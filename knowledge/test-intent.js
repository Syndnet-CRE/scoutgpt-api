/**
 * Test script for knowledge/intent-classifier.js
 * Run: node knowledge/test-intent.js
 */

const {
  classifyIntent,
  extractParameters,
  applySmartDefaults,
  processQuery,
  parseDollarAmount,
} = require('./intent-classifier');

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
console.log('\n💰 DOLLAR PARSING\n');

assert('$1.5M → 1500000', parseDollarAmount('1.5', 'm') === 1500000);
assert('$500K → 500000', parseDollarAmount('500', 'k') === 500000);
assert('$2,000,000 → 2000000', parseDollarAmount('2,000,000', null) === 2000000);
assert('$750 thousand → 750000', parseDollarAmount('750', 'thousand') === 750000);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🎯 INTENT CLASSIFICATION\n');

const testQueries = [
  // [query, expected primary intent]
  ['Find multifamily in 78704', 'PROPERTY_SEARCH'],
  ['Show me apartments over 50,000 SF in South Austin', 'PROPERTY_SEARCH'],
  ['Show me comps for 1102 S Congress Ave', 'COMPARABLE_SALES'],
  ['Run comps on 500 E Riverside', 'COMPARABLE_SALES'],
  ['What comparable sales are near 78702?', 'COMPARABLE_SALES'],
  ['Find distressed multifamily in 78704 under $2M', 'DISTRESSED_SCREEN'],
  ['Show me tax delinquent commercial properties', 'DISTRESSED_SCREEN'],
  ['Find foreclosures in 78745', 'DISTRESSED_SCREEN'],
  ['Find motivated sellers in East Austin', 'DISTRESSED_SCREEN'],
  ['Mom and pop owners of multifamily', 'DISTRESSED_SCREEN'],
  ['Who owns 1102 S Congress Ave?', 'OWNER_RESEARCH'],
  ['Show me everything owned by Greystar', 'OWNER_RESEARCH'],
  ['Run a site analysis on 4500 E Riverside Dr', 'SITE_ANALYSIS'],
  ['Due diligence on 500 W 6th St', 'SITE_ANALYSIS'],
  ['Tell me everything about 1102 S Congress', 'SITE_ANALYSIS'],
  ['Market stats for 78701', 'MARKET_STATISTICS'],
  ['How is the multifamily market in 78702?', 'MARKET_STATISTICS'],
  ['What is the equity position on 1102 S Congress Ave?', 'INVESTMENT_ANALYSIS'],
  ['Investment analysis for 500 E Riverside', 'INVESTMENT_ANALYSIS'],
  ['Find development sites in 78702 over 1 acre', 'DEVELOPMENT_POTENTIAL'],
  ['Teardown candidates in East Austin', 'DEVELOPMENT_POTENTIAL'],
  ['What is the flood risk for 500 E 6th St?', 'RISK_ASSESSMENT'],
  ['Climate risk assessment for this property', 'RISK_ASSESSMENT'],
  ['What permits have been filed near 78702?', 'PERMIT_ACTIVITY'],
  ['What is being built near the Domain?', 'PERMIT_ACTIVITY'],
  ['How have prices changed in 78704?', 'TREND_ANALYSIS'],
];

