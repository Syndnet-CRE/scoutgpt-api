#!/usr/bin/env node
// ============================================================
// ScoutGPT Filter System — Data Discovery Script
// Run from ~/scoutgpt-api:  node discover.js
// Uses your existing .env DATABASE_URL
// Outputs: discovery_results.md (paste into Claude)
// ============================================================

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

const queries = [
  {
    name: '1a. property_use_standardized values',
    sql: `SELECT property_use_standardized, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' GROUP BY property_use_standardized ORDER BY cnt DESC`
  },
  {
    name: '1b. property_use_code → standardized mapping',
    sql: `SELECT property_use_code, property_use_standardized, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' GROUP BY property_use_code, property_use_standardized ORDER BY cnt DESC`
  },
  {
    name: '1c. property_use_group values',
    sql: `SELECT property_use_group, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' GROUP BY property_use_group ORDER BY cnt DESC`
  },
  {
    name: '2a. Foreclosure record_type',
    sql: `SELECT record_type, COUNT(*) as cnt FROM foreclosure_records GROUP BY record_type ORDER BY cnt DESC`
  },
  {
    name: '2b. Foreclosure status',
    sql: `SELECT status, COUNT(*) as cnt FROM foreclosure_records GROUP BY status ORDER BY cnt DESC`
  },
  {
    name: '2c. Foreclosure record_type + status combo',
    sql: `SELECT record_type, status, COUNT(*) as cnt FROM foreclosure_records GROUP BY record_type, status ORDER BY cnt DESC`
  },
  {
    name: '2d. Foreclosure date range + data completeness',
    sql: `SELECT MIN(foreclosure_recording_date) as earliest, MAX(foreclosure_recording_date) as latest, COUNT(*) as total, COUNT(CASE WHEN auction_date IS NOT NULL THEN 1 END) as has_auction_date, COUNT(CASE WHEN default_amount IS NOT NULL AND default_amount > 0 THEN 1 END) as has_default_amount, COUNT(CASE WHEN estimated_value IS NOT NULL AND estimated_value > 0 THEN 1 END) as has_estimated_value FROM foreclosure_records`
  },
  {
    name: '3a. Tax delinquent year distribution',
    sql: `SELECT tax_delinquent_year, COUNT(*) as cnt FROM tax_assessments WHERE tax_delinquent_year IS NOT NULL GROUP BY tax_delinquent_year ORDER BY tax_delinquent_year DESC`
  },
  {
    name: '3b. Tax year coverage',
    sql: `SELECT tax_year, COUNT(*) as cnt FROM tax_assessments GROUP BY tax_year ORDER BY tax_year DESC`
  },
  {
    name: '3c. Tax delinquent count (most recent year)',
    sql: `SELECT COUNT(*) as total_assessments, COUNT(CASE WHEN tax_delinquent_year IS NOT NULL THEN 1 END) as delinquent_count FROM tax_assessments ta WHERE ta.tax_year = (SELECT MAX(tax_year) FROM tax_assessments)`
  },
  {
    name: '4a. Ownership company_flag + trust_flag combos',
    sql: `SELECT company_flag, trust_flag, COUNT(*) as cnt FROM ownership WHERE ownership_sequence = 1 GROUP BY company_flag, trust_flag ORDER BY cnt DESC`
  },
  {
    name: '4b. Absentee + owner occupied',
    sql: `SELECT is_absentee_owner, is_owner_occupied, COUNT(*) as cnt FROM ownership WHERE ownership_sequence = 1 GROUP BY is_absentee_owner, is_owner_occupied ORDER BY cnt DESC`
  },
  {
    name: '4c. ownership_type values',
    sql: `SELECT ownership_type, COUNT(*) as cnt FROM ownership WHERE ownership_sequence = 1 GROUP BY ownership_type ORDER BY cnt DESC`
  },
  {
    name: '4d. Top 50 corporate/institutional owner names',
    sql: `SELECT owner1_name_full, COUNT(*) as cnt FROM ownership WHERE ownership_sequence = 1 AND company_flag = true GROUP BY owner1_name_full ORDER BY cnt DESC LIMIT 50`
  },
  {
    name: '5a. Sales transaction date range',
    sql: `SELECT MIN(recording_date) as earliest, MAX(recording_date) as latest, COUNT(*) as total FROM sales_transactions`
  },
  {
    name: '5b. Sales last 365 days',
    sql: `SELECT COUNT(*) as total_last_year, COUNT(CASE WHEN is_arms_length = true THEN 1 END) as arms_length, COUNT(CASE WHEN is_distressed = true THEN 1 END) as distressed, COUNT(CASE WHEN is_foreclosure_auction = true THEN 1 END) as foreclosure_auction, AVG(CASE WHEN sale_price > 0 AND is_arms_length = true THEN sale_price END)::int as avg_arms_length_price FROM sales_transactions WHERE recording_date >= NOW() - INTERVAL '365 days'`
  },
  {
    name: '5c. Document types (top 20)',
    sql: `SELECT document_type, COUNT(*) as cnt FROM sales_transactions GROUP BY document_type ORDER BY cnt DESC LIMIT 20`
  },
  {
    name: '5d. Investor flag distribution',
    sql: `SELECT grantee_investor_flag, COUNT(*) as cnt FROM sales_transactions GROUP BY grantee_investor_flag ORDER BY cnt DESC`
  },
  {
    name: '6a. Lot size distribution (acres)',
    sql: `SELECT COUNT(*) as total, MIN(area_lot_acres) as min_acres, PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY area_lot_acres) as p25, PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY area_lot_acres) as median, PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY area_lot_acres) as p75, PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY area_lot_acres) as p95, MAX(area_lot_acres) as max_acres FROM properties WHERE fips_code = '48453' AND area_lot_acres IS NOT NULL AND area_lot_acres > 0`
  },
  {
    name: '6b. Building size distribution (sqft)',
    sql: `SELECT COUNT(*) as total, MIN(area_building) as min_sf, PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY area_building) as p25, PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY area_building) as median, PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY area_building) as p75, PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY area_building) as p95, MAX(area_building) as max_sf FROM properties WHERE fips_code = '48453' AND area_building IS NOT NULL AND area_building > 0`
  },
  {
    name: '6c. Unit count distribution',
    sql: `SELECT units_count, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' AND units_count IS NOT NULL AND units_count > 0 GROUP BY units_count ORDER BY units_count`
  },
  {
    name: '6d. Stories distribution',
    sql: `SELECT stories_count, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' AND stories_count IS NOT NULL AND stories_count > 0 GROUP BY stories_count ORDER BY stories_count`
  },
  {
    name: '6e. Year built by decade',
    sql: `SELECT (year_built / 10) * 10 as decade, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' AND year_built IS NOT NULL AND year_built > 1800 GROUP BY (year_built / 10) * 10 ORDER BY decade`
  },
  {
    name: '7a. Valuations coverage',
    sql: `SELECT COUNT(DISTINCT attom_id) as properties_with_valuations, COUNT(*) as total_valuation_records, MIN(valuation_date) as earliest, MAX(valuation_date) as latest FROM property_valuations`
  },
  {
    name: '7b. Valuation distributions (most recent per property)',
    sql: `SELECT COUNT(*) as total, COUNT(CASE WHEN estimated_value IS NOT NULL AND estimated_value > 0 THEN 1 END) as has_avm, COUNT(CASE WHEN ltv IS NOT NULL THEN 1 END) as has_ltv, COUNT(CASE WHEN available_equity IS NOT NULL THEN 1 END) as has_equity, AVG(CASE WHEN estimated_value > 0 THEN estimated_value END)::int as avg_avm, AVG(CASE WHEN ltv > 0 THEN ltv END)::numeric(5,2) as avg_ltv FROM (SELECT DISTINCT ON (attom_id) * FROM property_valuations ORDER BY attom_id, valuation_date DESC) latest`
  },
  {
    name: '8. Current loans overview',
    sql: `SELECT COUNT(DISTINCT attom_id) as properties_with_loans, COUNT(*) as total_loan_records, AVG(loan_amount)::int as avg_loan_amount, AVG(interest_rate)::numeric(5,2) as avg_rate, COUNT(CASE WHEN estimated_balance IS NOT NULL THEN 1 END) as has_est_balance FROM current_loans`
  },
  {
    name: '9. Climate risk scores',
    sql: `SELECT COUNT(*) as total, AVG(total_risk_score)::int as avg_total, COUNT(CASE WHEN total_risk_score >= 70 THEN 1 END) as high_risk_70plus, COUNT(CASE WHEN flood_risk_score >= 70 THEN 1 END) as high_flood_70plus, MIN(total_risk_score) as min_total, MAX(total_risk_score) as max_total FROM climate_risk`
  },
  {
    name: '10a. Building permits coverage',
    sql: `SELECT COUNT(*) as total, COUNT(CASE WHEN attom_id IS NOT NULL THEN 1 END) as matched_to_property, COUNT(DISTINCT attom_id) as unique_properties, MIN(effective_date) as earliest, MAX(effective_date) as latest FROM building_permits`
  },
  {
    name: '10b. Permit types (top 20)',
    sql: `SELECT permit_type, COUNT(*) as cnt FROM building_permits GROUP BY permit_type ORDER BY cnt DESC LIMIT 20`
  },
  {
    name: '11. Zoning codes (top 30)',
    sql: `SELECT zoning, COUNT(*) as cnt FROM properties WHERE fips_code = '48453' AND zoning IS NOT NULL GROUP BY zoning ORDER BY cnt DESC LIMIT 30`
  },
  {
    name: '12. Null coverage across all key fields',
    sql: `SELECT COUNT(*) as total_properties, COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as has_coords, COUNT(CASE WHEN property_use_standardized IS NOT NULL THEN 1 END) as has_use_type, COUNT(CASE WHEN year_built IS NOT NULL THEN 1 END) as has_year_built, COUNT(CASE WHEN area_building IS NOT NULL AND area_building > 0 THEN 1 END) as has_building_sf, COUNT(CASE WHEN area_lot_acres IS NOT NULL AND area_lot_acres > 0 THEN 1 END) as has_lot_acres, COUNT(CASE WHEN units_count IS NOT NULL AND units_count > 0 THEN 1 END) as has_units, COUNT(CASE WHEN last_sale_date IS NOT NULL THEN 1 END) as has_last_sale, COUNT(CASE WHEN last_sale_price IS NOT NULL AND last_sale_price > 0 THEN 1 END) as has_last_price, COUNT(CASE WHEN tax_assessed_value_total IS NOT NULL THEN 1 END) as has_assessed_value, COUNT(CASE WHEN zoning IS NOT NULL THEN 1 END) as has_zoning FROM properties WHERE fips_code = '48453'`
  },
  {
    name: '13. Performance baseline — multi-table filter (EXPLAIN ANALYZE)',
    sql: `EXPLAIN ANALYZE SELECT p.attom_id, p.latitude, p.longitude FROM properties p JOIN ownership o ON o.attom_id = p.attom_id AND o.ownership_sequence = 1 WHERE ST_Intersects(p.location, ST_MakeEnvelope(-97.85, 30.15, -97.65, 30.45, 4326)) AND p.property_use_standardized ILIKE '%apartment%' AND o.is_absentee_owner = true LIMIT 5000`
  }
];

