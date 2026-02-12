/**
 * ScoutGPT Asset Taxonomy
 * 
 * Full hierarchical classification: major CRE class → subtypes → codes → scale indicators.
 * Determines specific property subtypes based on ATTOM code + building square footage.
 * 
 * CRITICAL: units_count is 0/NULL for all records.
 * All size-based subtyping uses area_building (building SF) as the proxy.
 */

const { PROPERTY_CODES, CODE_GROUPS, codeToName, codeToGroup } = require('./dictionary');

// ─── Subtype Definitions ────────────────────────────────────────────────────
// For each code, define subtypes based on area_building thresholds

const SUBTYPES = {
  // ── Multifamily subtypes by code + size ──
  '373': [
    { max: 3000, subtype: 'Duplex', label: 'Duplex (2 units)' },
    { max: 5000, subtype: 'Triplex/Quad', label: 'Triplex or Quadruplex' },
    { max: Infinity, subtype: 'Small Multi (5+)', label: 'Small Multifamily (5+ units est.)' },
  ],
  '369': [
    { max: 5000, subtype: 'Small Apartment', label: 'Small Apartment Building' },
    { max: 20000, subtype: 'Mid-size Apartment', label: 'Mid-size Apartment Complex' },
    { max: 50000, subtype: 'Large Apartment', label: 'Large Apartment Complex' },
    { max: Infinity, subtype: 'Major Apartment', label: 'Major Apartment Community' },
  ],
  '378': [
    { max: 10000, subtype: 'Mid Apartment', label: 'Mid-size Apartment Complex' },
    { max: 50000, subtype: 'Large Apartment', label: 'Large Apartment Complex' },
    { max: Infinity, subtype: 'Major Apartment', label: 'Major Apartment Community' },
  ],
  '370': [
    { max: Infinity, subtype: 'Large Apartment Complex', label: 'Large Apartment Complex' },
  ],
  '368': [
    { max: Infinity, subtype: 'Major Apartment Community', label: 'Major Apartment Community (institutional)' },
  ],

  // ── Office subtypes ──
  '178': [
    { max: 3000, subtype: 'Small Office', label: 'Small Office' },
    { max: 10000, subtype: 'Office', label: 'Office' },
    { max: Infinity, subtype: 'Mid-size Office', label: 'Mid-size Office' },
  ],
  '167': [
    { max: 10000, subtype: 'Small-Mid Office', label: 'Small-Mid Office' },
    { max: 30000, subtype: 'Mid-size Office', label: 'Mid-size Office' },
    { max: Infinity, subtype: 'Large Office', label: 'Large Office' },
  ],
  '361': [
    { max: 10000, subtype: 'Urban Office', label: 'Urban Office' },
    { max: 30000, subtype: 'Urban Mid-rise Office', label: 'Urban Mid-rise Office' },
    { max: Infinity, subtype: 'Urban High-rise Office', label: 'Urban High-rise Office' },
  ],
  '172': [
    { max: Infinity, subtype: 'High-rise Office', label: 'High-rise / Institutional Office' },
  ],
  '179': [
    { max: Infinity, subtype: 'Corporate Campus', label: 'Large Office / Corporate Campus' },
  ],

  // ── Retail subtypes ──
  '139': [
    { max: 2000, subtype: 'Small Retail', label: 'Small Retail / Storefront' },
    { max: 5000, subtype: 'Strip Retail', label: 'Strip Retail' },
    { max: 10000, subtype: 'Neighborhood Retail', label: 'Neighborhood Retail' },
    { max: Infinity, subtype: 'Retail Center', label: 'Retail Center' },
  ],
  '169': [
    { max: 20000, subtype: 'Neighborhood Center', label: 'Neighborhood Shopping Center' },
    { max: 50000, subtype: 'Community Center', label: 'Community Shopping Center' },
    { max: 100000, subtype: 'Large Retail Center', label: 'Large Retail Center' },
    { max: Infinity, subtype: 'Power Center', label: 'Power Center' },
  ],
  '359': [
    { max: Infinity, subtype: 'Power Center', label: 'Power Center / Big Box' },
  ],
  '184': [
    { max: Infinity, subtype: 'Regional Mall', label: 'Regional Mall' },
  ],
  '358': [
    { max: Infinity, subtype: 'Major Commercial', label: 'Major Commercial Center' },
  ],
  '135': [
    { max: 5000, subtype: 'Small Commercial', label: 'Small Commercial' },
    { max: 20000, subtype: 'General Commercial', label: 'General Commercial' },
    { max: Infinity, subtype: 'Large Commercial', label: 'Large Commercial' },
  ],

  // ── Industrial subtypes ──
  '238': [
    { max: 10000, subtype: 'Small Warehouse', label: 'Small Warehouse / Flex' },
    { max: 30000, subtype: 'Warehouse', label: 'Warehouse' },
    { max: 60000, subtype: 'Large Warehouse', label: 'Large Warehouse' },
    { max: Infinity, subtype: 'Distribution', label: 'Distribution Facility' },
  ],
  '210': [
    { max: 30000, subtype: 'Manufacturing', label: 'Manufacturing' },
    { max: Infinity, subtype: 'Heavy Manufacturing', label: 'Heavy Manufacturing' },
  ],
  '229': [
    { max: 30000, subtype: 'Warehouse', label: 'Warehouse' },
    { max: Infinity, subtype: 'Distribution Center', label: 'Distribution Center' },
  ],
  '212': [
    { max: Infinity, subtype: 'Mid-size Industrial', label: 'Mid-size Industrial' },
  ],
  '231': [
    { max: Infinity, subtype: 'Major Industrial', label: 'Major Industrial / Quarry' },
  ],
  '280': [
    { max: Infinity, subtype: 'Large Industrial', label: 'Large Industrial / Processing' },
  ],
  '220': [
    { max: Infinity, subtype: 'Major Facility', label: 'Major Facility / Data Center' },
  ],

  // ── Hospitality ──
  '160': [
    { max: 10000, subtype: 'Small Hotel/Motel', label: 'Small Hotel / Motel' },
    { max: 30000, subtype: 'Hotel', label: 'Hotel' },
    { max: Infinity, subtype: 'Large Hotel', label: 'Large Hotel' },
  ],
  '161': [
    { max: Infinity, subtype: 'Resort', label: 'Resort / Large Hospitality' },
  ],
};

