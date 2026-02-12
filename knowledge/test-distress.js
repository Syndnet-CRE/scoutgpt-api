/**
 * Test script for knowledge/distress-signals.js
 * Run: node knowledge/test-distress.js
 */

const {
  DISTRESS_SIGNALS,
  SCORE_LABELS,
  calculateOpportunityScore,
  getDistressLabel,
  getTriggeredSignals,
  evaluatePreForeclosure,
  evaluateTaxDelinquent,
  evaluateHighLTV,
  evaluateDecliningValue,
  evaluateAbsenteeNoMaintenance,
  evaluateEstateTrust,
  evaluateMomAndPop,
  evaluateBelowMarketValue,
  evaluateDistressedSaleHistory,
  evaluateVacant,
} = require('./distress-signals');

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
console.log('\n📋 SIGNAL DEFINITIONS\n');

assert('Has 10 distress signals', DISTRESS_SIGNALS.length === 10);
assert('Has 5 score labels', SCORE_LABELS.length === 5);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🔍 INDIVIDUAL SIGNAL EVALUATORS\n');

// Signal 1: Pre-Foreclosure
console.log('  --- Pre-Foreclosure ---');
const foreclosureActive = evaluatePreForeclosure({
  foreclosure_records: [{ record_type: 'LIS_PENDENS', status: 'Active', default_amount: 250000 }]
});
assert('Active LIS_PENDENS triggers (weight 25)', foreclosureActive.triggered && foreclosureActive.weight === 25);

const foreclosureNone = evaluatePreForeclosure({ foreclosure_records: [] });
assert('Empty foreclosure records → not triggered', !foreclosureNone.triggered);

const foreclosureNull = evaluatePreForeclosure({});
assert('No foreclosure data → null (unevaluable)', foreclosureNull === null);

// Signal 2: Tax Delinquent
console.log('  --- Tax Delinquency ---');
const taxDelinq1 = evaluateTaxDelinquent({ tax_assessments: { tax_delinquent_year: 2025 } });
assert('1 year delinquent → weight 10', taxDelinq1.triggered && taxDelinq1.weight === 10);

const taxDelinq3 = evaluateTaxDelinquent({ tax_assessments: { tax_delinquent_year: 2023 } });
assert('3 years delinquent → weight 20', taxDelinq3.triggered && taxDelinq3.weight === 20);

const taxDelinq5 = evaluateTaxDelinquent({ tax_assessments: { tax_delinquent_year: 2020 } });
assert('6 years delinquent → weight 25 (CRITICAL)', taxDelinq5.triggered && taxDelinq5.weight === 25);

const taxCurrent = evaluateTaxDelinquent({ tax_assessments: { tax_amount_billed: 5000 } });
assert('Tax current → not triggered', !taxCurrent.triggered);

// Signal 3: High LTV
console.log('  --- High LTV ---');
const ltvUnderwater = evaluateHighLTV({ property_valuations: { ltv: 1.1 } });
assert('LTV 110% → weight 25 (UNDERWATER)', ltvUnderwater.triggered && ltvUnderwater.weight === 25);

const ltvHigh = evaluateHighLTV({ property_valuations: { ltv: 0.95 } });
assert('LTV 95% → weight 20', ltvHigh.triggered && ltvHigh.weight === 20);

const ltvElevated = evaluateHighLTV({ property_valuations: { ltv: 0.85 } });
assert('LTV 85% → weight 10', ltvElevated.triggered && ltvElevated.weight === 10);

const ltvOk = evaluateHighLTV({ property_valuations: { ltv: 0.60 } });
assert('LTV 60% → not triggered', !ltvOk.triggered);

// Handle percentage-style LTV (85 instead of 0.85)
const ltvPctStyle = evaluateHighLTV({ property_valuations: { ltv: 95 } });
assert('LTV 95 (percentage style) → normalizes and triggers', ltvPctStyle.triggered && ltvPctStyle.weight === 20);

// Calculate from balance and value
const ltvCalc = evaluateHighLTV({
  property_valuations: { estimated_value: 1000000 },
  current_loans: { estimated_balance: 920000 }
});
assert('Calculated LTV from balance/value → triggers at 92%', ltvCalc.triggered && ltvCalc.weight === 20);

// Signal 4: Declining Value
console.log('  --- Declining Value ---');
const declining = evaluateDecliningValue({
  property_valuations: { estimated_value: 800000 },
  last_sale_price: 1000000
});
assert('AVM 20% below last sale → triggered', declining.triggered && declining.weight === 10);