async function run() {
  const client = await pool.connect();
  const lines = [];
  
  lines.push('# ScoutGPT Filter System — Discovery Results');
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push('');

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`Running ${i + 1}/${queries.length}: ${q.name}...`);
    lines.push(`---`);
    lines.push(`## ${q.name}`);
    lines.push('');

    try {
      const result = await client.query(q.sql);
      
      if (result.rows.length === 0) {
        lines.push('*(no rows returned)*');
      } else {
        // Build markdown table
        const cols = Object.keys(result.rows[0]);
        lines.push('| ' + cols.join(' | ') + ' |');
        lines.push('| ' + cols.map(() => '---').join(' | ') + ' |');
        
        for (const row of result.rows) {
          const vals = cols.map(c => {
            const v = row[c];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number') return v.toLocaleString();
            return String(v);
          });
          lines.push('| ' + vals.join(' | ') + ' |');
        }
      }
      
      lines.push(`\n*${result.rows.length} rows*`);
    } catch (err) {
      lines.push(`**ERROR:** ${err.message}`);
      console.error(`  ERROR: ${err.message}`);
    }
    lines.push('');
  }

  client.release();
  await pool.end();

  const output = lines.join('\n');
  fs.writeFileSync('discovery_results.md', output);
  console.log(`\nDone! Results saved to discovery_results.md (${(output.length / 1024).toFixed(1)} KB)`);
  console.log('Paste the contents of that file into your next Claude message.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
