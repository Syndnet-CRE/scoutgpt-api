#!/usr/bin/env node
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

const lines = [];
function log(msg) {
  console.log(msg);
  lines.push(msg);
}

async function run() {
  const client = await pool.connect();
  log('# Session 1 Results');
  log(`> Generated: ${new Date().toISOString()}\n`);

  // PART 1: Spot-check top 20 asset class codes
  log('---');
  log('## PART 1: Asset Class Code Verification\n');
  const topCodes = ['385','401','366','386','373','369','402','383','238','117','169','375','139','171','135','378','359','167','361','178'];
  for (const code of topCodes) {
    log(`### Code ${code}`);
    try {
      const r = await client.query(`SELECT attom_id, address_full, property_use_group, area_building, stories_count, year_built FROM properties WHERE property_use_standardized = $1 AND fips_code = '48453' LIMIT 5`, [code]);
      if (r.rows.length === 0) { log('*(no rows)*\n'); continue; }
      const cols = ['address_full','property_use_group','area_building','stories_count','year_built'];
      log('| ' + cols.join(' | ') + ' |');
      log('| ' + cols.map(() => '---').join(' | ') + ' |');
      for (const row of r.rows) { log('| ' + cols.map(c => row[c] ?? 'NULL').join(' | ') + ' |'); }
      log('');
    } catch (err) { log(`**ERROR:** ${err.message}\n`); }
  }

  // PART 2: Absentee owner derivation check
  log('---');
  log('## PART 2: Absentee Owner Derivation Check\n');
  try {
    const r = await client.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN o.mail_address_city IS NOT NULL AND o.mail_address_city != '' THEN 1 END) as has_mail_city FROM ownership o WHERE o.ownership_sequence = 1`);
    log(`Total current owners: ${r.rows[0].total}`);
    log(`Have mail city: ${r.rows[0].has_mail_city}\n`);
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }
  try {
    const r = await client.query(`SELECT mail_address_city, mail_address_state, COUNT(*) as cnt FROM ownership WHERE ownership_sequence = 1 AND mail_address_city IS NOT NULL AND mail_address_city != '' GROUP BY mail_address_city, mail_address_state ORDER BY cnt DESC LIMIT 20`);
    log('### Top 20 mailing cities');
    log('| mail_address_city | mail_address_state | cnt |');
    log('| --- | --- | --- |');
    for (const row of r.rows) { log(`| ${row.mail_address_city} | ${row.mail_address_state ?? 'NULL'} | ${row.cnt} |`); }
    log('');
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }

  // PART 3: Ownership mail address columns
  log('---');
  log('## PART 3: Ownership mail address columns\n');
  try {
    const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ownership' AND column_name LIKE '%mail%' ORDER BY column_name`);
    log('Mail-related columns in ownership:');
    for (const row of r.rows) { log(`- ${row.column_name}`); }
    log('');
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }

  // PART 4: Flood risk score distribution
  log('---');
  log('## PART 4: Flood Risk Score Distribution\n');
  try {
    const r = await client.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN flood_risk_score IS NOT NULL THEN 1 END) as has_score, COUNT(CASE WHEN flood_risk_score >= 30 THEN 1 END) as gte_30, COUNT(CASE WHEN flood_risk_score >= 50 THEN 1 END) as gte_50, COUNT(CASE WHEN flood_risk_score >= 70 THEN 1 END) as gte_70, COUNT(CASE WHEN flood_risk_score >= 90 THEN 1 END) as gte_90, MIN(flood_risk_score) as min_score, MAX(flood_risk_score) as max_score, AVG(flood_risk_score)::int as avg_score FROM climate_risk`);
    const row = r.rows[0];
    log('| metric | value |');
    log('| --- | --- |');
    for (const [k, v] of Object.entries(row)) { log(`| ${k} | ${v} |`); }
    log('');
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }
  try {
    const scoreCheck = await client.query(`SELECT COUNT(CASE WHEN flood_risk_score IS NOT NULL THEN 1 END) as flood, COUNT(CASE WHEN drought_risk_score IS NOT NULL THEN 1 END) as drought, COUNT(CASE WHEN heat_risk_score IS NOT NULL THEN 1 END) as heat, COUNT(CASE WHEN storm_risk_score IS NOT NULL THEN 1 END) as storm, COUNT(CASE WHEN fire_risk_score IS NOT NULL THEN 1 END) as fire, COUNT(CASE WHEN total_risk_score IS NOT NULL THEN 1 END) as total FROM climate_risk`);
    log('### Score data coverage:');
    const sr = scoreCheck.rows[0];
    log('| score | records_with_data |');
    log('| --- | --- |');
    for (const [k, v] of Object.entries(sr)) { log(`| ${k} | ${v} |`); }
    log('');
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }

  // PART 5: property_details columns
  log('---');
  log('## PART 5: property_details columns\n');
  try {
    const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'property_details' ORDER BY column_name`);
    log('All columns in property_details:');
    for (const row of r.rows) { log(`- ${row.column_name}`); }
    log('');
  } catch (err) { log(`**ERROR:** ${err.message}\n`); }

  // PART 6: Create indexes (CONCURRENTLY can't run in transaction)
  log('---');
  log('## PART 6: Creating Indexes\n');
  client.release();
  const indexes = [
    { name: 'idx_ownership_company_seq1', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ownership_company_seq1 ON ownership (attom_id) WHERE company_flag = true AND ownership_sequence = 1` },
    { name: 'idx_ownership_trust_seq1', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ownership_trust_seq1 ON ownership (attom_id) WHERE trust_flag = true AND ownership_sequence = 1` },
    { name: 'idx_properties_lot_acres', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_lot_acres ON properties (area_lot_acres) WHERE area_lot_acres IS NOT NULL` },
    { name: 'idx_properties_building_sf', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_building_sf ON properties (area_building) WHERE area_building IS NOT NULL` },
    { name: 'idx_valuations_attom_date', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_valuations_attom_date ON property_valuations (attom_id, valuation_date DESC)` },
    { name: 'idx_foreclosure_recent', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_foreclosure_recent ON foreclosure_records (attom_id, foreclosure_recording_date DESC)` },
    { name: 'idx_sales_recent_arms', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_recent_arms ON sales_transactions (attom_id, recording_date DESC) WHERE is_arms_length = true` },
    { name: 'idx_climate_flood', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_climate_flood ON climate_risk (attom_id) WHERE flood_risk_score >= 50` },
    { name: 'idx_properties_year_built', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_year_built ON properties (year_built) WHERE year_built IS NOT NULL` },
    { name: 'idx_properties_stories', sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_properties_stories ON properties (stories_count) WHERE stories_count IS NOT NULL` }
  ];
  for (const idx of indexes) {
    log(`Creating ${idx.name}...`);
    try {
      const start = Date.now();
      await pool.query(idx.sql);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      log(`  ✅ Created in ${elapsed}s`);
    } catch (err) {
      if (err.message.includes('already exists')) { log(`  ⭐ Already exists`); }
      else { log(`  ❌ ERROR: ${err.message}`); }
    }
  }
  log('');

  // PART 7: Performance test filter queries
  log('---');
  log('## PART 7: Filter Query Performance\n');
  const client2 = await pool.connect();
  const bbox = [-97.85, 30.15, -97.65, 30.45];
  const perfTests = [
    { name: 'Asset Class (Multifamily)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND p.property_use_standardized IN ('117', '378', '383', '386', '388') LIMIT 5000`, params: bbox },
    { name: 'Foreclosure (any)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND EXISTS (SELECT 1 FROM foreclosure_records fr WHERE fr.attom_id = p.attom_id) LIMIT 5000`, params: bbox },
    { name: 'Owner Type (Corporate)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1 WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND o.company_flag = true AND o.trust_flag = false LIMIT 5000`, params: bbox },
    { name: 'Recent Sales (90 days, arms-length)', sql: `EXPLAIN ANALYZE SELECT DISTINCT ON (p.attom_id) p.attom_id, p.latitude, p.longitude FROM properties p JOIN sales_transactions st ON st.attom_id = p.attom_id WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND st.recording_date >= NOW() - INTERVAL '90 days' AND st.is_arms_length = true ORDER BY p.attom_id, st.recording_date DESC LIMIT 5000`, params: bbox },
    { name: 'Lot Size (1-10 acres)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND p.area_lot_acres BETWEEN 1 AND 10 LIMIT 5000`, params: bbox },
    { name: 'Building Size (10K+ sqft)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND p.area_building >= 10000 LIMIT 5000`, params: bbox },
    { name: 'High LTV (>80%)', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p JOIN property_valuations pv ON pv.attom_id = p.attom_id WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND pv.ltv > 0.80 LIMIT 5000`, params: bbox },
    { name: 'Combined: Multifamily + Corporate + Foreclosure', sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1 WHERE ST_Intersects(p.location, ST_MakeEnvelope($1, $2, $3, $4, 4326)) AND p.property_use_standardized IN ('117', '378', '383', '386', '388') AND o.company_flag = true AND EXISTS (SELECT 1 FROM foreclosure_records fr WHERE fr.attom_id = p.attom_id) LIMIT 5000`, params: bbox }
  ];
  for (const test of perfTests) {
    log(`### ${test.name}`);
    try {
      const r = await client2.query(test.sql, test.params);
      const planRows = r.rows.map(row => row['QUERY PLAN']);
      const timingLine = planRows.find(l => l.includes('Execution Time'));
      const planningLine = planRows.find(l => l.includes('Planning Time'));
      log(`Planning: ${planningLine || 'N/A'}`);
      log(`Execution: ${timingLine || 'N/A'}`);
      const topLine = planRows[0];
      const actualMatch = topLine?.match(/actual time=[\d.]+\.\.[\d.]+ rows=(\d+)/);
      if (actualMatch) log(`Rows returned: ${actualMatch[1]}`);
    } catch (err) { log(`**ERROR:** ${err.message}`); }
    log('');
  }

  client2.release();
  await pool.end();
  const output = lines.join('\n');
  fs.writeFileSync('session1_results.md', output);
  console.log(`\nDone! Results saved to session1_results.md (${(output.length / 1024).toFixed(1)} KB)`);
}

run().catch(err => { console.error('Fatal error:', err); process.exit(1); });