const appreciating = evaluateDecliningValue({
  property_valuations: { estimated_value: 1200000 },
  last_sale_price: 1000000
});
assert('AVM above last sale → not triggered', !appreciating.triggered);

// Signal 5: Absentee + No Maintenance
console.log('  --- Absentee + No Maintenance ---');
const absenteeNoPermits = evaluateAbsenteeNoMaintenance({
  ownership: { is_absentee_owner: true },
  building_permits: []
});
assert('Absentee + no permits → triggered (weight 15)', absenteeNoPermits.triggered && absenteeNoPermits.weight === 15);

const absenteeWithPermits = evaluateAbsenteeNoMaintenance({
  ownership: { is_absentee_owner: true },
  building_permits: [{ effective_date: '2025-01-15' }]
});
assert('Absentee + recent permits → not triggered', !absenteeWithPermits.triggered);

const notAbsentee = evaluateAbsenteeNoMaintenance({
  ownership: { is_absentee_owner: false }
});
assert('Not absentee → not triggered', !notAbsentee.triggered);

// Signal 6: Estate / Trust
console.log('  --- Estate / Trust ---');
const estate = evaluateEstateTrust({
  ownership: { owner1_name_full: 'SMITH JOHN ESTATE', trust_flag: false }
});
assert('Owner name contains ESTATE → triggered', estate.triggered && estate.weight === 15);

const trust = evaluateEstateTrust({
  ownership: { owner1_name_full: 'JONES FAMILY TRUST', trust_flag: true }
});
assert('Trust flag + name → triggered', trust.triggered);

const notTrust = evaluateEstateTrust({
  ownership: { owner1_name_full: 'ABC PROPERTIES LLC', trust_flag: false }
});
assert('Regular LLC → not triggered', !notTrust.triggered);

// Signal 7: Mom-and-Pop
console.log('  --- Mom-and-Pop ---');
const momPop = evaluateMomAndPop({
  ownership: { company_flag: false, ownership_transfer_date: '2015-06-01' }
});
assert('Individual owner, 10+ year hold → triggered (weight 8)', momPop.triggered && momPop.weight === 8);

const corporate = evaluateMomAndPop({
  ownership: { company_flag: true, ownership_transfer_date: '2010-01-01' }
});
assert('Corporate owner → not triggered', !corporate.triggered);

const recentIndividual = evaluateMomAndPop({
  ownership: { company_flag: false, ownership_transfer_date: '2024-01-01' }
});
assert('Individual but recent purchase → not triggered', !recentIndividual.triggered);

// Signal 8: Below-Market Value
console.log('  --- Below-Market Value ---');
const belowMarket = evaluateBelowMarketValue({
  last_sale_price: 500000,
  property_valuations: { estimated_value: 1000000 }
});
assert('Sale 50% below AVM → triggered (weight 12)', belowMarket.triggered && belowMarket.weight === 12);

const atMarket = evaluateBelowMarketValue({
  last_sale_price: 950000,
  property_valuations: { estimated_value: 1000000 }
});
assert('Sale near AVM → not triggered', !atMarket.triggered);

// Signal 9: Distressed Sale History
console.log('  --- Distressed Sale History ---');
const distressedSale = evaluateDistressedSaleHistory({
  sales_transactions: [{ recording_date: '2024-06-01', is_distressed: true, is_foreclosure_auction: false }]
});
assert('Distressed sale → triggered (weight 20)', distressedSale.triggered && distressedSale.weight === 20);

const normalSale = evaluateDistressedSaleHistory({
  sales_transactions: [{ recording_date: '2024-06-01', is_distressed: false, is_foreclosure_auction: false }]
});
assert('Normal sale → not triggered', !normalSale.triggered);

// Signal 10: Vacant
console.log('  --- Vacant / Unoccupied ---');
const vacant = evaluateVacant({
  ownership: { is_owner_occupied: false, is_absentee_owner: true },
  building_permits: []
});
assert('Not occupied + absentee + no permits → triggered (weight 10)', vacant.triggered && vacant.weight === 10);

const ownerOccupied = evaluateVacant({
  ownership: { is_owner_occupied: true }
});
assert('Owner-occupied → not triggered', !ownerOccupied.triggered);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📊 COMPOSITE SCORING\n');

