/**
 * ScoutGPT CRE Dictionary
 * 
 * Complete mapping of ATTOM numeric property_use_standardized codes
 * to CRE-standard names and asset class groups.
 * 
 * Source: Production database audit (444K+ Travis County properties)
 * All codes verified against actual property_use_standardized values.
 * 
 * CRITICAL: property_use_standardized contains NUMERIC codes, not text.
 * property_use_code is entirely NULL — never reference it.
 * units_count is 0/NULL for all records — use area_building as size proxy.
 */

// ─── Complete Property Code Reference ────────────────────────────────────────
// Every numeric code → { name, group, avgBldgSf, avgLotAcres, count }

const PROPERTY_CODES = {
  // ── Residential ──
  '385': { name: 'Single Family Residence',           group: 'SFR',           avgBldgSf: 2222,   avgLotAcres: 0.65,  count: 289698 },
  '401': { name: 'Vacant Residential Lot',            group: 'LAND',          avgBldgSf: 244,    avgLotAcres: 1.38,  count: 35916 },
  '366': { name: 'Condo / Townhome',                  group: 'CONDO',         avgBldgSf: 1371,   avgLotAcres: 0.11,  count: 35461 },
  '386': { name: 'Townhome / Attached SFR',           group: 'CONDO',         avgBldgSf: 1569,   avgLotAcres: 0.11,  count: 21764 },
  '373': { name: 'Duplex / Triplex / Quadruplex',     group: 'MULTIFAMILY',   avgBldgSf: 1307,   avgLotAcres: 1.17,  count: 16919 },
  '369': { name: 'Apartment / Multifamily',            group: 'MULTIFAMILY',   avgBldgSf: 2164,   avgLotAcres: 0.27,  count: 9816 },
  '383': { name: 'Rural / Ranch Residential',          group: 'SFR',           avgBldgSf: 155,    avgLotAcres: 23.84, count: 4252 },
  '378': { name: 'Multifamily — Mid/Large Complex',    group: 'MULTIFAMILY',   avgBldgSf: 3500,   avgLotAcres: 0.25,  count: 1112 },
  '375': { name: 'Mobile / Manufactured Home',         group: 'MOBILE_HOME',   avgBldgSf: 426,    avgLotAcres: 2.22,  count: 1952 },
  '388': { name: 'Older SFR (pre-1960 avg)',           group: 'SFR',           avgBldgSf: 2687,   avgLotAcres: 0.25,  count: 160 },
  '381': { name: 'Rural Residential / Cabin',          group: 'SFR',           avgBldgSf: 848,    avgLotAcres: 8.69,  count: 81 },
  '370': { name: 'Large Apartment Complex',            group: 'MULTIFAMILY',   avgBldgSf: 12356,  avgLotAcres: 0.59,  count: 36 },
  '368': { name: 'Major Apartment Community',          group: 'MULTIFAMILY',   avgBldgSf: 125996, avgLotAcres: 10.55, count: 12 },

  // ── Commercial — Retail ──
  '169': { name: 'Retail — Shopping Center',           group: 'RETAIL',        avgBldgSf: 29925,  avgLotAcres: 7.18,  count: 2636 },
  '139': { name: 'Retail — Small / Strip',             group: 'RETAIL',        avgBldgSf: 2578,   avgLotAcres: 0.23,  count: 1673 },
  '171': { name: 'Restaurant / Food Service',          group: 'RESTAURANT',    avgBldgSf: 2100,   avgLotAcres: 1.07,  count: 1340 },
  '135': { name: 'Commercial — General / Mixed',       group: 'RETAIL',        avgBldgSf: 3802,   avgLotAcres: 7.87,  count: 1280 },
  '359': { name: 'Large Retail / Power Center',        group: 'RETAIL',        avgBldgSf: 205831, avgLotAcres: 11.66, count: 1000 },
  '184': { name: 'Regional Mall / Major Retail',       group: 'RETAIL',        avgBldgSf: 238514, avgLotAcres: 3.81,  count: 112 },
  '358': { name: 'Major Commercial',                   group: 'RETAIL',        avgBldgSf: 318847, avgLotAcres: 1.00,  count: 41 },

  // ── Commercial — Office ──
  '167': { name: 'Office — Mid-size',                  group: 'OFFICE',        avgBldgSf: 14938,  avgLotAcres: 2.21,  count: 853 },
  '361': { name: 'Office — Urban / Multi-story',       group: 'OFFICE',        avgBldgSf: 15130,  avgLotAcres: 0.80,  count: 812 },
  '178': { name: 'Office — Small',                     group: 'OFFICE',        avgBldgSf: 4758,   avgLotAcres: 1.04,  count: 766 },
  '172': { name: 'High-rise Office / Commercial',      group: 'OFFICE',        avgBldgSf: 114044, avgLotAcres: 0.79,  count: 72 },
  '179': { name: 'Large Office / Corporate Campus',    group: 'OFFICE',        avgBldgSf: 57406,  avgLotAcres: 3.24,  count: 21 },

  // ── Commercial — Hospitality ──
  '160': { name: 'Hotel / Motel',                      group: 'HOSPITALITY',   avgBldgSf: 18900,  avgLotAcres: 2.06,  count: 304 },
  '161': { name: 'Resort / Large Hospitality',         group: 'HOSPITALITY',   avgBldgSf: 139786, avgLotAcres: 114.73, count: 5 },

  // ── Commercial — Medical ──
  '148': { name: 'Medical Office / Clinic',            group: 'MEDICAL_OFFICE', avgBldgSf: 4895,  avgLotAcres: 1.28,  count: 490 },
  '155': { name: 'Hospital / Medical Center',          group: 'HOSPITAL',      avgBldgSf: 106975, avgLotAcres: 2.58,  count: 188 },

  // ── Commercial — Special Purpose ──
  '339': { name: 'Self-Storage',                       group: 'SELF_STORAGE',  avgBldgSf: 58967,  avgLotAcres: 6.47,  count: 96 },
  '126': { name: 'Church / Religious',                 group: 'RELIGIOUS',     avgBldgSf: 5843,   avgLotAcres: 2.01,  count: 621 },
  '124': { name: 'Daycare / School (small)',           group: 'EDUCATION',     avgBldgSf: 3143,   avgLotAcres: 1.14,  count: 472 },
  '127': { name: 'School / Educational Facility',      group: 'EDUCATION',     avgBldgSf: 29431,  avgLotAcres: 6.97,  count: 61 },
  '163': { name: 'Nursing Home / Assisted Living',     group: 'SENIOR_HOUSING', avgBldgSf: 31557, avgLotAcres: 2.27,  count: 79 },
  '183': { name: 'Mobile Home Park',                   group: 'MH_PARK',       avgBldgSf: 37317,  avgLotAcres: 9.05,  count: 71 },
  '150': { name: 'Bank / Financial',                   group: 'RETAIL',        avgBldgSf: 6674,   avgLotAcres: 1.36,  count: 232 },
  '146': { name: 'Service / Automotive',               group: 'RETAIL',        avgBldgSf: 2547,   avgLotAcres: 0.82,  count: 364 },
  '166': { name: 'Funeral Home / Special Service',     group: 'RETAIL',        avgBldgSf: 5005,   avgLotAcres: 0.71,  count: 217 },
  '145': { name: 'Theater / Entertainment',            group: 'ENTERTAINMENT', avgBldgSf: 13738,  avgLotAcres: 1.94,  count: 50 },
  '194': { name: 'Convention / Entertainment Venue',   group: 'ENTERTAINMENT', avgBldgSf: 92779,  avgLotAcres: 9.26,  count: 118 },
  '151': { name: 'Golf Course / Recreation',           group: 'RECREATION',    avgBldgSf: 60145,  avgLotAcres: 9.50,  count: 51 },
  '193': { name: 'Veterinary / Kennel',                group: 'RETAIL',        avgBldgSf: 2484,   avgLotAcres: 1.37,  count: 32 },
  '296': { name: 'Camp / Retreat Center',              group: 'RECREATION',    avgBldgSf: 33165,  avgLotAcres: 28.85, count: 20 },
  '175': { name: 'Commercial — Miscellaneous',         group: 'RETAIL',        avgBldgSf: 9315,   avgLotAcres: 1.99,  count: 108 },
  '136': { name: 'Large Commercial Campus',            group: 'RETAIL',        avgBldgSf: 103929, avgLotAcres: 10.54, count: 19 },
  '348': { name: 'Commercial — Large Misc',            group: 'RETAIL',        avgBldgSf: 41060,  avgLotAcres: 7.37,  count: 16 },
  '141': { name: 'Convention Center',                  group: 'ENTERTAINMENT', avgBldgSf: 146757, avgLotAcres: 14.04, count: 3 },
  '133': { name: 'Commercial — Other',                 group: 'RETAIL',        avgBldgSf: 9332,   avgLotAcres: 1.69,  count: 15 },
  '186': { name: 'Commercial — Other',                 group: 'RETAIL',        avgBldgSf: 3045,   avgLotAcres: 0.75,  count: 12 },
  '131': { name: 'Commercial — Other',                 group: 'RETAIL',        avgBldgSf: 2542,   avgLotAcres: 5.22,  count: 2 },
  '264': { name: 'Commercial — Other',                 group: 'RETAIL',        avgBldgSf: 38494,  avgLotAcres: 7.37,  count: 5 },

  // ── Industrial ──
  '238': { name: 'Light Industrial / Warehouse',       group: 'INDUSTRIAL',    avgBldgSf: 16269,  avgLotAcres: 4.21,  count: 2957 },
  '210': { name: 'Heavy Industrial / Manufacturing',   group: 'INDUSTRIAL',    avgBldgSf: 57496,  avgLotAcres: 7.92,  count: 363 },
  '229': { name: 'Warehouse / Distribution',           group: 'INDUSTRIAL',    avgBldgSf: 46337,  avgLotAcres: 3.99,  count: 233 },
  '212': { name: 'Industrial — Mid-size',              group: 'INDUSTRIAL',    avgBldgSf: 24900,  avgLotAcres: 4.74,  count: 95 },
  '231': { name: 'Major Industrial / Quarry',          group: 'INDUSTRIAL',    avgBldgSf: 64033,  avgLotAcres: 49.91, count: 48 },
  '280': { name: 'Large Industrial / Processing',      group: 'INDUSTRIAL',    avgBldgSf: 68852,  avgLotAcres: 14.18, count: 26 },
  '220': { name: 'Major Facility / Data Center',       group: 'INDUSTRIAL',    avgBldgSf: 344896, avgLotAcres: 32.86, count: 11 },

  // ── Agriculture ──
  '117': { name: 'Agricultural / Farm / Ranch',        group: 'AGRICULTURE',   avgBldgSf: 0,      avgLotAcres: 42.16, count: 2955 },
  '109': { name: 'Agricultural — Smaller Parcels',     group: 'AGRICULTURE',   avgBldgSf: 0,      avgLotAcres: 25.12, count: 304 },

  // ── Vacant Land ──
  '120': { name: 'Vacant Commercial / Rural Land',     group: 'LAND',          avgBldgSf: 0,      avgLotAcres: 62.72, count: 176 },
  '270': { name: 'Vacant Commercial Land',             group: 'LAND',          avgBldgSf: 0,      avgLotAcres: 15.87, count: 133 },

  // ── Government / Public ──
  '329': { name: 'Utility / Infrastructure',           group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 18 },
  '302': { name: 'Government Building',                group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 16 },
  '330': { name: 'Park / Open Space',                  group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 15 },
  '246': { name: 'Utility Right-of-Way',               group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 10 },
  '347': { name: 'Public — Small Facility',            group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 10 },
  '342': { name: 'Public Facility',                    group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 6 },
  '311': { name: 'Public — Other',                     group: 'GOVERNMENT',    avgBldgSf: 0,      avgLotAcres: 0,     count: 2 },

  // ── Other / Unknown ──
  '402': { name: 'Unknown / Unclassified',             group: 'OTHER',         avgBldgSf: 0,      avgLotAcres: 0,     count: 5279 },
  '315': { name: 'Other',                              group: 'OTHER',         avgBldgSf: 0,      avgLotAcres: 0,     count: 11 },
  '463': { name: 'Other',                              group: 'OTHER',         avgBldgSf: 0,      avgLotAcres: 0,     count: 2 },
  '284': { name: 'Other',                              group: 'OTHER',         avgBldgSf: 0,      avgLotAcres: 0,     count: 1 },
};

