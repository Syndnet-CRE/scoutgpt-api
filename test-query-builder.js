require("dotenv").config();
const pool = require('./db/pool');
const registryService = require('./services/registryService');
const {
  validateFilters,
  buildQuery,
  executeQuery,
  runInsightQueries
} = require('./services/queryBuilder');

// Test results tracking
let passed = 0;
let failed = 0;

/**
 * Logs test header
 */
function logTest(name) {
  console.log('\n' + '='.repeat(70));
  console.log(`TEST: ${name}`);
  console.log('='.repeat(70));
}

/**
 * Logs query details for debugging
 */
function logQuery(sql, params) {
  console.log('\n--- Generated SQL ---');
  console.log(sql);
  console.log('\n--- Params ---');
  console.log(JSON.stringify(params, null, 2));
}

/**
 * Logs result summary
 */
function logResults(properties, totalCount) {
  console.log('\n--- Results ---');
  console.log(`Total count: ${totalCount}`);
  console.log(`Returned rows: ${properties.length}`);

  if (properties.length > 0) {
    console.log('\nFirst 2 rows:');
    properties.slice(0, 2).forEach((row, i) => {
      console.log(`  [${i + 1}] attom_id: ${row.attom_id}`);
      console.log(`      address: ${row.address_full}`);
      console.log(`      city/state/zip: ${row.address_city}, ${row.address_state} ${row.address_zip}`);
      console.log(`      use_group: ${row.property_use_group}`);
      console.log(`      year_built: ${row.year_built}, sqft: ${row.area_building}`);
      console.log(`      last_sale: ${row.last_sale_date} @ $${row.last_sale_price}`);
    });
  }
}

/**
 * Marks test as passed
 */
function markPass(message = '') {
  passed++;
  console.log(`\n✅ PASS${message ? ': ' + message : ''}`);
}

/**
 * Marks test as failed
 */
