/**
 * Test script for knowledge/system-prompt.js
 * Run: node knowledge/test-system-prompt.js
 */

const {
  buildSystemPrompt,
  buildCompactPrompt,
  buildCodeGroupReference,
  buildDistressReference,
  buildScoreLabels,
} = require('./system-prompt');

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
console.log('\n🔧 COMPONENT BUILDERS\n');

const codeRef = buildCodeGroupReference();
assert('Code group reference is non-empty', codeRef.length > 100);
assert('Contains MULTIFAMILY', codeRef.includes('MULTIFAMILY'));
assert('Contains INDUSTRIAL', codeRef.includes('INDUSTRIAL'));
assert('Contains code 369', codeRef.includes('369'));

const distressRef = buildDistressReference();
assert('Distress reference is non-empty', distressRef.length > 100);
assert('Contains Pre-Foreclosure', distressRef.includes('Pre-Foreclosure'));
assert('Contains Tax Delinquency', distressRef.includes('Tax Delinquency'));
assert('Contains 10 signals', distressRef.split('\n').length === 10);

const labels = buildScoreLabels();
assert('Score labels non-empty', labels.length > 50);
assert('Contains Critical', labels.includes('Critical'));
assert('Contains Stable', labels.includes('Stable'));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n📝 FULL SYSTEM PROMPT\n');

const prompt = buildSystemPrompt();
assert('Prompt is non-empty', prompt.length > 500);

// Identity
assert('Contains ScoutGPT identity', prompt.includes('You are ScoutGPT'));
assert('Contains CRE terminology', prompt.includes('commercial real estate'));

// Critical data facts
assert('Warns about numeric codes', prompt.includes('NUMERIC ATTOM codes'));
assert('Warns about units_count', prompt.includes('units_count is 0/NULL'));
assert('Contains 900 SF/unit proxy', prompt.includes('900 SF/unit'));

// Code groups present
assert('Contains code group reference', prompt.includes('MULTIFAMILY: codes'));
assert('Contains ALL_COMMERCIAL_CODES', prompt.includes('ALL_COMMERCIAL_CODES'));

// Tool instructions
assert('Contains search_properties tool', prompt.includes('search_properties'));
assert('Contains get_property_details tool', prompt.includes('get_property_details'));
assert('Contains get_market_stats tool', prompt.includes('get_market_stats'));
assert('Contains spatial_query tool', prompt.includes('spatial_query'));
assert('Contains propertyType translation rules', prompt.includes('"369"'));

// Intent routing
assert('Contains PROPERTY SEARCH routing', prompt.includes('PROPERTY SEARCH'));
assert('Contains COMPARABLE SALES routing', prompt.includes('COMPARABLE SALES'));
assert('Contains DISTRESSED routing', prompt.includes('DISTRESSED'));
assert('Contains OWNER RESEARCH routing', prompt.includes('OWNER RESEARCH'));
assert('Contains SITE ANALYSIS routing', prompt.includes('SITE ANALYSIS'));

// Distress framework
assert('Contains distress signal list', prompt.includes('Pre-Foreclosure'));
assert('Contains score labels', prompt.includes('Critical Opportunity'));

// Output formatting rules
assert('Contains formatting rules', prompt.includes('Lead with the answer'));
assert('Contains code translation rule', prompt.includes('NEVER show numeric codes'));
assert('Contains follow-up instruction', prompt.includes('follow-up suggestions'));

// Caveats
assert('Contains cap rate caveat', prompt.includes('Actual cap rate requires'));
assert('Contains NOI caveat', prompt.includes('Net operating income cannot'));
assert('Contains loan data caveat', prompt.includes('Loan balances are modeled'));

// Limitations
assert('Contains NOI limitation', prompt.includes('cannot provide actual NOI'));
assert('Contains zoning limitation', prompt.includes('cannot determine exact zoning'));

// Token count
const tokenEstimate = Math.ceil(prompt.length / 4); // rough estimate
console.log(`\n  Prompt length: ${prompt.length} chars (~${tokenEstimate} tokens)`);
assert('Prompt under 12K tokens', tokenEstimate < 12000);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n🏗️  CONTEXT INJECTION\n');

const contextPrompt = buildSystemPrompt({
  selectedAttomId: '12345678',
  viewport: { minLng: -97.8, minLat: 30.2, maxLng: -97.6, maxLat: 30.4 },
});
assert('Context prompt includes selected property', contextPrompt.includes('12345678'));
assert('Context prompt includes viewport', contextPrompt.includes('-97.8'));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n⚡ COMPACT PROMPT\n');

const compact = buildCompactPrompt();
assert('Compact prompt exists', compact.length > 50);
assert('Compact prompt is short', compact.length < 1000);
assert('Compact mentions key code', compact.includes('369'));
assert('Compact mentions units unavailable', compact.includes('unavailable'));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