// ─── CRE Asset Class → Code Groups ──────────────────────────────────────────
// Primary translation table: canonical CRE class name → array of ATTOM codes

const CODE_GROUPS = {
  MULTIFAMILY:    ['369', '373', '378', '370', '368'],
  OFFICE:         ['167', '361', '178', '172', '179'],
  RETAIL:         ['169', '139', '359', '184', '135', '358', '171'],
  INDUSTRIAL:     ['238', '210', '229', '212', '231', '280', '220'],
  LAND:           ['401', '120', '270'],
  AGRICULTURE:    ['117', '109'],
  HOSPITALITY:    ['160', '161'],
  SELF_STORAGE:   ['339'],
  MEDICAL_OFFICE: ['148'],
  HOSPITAL:       ['155'],
  RELIGIOUS:      ['126'],
  EDUCATION:      ['127', '124'],
  SENIOR_HOUSING: ['163'],
  MH_PARK:        ['183'],
  SFR:            ['385', '388', '383', '381'],
  CONDO:          ['366', '386'],
  MOBILE_HOME:    ['375'],
  GOVERNMENT:     ['329', '302', '330', '246', '347', '342', '311'],
  RESTAURANT:     ['171'],
  ENTERTAINMENT:  ['145', '194', '141'],
  RECREATION:     ['151', '296'],
  OTHER:          ['402', '315', '463', '284'],
};