for (const [query, expectedIntent] of testQueries) {
  const result = classifyIntent(query);
  assert(
    `"${query.substring(0, 50)}..." → ${expectedIntent}`,
    result.primary.intent === expectedIntent
  );
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📦 PARAMETER EXTRACTION\n');

// ZIP codes
const p1 = extractParameters('Find multifamily in 78704');
assert('Extracts ZIP 78704', p1.zipCodes && p1.zipCodes.includes('78704'));
assert('Extracts asset class MULTIFAMILY', p1.assetClass === 'MULTIFAMILY');

// Named areas
const p2 = extractParameters('Show me retail in South Austin');
assert('South Austin → ZIP codes', p2.zipCodes && p2.zipCodes.length >= 4);
assert('Named area = south austin', p2.namedArea === 'south austin');

// Dollar amounts
const p3 = extractParameters('Find properties under $2M');
assert('Under $2M → maxPrice 2000000', p3.maxPrice === 2000000);

const p4 = extractParameters('Properties over $500K');
assert('Over $500K → minPrice 500000', p4.minPrice === 500000);

// Building SF
const p5 = extractParameters('Show me warehouses over 50,000 SF');
assert('Over 50,000 SF → minBuildingSf', p5.minBuildingSf === 50000);
assert('Warehouses → INDUSTRIAL', p5.assetClass === 'INDUSTRIAL');

// Lot acres
const p6 = extractParameters('Find vacant land over 5 acres in 78702');
assert('Over 5 acres → minLotAcres', p6.minLotAcres === 5);
assert('Vacant land → LAND', p6.assetClass === 'LAND');

// Year built
const p7 = extractParameters('Find office built after 2010');
assert('Built after 2010 → minYearBuilt', p7.minYearBuilt === 2010);
assert('Office → OFFICE', p7.assetClass === 'OFFICE');

// Units → SF translation
const p8 = extractParameters('Show me apartments with 50+ units');
assert('50+ units → requestedUnits 50', p8.requestedUnits === 50);
assert('50 units → minBuildingSf ~45000', p8.minBuildingSf === 45000);
assert('Units note present', p8.unitsNote && p8.unitsNote.includes('unavailable'));

// Property class
const p9 = extractParameters('Find Class B multifamily in 78704');
assert('Class B extracted', p9.propertyClass === 'B');
assert('MF + ZIP extracted too', p9.assetClass === 'MULTIFAMILY' && p9.zipCodes.includes('78704'));

// Owner type signals
const p10 = extractParameters('Find absentee owners of office in 78701');
assert('Absentee flag set', p10.absenteeOwner === true);
assert('Office extracted', p10.assetClass === 'OFFICE');

// Distress signals
const p11 = extractParameters('Tax delinquent commercial in 78745');
assert('Tax delinquent flag set', p11.taxDelinquent === true);

// Timeframe
const p12 = extractParameters('What sold in the last 6 months?');
assert('Last 6 months → timeframeMonths 6', p12.timeframeMonths === 6);

// Address extraction
const p13 = extractParameters('Run comps on 1102 S Congress Ave');
assert('Address extracted', p13.subjectAddress && p13.subjectAddress.includes('Congress'));

// Vague terms
const p14 = extractParameters('Find new office buildings');
assert('New → minYearBuilt 2015', p14.minYearBuilt === 2015);

const p15 = extractParameters('Show me old apartments');
assert('Old → maxYearBuilt 1980', p15.maxYearBuilt === 1980);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🔧 SMART DEFAULTS\n');

const d1 = applySmartDefaults({}, 'COMPARABLE_SALES');
assert('Comp defaults: timeframe 24 months', d1.timeframeMonths === 24);
assert('Comp defaults: radius tiers [1,3,5]', d1.radiusTiers && d1.radiusTiers.length === 3);
assert('Comp defaults: arms-length only', d1.armsLengthOnly === true);

const d2 = applySmartDefaults({}, 'MARKET_STATISTICS');
assert('Market stats defaults: timeframe 12 months', d2.timeframeMonths === 12);

const d3 = applySmartDefaults({}, 'PERMIT_ACTIVITY');
assert('Permit defaults: timeframe 24 months', d3.timeframeMonths === 24);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🔄 FULL PIPELINE (processQuery)\n');

const full1 = processQuery('Find distressed multifamily in 78704 under $2M');
assert('Full pipeline: intent = DISTRESSED_SCREEN', full1.intent === 'DISTRESSED_SCREEN');
assert('Full pipeline: has asset codes', full1.params.assetCodes && full1.params.assetCodes.length > 0);
assert('Full pipeline: has ZIP', full1.params.zipCodes && full1.params.zipCodes.includes('78704'));
assert('Full pipeline: has maxPrice', full1.params.maxPrice === 2000000);
assert('Full pipeline: has tools', full1.tools.length > 0);
assert('Full pipeline: has template F', full1.template === 'F');

const full2 = processQuery('Show me comps for 1102 S Congress Ave');
assert('Comp pipeline: intent = COMPARABLE_SALES', full2.intent === 'COMPARABLE_SALES');
assert('Comp pipeline: requires subject', full2.requiresSubject === true);
assert('Comp pipeline: has radius tiers', full2.params.radiusTiers && full2.params.radiusTiers.length === 3);

const full3 = processQuery('Who owns 500 E 6th St?');
assert('Owner pipeline: intent = OWNER_RESEARCH', full3.intent === 'OWNER_RESEARCH');

// Multi-intent detection
const full4 = processQuery('Find distressed multifamily and run comps');
assert('Multi-intent: primary is DISTRESSED_SCREEN or COMPARABLE_SALES', 
  full4.primary.intent === 'DISTRESSED_SCREEN' || full4.primary.intent === 'COMPARABLE_SALES');
assert('Multi-intent: secondary exists', full4.secondary !== null);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
