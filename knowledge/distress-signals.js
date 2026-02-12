/**
 * ScoutGPT Distress Signal Taxonomy & Opportunity Scoring
 * 
 * Detects 10 distress signals from ATTOM property data and calculates
 * a composite Opportunity Score (0-100) for acquisition targeting.
 * 
 * Input: Full property detail object from get_property_details
 * Output: Score 0-100, label, signal breakdown, and unevaluated signals
 * 
 * IMPORTANT: Some signals depend on data that may be missing (e.g., 
 * property_valuations, foreclosure_records). The scorer handles nulls
 * gracefully and reports which signals couldn't be evaluated.
 */

// ─── Signal Definitions ─────────────────────────────────────────────────────

const DISTRESS_SIGNALS = [
  {
    id: 'PRE_FORECLOSURE',
    name: 'Pre-Foreclosure / Notice of Default',
    source: 'foreclosure_records',
    severity: 'HIGH',
    maxWeight: 25,
    description: 'Active foreclosure proceedings indicate immediate financial distress',
  },
  {
    id: 'TAX_DELINQUENT',
    name: 'Tax Delinquency',
    source: 'tax_assessments.tax_delinquent_year',
    severity: 'VARIABLE', // 10-25 based on years
    maxWeight: 25,
    description: 'Unpaid property taxes signal cash flow problems',
  },
  {
    id: 'HIGH_LTV',
    name: 'High LTV / Underwater',
    source: 'property_valuations.ltv + current_loans',
    severity: 'VARIABLE', // 10-25 based on LTV level
    maxWeight: 25,
    description: 'Limited refinance options, potential distressed sale motivation',
  },
  {
    id: 'DECLINING_VALUE',
    name: 'Declining Value',
    source: 'property_valuations (time series)',
    severity: 'MODERATE',
    maxWeight: 10,
    description: 'AVM suggests market softening or property deterioration',
  },
  {
    id: 'ABSENTEE_NO_MAINTENANCE',
    name: 'Absentee Owner + No Maintenance',
    source: 'ownership.is_absentee_owner + building_permits',
    severity: 'MODERATE',
    maxWeight: 15,
    description: 'Out-of-area owner with no investment in property maintenance',
  },
  {
    id: 'ESTATE_TRUST',
    name: 'Estate / Trust Ownership',
    source: 'ownership.trust_flag + owner name patterns',
    severity: 'MODERATE',
    maxWeight: 15,
    description: 'Estate situations often create motivation to liquidate',
  },
  {
    id: 'MOM_AND_POP',
    name: 'Mom-and-Pop Owner',
    source: 'ownership.company_flag + ownership_transfer_date',
    severity: 'LOW-MODERATE',
    maxWeight: 8,
    description: 'Individual owner with long hold period — potential tired landlord',
  },
  {
    id: 'BELOW_MARKET_VALUE',
    name: 'Below-Market Value',
    source: 'tax_assessed_value_total vs submarket median',
    severity: 'MODERATE',
    maxWeight: 12,
    description: 'Property may be significantly undervalued',
  },
  {
    id: 'DISTRESSED_SALE_HISTORY',
    name: 'Distressed Sale History',
    source: 'sales_transactions.is_distressed',
    severity: 'HIGH',
    maxWeight: 20,
    description: 'Previously acquired in distress — may still be in distressed condition',
  },
  {
    id: 'VACANT_ESTIMATED',
    name: 'Vacant / Unoccupied (estimated)',
    source: 'ownership.is_owner_occupied + absentee indicators',
    severity: 'MODERATE',
    maxWeight: 10,
    description: 'Potential vacancy increases carrying costs and motivation to sell',
  },
];

// Maximum possible score (sum of all maxWeights)
const MAX_POSSIBLE_SCORE = DISTRESS_SIGNALS.reduce((sum, s) => sum + s.maxWeight, 0);
// = 165

// ─── Score Labels ───────────────────────────────────────────────────────────

const SCORE_LABELS = [
  { min: 80, max: 100, label: 'Critical Opportunity', emoji: '🔴', description: 'Multiple severe distress signals — immediate action recommended' },
  { min: 60, max: 79,  label: 'High Opportunity',     emoji: '🟠', description: 'Significant distress indicators — strong acquisition target' },
  { min: 40, max: 59,  label: 'Moderate Opportunity',  emoji: '🟡', description: 'Some distress signals — worth investigating' },
  { min: 20, max: 39,  label: 'Low Opportunity',       emoji: '🟢', description: 'Minimal distress — may still have value-add potential' },
  { min: 0,  max: 19,  label: 'Stable',                emoji: '⚪', description: 'No significant distress signals' },
];