// Convenience: all codes that count as "commercial" in CRE terms
// (everything except SFR, Condo, Mobile Home, Government, Other)
const ALL_COMMERCIAL_CODES = [
  ...CODE_GROUPS.MULTIFAMILY,
  ...CODE_GROUPS.OFFICE,
  ...CODE_GROUPS.RETAIL,
  ...CODE_GROUPS.INDUSTRIAL,
  ...CODE_GROUPS.HOSPITALITY,
  ...CODE_GROUPS.SELF_STORAGE,
  ...CODE_GROUPS.MEDICAL_OFFICE,
  ...CODE_GROUPS.HOSPITAL,
  ...CODE_GROUPS.EDUCATION,
  ...CODE_GROUPS.SENIOR_HOUSING,
  ...CODE_GROUPS.MH_PARK,
  ...CODE_GROUPS.RESTAURANT,
  ...CODE_GROUPS.ENTERTAINMENT,
  ...CODE_GROUPS.RECREATION,
  ...CODE_GROUPS.RELIGIOUS,
];

// All investable CRE: commercial + land + agriculture (excludes SFR, condo, gov, other)
const ALL_INVESTABLE_CODES = [
  ...ALL_COMMERCIAL_CODES,
  ...CODE_GROUPS.LAND,
  ...CODE_GROUPS.AGRICULTURE,
];

