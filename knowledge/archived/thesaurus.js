/**
 * ScoutGPT CRE Thesaurus
 * 
 * Resolves natural language CRE terms to canonical asset class groups
 * and their corresponding ATTOM numeric codes.
 * 
 * Usage:
 *   resolveAssetClass("apartments") → { class: 'MULTIFAMILY', codes: ['369','373','378','370','368'], label: 'Multifamily' }
 *   resolveAssetClass("warehouse")  → { class: 'INDUSTRIAL', codes: ['238','229','212'], label: 'Industrial (Warehouse/Distribution)' }
 *   resolveVagueTerm("big")         → { filter: 'area_building', operator: '>', value: null, note: 'above median' }
 */

const { CODE_GROUPS, ALL_COMMERCIAL_CODES, ALL_INVESTABLE_CODES, groupToCodes } = require('./dictionary');

// ─── Synonym Map ────────────────────────────────────────────────────────────
// Every way a user might refer to an asset class → canonical group key + optional subset
// Format: lowercase term → { class, codes (optional override), label }

const SYNONYMS = {
  // ── Multifamily ──
  'multifamily':      { class: 'MULTIFAMILY', label: 'Multifamily' },
  'multi-family':     { class: 'MULTIFAMILY', label: 'Multifamily' },
  'multi family':     { class: 'MULTIFAMILY', label: 'Multifamily' },
  'mf':               { class: 'MULTIFAMILY', label: 'Multifamily' },
  'multi':            { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apartments':       { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apartment':        { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apt':              { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apts':             { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apartment complex': { class: 'MULTIFAMILY', label: 'Multifamily' },
  'apartment community': { class: 'MULTIFAMILY', label: 'Multifamily' },

  // MF subtypes
  'duplex':           { class: 'MULTIFAMILY', codes: ['373'], label: 'Duplex / Triplex / Quad' },
  'triplex':          { class: 'MULTIFAMILY', codes: ['373'], label: 'Duplex / Triplex / Quad' },
  'fourplex':         { class: 'MULTIFAMILY', codes: ['373'], label: 'Duplex / Triplex / Quad' },
  'quadplex':         { class: 'MULTIFAMILY', codes: ['373'], label: 'Duplex / Triplex / Quad' },
  'quad':             { class: 'MULTIFAMILY', codes: ['373'], label: 'Duplex / Triplex / Quad' },
  'small multi':      { class: 'MULTIFAMILY', codes: ['373', '369'], label: 'Small Multifamily' },
  'small multifamily': { class: 'MULTIFAMILY', codes: ['373', '369'], label: 'Small Multifamily' },
  'large multifamily': { class: 'MULTIFAMILY', codes: ['370', '368', '378'], label: 'Large Multifamily' },
  'large apartment':  { class: 'MULTIFAMILY', codes: ['370', '368'], label: 'Large Apartment Complex' },

  // ── Office ──
  'office':           { class: 'OFFICE', label: 'Office' },
  'office building':  { class: 'OFFICE', label: 'Office' },
  'office buildings': { class: 'OFFICE', label: 'Office' },
  'professional':     { class: 'OFFICE', label: 'Office' },
  'corporate':        { class: 'OFFICE', label: 'Office' },
  'corporate office': { class: 'OFFICE', label: 'Office' },
  'small office':     { class: 'OFFICE', codes: ['178'], label: 'Small Office' },
  'high-rise office': { class: 'OFFICE', codes: ['172'], label: 'High-rise Office' },
  'highrise office':  { class: 'OFFICE', codes: ['172'], label: 'High-rise Office' },

  // ── Medical ──
  'medical office':   { class: 'MEDICAL_OFFICE', label: 'Medical Office' },
  'mob':              { class: 'MEDICAL_OFFICE', label: 'Medical Office' },
  'clinic':           { class: 'MEDICAL_OFFICE', label: 'Medical Office' },
  'medical':          { class: 'MEDICAL_OFFICE', label: 'Medical Office' },
  'hospital':         { class: 'HOSPITAL', label: 'Hospital / Medical Center' },
  'medical center':   { class: 'HOSPITAL', label: 'Hospital / Medical Center' },

  // ── Retail ──
  'retail':           { class: 'RETAIL', label: 'Retail' },
  'shopping':         { class: 'RETAIL', label: 'Retail' },
  'shopping center':  { class: 'RETAIL', codes: ['169', '359', '184'], label: 'Shopping Center' },
  'store':            { class: 'RETAIL', codes: ['139'], label: 'Retail — Small' },
  'storefront':       { class: 'RETAIL', codes: ['139'], label: 'Retail — Small' },
  'strip mall':       { class: 'RETAIL', codes: ['139', '169'], label: 'Strip / Shopping Center' },
  'strip center':     { class: 'RETAIL', codes: ['139', '169'], label: 'Strip / Shopping Center' },
  'plaza':            { class: 'RETAIL', codes: ['169'], label: 'Retail — Shopping Center' },
  'power center':     { class: 'RETAIL', codes: ['359'], label: 'Power Center' },
  'big box':          { class: 'RETAIL', codes: ['359'], label: 'Big Box / Power Center' },
  'mall':             { class: 'RETAIL', codes: ['184'], label: 'Regional Mall' },
  'nnn':              { class: 'RETAIL', codes: ['139'], label: 'Retail — NNN / Single Tenant', scaleFilter: { field: 'area_building', max: 10000 } },
  'triple net':       { class: 'RETAIL', codes: ['139'], label: 'Retail — NNN / Single Tenant', scaleFilter: { field: 'area_building', max: 10000 } },
  'net lease':        { class: 'RETAIL', codes: ['139'], label: 'Retail — NNN / Single Tenant', scaleFilter: { field: 'area_building', max: 10000 } },
  'single tenant':    { class: 'RETAIL', codes: ['139'], label: 'Retail — Single Tenant' },
  'restaurant':       { class: 'RESTAURANT', label: 'Restaurant' },
  'restaurants':      { class: 'RESTAURANT', label: 'Restaurant' },
  'qsr':              { class: 'RESTAURANT', label: 'Restaurant / QSR' },
  'food service':     { class: 'RESTAURANT', label: 'Restaurant / Food Service' },

  // ── Industrial ──
  'industrial':       { class: 'INDUSTRIAL', label: 'Industrial' },
  'warehouse':        { class: 'INDUSTRIAL', codes: ['238', '229', '212'], label: 'Industrial (Warehouse)' },
  'warehouses':       { class: 'INDUSTRIAL', codes: ['238', '229', '212'], label: 'Industrial (Warehouse)' },
  'distribution':     { class: 'INDUSTRIAL', codes: ['229'], label: 'Distribution / Warehouse' },
  'distribution center': { class: 'INDUSTRIAL', codes: ['229', '220'], label: 'Distribution Center' },
  'manufacturing':    { class: 'INDUSTRIAL', codes: ['210'], label: 'Manufacturing' },
  'flex':             { class: 'INDUSTRIAL', codes: ['238', '212'], label: 'Flex / Light Industrial' },
  'flex space':       { class: 'INDUSTRIAL', codes: ['238', '212'], label: 'Flex / Light Industrial' },
  'light industrial': { class: 'INDUSTRIAL', codes: ['238'], label: 'Light Industrial' },
  'heavy industrial': { class: 'INDUSTRIAL', codes: ['210', '231', '280'], label: 'Heavy Industrial' },
  'data center':      { class: 'INDUSTRIAL', codes: ['220'], label: 'Data Center / Major Facility' },

  // ── Land ──
  'land':             { class: 'LAND', label: 'Land' },
  'vacant land':      { class: 'LAND', label: 'Vacant Land' },
  'vacant':           { class: 'LAND', label: 'Vacant Land' },
  'lot':              { class: 'LAND', label: 'Vacant Land' },
  'lots':             { class: 'LAND', label: 'Vacant Land' },
  'dirt':             { class: 'LAND', label: 'Vacant Land' },
  'raw land':         { class: 'LAND', label: 'Vacant Land' },
  'acreage':          { class: 'LAND', codes: ['120', '270'], label: 'Acreage / Large Land' },
  'parcel':           { class: 'LAND', label: 'Vacant Land' },
  'parcels':          { class: 'LAND', label: 'Vacant Land' },
  'development site': { class: 'LAND', codes: ['120', '270'], label: 'Development Site' },
  'development sites': { class: 'LAND', codes: ['120', '270'], label: 'Development Site' },
  'pad site':         { class: 'LAND', codes: ['270'], label: 'Pad Site' },
  'vacant commercial land': { class: 'LAND', codes: ['120', '270'], label: 'Vacant Commercial Land' },
  'vacant residential land': { class: 'LAND', codes: ['401'], label: 'Vacant Residential Land' },

  // ── Agriculture ──
  'farm':             { class: 'AGRICULTURE', label: 'Agricultural / Farm' },
  'ranch':            { class: 'AGRICULTURE', label: 'Agricultural / Ranch' },
  'agricultural':     { class: 'AGRICULTURE', label: 'Agricultural' },
  'ag':               { class: 'AGRICULTURE', label: 'Agricultural' },
  'agriculture':      { class: 'AGRICULTURE', label: 'Agricultural' },
  'farmland':         { class: 'AGRICULTURE', label: 'Agricultural / Farm' },
  'ranchland':        { class: 'AGRICULTURE', label: 'Agricultural / Ranch' },

  // ── Hospitality ──
  'hotel':            { class: 'HOSPITALITY', label: 'Hotel' },
  'hotels':           { class: 'HOSPITALITY', label: 'Hotel' },
  'motel':            { class: 'HOSPITALITY', codes: ['160'], label: 'Hotel / Motel' },
  'hospitality':      { class: 'HOSPITALITY', label: 'Hospitality' },
  'lodging':          { class: 'HOSPITALITY', label: 'Hospitality / Lodging' },
  'resort':           { class: 'HOSPITALITY', codes: ['161'], label: 'Resort' },

  // ── Self-Storage ──
  'storage':          { class: 'SELF_STORAGE', label: 'Self-Storage' },
  'self-storage':     { class: 'SELF_STORAGE', label: 'Self-Storage' },
  'self storage':     { class: 'SELF_STORAGE', label: 'Self-Storage' },
  'mini-storage':     { class: 'SELF_STORAGE', label: 'Self-Storage' },
  'mini storage':     { class: 'SELF_STORAGE', label: 'Self-Storage' },

  // ── Senior Housing ──
  'nursing home':     { class: 'SENIOR_HOUSING', label: 'Nursing Home / Assisted Living' },
  'assisted living':  { class: 'SENIOR_HOUSING', label: 'Assisted Living' },
  'senior living':    { class: 'SENIOR_HOUSING', label: 'Senior Housing' },
  'senior housing':   { class: 'SENIOR_HOUSING', label: 'Senior Housing' },

  // ── Mobile Home Park ──
  'mobile home park': { class: 'MH_PARK', label: 'Mobile Home Park' },
  'mhp':             { class: 'MH_PARK', label: 'Mobile Home Park' },
  'trailer park':    { class: 'MH_PARK', label: 'Mobile Home Park' },
  'manufactured housing': { class: 'MH_PARK', label: 'Mobile Home Park' },

  // ── Religious ──
  'church':           { class: 'RELIGIOUS', label: 'Church / Religious' },
  'religious':        { class: 'RELIGIOUS', label: 'Religious' },
  'temple':           { class: 'RELIGIOUS', label: 'Religious' },
  'mosque':           { class: 'RELIGIOUS', label: 'Religious' },

  // ── Education ──
  'school':           { class: 'EDUCATION', label: 'School / Educational' },
  'education':        { class: 'EDUCATION', label: 'Educational Facility' },
  'daycare':          { class: 'EDUCATION', codes: ['124'], label: 'Daycare' },

  // ── Residential (non-CRE but users ask) ──
  'sfr':              { class: 'SFR', label: 'Single Family Residence' },
  'single family':    { class: 'SFR', label: 'Single Family Residence' },
  'single-family':    { class: 'SFR', label: 'Single Family Residence' },
  'house':            { class: 'SFR', label: 'Single Family Residence' },
  'houses':           { class: 'SFR', label: 'Single Family Residence' },
  'home':             { class: 'SFR', label: 'Single Family Residence' },
  'homes':            { class: 'SFR', label: 'Single Family Residence' },
  'residential':      { class: 'SFR', label: 'Single Family Residence' },
  'condo':            { class: 'CONDO', label: 'Condo / Townhome' },
  'condos':           { class: 'CONDO', label: 'Condo / Townhome' },
  'condominium':      { class: 'CONDO', label: 'Condo / Townhome' },
  'townhome':         { class: 'CONDO', label: 'Townhome' },
  'townhouse':        { class: 'CONDO', label: 'Townhome' },
  'townhomes':        { class: 'CONDO', label: 'Townhome' },

  // ── Broad categories ──
  'commercial':       { class: 'COMMERCIAL', codes: null, label: 'Commercial' }, // special handling
  'commercial properties': { class: 'COMMERCIAL', codes: null, label: 'Commercial' },
  'investment property': { class: 'INVESTABLE', codes: null, label: 'Investment Property' },
  'investment properties': { class: 'INVESTABLE', codes: null, label: 'Investment Property' },
  'income property':  { class: 'INVESTABLE', codes: null, label: 'Income Property' },
  'mixed use':        { class: 'MIXED_USE', codes: ['135'], label: 'Mixed Use' },
  'mixed-use':        { class: 'MIXED_USE', codes: ['135'], label: 'Mixed Use' },
  'live/work':        { class: 'MIXED_USE', codes: ['135'], label: 'Mixed Use / Live-Work' },
  'live-work':        { class: 'MIXED_USE', codes: ['135'], label: 'Mixed Use / Live-Work' },
};

// ─── Vague Term Resolution ──────────────────────────────────────────────────
// When users say "big", "new", "old", "cheap" etc.

const VAGUE_TERMS = {
  'big':    { filter: 'area_building', operator: '>', value: null, note: 'Above median building SF for asset class' },
  'large':  { filter: 'area_building', operator: '>', value: null, note: 'Above median building SF for asset class' },
  'small':  { filter: 'area_building', operator: '<', value: null, note: 'Below median building SF for asset class' },
  'new':    { filter: 'year_built', operator: '>=', value: 2015, note: 'Built 2015 or later' },
  'newer':  { filter: 'year_built', operator: '>=', value: 2010, note: 'Built 2010 or later' },
  'recent': { filter: 'year_built', operator: '>=', value: 2010, note: 'Built 2010 or later' },
  'old':    { filter: 'year_built', operator: '<', value: 1980, note: 'Built before 1980' },
  'older':  { filter: 'year_built', operator: '<', value: 1990, note: 'Built before 1990' },
  'vintage': { filter: 'year_built', operator: '<', value: 1970, note: 'Built before 1970' },
  'historic': { filter: 'year_built', operator: '<', value: 1950, note: 'Built before 1950' },
  'cheap':  { filter: 'last_sale_price', operator: '<', value: null, note: 'Below median price for asset class in area' },
  'expensive': { filter: 'last_sale_price', operator: '>', value: null, note: 'Above median price for asset class in area' },
};

// Scale thresholds by asset class for vague "big"/"small" terms
const SIZE_THRESHOLDS = {
  MULTIFAMILY:    { big: 50000, small: 5000 },
  OFFICE:         { big: 50000, small: 5000 },
  RETAIL:         { big: 50000, small: 5000 },
  INDUSTRIAL:     { big: 100000, small: 10000 },
  LAND:           { big: null, small: null }, // use lot acres instead
  HOSPITALITY:    { big: 50000, small: 10000 },
  SELF_STORAGE:   { big: 80000, small: 30000 },
  MEDICAL_OFFICE: { big: 10000, small: 3000 },
};

// ─── Core Resolution Functions ──────────────────────────────────────────────

/**
 * Resolve natural language input to a canonical asset class, codes, and label.
 * 
 * @param {string} userInput - What the user typed (e.g. "apartments", "MF", "warehouse")
 * @returns {{ class: string, codes: string[], label: string, scaleFilter?: object } | null}
 */
function resolveAssetClass(userInput) {
  if (!userInput) return null;

  const normalized = userInput.toLowerCase().trim();

  // 1. Try exact match first
  if (SYNONYMS[normalized]) {
    return _buildResult(SYNONYMS[normalized]);
  }

  // 2. Try multi-word match (longest match first)
  const words = normalized.split(/\s+/);
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      const phrase = words.slice(start, start + len).join(' ');
      if (SYNONYMS[phrase]) {
        return _buildResult(SYNONYMS[phrase]);
      }
    }
  }

  // 3. Try partial / fuzzy match on individual words
  for (const word of words) {
    if (word.length < 3) continue; // skip short words like "in", "at"
    for (const [key, value] of Object.entries(SYNONYMS)) {
      if (key.startsWith(word) || key.includes(word)) {
        return _buildResult(value);
      }
    }
  }

  return null;
}

/**
 * Build a standardized result from a synonym entry.
 * @private
 */
function _buildResult(synonymEntry) {
  const { class: cls, codes, label, scaleFilter } = synonymEntry;

  // Handle special broad categories
  if (cls === 'COMMERCIAL') {
    return { class: 'COMMERCIAL', codes: ALL_COMMERCIAL_CODES, label: label || 'Commercial' };
  }
  if (cls === 'INVESTABLE') {
    return { class: 'INVESTABLE', codes: ALL_INVESTABLE_CODES, label: label || 'Investment Property' };
  }

  const resolvedCodes = codes || groupToCodes(cls);

  const result = {
    class: cls,
    codes: resolvedCodes,
    label: label || cls,
  };

  if (scaleFilter) {
    result.scaleFilter = scaleFilter;
  }

  return result;
}

/**
 * Resolve a vague term ("big", "new", "old") to a filter definition.
 * 
 * @param {string} term - The vague term
 * @param {string} [assetClass] - Optional asset class for context-specific thresholds
 * @returns {{ filter: string, operator: string, value: number|null, note: string } | null}
 */
function resolveVagueTerm(term, assetClass) {
  if (!term) return null;
  const normalized = term.toLowerCase().trim();
  const vague = VAGUE_TERMS[normalized];
  if (!vague) return null;

  const result = { ...vague };

  // Fill in context-specific values for size terms
  if ((normalized === 'big' || normalized === 'large') && assetClass) {
    const thresholds = SIZE_THRESHOLDS[assetClass.toUpperCase()];
    if (thresholds && thresholds.big) {
      result.value = thresholds.big;
    }
  }
  if ((normalized === 'small') && assetClass) {
    const thresholds = SIZE_THRESHOLDS[assetClass.toUpperCase()];
    if (thresholds && thresholds.small) {
      result.value = thresholds.small;
    }
  }

  return result;
}

/**
 * Parse a user query and extract all recognized asset class terms.
 * Returns an array of matches (there may be multiple in a complex query).
 * 
 * @param {string} query - Full user query
 * @returns {Array<{ class: string, codes: string[], label: string, matchedTerm: string }>}
 */
function extractAssetClasses(query) {
  if (!query) return [];

  const normalized = query.toLowerCase().trim();
  const matches = [];
  const seen = new Set();

  // Check all synonym keys against the query, longest first
  const sortedKeys = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    // Word boundary matching to avoid partial matches
    const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(normalized) && !seen.has(SYNONYMS[key].class)) {
      const result = _buildResult(SYNONYMS[key]);
      if (result) {
        seen.add(result.class);
        matches.push({ ...result, matchedTerm: key });
      }
    }
  }

  return matches;
}

module.exports = {
  SYNONYMS,
  VAGUE_TERMS,
  SIZE_THRESHOLDS,
  resolveAssetClass,
  resolveVagueTerm,
  extractAssetClasses,
};