// ─── Individual Signal Evaluators ───────────────────────────────────────────
// Each function takes the full property data object and returns:
// { triggered: boolean, weight: number, detail: string } or null (if can't evaluate)

/**
 * Signal 1: Pre-Foreclosure / Notice of Default
 * Checks foreclosure_records for active filings
 */
function evaluatePreForeclosure(data) {
  const foreclosures = data.foreclosure_records || data.foreclosures;
  
  if (!foreclosures || !Array.isArray(foreclosures)) {
    return null; // Can't evaluate — no foreclosure data
  }

  const active = foreclosures.filter(f => {
    const status = (f.status || '').toLowerCase();
    const recordType = (f.record_type || '').toUpperCase();
    return (
      (status === 'active' || status === 'pre-foreclosure') &&
      (recordType === 'LIS_PENDENS' || recordType === 'NOTICE_OF_DEFAULT' || recordType === 'NOD')
    );
  });

  if (active.length > 0) {
    const detail = `Active ${active[0].record_type || 'foreclosure filing'} found` +
      (active[0].default_amount ? ` — default amount: $${Number(active[0].default_amount).toLocaleString()}` : '');
    return { triggered: true, weight: 25, detail };
  }

  // Check if any foreclosure records exist at all (even resolved ones)
  if (foreclosures.length > 0) {
    return { triggered: false, weight: 0, detail: 'Foreclosure records exist but none are active' };
  }

  return { triggered: false, weight: 0, detail: 'No foreclosure records' };
}

/**
 * Signal 2: Tax Delinquency
 * Checks tax_assessments.tax_delinquent_year
 */
function evaluateTaxDelinquent(data) {
  // Try multiple paths to find tax delinquent data
  const taxData = data.tax_assessments || data.tax || {};
  const delinquentYear = taxData.tax_delinquent_year || data.tax_delinquent_year;

  if (delinquentYear === undefined || delinquentYear === null) {
    // Check if we have tax data at all
    if (taxData.tax_amount_billed || taxData.assessed_value_total || data.tax_assessed_value_total) {
      return { triggered: false, weight: 0, detail: 'Tax current — no delinquency' };
    }
    return null; // Can't evaluate — no tax data
  }

  const currentYear = new Date().getFullYear();
  const yearsDelinquent = currentYear - Number(delinquentYear);

  if (yearsDelinquent >= 4) {
    return { triggered: true, weight: 25, detail: `Tax delinquent since ${delinquentYear} (${yearsDelinquent} years) — CRITICAL` };
  } else if (yearsDelinquent >= 2) {
    return { triggered: true, weight: 20, detail: `Tax delinquent since ${delinquentYear} (${yearsDelinquent} years)` };
  } else if (yearsDelinquent >= 1) {
    return { triggered: true, weight: 10, detail: `Tax delinquent since ${delinquentYear} (${yearsDelinquent} year)` };
  }

  return { triggered: false, weight: 0, detail: 'Tax current' };
}

/**
 * Signal 3: High LTV / Underwater
 * Checks property_valuations.ltv and loan balance vs value
 */
function evaluateHighLTV(data) {
  const valuations = data.property_valuations || data.valuations || {};
  const loans = data.current_loans || data.loans || {};

  const ltv = valuations.ltv || null;
  const estimatedValue = valuations.estimated_value || null;
  const estimatedBalance = loans.estimated_balance || valuations.estimated_balance || null;

  // Try to calculate LTV if not directly available
  let calculatedLtv = ltv;
  if (!calculatedLtv && estimatedValue && estimatedBalance && estimatedValue > 0) {
    calculatedLtv = estimatedBalance / estimatedValue;
  }

  if (calculatedLtv === null || calculatedLtv === undefined) {
    return null; // Can't evaluate
  }

  // Normalize — ATTOM may store as decimal (0.85) or percentage (85)
  const ltvDecimal = calculatedLtv > 2 ? calculatedLtv / 100 : calculatedLtv;
  const ltvPct = (ltvDecimal * 100).toFixed(1);

  if (ltvDecimal > 1.0) {
    return { triggered: true, weight: 25, detail: `LTV ${ltvPct}% — UNDERWATER (owes more than property is worth)` };
  } else if (ltvDecimal > 0.90) {
    return { triggered: true, weight: 20, detail: `LTV ${ltvPct}% — very high, limited refinance options` };
  } else if (ltvDecimal > 0.80) {
    return { triggered: true, weight: 10, detail: `LTV ${ltvPct}% — elevated` };
  }

  return { triggered: false, weight: 0, detail: `LTV ${ltvPct}%` };
}

