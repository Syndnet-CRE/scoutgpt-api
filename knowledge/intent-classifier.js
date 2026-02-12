/**
 * ScoutGPT Intent Classifier
 * 
 * Classifies user queries into CRE intent categories and extracts
 * structured parameters for tool routing.
 * 
 * This runs BEFORE Claude processes the query — it enriches the
 * system prompt with intent context so Claude knows which tools
 * to call and what parameters to use.
 * 
 * 12 intent types covering all CRE query patterns.
 */

const { resolveAssetClass, resolveVagueTerm, extractAssetClasses } = require('./thesaurus');
const { CODE_GROUPS, ALL_COMMERCIAL_CODES, groupToCodes, codesToSqlIn } = require('./dictionary');

// ─── Intent Definitions ─────────────────────────────────────────────────────

const INTENTS = {
  PROPERTY_SEARCH: {
    name: 'Property Search',
    description: 'Find properties matching criteria',
    tools: ['search_properties'],
    template: 'A',
  },
  COMPARABLE_SALES: {
    name: 'Comparable Sales Analysis',
    description: 'Find comps for a specific property',
    tools: ['get_property_details', 'spatial_query', 'get_market_stats'],
    template: 'B',
    requiresSubject: true,
  },
  DISTRESSED_SCREEN: {
    name: 'Distressed Opportunity Screen',
    description: 'Find distressed or high-opportunity properties',
    tools: ['search_properties', 'get_property_details'],
    template: 'F',
  },
  OWNER_RESEARCH: {
    name: 'Owner Research',
    description: 'Research property ownership and portfolios',
    tools: ['get_property_details', 'search_properties'],
    template: 'D',
  },
  SITE_ANALYSIS: {
    name: 'Site Analysis',
    description: 'Comprehensive property due diligence',
    tools: ['get_property_details', 'spatial_query', 'get_market_stats'],
    template: 'C',
    requiresSubject: true,
  },
  MARKET_STATISTICS: {
    name: 'Market Statistics',
    description: 'Aggregate market data for an area',
    tools: ['get_market_stats', 'search_properties'],
    template: 'E',
  },
  INVESTMENT_ANALYSIS: {
    name: 'Investment Analysis',
    description: 'Financial and equity analysis',
    tools: ['get_property_details', 'get_market_stats'],
    template: 'G',
    requiresSubject: true,
  },
  DEVELOPMENT_POTENTIAL: {
    name: 'Development Potential',
    description: 'Find development sites or redevelopment candidates',
    tools: ['search_properties', 'spatial_query'],
    template: 'H',
  },
  PORTFOLIO_QUERY: {
    name: 'Portfolio Query',
    description: 'Analyze properties grouped by owner',
    tools: ['search_properties', 'get_property_details'],
    template: 'D',
  },
  TREND_ANALYSIS: {
    name: 'Trend Analysis',
    description: 'How metrics changed over time',
    tools: ['get_market_stats'],
    template: 'E',
  },
  RISK_ASSESSMENT: {
    name: 'Risk Assessment',
    description: 'Climate, flood, and environmental risk',
    tools: ['get_property_details'],
    template: 'I',
    requiresSubject: true,
  },
  PERMIT_ACTIVITY: {
    name: 'Permit Activity',
    description: 'Construction and development activity',
    tools: ['get_property_details', 'spatial_query'],
    template: 'J',
  },
  GENERAL: {
    name: 'General Question',
    description: 'General CRE question or conversation',
    tools: [],
    template: null,
  },
};

// ─── Intent Detection Patterns ──────────────────────────────────────────────
// Each pattern has a regex and a weight. Highest total weight wins.

