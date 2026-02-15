// ══════════════════════════════════════════════════════════════
// ScoutGPT v2 — Filter Mappings
// File: utils/filterMappings.js
//
// Contains verified asset class taxonomy and owner type mappings
// for the filter system. All property_use_standardized codes
// verified against Neon ATTOM data.
// ══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────
// ASSET CLASS TAXONOMY (12 groups)
// Verified codes from ATTOM property_use_standardized
// ──────────────────────────────────────────────────────────────
const ASSET_CLASS_CODES = {
  singleFamily: [385, 373, 375, 369, 381],
  condo: [366], // 401 handled with split logic
  multifamily: [386, 378, 388, 368, 359, 370], // 383 handled with split logic
  mixedUse: [155, 358],
  office: [139, 172, 184],
  retail: [169, 167, 148, 166, 194],
  industrial: [238, 135, 171, 175, 210, 229, 212, 231, 220, 280],
  hospitality: [178],
  seniorLiving: [339],
  land: [120, 270, 117, 109],
  developments: [402], // 401 and 383 handled with split logic
  specialPurpose: [126, 124, 146, 160, 150, 159, 302, 329, 330, 347, 246, 342, 311],
};

// Codes that require split logic based on building characteristics
const SPLIT_CODES = {
  // Code 401: Condo if improved, Development if unimproved
  401: {
    improvedGroup: 'condo',
    developmentGroup: 'developments',
  },
  // Code 383: Multifamily if improved, Development if unimproved
  383: {
    improvedGroup: 'multifamily',
    developmentGroup: 'developments',
  },
};

// Improvement condition SQL fragments
const IMPROVED_CONDITION = '(area_building > 0 OR year_built > 0)';
const UNIMPROVED_CONDITION = '((area_building IS NULL OR area_building = 0) AND (year_built IS NULL OR year_built = 0))';

// All remaining codes not in groups 1-11 go to Special Purpose
// This is calculated dynamically to ensure completeness

// Human-readable labels for frontend
const ASSET_CLASS_LABELS = {
  singleFamily: 'Single Family',
  condo: 'Condo',
  multifamily: 'Multifamily',
  mixedUse: 'Mixed-Use',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  hospitality: 'Hospitality',
  seniorLiving: 'Senior Living',
  land: 'Land',
  developments: 'Developments',
  specialPurpose: 'Special Purpose',
};

// ──────────────────────────────────────────────────────────────
// OWNER TYPE MAPPINGS
// Maps frontend owner types to SQL conditions
// ──────────────────────────────────────────────────────────────
const OWNER_TYPE_CONDITIONS = {
  individual: {
    description: 'Individual owner (not corporate, not trust)',
    condition: '(o.company_flag = false OR o.company_flag IS NULL) AND (o.trust_flag = false OR o.trust_flag IS NULL)',
  },
  corporate: {
    description: 'Corporate/LLC/Company owned',
    condition: 'o.company_flag = true',
  },
  trust: {
    description: 'Trust ownership',
    condition: 'o.trust_flag = true',
  },
  government: {
    description: 'Government owned',
    condition: "o.owner1_name_full ~* '(CITY OF|COUNTY OF|STATE OF|UNITED STATES|USA|GOVERNMENT|MUNICIPAL|PUBLIC|SCHOOL DISTRICT|ISD|HOUSING AUTHORITY)'",
  },
  builder: {
    description: 'Builder/Developer owned',
    condition: "o.owner1_name_full ~* '(BUILDER|BUILDERS|CONSTRUCTION|HOMES|HOME BUILDERS|DEVELOPMENT|DEVELOPER|DEVELOPERS|COMMUNITIES|RESIDENTIAL)'",
  },
};

// ──────────────────────────────────────────────────────────────
// FORECLOSURE TYPE MAPPINGS
// ──────────────────────────────────────────────────────────────
const FORECLOSURE_TYPES = {
  NTS: 'Notice of Trustee Sale',
  LIS: 'Lis Pendens',
  NOD: 'Notice of Default',
};

// ──────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────

/**
 * Builds SQL WHERE conditions for asset class filtering
 * Handles the split logic for codes 401 and 383
 * @param {string[]} assetClasses - Array of asset class IDs
 * @returns {string} SQL condition fragment
 */