/**
 * Signal 4: Declining Value
 * Checks if current AVM < previous AVM or < last sale price
 */
function evaluateDecliningValue(data) {
  const valuations = data.property_valuations || data.valuations || {};
  const estimatedValue = valuations.estimated_value || null;
  const previousValue = valuations.previous_estimated_value || null;
  const lastSalePrice = data.last_sale_price || (data.properties || {}).last_sale_price || null;

  if (!estimatedValue) {
    return null; // Can't evaluate
  }

  // Check against previous valuation if available
  if (previousValue && estimatedValue < previousValue) {
    const decline = (((previousValue - estimatedValue) / previousValue) * 100).toFixed(1);
    return { triggered: true, weight: 10, detail: `AVM declined ${decline}% from previous valuation` };
  }

  // Check against last sale price as proxy
  if (lastSalePrice && estimatedValue < lastSalePrice * 0.90) {
    const decline = (((lastSalePrice - estimatedValue) / lastSalePrice) * 100).toFixed(1);
    return { triggered: true, weight: 10, detail: `Current AVM ${decline}% below last sale price` };
  }

  if (previousValue || lastSalePrice) {
    return { triggered: false, weight: 0, detail: 'Value stable or appreciating' };
  }

  return null; // Not enough data to compare
}

/**
 * Signal 5: Absentee Owner + No Maintenance
 * Checks ownership.is_absentee_owner AND absence of building permits
 */
function evaluateAbsenteeNoMaintenance(data) {
  const ownership = data.ownership || {};
  const isAbsentee = ownership.is_absentee_owner;

  if (isAbsentee === null || isAbsentee === undefined) {
    return null; // Can't evaluate
  }

  if (!isAbsentee) {
    return { triggered: false, weight: 0, detail: 'Owner is not absentee' };
  }

  // Check permits
  const permits = data.building_permits || data.permits || [];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  let recentPermits = 0;
  if (Array.isArray(permits)) {
    recentPermits = permits.filter(p => {
      const permitDate = new Date(p.effective_date || p.date || 0);
      return permitDate >= fiveYearsAgo;
    }).length;
  }

  if (recentPermits === 0) {
    return { triggered: true, weight: 15, detail: 'Absentee owner with no permits in 5+ years' };
  }

  return { triggered: false, weight: 0, detail: `Absentee owner but has ${recentPermits} recent permit(s)` };
}

/**
 * Signal 6: Estate / Trust Ownership
 * Checks trust_flag and owner name patterns
 */
function evaluateEstateTrust(data) {
  const ownership = data.ownership || {};
  const trustFlag = ownership.trust_flag;
  const ownerName = (ownership.owner1_name_full || data.owner_name || '').toUpperCase();

  if (!ownerName && (trustFlag === null || trustFlag === undefined)) {
    return null; // Can't evaluate
  }

  // "REAL ESTATE" is a business term, not an estate/probate indicator
  const nameWithoutRealEstate = ownerName.replace(/REAL\s+ESTATE/g, '');
  const isEstate = nameWithoutRealEstate.includes('ESTATE') || ownerName.includes('HEIR') || ownerName.includes('DECEASED');
  const isTrust = trustFlag === true || ownerName.includes('TRUST');

  if (isEstate) {
    return { triggered: true, weight: 15, detail: `Estate ownership detected: "${ownerName.substring(0, 50)}"` };
  }

  if (isTrust) {
    return { triggered: true, weight: 15, detail: `Trust ownership: "${ownerName.substring(0, 50)}"` };
  }

  return { triggered: false, weight: 0, detail: 'Not estate or trust ownership' };
}

/**
 * Signal 7: Mom-and-Pop Owner
 * Individual (non-corporate) owner with 5+ year hold
 */
function evaluateMomAndPop(data) {
  const ownership = data.ownership || {};
  const companyFlag = ownership.company_flag;
  const transferDate = ownership.ownership_transfer_date;

  if (companyFlag === null || companyFlag === undefined) {
    return null; // Can't evaluate
  }

  if (companyFlag === true) {
    return { triggered: false, weight: 0, detail: 'Corporate/entity owner' };
  }

  // Individual owner — check hold period
  if (!transferDate) {
    return { triggered: false, weight: 0, detail: 'Individual owner, hold period unknown' };
  }

  const holdYears = (new Date() - new Date(transferDate)) / (365.25 * 24 * 60 * 60 * 1000);

  if (holdYears >= 5) {
    return {
      triggered: true,
      weight: 8,
      detail: `Individual owner, held ${Math.floor(holdYears)} years — potential tired landlord`,
    };
  }

  return { triggered: false, weight: 0, detail: `Individual owner, held ${Math.floor(holdYears)} years` };
}

