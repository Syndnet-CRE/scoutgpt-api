/**
 * Test script for knowledge/ modules
 * Run: node knowledge/test.js
 */

const { PROPERTY_CODES, CODE_GROUPS, ALL_COMMERCIAL_CODES, codeToName, codeToGroup, groupToCodes, codesToSqlIn, codeToDisplay, getCodeMeta } = require('./dictionary');
const { resolveAssetClass, resolveVagueTerm, extractAssetClasses } = require('./thesaurus');
const { getSubtype, formatPropertyType, isCommercialCode, isLand, getPriceMetric } = require('./asset-taxonomy');

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📖 DICTIONARY TESTS\n');

// Code count
const codeCount = Object.keys(PROPERTY_CODES).length;
console.log(`  Total codes: ${codeCount}`);
assert('Has 70+ property codes', codeCount >= 70);

// codeToName
assert('369 → "Apartment / Multifamily"', codeToName('369') === 'Apartment / Multifamily');
assert('385 → "Single Family Residence"', codeToName('385') === 'Single Family Residence');
assert('238 → "Light Industrial / Warehouse"', codeToName('238') === 'Light Industrial / Warehouse');
assert('999 → "Unknown (999)"', codeToName('999') === 'Unknown (999)');

// codeToGroup
assert('369 → MULTIFAMILY', codeToGroup('369') === 'MULTIFAMILY');
assert('167 → OFFICE', codeToGroup('167') === 'OFFICE');
assert('238 → INDUSTRIAL', codeToGroup('238') === 'INDUSTRIAL');
assert('401 → LAND', codeToGroup('401') === 'LAND');

// groupToCodes
const mfCodes = groupToCodes('MULTIFAMILY');
assert('MULTIFAMILY has 5 codes', mfCodes.length === 5);
assert('MULTIFAMILY includes 369', mfCodes.includes('369'));
assert('MULTIFAMILY includes 368', mfCodes.includes('368'));

const officeCodes = groupToCodes('OFFICE');
assert('OFFICE has 5 codes', officeCodes.length === 5);

// codesToSqlIn
const sqlIn = codesToSqlIn(['369', '373', '378']);
assert('codesToSqlIn produces valid SQL', sqlIn === "'369','373','378'");

// ALL_COMMERCIAL_CODES
assert('ALL_COMMERCIAL_CODES has 30+ entries', ALL_COMMERCIAL_CODES.length >= 30);
assert('Commercial codes include 369 (MF)', ALL_COMMERCIAL_CODES.includes('369'));
assert('Commercial codes include 238 (Industrial)', ALL_COMMERCIAL_CODES.includes('238'));
assert('Commercial codes exclude 385 (SFR)', !ALL_COMMERCIAL_CODES.includes('385'));
assert('Commercial codes exclude 302 (Gov)', !ALL_COMMERCIAL_CODES.includes('302'));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📚 THESAURUS TESTS\n');

// resolveAssetClass — standard terms
const testCases = [
  ['multifamily', 'MULTIFAMILY', 5],
  ['apartments', 'MULTIFAMILY', 5],
  ['MF', 'MULTIFAMILY', 5],
  ['warehouse', 'INDUSTRIAL', 3],
  ['office', 'OFFICE', 5],
  ['retail', 'RETAIL', 7],
  ['land', 'LAND', 3],
  ['vacant', 'LAND', 3],
  ['commercial', 'COMMERCIAL', null], // special — many codes
  ['industrial', 'INDUSTRIAL', 7],
  ['hotel', 'HOSPITALITY', 2],
  ['storage', 'SELF_STORAGE', 1],
  ['NNN', 'RETAIL', 1],
  ['medical office', 'MEDICAL_OFFICE', 1],
  ['duplex', 'MULTIFAMILY', 1],
  ['self-storage', 'SELF_STORAGE', 1],
  ['strip mall', 'RETAIL', 2],
  ['farm', 'AGRICULTURE', 2],
  ['condo', 'CONDO', 2],
  ['sfr', 'SFR', null],
];

for (const [input, expectedClass, expectedCodeCount] of testCases) {
  const result = resolveAssetClass(input);
  assert(
    `"${input}" → ${expectedClass}`,
    result && result.class === expectedClass
  );
  if (expectedCodeCount !== null && result) {
    assert(
      `  "${input}" has ${expectedCodeCount} codes`,
      result.codes.length === expectedCodeCount
    );
  }
}

// resolveAssetClass — should return null for non-asset terms
const nullResult = resolveAssetClass('banana');
assert('"banana" → null', nullResult === null);

// resolveVagueTerm
const bigResult = resolveVagueTerm('big', 'MULTIFAMILY');
assert('"big" + MULTIFAMILY → area_building > 50000', bigResult && bigResult.filter === 'area_building' && bigResult.value === 50000);

const newResult = resolveVagueTerm('new');
assert('"new" → year_built >= 2015', newResult && newResult.filter === 'year_built' && newResult.value === 2015);

const oldResult = resolveVagueTerm('old');
assert('"old" → year_built < 1980', oldResult && oldResult.filter === 'year_built' && oldResult.value === 1980);

// extractAssetClasses from full query
const extracted = extractAssetClasses('Find multifamily and retail in 78704');
assert('Extracts "multifamily" from query', extracted.some(e => e.class === 'MULTIFAMILY'));
assert('Extracts "retail" from query', extracted.some(e => e.class === 'RETAIL'));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🏗️  ASSET TAXONOMY TESTS\n');

// getSubtype
const apt369small = getSubtype('369', 3000);
assert('369 + 3000 SF → "Small Apartment Building"', apt369small.label === 'Small Apartment Building');
assert('369 parent = MULTIFAMILY', apt369small.parentClass === 'MULTIFAMILY');

const apt369large = getSubtype('369', 60000);
assert('369 + 60000 SF → "Major Apartment Community"', apt369large.label === 'Major Apartment Community');

const apt368 = getSubtype('368', 125000);
assert('368 → "Major Apartment Community (institutional)"', apt368.label === 'Major Apartment Community (institutional)');

const wh238small = getSubtype('238', 8000);
assert('238 + 8000 SF → "Small Warehouse / Flex"', wh238small.label === 'Small Warehouse / Flex');

const wh238large = getSubtype('238', 70000);
assert('238 + 70000 SF → "Distribution Facility"', wh238large.label === 'Distribution Facility');

// formatPropertyType
const formatted = formatPropertyType('369', 60000);
assert('formatPropertyType returns readable string', typeof formatted === 'string' && formatted.length > 0);
console.log(`    → "${formatted}"`);

// isCommercialCode
assert('369 is commercial', isCommercialCode('369') === true);
assert('385 is NOT commercial', isCommercialCode('385') === false);
assert('302 is NOT commercial', isCommercialCode('302') === false);

// isLand
assert('401 is land', isLand('401', 0) === true);
assert('369 with 0 SF is land', isLand('369', 0) === true);
assert('369 with 10000 SF is NOT land', isLand('369', 10000) === false);
assert('117 is land (agriculture)', isLand('117', 0) === true);

// getPriceMetric
const mfMetric = getPriceMetric('369');
assert('MF uses $/SF', mfMetric.metric === 'price_per_sf');
const landMetric = getPriceMetric('401');
assert('Land uses $/Acre', landMetric.metric === 'price_per_acre');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
