// ScoutGPT Neon Database Audit
// Read-only audit of all 14 ATTOM tables
// Outputs: ~/scoutgpt-api/audits/neon-data-audit.md

const path = require('path');
const fs = require('fs');

// Load .env manually so we don't need dotenv as a dependency
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const pool = require('../db/pool');

const TABLES = [
  'properties', 'property_details', 'ownership', 'sales_transactions',
  'current_loans', 'tax_assessments', 'property_valuations', 'foreclosure_records',
  'climate_risk', 'building_permits', 'parcel_boundaries', 'fema_flood_zones',
  'school_districts', 'mortgage_records'
];

const SAMPLE_LIMIT = 10000;

async function auditTable(client, tableName) {
  console.log(`Auditing ${tableName}...`);
  
  // Row count
  const countResult = await client.query(`SELECT COUNT(*) as cnt FROM ${tableName}`);
  const rowCount = parseInt(countResult.rows[0].cnt);
  console.log(`  ${tableName}: ${rowCount} rows`);

  // Column metadata
  const colResult = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns 
     WHERE table_schema = 'public' AND table_name = $1 
     ORDER BY ordinal_position`, [tableName]
  );
  const columns = colResult.rows;

  if (rowCount === 0) {
    return {
      table: tableName,
      rowCount: 0,
      sampleSize: 0,
      columns: columns.map(c => ({
        name: c.column_name,
        type: c.data_type,
        populationPct: 0,
        samples: [],
        notes: 'EMPTY TABLE'
      })),
      deadColumns: columns.map(c => c.column_name)
    };
  }

  // Determine which columns are geometry (skip sampling for those)
  const geomColumns = new Set(
    columns
      .filter(c => c.data_type === 'USER-DEFINED' || c.column_name === 'geometry' || c.column_name === 'geom')
      .map(c => c.column_name)
  );

  // Sample data for population rates
  const nonGeomCols = columns.filter(c => !geomColumns.has(c.column_name));
  let sampleRows = [];
  let sampleSize = 0;

  if (nonGeomCols.length > 0) {
    const colNames = nonGeomCols.map(c => `"${c.column_name}"`).join(', ');
    
    if (rowCount > SAMPLE_LIMIT) {
      // Try TABLESAMPLE first
      try {
        const pct = Math.min(100, Math.ceil((SAMPLE_LIMIT / rowCount) * 100 * 1.5));
        const sampleResult = await client.query(
          `SELECT ${colNames} FROM ${tableName} TABLESAMPLE SYSTEM(${pct}) LIMIT ${SAMPLE_LIMIT}`
        );
        sampleRows = sampleResult.rows;
      } catch (e) {
        // Fallback to random
        const sampleResult = await client.query(
          `SELECT ${colNames} FROM ${tableName} ORDER BY random() LIMIT ${SAMPLE_LIMIT}`
        );
        sampleRows = sampleResult.rows;
      }
    } else {
      const sampleResult = await client.query(`SELECT ${colNames} FROM ${tableName}`);
      sampleRows = sampleResult.rows;
    }
    sampleSize = sampleRows.length;
  }

  // Calculate population rates
  const columnStats = [];
  
  for (const col of columns) {
    if (geomColumns.has(col.column_name)) {
      columnStats.push({
        name: col.column_name,
        type: col.data_type,
        populationPct: -1, // unknown, geometry
        samples: ['GEOMETRY - not sampled'],
        notes: 'GEOMETRY'
      });
      continue;
    }

    const nonNullCount = sampleRows.filter(r => r[col.column_name] != null).length;
    const pct = sampleSize > 0 ? Math.round((nonNullCount / sampleSize) * 100 * 10) / 10 : 0;

    // Get sample values
    let samples = [];
    if (pct > 0) {
      try {
        const sampleResult = await client.query(
          `SELECT DISTINCT "${col.column_name}" FROM ${tableName} 
           WHERE "${col.column_name}" IS NOT NULL LIMIT 3`
        );
        samples = sampleResult.rows.map(r => {
          const val = String(r[col.column_name]);
          return val.length > 80 ? val.substring(0, 77) + '...' : val;
        });
      } catch (e) {
        samples = ['ERROR fetching samples'];
      }
    }

    let notes = 'ok';
    if (pct === 0) notes = 'DEAD COLUMN';
    else if (pct < 5) notes = 'sparse';

    columnStats.push({
      name: col.column_name,
      type: col.data_type,
      populationPct: pct,
      samples,
      notes
    });
  }

  const deadColumns = columnStats
    .filter(c => c.notes === 'DEAD COLUMN')
    .map(c => c.name);

  return {
    table: tableName,
    rowCount,
    sampleSize,
    columns: columnStats,
    deadColumns
  };
}

async function loadFiltersRegistry(client) {
  try {
    const result = await client.query(
      `SELECT filter_slug, filter_name, category, source_table, source_columns 
       FROM filters_registry WHERE is_active = true ORDER BY category, filter_slug`
    );
    return result.rows;
  } catch (e) {
    console.log('WARNING: filters_registry table not found. Skipping cross-reference.');
    return null;
  }
}

function crossReferenceFilters(filters, tableAudits) {
  if (!filters) return null;

  const tableMap = {};
  tableAudits.forEach(t => { tableMap[t.table] = t; });

  return filters.map(f => {
    const table = tableMap[f.source_table];
    if (!table) {
      return { ...f, status: 'BLOCKED', reason: `Table "${f.source_table}" not found` };
    }
    if (table.rowCount === 0) {
      return { ...f, status: 'BLOCKED', reason: 'Empty table (0 rows)' };
    }

    const sourceCols = Array.isArray(f.source_columns) ? f.source_columns : [f.source_columns];
    const colStats = sourceCols.map(colName => {
      const stat = table.columns.find(c => c.name === colName);
      return stat || null;
    }).filter(Boolean);

    if (colStats.length === 0) {
      return { ...f, status: 'WARNING', reason: 'Source columns not found in table' };
    }

    const allDead = colStats.every(c => c.populationPct === 0);
    if (allDead) {
      return { ...f, status: 'BLOCKED', reason: `All source columns are 0% populated: ${sourceCols.join(', ')}` };
    }

    const anySparse = colStats.some(c => c.populationPct > 0 && c.populationPct < 5);
    if (anySparse) {
      const sparseOnes = colStats.filter(c => c.populationPct > 0 && c.populationPct < 5);
      return { ...f, status: 'WARNING', reason: `Sparse data: ${sparseOnes.map(c => `${c.name} (${c.populationPct}%)`).join(', ')}` };
    }

    return { ...f, status: 'OK', reason: '' };
  });
}

function generateReport(tableAudits, filterResults) {
  const timestamp = new Date().toISOString();
  
  const populated = tableAudits.filter(t => t.rowCount > 1000);
  const partial = tableAudits.filter(t => t.rowCount > 0 && t.rowCount <= 1000);
  const empty = tableAudits.filter(t => t.rowCount === 0);

  let md = `# ScoutGPT Neon Database Audit\nGenerated: ${timestamp}\n\n`;

  // Summary
  md += `## Summary\n\n`;
  md += `- **Tables with data (>1K rows):** ${populated.map(t => `${t.table} (${t.rowCount.toLocaleString()})`).join(', ') || 'none'}\n`;
  md += `- **Tables with some data (≤1K rows):** ${partial.map(t => `${t.table} (${t.rowCount})`).join(', ') || 'none'}\n`;
  md += `- **Empty tables (0 rows):** ${empty.map(t => t.table).join(', ') || 'none'}\n\n`;

  // Filters summary
  if (filterResults) {
    const ok = filterResults.filter(f => f.status === 'OK');
    const blocked = filterResults.filter(f => f.status === 'BLOCKED');
    const warning = filterResults.filter(f => f.status === 'WARNING');

    md += `- **Total active filters:** ${filterResults.length}\n`;
    md += `- **Filters OK:** ${ok.length}\n`;
    md += `- **Filters BLOCKED:** ${blocked.length}${blocked.length > 0 ? ' — ' + blocked.map(f => f.filter_slug).join(', ') : ''}\n`;
    md += `- **Filters WARNING:** ${warning.length}${warning.length > 0 ? ' — ' + warning.map(f => f.filter_slug).join(', ') : ''}\n\n`;

    // Filters table
    md += `## Filters Registry Impact\n\n`;
    md += `| Filter Slug | Category | Source Table | Status | Reason |\n`;
    md += `|---|---|---|---|---|\n`;
    filterResults.forEach(f => {
      md += `| ${f.filter_slug} | ${f.category} | ${f.source_table} | ${f.status} | ${f.reason} |\n`;
    });
    md += `\n`;
  }

  // Table details
  md += `## Table Details\n\n`;
  tableAudits.forEach(t => {
    md += `### ${t.table}\n`;
    md += `**Rows:** ${t.rowCount.toLocaleString()} | **Sampled:** ${t.sampleSize.toLocaleString()}\n\n`;

    if (t.rowCount === 0) {
      md += `*Table is empty — no column data to report.*\n\n`;
      return;
    }

    md += `| Column | Type | Population % | Samples | Notes |\n`;
    md += `|---|---|---|---|---|\n`;
    t.columns.forEach(c => {
      const pctStr = c.populationPct === -1 ? 'N/A' : `${c.populationPct}%`;
      const samplesStr = c.samples.length > 0 ? c.samples.join(', ') : '-';
      md += `| ${c.name} | ${c.type} | ${pctStr} | ${samplesStr} | ${c.notes} |\n`;
    });
    md += `\n`;

    if (t.deadColumns.length > 0) {
      md += `**Dead columns (0% populated):** ${t.deadColumns.join(', ')}\n\n`;
    }
  });

  return md;
}

async function main() {
  const client = await pool.connect();
  
  try {
    // Set timeout
    await client.query("SET statement_timeout = '30000'");
    
    console.log('=== ScoutGPT Neon Database Audit ===');
    console.log(`Started: ${new Date().toISOString()}\n`);

    // Audit each table
    const tableAudits = [];
    for (const table of TABLES) {
      try {
        const result = await auditTable(client, table);
        tableAudits.push(result);
      } catch (e) {
        console.error(`  ERROR auditing ${table}: ${e.message}`);
        tableAudits.push({
          table,
          rowCount: -1,
          sampleSize: 0,
          columns: [],
          deadColumns: [],
          error: e.message
        });
      }
    }

    // Cross-reference with filters_registry
    console.log('\nCross-referencing with filters_registry...');
    const filters = await loadFiltersRegistry(client);
    const filterResults = crossReferenceFilters(filters, tableAudits);

    // Generate report
    const report = generateReport(tableAudits, filterResults);
    
    // Write to file
    const outputPath = path.join(__dirname, 'neon-data-audit.md');
    fs.writeFileSync(outputPath, report);
    console.log(`\nAudit written to: ${outputPath}`);
    console.log(`Finished: ${new Date().toISOString()}`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