/**
 * Signal 8: Below-Market Value
 * Property assessed value significantly below what's expected
 * NOTE: Submarket median comparison requires context; we use simple heuristics here
 */
function evaluateBelowMarketValue(data) {
  const assessedValue = data.tax_assessed_value_total ||
    (data.tax_assessments || {}).assessed_value_total ||
    (data.properties || {}).tax_assessed_value_total;

  const estimatedValue = (data.property_valuations || data.valuations || {}).estimated_value;
  const lastSalePrice = data.last_sale_price || (data.properties || {}).last_sale_price;

  if (!assessedValue && !lastSalePrice) {
    return null; // Can't evaluate
  }

  // Check if last sale was significantly below AVM
  if (lastSalePrice && estimatedValue && lastSalePrice < estimatedValue * 0.70) {
    const discount = (((estimatedValue - lastSalePrice) / estimatedValue) * 100).toFixed(1);
    return { triggered: true, weight: 12, detail: `Last sale ${discount}% below current AVM estimate` };
  }

  // Check if assessed value is significantly below AVM
  if (assessedValue && estimatedValue && assessedValue < estimatedValue * 0.60) {
    const gap = (((estimatedValue - assessedValue) / estimatedValue) * 100).toFixed(1);
    return { triggered: true, weight: 12, detail: `Assessed value ${gap}% below AVM — potential undervaluation` };
  }

  return { triggered: false, weight: 0, detail: 'Value appears at or near market' };
}

/**
 * Signal 9: Distressed Sale History
 * Most recent sale was distressed or foreclosure auction
 */
function evaluateDistressedSaleHistory(data) {
  const sales = data.sales_transactions || data.sales || [];

  if (!Array.isArray(sales) || sales.length === 0) {
    // Check properties-level fields
    const isDistressed = (data.properties || {}).is_distressed || data.is_distressed;
    if (isDistressed === true) {
      return { triggered: true, weight: 20, detail: 'Most recent sale flagged as distressed' };
    }
    if (isDistressed === false) {
      return { triggered: false, weight: 0, detail: 'Most recent sale was arms-length' };
    }
    return null; // Can't evaluate
  }

  // Sort by date descending, check most recent
  const sorted = [...sales].sort((a, b) => {
    return new Date(b.recording_date || b.sale_date || 0) - new Date(a.recording_date || a.sale_date || 0);
  });

  const mostRecent = sorted[0];
  if (mostRecent.is_distressed === true || mostRecent.is_foreclosure_auction === true) {
    const saleDate = mostRecent.recording_date || mostRecent.sale_date || 'unknown date';
    const type = mostRecent.is_foreclosure_auction ? 'foreclosure auction' : 'distressed sale';
    return { triggered: true, weight: 20, detail: `Last sale was ${type} on ${saleDate}` };
  }

  return { triggered: false, weight: 0, detail: 'Most recent sale was arms-length market transaction' };
}

/**
 * Signal 10: Vacant / Unoccupied (estimated)
 * Not owner-occupied + absentee indicators + no recent activity
 */
function evaluateVacant(data) {
  const ownership = data.ownership || {};
  const isOwnerOccupied = ownership.is_owner_occupied;
  const isAbsentee = ownership.is_absentee_owner;

  if (isOwnerOccupied === null || isOwnerOccupied === undefined) {
    return null; // Can't evaluate
  }

  if (isOwnerOccupied === true) {
    return { triggered: false, weight: 0, detail: 'Owner-occupied' };
  }

  // Not owner-occupied — check other vacancy indicators
  const permits = data.building_permits || data.permits || [];
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  const recentPermits = Array.isArray(permits) ? permits.filter(p => {
    return new Date(p.effective_date || p.date || 0) >= tenYearsAgo;
  }).length : 0;

  if (isAbsentee === true && recentPermits === 0) {
    return { triggered: true, weight: 10, detail: 'Not owner-occupied, absentee owner, no permits in 10+ years — likely vacant or neglected' };
  }

  return { triggered: false, weight: 0, detail: 'Not owner-occupied but shows activity' };
}

// Map signal IDs to evaluator functions
const SIGNAL_EVALUATORS = {
  PRE_FORECLOSURE:       evaluatePreForeclosure,
  TAX_DELINQUENT:        evaluateTaxDelinquent,
  HIGH_LTV:              evaluateHighLTV,
  DECLINING_VALUE:       evaluateDecliningValue,
  ABSENTEE_NO_MAINTENANCE: evaluateAbsenteeNoMaintenance,
  ESTATE_TRUST:          evaluateEstateTrust,
  MOM_AND_POP:           evaluateMomAndPop,
  BELOW_MARKET_VALUE:    evaluateBelowMarketValue,
  DISTRESSED_SALE_HISTORY: evaluateDistressedSaleHistory,
  VACANT_ESTIMATED:      evaluateVacant,
};