function buildAssetClassCondition(assetClasses) {
  if (!assetClasses || assetClasses.length === 0) return null;

  const conditions = [];
  const standardCodes = [];
  const needsImproved401 = assetClasses.includes('condo');
  const needsUnimproved401 = assetClasses.includes('developments');
  const needsImproved383 = assetClasses.includes('multifamily');
  const needsUnimproved383 = assetClasses.includes('developments');

  // Collect standard codes (non-split)
  for (const assetClass of assetClasses) {
    if (ASSET_CLASS_CODES[assetClass]) {
      standardCodes.push(...ASSET_CLASS_CODES[assetClass]);
    }
  }

  // Build standard codes condition (codes are stored as VARCHAR)
  if (standardCodes.length > 0) {
    const quotedCodes = standardCodes.map(c => `'${c}'`).join(',');
    conditions.push(`p.property_use_standardized IN (${quotedCodes})`);
  }

  // Handle code 401 split logic
  if (needsImproved401 && !needsUnimproved401) {
    // Condo only: 401 with improvements
    conditions.push(`(p.property_use_standardized = '401' AND ${IMPROVED_CONDITION})`);
  } else if (!needsImproved401 && needsUnimproved401) {
    // Developments only: 401 without improvements
    conditions.push(`(p.property_use_standardized = '401' AND ${UNIMPROVED_CONDITION})`);
  } else if (needsImproved401 && needsUnimproved401) {
    // Both: include all 401
    conditions.push("p.property_use_standardized = '401'");
  }

  // Handle code 383 split logic
  if (needsImproved383 && !needsUnimproved383) {
    // Multifamily only: 383 with improvements
    conditions.push(`(p.property_use_standardized = '383' AND ${IMPROVED_CONDITION})`);
  } else if (!needsImproved383 && needsUnimproved383) {
    // Developments only: 383 without improvements
    conditions.push(`(p.property_use_standardized = '383' AND ${UNIMPROVED_CONDITION})`);
  } else if (needsImproved383 && needsUnimproved383) {
    // Both: include all 383
    conditions.push("p.property_use_standardized = '383'");
  }

  if (conditions.length === 0) return null;
  return `(${conditions.join(' OR ')})`;
}

/**
 * Builds SQL WHERE conditions for owner type filtering
 * @param {string[]} ownerTypes - Array of owner type IDs
 * @returns {string} SQL condition fragment
 */
function buildOwnerTypeCondition(ownerTypes) {
  if (!ownerTypes || ownerTypes.length === 0) return null;

  const conditions = ownerTypes
    .filter(type => OWNER_TYPE_CONDITIONS[type])
    .map(type => `(${OWNER_TYPE_CONDITIONS[type].condition})`);

  if (conditions.length === 0) return null;
  return `(${conditions.join(' OR ')})`;
}

/**
 * Builds SQL WHERE conditions for foreclosure type filtering
 * @param {string[]} foreclosureTypes - Array of foreclosure type codes
 * @returns {string} SQL condition fragment
 */
function buildForeclosureTypeCondition(foreclosureTypes) {
  if (!foreclosureTypes || foreclosureTypes.length === 0) return null;

  const validTypes = foreclosureTypes.filter(t => FORECLOSURE_TYPES[t]);
  if (validTypes.length === 0) return null;

  return `fr.record_type IN ('${validTypes.join("','")}')`;
}

/**
 * Maps asset class ID to human-readable label
 * @param {string} assetClassId - Asset class identifier
 * @returns {string} Human-readable label
 */
function getAssetClassLabel(assetClassId) {
  return ASSET_CLASS_LABELS[assetClassId] || assetClassId;
}

/**
 * Gets all asset class IDs
 * @returns {string[]} Array of asset class identifiers
 */
function getAllAssetClassIds() {
  return Object.keys(ASSET_CLASS_CODES);
}

/**
 * Gets all owner type IDs
 * @returns {string[]} Array of owner type identifiers
 */
function getAllOwnerTypeIds() {
  return Object.keys(OWNER_TYPE_CONDITIONS);
}

module.exports = {
  ASSET_CLASS_CODES,
  ASSET_CLASS_LABELS,
  SPLIT_CODES,
  IMPROVED_CONDITION,
  UNIMPROVED_CONDITION,
  OWNER_TYPE_CONDITIONS,
  FORECLOSURE_TYPES,
  buildAssetClassCondition,
  buildOwnerTypeCondition,
  buildForeclosureTypeCondition,
  getAssetClassLabel,
  getAllAssetClassIds,
  getAllOwnerTypeIds,
};