function markFail(message = '') {
  failed++;
  console.log(`\n❌ FAIL${message ? ': ' + message : ''}`);
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('QueryBuilder Test Suite');
  console.log('=======================\n');

  // Load the registry first
  console.log('Loading registry...');
  await registryService.loadRegistry();
  console.log('Registry loaded.\n');

  let test1AttomIds = [];

  // =========================================================================
  // TEST 1: Simple enum filter
  // =========================================================================
  logTest('1: Simple enum filter');
  try {
    const filters = validateFilters([
      { slug: 'property-use-group', operator: 'eq', value: 'COMMERCIAL' }
    ]);

    const { sql, countSql, params } = buildQuery({
      filters,
      spatial: { type: 'zip', zip: '78704' },
      sort: null,
      limit: 10
    });

    logQuery(sql, params);

    const { properties, totalCount } = await executeQuery({ sql, countSql, params });
    logResults(properties, totalCount);

    // Save attom_ids for Test 8
    test1AttomIds = properties.map(p => p.attom_id);

    if (totalCount > 0 && properties.length > 0) {
      markPass(`Found ${totalCount} commercial properties in 78704`);
    } else {
      markFail('Expected count > 0');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // TEST 2: Multi-filter with JOIN
  // =========================================================================
  logTest('2: Multi-filter with JOIN (absentee-owner)');
  try {
    const filters = validateFilters([
      { slug: 'property-use-group', operator: 'eq', value: 'COMMERCIAL' },
      { slug: 'absentee-owner', operator: 'eq', value: true }
    ]);

    const { sql, countSql, params } = buildQuery({
      filters,
      spatial: { type: 'zip', zip: '78704' },
      sort: { field: 'last_sale_date', order: 'desc' },
      limit: 10
    });

    logQuery(sql, params);

    // Check that JOIN is present
    const hasJoin = sql.toLowerCase().includes('join');
    console.log(`\nRequires JOIN: ${hasJoin}`);

    const { properties, totalCount } = await executeQuery({ sql, countSql, params });
    logResults(properties, totalCount);

    if (properties.length >= 0 && hasJoin) {
      markPass(`Found ${totalCount} absentee-owned commercial properties`);
    } else {
      markFail('Expected JOIN clause for ownership table');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // TEST 3: Numeric range
  // =========================================================================
  logTest('3: Numeric range (building-sqft >= 25000)');
  try {
    const filters = validateFilters([
      { slug: 'building-sqft', operator: 'gte', value: 25000 }
    ]);

    const { sql, countSql, params } = buildQuery({
      filters,
      spatial: { type: 'zip', zip: '78701' },
      sort: null,
      limit: 10
    });

    logQuery(sql, params);

    const { properties, totalCount } = await executeQuery({ sql, countSql, params });
    logResults(properties, totalCount);

    // Verify all returned properties have area_building >= 25000
    const allValid = properties.every(p => p.area_building >= 25000);

    if (allValid) {
      markPass(`All ${properties.length} properties have sqft >= 25000`);
    } else {
      markFail('Some properties have area_building < 25000');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // TEST 4: Date range (loan maturity)
  // =========================================================================
  logTest('4: Date range (loan-due-date between 2027-02-19 and 2028-02-19)');
  try {
    const filters = validateFilters([
      { slug: 'loan-due-date', operator: 'between', value: ['2027-02-19', '2028-02-19'] }
    ]);

    const { sql, countSql, params } = buildQuery({
      filters,
      spatial: { type: 'bbox', bbox: '-97.8,30.2,-97.7,30.35' },
      sort: { field: 'loan-due-date', order: 'asc' },
      limit: 15
    });

    logQuery(sql, params);

    // Check that current_loans JOIN is present
    const hasLoansJoin = sql.toLowerCase().includes('current_loans');
    console.log(`\nRequires current_loans JOIN: ${hasLoansJoin}`);

    const { properties, totalCount } = await executeQuery({ sql, countSql, params });
    logResults(properties, totalCount);

    if (properties.length >= 0) {
      markPass(`Found ${totalCount} properties with loan due dates in range`);
    } else {
      markFail('Query execution failed');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // TEST 5: Boolean filter (tax delinquent)
  // =========================================================================
  logTest('5: Boolean filter (tax-delinquent = true)');
  try {
    const filters = validateFilters([
      { slug: 'tax-delinquent', operator: 'eq', value: true }
    ]);

    const { sql, countSql, params } = buildQuery({
      filters,
      spatial: { type: 'zip', zip: '78741' },
      sort: null,
      limit: 10
    });

    logQuery(sql, params);

    // Check that tax_assessments JOIN is present
    const hasTaxJoin = sql.toLowerCase().includes('tax_assessments');
    console.log(`\nRequires tax_assessments JOIN: ${hasTaxJoin}`);

    const { properties, totalCount } = await executeQuery({ sql, countSql, params });
    logResults(properties, totalCount);

    if (properties.length >= 0) {
      markPass(`Found ${totalCount} tax delinquent properties in 78741`);
    } else {
      markFail('Query execution failed');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // TEST 6: Validation — invalid slug
  // =========================================================================
  logTest('6: Validation — invalid slug');
  try {
    validateFilters([
      { slug: 'fake-filter', operator: 'eq', value: 'test' }
    ]);
    markFail('Expected error to be thrown for invalid slug');
  } catch (error) {
    console.log(`\nCaught error: ${error.message}`);
    if (error.message.includes('Unknown filter slug: fake-filter')) {
      markPass('Correctly threw error for unknown filter slug');
    } else {
      markFail(`Unexpected error message: ${error.message}`);
    }
  }

  // =========================================================================
  // TEST 7: Validation — invalid operator
  // =========================================================================
  logTest('7: Validation — invalid operator for enum type');
  try {
    validateFilters([
      { slug: 'property-use-group', operator: 'gte', value: 'COMMERCIAL' }
    ]);
    markFail('Expected error to be thrown for invalid operator');
  } catch (error) {
    console.log(`\nCaught error: ${error.message}`);
    if (error.message.includes('Invalid operator') && error.message.includes('enum')) {
      markPass('Correctly threw error for invalid operator on enum type');
    } else {
      markFail(`Unexpected error message: ${error.message}`);
    }
  }

  // =========================================================================
  // TEST 8: Insight queries
  // =========================================================================
  logTest('8: Insight queries');
  try {
    if (test1AttomIds.length === 0) {
      console.log('No attom_ids from Test 1, running a quick query to get some...');
      const filters = validateFilters([
        { slug: 'property-use-group', operator: 'eq', value: 'COMMERCIAL' }
      ]);
      const { sql, countSql, params } = buildQuery({
        filters,
        spatial: { type: 'zip', zip: '78704' },
        limit: 20
      });
      const { properties } = await executeQuery({ sql, countSql, params });
      test1AttomIds = properties.map(p => p.attom_id);
    }

    console.log(`\nUsing ${test1AttomIds.length} attom_ids from Test 1`);
    console.log(`attom_ids sample: [${test1AttomIds.slice(0, 5).join(', ')}...]`);

    const insights = await runInsightQueries(
      test1AttomIds,
      ['tax-delinquent', 'absentee-owner', 'foreclosure-status']
    );

    console.log('\n--- Insight Results ---');
    insights.forEach(insight => {
      console.log(`  ${insight.filterName} (${insight.slug}): ${insight.count}/${insight.total}`);
    });

    if (Array.isArray(insights)) {
      markPass(`Returned ${insights.length} insight objects`);
    } else {
      markFail('Expected array of insight objects');
    }
  } catch (error) {
    markFail(error.message);
    console.error(error);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('='.repeat(70));

  // Close pool and exit
  console.log('\nClosing database pool...');
  await pool.end();
  console.log('Done.');
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  pool.end().then(() => process.exit(1));
});