// ─── Utility Functions ──────────────────────────────────────────────────────

/**
 * Translate a single ATTOM numeric code to its CRE name.
 * @param {string} code - e.g. '369'
 * @returns {string} - e.g. 'Apartment / Multifamily'
 */
function codeToName(code) {
  const entry = PROPERTY_CODES[String(code)];
  return entry ? entry.name : `Unknown (${code})`;
}

/**
 * Translate a single code to its parent CRE group name.
 * @param {string} code - e.g. '369'
 * @returns {string} - e.g. 'MULTIFAMILY'
 */
function codeToGroup(code) {
  const entry = PROPERTY_CODES[String(code)];
  return entry ? entry.group : 'OTHER';
}

/**
 * Get all codes for a CRE group name.
 * @param {string} groupName - e.g. 'MULTIFAMILY' (case-insensitive)
 * @returns {string[]} - e.g. ['369','373','378','370','368']
 */
function groupToCodes(groupName) {
  const key = groupName.toUpperCase().replace(/[\s-]/g, '_');
  return CODE_GROUPS[key] || [];
}

/**
 * Format an array of codes as a SQL IN clause value string.
 * @param {string[]} codes - e.g. ['369','373','378']
 * @returns {string} - e.g. "'369','373','378'"
 */
function codesToSqlIn(codes) {
  return codes.map(c => `'${c}'`).join(',');
}

/**
 * Format a single code for display: "Apartment / Multifamily (369)"
 * @param {string} code
 * @returns {string}
 */
function codeToDisplay(code) {
  const name = codeToName(code);
  return name.startsWith('Unknown') ? name : `${name} (${code})`;
}

/**
 * Given an array of codes, return the CRE group names represented.
 * @param {string[]} codes
 * @returns {string[]} - e.g. ['MULTIFAMILY', 'OFFICE']
 */
function codesToGroups(codes) {
  const groups = new Set(codes.map(c => codeToGroup(c)));
  return [...groups];
}

/**
 * Get full metadata for a code.
 * @param {string} code
 * @returns {object|null} - { name, group, avgBldgSf, avgLotAcres, count }
 */
function getCodeMeta(code) {
  return PROPERTY_CODES[String(code)] || null;
}

module.exports = {
  PROPERTY_CODES,
  CODE_GROUPS,
  ALL_COMMERCIAL_CODES,
  ALL_INVESTABLE_CODES,
  codeToName,
  codeToGroup,
  groupToCodes,
  codesToSqlIn,
  codeToDisplay,
  codesToGroups,
  getCodeMeta,
};