// Heavily distressed property
const heavyDistress = calculateOpportunityScore({
  foreclosure_records: [{ record_type: 'LIS_PENDENS', status: 'Active', default_amount: 150000 }],
  tax_assessments: { tax_delinquent_year: 2022 },
  property_valuations: { ltv: 1.05, estimated_value: 500000 },
  current_loans: { estimated_balance: 525000 },
  ownership: { is_absentee_owner: true, is_owner_occupied: false, company_flag: false, trust_flag: false, owner1_name_full: 'SMITH JOHN', ownership_transfer_date: '2010-01-01' },
  building_permits: [],
  last_sale_price: 400000,
  sales_transactions: [{ recording_date: '2019-01-01', is_distressed: true, is_foreclosure_auction: false }],
});

console.log(`  Heavy distress score: ${heavyDistress.score}/100 (${heavyDistress.label})`);
console.log(`  Raw score: ${heavyDistress.rawScore}`);
console.log(`  Triggered signals: ${heavyDistress.signals.filter(s => s.triggered).length}`);
console.log(`  Unevaluated: ${heavyDistress.unevaluated.length}`);
assert('Heavy distress → Critical or High Opportunity', heavyDistress.score >= 60);
assert('Multiple signals triggered', heavyDistress.signals.filter(s => s.triggered).length >= 5);

// Stable property
const stable = calculateOpportunityScore({
  foreclosure_records: [],
  tax_assessments: { tax_amount_billed: 12000 },
  property_valuations: { ltv: 0.50, estimated_value: 2000000 },
  current_loans: { estimated_balance: 1000000 },
  ownership: { is_absentee_owner: false, is_owner_occupied: true, company_flag: true, trust_flag: false, owner1_name_full: 'GREYSTAR REAL ESTATE LLC', ownership_transfer_date: '2022-06-01' },
  building_permits: [{ effective_date: '2025-03-01' }],
  last_sale_price: 1900000,
  sales_transactions: [{ recording_date: '2022-06-01', is_distressed: false, is_foreclosure_auction: false }],
});

console.log(`\n  Stable property score: ${stable.score}/100 (${stable.label})`);
assert('Stable property → score < 20', stable.score < 20);
assert('No signals triggered', stable.signals.filter(s => s.triggered).length === 0);

// Partial data (some signals unevaluable)
const partialData = calculateOpportunityScore({
  ownership: { is_absentee_owner: true, is_owner_occupied: false, company_flag: false, trust_flag: false, owner1_name_full: 'DOE JANE', ownership_transfer_date: '2008-03-15' },
  building_permits: [],
});

console.log(`\n  Partial data score: ${partialData.score}/100 (${partialData.label})`);
console.log(`  Evaluated: ${partialData.signals.length}, Unevaluated: ${partialData.unevaluated.length}`);
assert('Partial data still produces a score', partialData.score >= 0);
assert('Some signals unevaluated', partialData.unevaluated.length > 0);
assert('Absentee + no maintenance triggers', partialData.signals.some(s => s.id === 'ABSENTEE_NO_MAINTENANCE' && s.triggered));
assert('Mom-and-pop triggers', partialData.signals.some(s => s.id === 'MOM_AND_POP' && s.triggered));

// Null/empty input
const empty = calculateOpportunityScore(null);
assert('Null input → score 0', empty.score === 0);
assert('Null input → all unevaluated', empty.unevaluated.length === 10);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🏷️  LABELS\n');

assert('Score 85 → Critical Opportunity', getDistressLabel(85).label === 'Critical Opportunity');
assert('Score 65 → High Opportunity', getDistressLabel(65).label === 'High Opportunity');
assert('Score 45 → Moderate Opportunity', getDistressLabel(45).label === 'Moderate Opportunity');
assert('Score 25 → Low Opportunity', getDistressLabel(25).label === 'Low Opportunity');
assert('Score 10 → Stable', getDistressLabel(10).label === 'Stable');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🔗 HELPER FUNCTIONS\n');

const triggered = getTriggeredSignals({
  tax_assessments: { tax_delinquent_year: 2022 },
  ownership: { is_absentee_owner: true, is_owner_occupied: false, company_flag: false, trust_flag: false, owner1_name_full: 'DOE JOHN', ownership_transfer_date: '2012-01-01' },
  building_permits: [],
});
assert('getTriggeredSignals returns array', Array.isArray(triggered));
assert('getTriggeredSignals finds tax delinquent', triggered.some(s => s.includes('Tax')));
console.log(`  Triggered: ${triggered.join(', ')}`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