// ─── Parent Class Hierarchy ─────────────────────────────────────────────────
// Human-readable class labels

const CLASS_LABELS = {
  MULTIFAMILY:    'Multifamily',
  OFFICE:         'Office',
  RETAIL:         'Retail',
  INDUSTRIAL:     'Industrial',
  LAND:           'Land',
  AGRICULTURE:    'Agriculture',
  HOSPITALITY:    'Hospitality',
  SELF_STORAGE:   'Self-Storage',
  MEDICAL_OFFICE: 'Medical Office',
  HOSPITAL:       'Hospital',
  RELIGIOUS:      'Religious',
  EDUCATION:      'Education',
  SENIOR_HOUSING: 'Senior Housing',
  MH_PARK:        'Mobile Home Park',
  SFR:            'Single Family',
  CONDO:          'Condo / Townhome',
  MOBILE_HOME:    'Mobile Home',
  GOVERNMENT:     'Government',
  RESTAURANT:     'Restaurant',
  ENTERTAINMENT:  'Entertainment',
  RECREATION:     'Recreation',
  OTHER:          'Other',
};

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Determine specific property subtype based on ATTOM code and building SF.
 * 
 * @param {string} code - ATTOM property_use_standardized code
 * @param {number} [areaBuilding=0] - Building square footage
 * @returns {{ subtype: string, label: string, parentClass: string, parentLabel: string }}
 */
function getSubtype(code, areaBuilding = 0) {
  const codeStr = String(code);
  const sf = Number(areaBuilding) || 0;
  const parentClass = codeToGroup(codeStr);
  const parentLabel = CLASS_LABELS[parentClass] || parentClass;

  // Check if we have subtype definitions for this code
  const subtypeDefs = SUBTYPES[codeStr];
  if (subtypeDefs) {
    for (const def of subtypeDefs) {
      if (sf <= def.max) {
        return {
          subtype: def.subtype,
          label: def.label,
          parentClass,
          parentLabel,
        };
      }
    }
  }

  // Fallback: use the base code name
  return {
    subtype: codeToName(codeStr),
    label: codeToName(codeStr),
    parentClass,
    parentLabel,
  };
}

/**
 * Get the parent CRE asset class from a code.
 * @param {string} code
 * @returns {{ class: string, label: string }}
 */
function getAssetClassFromCode(code) {
  const cls = codeToGroup(String(code));
  return {
    class: cls,
    label: CLASS_LABELS[cls] || cls,
  };
}

/**
 * Format a property for CRE display given its code and building SF.
 * Returns a single descriptive string like "Large Apartment Complex (Multifamily)"
 * 
 * @param {string} code
 * @param {number} [areaBuilding=0]
 * @returns {string}
 */
function formatPropertyType(code, areaBuilding = 0) {
  const { label, parentLabel } = getSubtype(code, areaBuilding);
  // If the subtype label already contains the parent class name, don't duplicate
  if (label.toLowerCase().includes(parentLabel.toLowerCase())) {
    return label;
  }
  return `${label} (${parentLabel})`;
}

/**
 * Determine if a property is a CRE-investable asset class.
 * Excludes SFR, Condo, Mobile Home, Government, Other.
 */
function isCommercialCode(code) {
  const group = codeToGroup(String(code));
  return !['SFR', 'CONDO', 'MOBILE_HOME', 'GOVERNMENT', 'OTHER'].includes(group);
}

/**
 * Determine if a property should be treated as vacant land.
 * Either by code OR by zero/null building SF.
 */
function isLand(code, areaBuilding) {
  const group = codeToGroup(String(code));
  if (group === 'LAND') return true;
  if (group === 'AGRICULTURE') return true;
  // Also treat as land if building SF is 0 or null
  if (!areaBuilding || Number(areaBuilding) === 0) return true;
  return false;
}

/**
 * Get the appropriate "price per" metric for an asset class.
 * @param {string} code
 * @returns {{ metric: string, label: string, divisorField: string }}
 */
function getPriceMetric(code) {
  const group = codeToGroup(String(code));

  if (group === 'LAND' || group === 'AGRICULTURE') {
    return { metric: 'price_per_acre', label: '$/Acre', divisorField: 'area_lot_acres' };
  }

  // For all improved property, use $/SF
  // NOTE: $/Unit would be ideal for MF but units_count is unavailable
  return { metric: 'price_per_sf', label: '$/SF', divisorField: 'area_building' };
}

module.exports = {
  SUBTYPES,
  CLASS_LABELS,
  getSubtype,
  getAssetClassFromCode,
  formatPropertyType,
  isCommercialCode,
  isLand,
  getPriceMetric,
};