// ─── Composite Opportunity Score Calculator ─────────────────────────────────

/**
 * Calculate composite Opportunity Score for a property.
 * 
 * @param {object} propertyData - Full property detail object from get_property_details
 * @returns {{
 *   score: number,           // 0-100 normalized score
 *   rawScore: number,        // Sum of triggered signal weights
 *   label: string,           // "Critical Opportunity", "High Opportunity", etc.
 *   emoji: string,           // 🔴, 🟠, 🟡, 🟢, ⚪
 *   description: string,     // Label description
 *   signals: Array<{         // Breakdown of each signal
 *     id: string,
 *     name: string,
 *     triggered: boolean,
 *     weight: number,
 *     maxWeight: number,
 *     detail: string
 *   }>,
 *   unevaluated: Array<{     // Signals that couldn't be evaluated
 *     id: string,
 *     name: string,
 *     reason: string
 *   }>,
 *   caveat: string           // Required disclaimer
 * }}
 */
function calculateOpportunityScore(propertyData) {
  if (!propertyData) {
    return {
      score: 0,
      rawScore: 0,
      label: 'Unknown',
      emoji: '⚪',
      description: 'No property data provided',
      signals: [],
      unevaluated: DISTRESS_SIGNALS.map(s => ({
        id: s.id, name: s.name, reason: 'No property data'
      })),
      caveat: CAVEAT_TEXT,
    };
  }

  const signals = [];
  const unevaluated = [];
  let rawScore = 0;

  for (const signal of DISTRESS_SIGNALS) {
    const evaluator = SIGNAL_EVALUATORS[signal.id];
    if (!evaluator) continue;

    try {
      const result = evaluator(propertyData);

      if (result === null) {
        unevaluated.push({
          id: signal.id,
          name: signal.name,
          reason: `Missing data from ${signal.source}`,
        });
      } else {
        signals.push({
          id: signal.id,
          name: signal.name,
          triggered: result.triggered,
          weight: result.weight,
          maxWeight: signal.maxWeight,
          detail: result.detail,
        });
        rawScore += result.weight;
      }
    } catch (err) {
      unevaluated.push({
        id: signal.id,
        name: signal.name,
        reason: `Error evaluating: ${err.message}`,
      });
    }
  }

  // Normalize to 0-100
  // Use the max possible from evaluable signals (not all 165)
  const evaluableMax = signals.reduce((sum, s) => sum + s.maxWeight, 0);
  const score = evaluableMax > 0 ? Math.round((rawScore / evaluableMax) * 100) : 0;

  // Get label
  const labelEntry = SCORE_LABELS.find(l => score >= l.min && score <= l.max) || SCORE_LABELS[SCORE_LABELS.length - 1];

  return {
    score,
    rawScore,
    label: labelEntry.label,
    emoji: labelEntry.emoji,
    description: labelEntry.description,
    signals,
    unevaluated,
    caveat: CAVEAT_TEXT,
  };
}

/**
 * Get the label/emoji for a given score without full calculation.
 * @param {number} score - 0-100
 * @returns {{ label: string, emoji: string, description: string }}
 */
function getDistressLabel(score) {
  const entry = SCORE_LABELS.find(l => score >= l.min && score <= l.max) || SCORE_LABELS[SCORE_LABELS.length - 1];
  return { label: entry.label, emoji: entry.emoji, description: entry.description };
}

/**
 * Get just the triggered signal names for a quick summary.
 * @param {object} propertyData
 * @returns {string[]} - e.g. ["Tax Delinquent (20)", "Absentee + No Maintenance (15)"]
 */
function getTriggeredSignals(propertyData) {
  const result = calculateOpportunityScore(propertyData);
  return result.signals
    .filter(s => s.triggered)
    .map(s => `${s.name} (${s.weight})`);
}

const CAVEAT_TEXT = 'Opportunity scoring is based on available public records. On-site inspection and owner contact are required to verify distress level.';

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  DISTRESS_SIGNALS,
  SCORE_LABELS,
  MAX_POSSIBLE_SCORE,
  CAVEAT_TEXT,
  calculateOpportunityScore,
  getDistressLabel,
  getTriggeredSignals,
  // Export individual evaluators for unit testing
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
};