const INTENT_PATTERNS = {
  COMPARABLE_SALES: [
    { pattern: /\bcomps?\b/i, weight: 10 },
    { pattern: /\bcomparable\s+sales?\b/i, weight: 10 },
    { pattern: /\bcomp\s+analysis\b/i, weight: 10 },
    { pattern: /\brun\s+comps\b/i, weight: 10 },
    { pattern: /\bwhat\b.{0,20}\bworth\b.{0,20}\bsales\b/i, weight: 8 },
    { pattern: /\bwhat\b.{0,20}\bsold\b.{0,20}\bnear(by)?\b/i, weight: 7 },
    { pattern: /\bsimilar\b.{0,20}\bsold\b/i, weight: 7 },
  ],
  DISTRESSED_SCREEN: [
    { pattern: /\bdistressed\b/i, weight: 10 },
    { pattern: /\bforeclosure(s)?\b/i, weight: 10 },
    { pattern: /\bpre-?foreclosure\b/i, weight: 10 },
    { pattern: /\btax\s+delinquen/i, weight: 10 },
    { pattern: /\bmotivated\s+seller/i, weight: 9 },
    { pattern: /\btired\s+landlord/i, weight: 9 },
    { pattern: /\bmom\s*(and|&|n)\s*pop\b/i, weight: 8 },
    { pattern: /\bopportunit(y|ies)\b/i, weight: 6 },
    { pattern: /\bgood\s+deal/i, weight: 6 },
    { pattern: /\bunder\s*water\b/i, weight: 8 },
    { pattern: /\bhigh\s+ltv\b/i, weight: 8 },
    { pattern: /\bnotice\s+of\s+default\b/i, weight: 10 },
    { pattern: /\bnod\b/i, weight: 5 },
  ],
  OWNER_RESEARCH: [
    { pattern: /\bwho\s+owns\b/i, weight: 10 },
    { pattern: /\bowner\b.{0,15}\bportfolio\b/i, weight: 10 },
    { pattern: /\bwhat\s+else\b.{0,20}\bown/i, weight: 9 },
    { pattern: /\blinked\s+propert/i, weight: 8 },
    { pattern: /\bsame\s+(owner|entity)\b/i, weight: 8 },
    { pattern: /\bowned\s+by\b/i, weight: 7 },
    { pattern: /\beverything\s+owned\b/i, weight: 9 },
    { pattern: /\babsentee\s+owner/i, weight: 6 },
    { pattern: /\bcorporate\s+own/i, weight: 5 },
  ],
  SITE_ANALYSIS: [
    { pattern: /\bsite\s+analysis\b/i, weight: 10 },
    { pattern: /\bdue\s+diligence\b/i, weight: 10 },
    { pattern: /\banalyze\b.{0,30}\bacquisition\b/i, weight: 10 },
    { pattern: /\btell\s+me\s+everything\b/i, weight: 9 },
    { pattern: /\bsite\s+report\b/i, weight: 9 },
    { pattern: /\bwhat\s+should\s+I\s+know\b/i, weight: 8 },
    { pattern: /\bevaluate\b.{0,20}\binvestment\b/i, weight: 7 },
    { pattern: /\bfull\s+(analysis|report)\b/i, weight: 7 },
  ],
  MARKET_STATISTICS: [
    { pattern: /\bmarket\s+stat/i, weight: 10 },
    { pattern: /\bmarket\s+snapshot\b/i, weight: 10 },
    { pattern: /\baverage\b.{0,20}\b(price|value|psf|\$\/sf)\b/i, weight: 8 },
    { pattern: /\bhow('s|\s+is)\s+the\b.{0,20}\bmarket\b/i, weight: 8 },
    { pattern: /\bmedian\b.{0,20}\b(price|value)\b/i, weight: 8 },
    { pattern: /\bsales?\s+volume\b/i, weight: 7 },
    { pattern: /\binvestor\s+activity\b/i, weight: 7 },
    { pattern: /\bforeclosure\s+rate\b/i, weight: 6 },
  ],
  INVESTMENT_ANALYSIS: [
    { pattern: /\bequity\s+position\b/i, weight: 10 },
    { pattern: /\binvestment\s+analysis\b/i, weight: 10 },
    { pattern: /\bhow\s+much\s+equity\b/i, weight: 9 },
    { pattern: /\bltv\b/i, weight: 7 },
    { pattern: /\brental\s+(income|value|yield)\b/i, weight: 7 },
    { pattern: /\bcap\s+rate\b/i, weight: 6 },
    { pattern: /\breturn\b.{0,15}\blook\s+like\b/i, weight: 7 },
    { pattern: /\bloan\s+balance\b/i, weight: 6 },
  ],
  DEVELOPMENT_POTENTIAL: [
    { pattern: /\bdevelopment\s+site/i, weight: 10 },
    { pattern: /\bteardown\b/i, weight: 10 },
    { pattern: /\bassemblage\b/i, weight: 10 },
    { pattern: /\bwhere\s+can\s+I\s+build\b/i, weight: 9 },
    { pattern: /\bvacant\b.{0,20}\b(commercial|zoned)\b/i, weight: 8 },
    { pattern: /\bdevelopment\s+potential\b/i, weight: 9 },
    { pattern: /\bentitled\s+land\b/i, weight: 9 },
    { pattern: /\bland.{0,10}ratio\b/i, weight: 7 },
    { pattern: /\bredevelopment\b/i, weight: 8 },
  ],
  PORTFOLIO_QUERY: [
    { pattern: /\bportfolio\b/i, weight: 8 },
    { pattern: /\ball\s+propert.{0,10}\bowned\b/i, weight: 9 },
    { pattern: /\blargest\s+(landlord|owner)/i, weight: 8 },
    { pattern: /\btop\b.{0,15}\b(investor|owner)/i, weight: 7 },
    { pattern: /\beverything\s+owned\b/i, weight: 8 },
  ],
  TREND_ANALYSIS: [
    { pattern: /\btrend/i, weight: 8 },
    { pattern: /\bhow\s+have\b.{0,20}\bchanged\b/i, weight: 8 },
    { pattern: /\bappreciating\b/i, weight: 7 },
    { pattern: /\bdeclining\b/i, weight: 6 },
    { pattern: /\bcompare\b.{0,30}\bvs\b/i, weight: 8 },
    { pattern: /\bover\s+(the\s+)?(last|past)\b.{0,15}\byear/i, weight: 5 },
    { pattern: /\byear.over.year\b/i, weight: 8 },
  ],
  RISK_ASSESSMENT: [
    { pattern: /\bflood\s+(risk|zone)\b/i, weight: 10 },
    { pattern: /\bclimate\s+risk\b/i, weight: 10 },
    { pattern: /\benvironmental\b.{0,15}\b(risk|concern)/i, weight: 9 },
    { pattern: /\bin\s+a\s+flood\s+zone\b/i, weight: 9 },
    { pattern: /\brisk\s+(factor|assess)/i, weight: 8 },
    { pattern: /\bwildfire\b/i, weight: 7 },
    { pattern: /\bhurricane\b/i, weight: 6 },
  ],
  PERMIT_ACTIVITY: [
    { pattern: /\bpermit/i, weight: 9 },
    { pattern: /\bconstruction\s+activity\b/i, weight: 9 },
    { pattern: /\bwhat('s|\s+is)\s+being\s+built\b/i, weight: 9 },
    { pattern: /\bnew\s+development/i, weight: 7 },
    { pattern: /\brecent\b.{0,15}\b(construction|building)\b/i, weight: 6 },
  ],
  PROPERTY_SEARCH: [
    { pattern: /\bfind\b/i, weight: 3 },
    { pattern: /\bshow\s+me\b/i, weight: 3 },
    { pattern: /\bsearch\b/i, weight: 3 },
    { pattern: /\blist\b/i, weight: 3 },
    { pattern: /\bare\s+there\s+any\b/i, weight: 3 },
    { pattern: /\bwhat\b.{0,20}\bavailable\b/i, weight: 3 },
    { pattern: /\blooking\s+for\b/i, weight: 3 },
  ],
};

// ─── Parameter Extraction ───────────────────────────────────────────────────

// ZIP code pattern
const ZIP_REGEX = /\b(\d{5})\b/g;

// Address pattern (simplified — catches most US addresses)
const ADDRESS_REGEX = /\b\d+\s+[A-Za-z][\w\s.]+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Pkwy|Hwy|Loop|Circle|Cir)\b\.?/gi;

// Dollar amount patterns
const DOLLAR_REGEX = /\$\s*([\d,.]+)\s*(k|m|mm|mil|million|thousand|billion)?/gi;
const UNDER_OVER_REGEX = /\b(under|below|less\s+than|over|above|more\s+than|at\s+least)\s+\$?\s*([\d,.]+)\s*(k|m|mm|mil|million|thousand)?/gi;

// Numeric with unit patterns
const SF_REGEX = /\b([\d,]+)\s*(?:\+\s*)?(?:sf|sq\s*ft|square\s*feet|square\s*foot)\b/gi;
const ACRES_REGEX = /\b([\d,.]+)\s*(?:\+\s*)?(?:acres?)\b/gi;
const UNITS_REGEX = /\b([\d,]+)\s*(?:\+\s*)?(?:units?|doors?)\b/gi;

// Year patterns
const YEAR_BUILT_REGEX = /\bbuilt\s+(after|before|since|in)\s+(\d{4})\b/gi;
const YEAR_REGEX = /\b(19|20)\d{2}\b/g;

// Time patterns
const MONTHS_REGEX = /\b(?:last|past)\s+(\d+)\s+months?\b/gi;
const YEARS_REGEX = /\b(?:last|past)\s+(\d+)\s+years?\b/gi;

// Radius patterns
const RADIUS_REGEX = /\b(?:within|in)\s+(\d+)\s+miles?\b/gi;

// Austin area neighborhood mappings
const AREA_TO_ZIPS = {
  'south austin':    ['78704', '78741', '78745', '78748', '78749'],
  'east austin':     ['78702', '78721', '78722', '78723', '78741'],
  'north austin':    ['78758', '78759', '78757', '78753', '78750'],
  'west austin':     ['78735', '78746', '78733', '78730'],
  'downtown':        ['78701'],
  'downtown austin': ['78701'],
  'central austin':  ['78701', '78703', '78705', '78751', '78756'],
  'mueller':         ['78723'],
  'domain':          ['78758'],
  'the domain':      ['78758'],
  'round rock':      ['78664', '78665', '78681'],
  'cedar park':      ['78613'],
  'pflugerville':    ['78660'],
  'georgetown':      ['78626', '78628', '78633'],
  'lakeway':         ['78734'],
  'bee cave':        ['78738'],
  'kyle':            ['78640'],
  'buda':            ['78610'],
  'manor':           ['78653'],
  'leander':         ['78641'],
  'dripping springs': ['78620'],
};

/**
 * Parse a dollar string into a number.
 * "$1.5M" → 1500000, "$500K" → 500000, "$2,000,000" → 2000000
 */
function parseDollarAmount(numStr, suffix) {
  let num = parseFloat(numStr.replace(/,/g, ''));
  if (!suffix) return num;
  
  const s = suffix.toLowerCase();
  if (s === 'k' || s === 'thousand') num *= 1000;
  else if (s === 'm' || s === 'mm' || s === 'mil' || s === 'million') num *= 1000000;
  else if (s === 'billion') num *= 1000000000;
  
  return num;
}

/**
 * Extract structured parameters from a user query.
 * 
 * @param {string} query - User's raw query text
 * @param {string} [intentType] - Classified intent (for context-specific extraction)
 * @returns {object} Extracted parameters
 */
function extractParameters(query, intentType) {
  const params = {};
  const q = query || '';

  // ── Asset Class ──
  const assetClasses = extractAssetClasses(q);
  if (assetClasses.length > 0) {
    // Use the first (most specific) match
    const primary = assetClasses[0];
    params.assetClass = primary.class;
    params.assetCodes = primary.codes;
    params.assetLabel = primary.label;
    if (primary.scaleFilter) {
      params.scaleFilter = primary.scaleFilter;
    }
  }

  // ── Location: ZIP codes ──
  const zips = [];
  let zipMatch;
  const zipRegex = new RegExp(ZIP_REGEX.source, 'g');
  while ((zipMatch = zipRegex.exec(q)) !== null) {
    zips.push(zipMatch[1]);
  }
  if (zips.length > 0) {
    params.zipCodes = zips;
  }

  // ── Location: Named areas ──
  const qLower = q.toLowerCase();
  for (const [area, areaZips] of Object.entries(AREA_TO_ZIPS)) {
    if (qLower.includes(area)) {
      params.namedArea = area;
      params.zipCodes = params.zipCodes || [];
      params.zipCodes.push(...areaZips.filter(z => !params.zipCodes.includes(z)));
      break;
    }
  }

  // ── Location: Addresses ──
  const addrRegex = new RegExp(ADDRESS_REGEX.source, 'gi');
  const addresses = [];
  let addrMatch;
  while ((addrMatch = addrRegex.exec(q)) !== null) {
    addresses.push(addrMatch[0].trim());
  }
  if (addresses.length > 0) {
    params.addresses = addresses;
    params.subjectAddress = addresses[0]; // Primary address
  }

  // ── Dollar amounts ──
  const dollarRegex = new RegExp(DOLLAR_REGEX.source, 'gi');
  let dollarMatch;
  while ((dollarMatch = dollarRegex.exec(q)) !== null) {
    const amount = parseDollarAmount(dollarMatch[1], dollarMatch[2]);
    if (!params.dollarAmounts) params.dollarAmounts = [];
    params.dollarAmounts.push(amount);
  }

  // ── Under/Over amounts ──
  const underOverRegex = new RegExp(UNDER_OVER_REGEX.source, 'gi');
  let uoMatch;
  while ((uoMatch = underOverRegex.exec(q)) !== null) {
    const direction = uoMatch[1].toLowerCase();
    const amount = parseDollarAmount(uoMatch[2], uoMatch[3]);
    if (direction.includes('under') || direction.includes('below') || direction.includes('less')) {
      params.maxPrice = amount;
    } else {
      params.minPrice = amount;
    }
  }

  // ── Building SF ──
  const sfRegex = new RegExp(SF_REGEX.source, 'gi');
  let sfMatch;
  while ((sfMatch = sfRegex.exec(q)) !== null) {
    const sf = parseInt(sfMatch[1].replace(/,/g, ''));
    // Check context for min/max
    const preceding = q.substring(Math.max(0, sfMatch.index - 20), sfMatch.index).toLowerCase();
    if (preceding.includes('over') || preceding.includes('above') || preceding.includes('at least') || preceding.includes('+')) {
      params.minBuildingSf = sf;
    } else if (preceding.includes('under') || preceding.includes('below') || preceding.includes('less')) {
      params.maxBuildingSf = sf;
    } else {
      params.minBuildingSf = sf; // Default: "50,000 SF" means "at least"
    }
  }

  // ── Lot Acres ──
  const acresRegex = new RegExp(ACRES_REGEX.source, 'gi');
  let acresMatch;
  while ((acresMatch = acresRegex.exec(q)) !== null) {
    const acres = parseFloat(acresMatch[1].replace(/,/g, ''));
    const preceding = q.substring(Math.max(0, acresMatch.index - 20), acresMatch.index).toLowerCase();
    if (preceding.includes('under') || preceding.includes('below') || preceding.includes('less')) {
      params.maxLotAcres = acres;
    } else {
      params.minLotAcres = acres;
    }
  }

  // ── Units (translate to SF since units_count unavailable) ──
  const unitsRegex = new RegExp(UNITS_REGEX.source, 'gi');
  let unitsMatch;
  while ((unitsMatch = unitsRegex.exec(q)) !== null) {
    const units = parseInt(unitsMatch[1].replace(/,/g, ''));
    // Rough translation: 1 unit ≈ 900 SF average
    params.requestedUnits = units;
    params.minBuildingSf = params.minBuildingSf || (units * 900);
    params.unitsNote = `User requested ${units}+ units. Unit count data is unavailable; using estimated ${params.minBuildingSf.toLocaleString()} SF as proxy (~900 SF/unit average).`;
  }

  // ── Year Built ──
  const ybRegex = new RegExp(YEAR_BUILT_REGEX.source, 'gi');
  let ybMatch;
  while ((ybMatch = ybRegex.exec(q)) !== null) {
    const direction = ybMatch[1].toLowerCase();
    const year = parseInt(ybMatch[2]);
    if (direction === 'after' || direction === 'since') {
      params.minYearBuilt = year;
    } else if (direction === 'before') {
      params.maxYearBuilt = year;
    } else if (direction === 'in') {
      params.minYearBuilt = year;
      params.maxYearBuilt = year;
    }
  }

  // ── Timeframe ──
  const monthsRegex = new RegExp(MONTHS_REGEX.source, 'gi');
  let monthsMatch;
  if ((monthsMatch = monthsRegex.exec(q)) !== null) {
    params.timeframeMonths = parseInt(monthsMatch[1]);
  }
  const yearsRegex = new RegExp(YEARS_REGEX.source, 'gi');
  let yearsMatch;
  if ((yearsMatch = yearsRegex.exec(q)) !== null) {
    params.timeframeMonths = parseInt(yearsMatch[1]) * 12;
  }

  // ── Radius ──
  const radiusRegex = new RegExp(RADIUS_REGEX.source, 'gi');
  let radiusMatch;
  if ((radiusMatch = radiusRegex.exec(q)) !== null) {
    params.radiusMiles = parseInt(radiusMatch[1]);
  }

  // ── Owner type signals ──
  if (/\babsentee\b/i.test(q)) params.absenteeOwner = true;
  if (/\bowner.?occupied\b/i.test(q)) params.ownerOccupied = true;
  if (/\bcorporate\b/i.test(q)) params.corporateOwned = true;
  if (/\bmom\s*(and|&|n)\s*pop\b/i.test(q)) params.momAndPop = true;
  if (/\btrust\b/i.test(q) && !params.assetClass) params.trustOwned = true;
  if (/\bestate\b/i.test(q) && !params.assetClass) params.estateOwned = true;

  // ── Distress signals ──
  if (/\btax\s+delinquen/i.test(q)) params.taxDelinquent = true;
  if (/\bforeclosure/i.test(q) || /\bpre-?foreclosure/i.test(q)) params.foreclosure = true;
  if (/\bhigh\s+(equity|ltv)\b/i.test(q)) params.highEquity = true;

  // ── Vague terms ──
  const vagueTerms = ['big', 'large', 'small', 'new', 'newer', 'old', 'older', 'vintage', 'historic', 'cheap', 'expensive'];
  for (const term of vagueTerms) {
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    if (regex.test(q)) {
      const resolved = resolveVagueTerm(term, params.assetClass);
      if (resolved) {
        params.vagueTerms = params.vagueTerms || [];
        params.vagueTerms.push({ term, ...resolved });

        // Apply resolved filters
        if (resolved.filter === 'area_building' && resolved.value) {
          if (resolved.operator === '>') params.minBuildingSf = params.minBuildingSf || resolved.value;
          if (resolved.operator === '<') params.maxBuildingSf = params.maxBuildingSf || resolved.value;
        }
        if (resolved.filter === 'year_built' && resolved.value) {
          if (resolved.operator === '>=') params.minYearBuilt = params.minYearBuilt || resolved.value;
          if (resolved.operator === '<') params.maxYearBuilt = params.maxYearBuilt || resolved.value;
        }
      }
    }
  }

  // ── Owner name (for portfolio queries) ──
  // Look for quoted names or "owned by [name]"
  const ownedByMatch = q.match(/(?:owned\s+by|owner\s+(?:is|named?))\s+(.+?)(?:\s+in\b|\s+near\b|\?|$)/i);
  if (ownedByMatch) {
    params.ownerName = ownedByMatch[1].trim();
  }
  const quotedMatch = q.match(/["']([^"']+)["']/);
  if (quotedMatch && (intentType === 'OWNER_RESEARCH' || intentType === 'PORTFOLIO_QUERY')) {
    params.ownerName = quotedMatch[1].trim();
  }

  // ── Property class (A/B/C/D) ──
  const classMatch = q.match(/\bclass\s+([A-Da-d])\b/i);
  if (classMatch) {
    params.propertyClass = classMatch[1].toUpperCase();
  }

  return params;
}

// ─── Intent Classification ──────────────────────────────────────────────────

/**
 * Classify a user query into one or more intent categories.
 * 
 * @param {string} query - User's raw query text
 * @returns {{
 *   primary: { intent: string, confidence: number, name: string },
 *   secondary: { intent: string, confidence: number, name: string } | null,
 *   params: object,
 *   isMultiIntent: boolean
 * }}
 */
function classifyIntent(query) {
  if (!query || query.trim().length === 0) {
    return {
      primary: { intent: 'GENERAL', confidence: 0, name: 'General Question' },
      secondary: null,
      params: {},
      isMultiIntent: false,
    };
  }

  // Score each intent
  const scores = {};
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    scores[intent] = 0;
    for (const { pattern, weight } of patterns) {
      if (pattern.test(query)) {
        scores[intent] += weight;
      }
    }
  }

  // Sort by score descending
  const sorted = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  if (sorted.length === 0) {
    // No patterns matched — check if it has an asset class (likely a search)
    const assetClasses = extractAssetClasses(query);
    if (assetClasses.length > 0) {
      const params = extractParameters(query, 'PROPERTY_SEARCH');
      return {
        primary: { intent: 'PROPERTY_SEARCH', confidence: 0.5, name: 'Property Search' },
        secondary: null,
        params,
        isMultiIntent: false,
      };
    }

    return {
      primary: { intent: 'GENERAL', confidence: 0.3, name: 'General Question' },
      secondary: null,
      params: extractParameters(query),
      isMultiIntent: false,
    };
  }

  const [primaryIntent, primaryScore] = sorted[0];
  const maxPossible = INTENT_PATTERNS[primaryIntent].reduce((sum, p) => sum + p.weight, 0);
  const primaryConfidence = Math.min(primaryScore / maxPossible, 1.0);

  // Extract parameters with intent context
  const params = extractParameters(query, primaryIntent);

  // Check for multi-intent
  let secondary = null;
  let isMultiIntent = false;
  if (sorted.length >= 2) {
    const [secIntent, secScore] = sorted[1];
    const secMaxPossible = INTENT_PATTERNS[secIntent].reduce((sum, p) => sum + p.weight, 0);
    const secConfidence = Math.min(secScore / secMaxPossible, 1.0);

    // If second intent has meaningful score and is different enough
    if (secScore >= 6 && secConfidence >= 0.08) {
      secondary = {
        intent: secIntent,
        confidence: secConfidence,
        name: INTENTS[secIntent]?.name || secIntent,
      };
      isMultiIntent = true;
    }
  }

  return {
    primary: {
      intent: primaryIntent,
      confidence: primaryConfidence,
      name: INTENTS[primaryIntent]?.name || primaryIntent,
    },
    secondary,
    params,
    isMultiIntent,
  };
}

// ─── Smart Defaults ─────────────────────────────────────────────────────────

/**
 * Apply professional CRE defaults to extracted parameters.
 * Fills in missing values based on intent and best practices.
 * 
 * @param {object} params - Extracted parameters
 * @param {string} intentType - Classified intent
 * @returns {object} Parameters with defaults applied
 */
function applySmartDefaults(params, intentType) {
  const enriched = { ...params };

  // Default asset codes for "commercial" if no specific type
  if (!enriched.assetCodes && intentType !== 'GENERAL') {
    // Don't default for owner research or site analysis (those work on any type)
    if (['PROPERTY_SEARCH', 'DISTRESSED_SCREEN', 'MARKET_STATISTICS', 'DEVELOPMENT_POTENTIAL'].includes(intentType)) {
      // Leave unset — search all types. Claude can ask for specificity.
    }
  }

  // Default timeframe
  if (!enriched.timeframeMonths) {
    if (intentType === 'COMPARABLE_SALES') enriched.timeframeMonths = 24;
    if (intentType === 'MARKET_STATISTICS') enriched.timeframeMonths = 12;
    if (intentType === 'TREND_ANALYSIS') enriched.timeframeMonths = 36;
    if (intentType === 'PERMIT_ACTIVITY') enriched.timeframeMonths = 24;
  }

  // Default radius for comp searches
  if (intentType === 'COMPARABLE_SALES' && !enriched.radiusMiles) {
    enriched.radiusTiers = [1, 3, 5]; // miles
  }

  // Default result limit
  if (!enriched.limit) {
    enriched.limit = 50;
  }

  // Default: arms-length only for comps
  if (intentType === 'COMPARABLE_SALES') {
    enriched.armsLengthOnly = enriched.armsLengthOnly !== false; // default true
  }

  return enriched;
}

// ─── Full Pipeline Entry Point ──────────────────────────────────────────────

/**
 * Full classification pipeline: classify → extract → defaults → context.
 * 
 * @param {string} query - User's raw query
 * @param {object} [context] - Optional context (selectedAttomId, viewport bbox, etc.)
 * @returns {object} Complete classification result
 */
function processQuery(query, context = {}) {
  const classification = classifyIntent(query);
  const enrichedParams = applySmartDefaults(classification.params, classification.primary.intent);

  // Add context
  if (context.selectedAttomId && !enrichedParams.subjectAddress) {
    enrichedParams.selectedAttomId = context.selectedAttomId;
  }
  if (context.bbox && !enrichedParams.zipCodes && !enrichedParams.addresses) {
    enrichedParams.bbox = context.bbox;
  }

  return {
    ...classification,
    params: enrichedParams,
    intent: classification.primary.intent,
    tools: INTENTS[classification.primary.intent]?.tools || [],
    template: INTENTS[classification.primary.intent]?.template || null,
    requiresSubject: INTENTS[classification.primary.intent]?.requiresSubject || false,
  };
}

module.exports = {
  INTENTS,
  INTENT_PATTERNS,
  AREA_TO_ZIPS,
  classifyIntent,
  extractParameters,
  applySmartDefaults,
  processQuery,
  parseDollarAmount,
};
