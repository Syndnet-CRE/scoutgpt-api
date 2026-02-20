// Helper to title-case strings (e.g., "COMMERCIAL" -> "Commercial")
function titleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Category-to-column mappings for dynamic table
const CATEGORY_COLUMNS = {
  financing: [
    { header: 'Loan Bal', field: 'loan_amount', format: 'currency' },
    { header: 'Rate', field: 'interest_rate', format: 'percent' },
    { header: 'Maturity', field: 'due_date', format: 'date_short' },
  ],
  ownership: [
    { header: 'Owner', field: 'owner1_name_full', format: 'text' },
    { header: 'Absentee', field: 'is_absentee_owner', format: 'boolean' },
  ],
  valuation: [
    { header: 'AVM', field: 'estimated_value', format: 'currency' },
    { header: 'Equity', field: 'available_equity', format: 'currency' },
  ],
  tax: [
    { header: 'Tax Delinq', field: 'tax_delinquent_year', format: 'text' },
  ],
  distress: [
    { header: 'Status', field: 'foreclosure_status', format: 'text' },
  ],
  climate: [
    { header: 'Risk Score', field: 'total_risk_score', format: 'number' },
  ],
  physical: [
    { header: 'Bldg SF', field: 'area_building', format: 'number' },
    { header: 'Lot Acres', field: 'area_lot_acres', format: 'number' },
  ],
};

// Insight narrative templates
const INSIGHT_NARRATIVES = {
  'tax-delinquent': '{count} have tax delinquencies — unpaid property taxes are an early distress signal that often precedes foreclosure',
  'absentee-owner': '{count} are absentee-owned — the owner mailing address differs from the property, indicating an investor or out-of-area holder',
  'foreclosure-status': '{count} have active foreclosure filings — these properties are in some stage of the foreclosure process',
  'loan-due-date': '{count} have notes maturing within 12 months — maturing debt forces a refinance, sale, or potential default',
  'high-equity': '{count} have significant available equity — substantial gap between estimated value and loan balance',
  'corporate-owner': '{count} are corporate-owned — held by a company entity rather than an individual',
};

// Follow-up suggestions by category
const CATEGORY_FOLLOWUPS = {
  financing: ['"Show me just the adjustable rate ones"', '"Which of these are overleveraged?"'],
  distress: ['"Who owns these?"', '"Show me auction dates"', '"Which have the highest default amounts?"'],
  ownership: ['"Show me their loan positions"', '"Which are in pre-foreclosure?"'],
  valuation: ['"Which have the most equity?"', '"Show me estimated rental values"'],
  tax: ['"Which are also in foreclosure?"', '"Show me the absentee owners"'],
  property_type: ['"Show me the absentee-owned ones"', '"Check tax status on these"'],
  location: ['"Show me distressed properties here"', '"What about commercial properties?"'],
  physical: ['"Which have loading docks?"', '"Show me climate risk scores"'],
  climate: ['"Which are in flood zones?"', '"Show me the safest ones"'],
};

// Formatters for table values
const formatters = {
  currency: (v) => v != null ? `$${Number(v).toLocaleString()}` : '—',
  percent: (v) => v != null ? `${Number(v).toFixed(2)}%` : '—',
  date_short: (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—',
  number: (v) => v != null ? Number(v).toLocaleString() : '—',
  boolean: (v) => v === true ? 'Yes' : v === false ? 'No' : '—',
  text: (v) => v || '—',
};

/**
 * Builds the headline section based on result count and filters
 */
function buildHeadline(searchResult, extractionResult) {
  const { total_count, applied_filters } = searchResult;

  if (total_count === 0) {
    return '## No Properties Found Matching Your Criteria';
  }

  const parts = [];

  // Start with count
  parts.push(`${total_count}`);

  // Look for key filter descriptors
  const descriptors = [];
  const appliedFilters = applied_filters || [];

  // Check for notable filters
  for (const filter of appliedFilters) {
    const slug = filter.slug;
    if (slug === 'is-absentee-owner' && filter.value === true) {
      descriptors.push('Absentee-Owned');
    } else if (slug === 'tax-delinquent-year') {
      descriptors.push('Tax-Delinquent');
    } else if (slug === 'foreclosure-status') {
      descriptors.push('Foreclosure');
    } else if (slug === 'loan-due-date') {
      descriptors.push('Maturing Notes');
    }
  }

  // Find property type from filters
  let propertyType = '';
  for (const filter of appliedFilters) {
    if (filter.slug === 'property-use-group' && filter.value) {
      propertyType = titleCase(String(filter.value));
      break;
    } else if (filter.slug === 'property-use-standardized' && filter.value) {
      propertyType = titleCase(String(filter.value));
      break;
    }
  }

  // Build descriptor string with "Properties" suffix
  if (descriptors.length > 0 && propertyType) {
    parts.push(`${descriptors.join(' ')} ${propertyType} Properties`);
  } else if (descriptors.length > 0) {
    parts.push(`${descriptors.join(' ')} Properties`);
  } else if (propertyType) {
    parts.push(`${propertyType} Properties`);
  } else {
    parts.push('Properties');
  }

  // Add spatial context
  let spatialContext = '';
  for (const filter of appliedFilters) {
    if (filter.slug === 'address-zip' && filter.value) {
      spatialContext = `in ${filter.value}`;
      break;
    } else if (filter.slug === 'address-city' && filter.value) {
      spatialContext = `in ${filter.value}`;
      break;
    } else if (filter.slug === 'county' && filter.value) {
      spatialContext = `in ${filter.value} County`;
      break;
    }
  }

  // Check extractionResult.spatial as fallback
  if (!spatialContext && extractionResult.spatial) {
    const spatial = extractionResult.spatial;
    if (spatial.zip) {
      spatialContext = `in ${spatial.zip}`;
    } else if (spatial.city) {
      spatialContext = `in ${spatial.city}`;
    } else if (spatial.county) {
      spatialContext = `in ${spatial.county}`;
    }
  }

  if (spatialContext) {
    parts.push(spatialContext);
  }

  return `## ${parts.join(' ')}`;
}

/**
 * Builds the transparency block explaining what was searched
 */
function buildTransparencyBlock(extractionResult) {
  const { filter_explanation, spatial } = extractionResult;

  let explanation = '';

  if (typeof filter_explanation === 'string') {
    explanation = filter_explanation;
  } else if (Array.isArray(filter_explanation) && filter_explanation.length > 0) {
    const reasons = filter_explanation.map(f => f.reason).filter(Boolean);
    if (reasons.length === 1) {
      explanation = reasons[0];
    } else if (reasons.length === 2) {
      explanation = `${reasons[0]} and ${reasons[1]}`;
    } else if (reasons.length > 2) {
      const lastReason = reasons.pop();
      explanation = `${reasons.join(', ')}, and ${lastReason}`;
    }
  }

  if (!explanation) {
    return '';
  }

  let result = `**What I searched for:** ${explanation}`;

  // Append spatial context if exists AND not already mentioned in explanation
  if (spatial) {
    let spatialDesc = '';
    let spatialValue = ''; // The raw value to check against explanation
    if (spatial.zip) {
      spatialDesc = `ZIP code ${spatial.zip}`;
      spatialValue = spatial.zip;
    } else if (spatial.city && spatial.state) {
      spatialDesc = `${spatial.city}, ${spatial.state}`;
      spatialValue = spatial.city;
    } else if (spatial.city) {
      spatialDesc = spatial.city;
      spatialValue = spatial.city;
    } else if (spatial.county && spatial.state) {
      spatialDesc = `${spatial.county} County, ${spatial.state}`;
      spatialValue = spatial.county;
    } else if (spatial.county) {
      spatialDesc = `${spatial.county} County`;
      spatialValue = spatial.county;
    }

    // Only append if the spatial value isn't already in the explanation
    if (spatialDesc && !explanation.toLowerCase().includes(spatialValue.toLowerCase())) {
      result += ` within ${spatialDesc}`;
    }
  }

  // Ensure it ends with a period
  if (!result.endsWith('.')) {
    result += '.';
  }

  return result;
}

/**
 * Gets unique categories from the search result's applied filters
 */
function getActiveCategories(searchResult) {
  const categories = new Set();
  const appliedFilters = searchResult.applied_filters || [];

  for (const filter of appliedFilters) {
    if (filter.category) {
      categories.add(filter.category);
    }
  }

  return Array.from(categories);
}

/**
 * Builds the dynamic markdown table
 */
function buildTable(searchResult, extractionResult) {
  const properties = searchResult.properties || [];

  if (properties.length === 0) {
    return '';
  }

  // Base columns
  const columns = [
    { header: '#', field: '_index', format: 'text' },
    { header: 'Address', field: 'address_full', format: 'text' },
    { header: 'Type', field: 'property_use_standardized', format: 'text' },
    { header: 'Year', field: 'year_built', format: 'text' },
    { header: 'Assessed Value', field: 'tax_assessed_value_total', format: 'currency' },
  ];

  // Get active categories and add extra columns (max 4)
  const activeCategories = getActiveCategories(searchResult);
  let extraColumnsAdded = 0;
  const maxExtraColumns = 4;

  for (const category of activeCategories) {
    if (extraColumnsAdded >= maxExtraColumns) break;

    const categoryColumns = CATEGORY_COLUMNS[category] || [];
    for (const col of categoryColumns) {
      if (extraColumnsAdded >= maxExtraColumns) break;
      // Avoid duplicate columns
      if (!columns.some(c => c.field === col.field)) {
        columns.push(col);
        extraColumnsAdded++;
      }
    }
  }

  // Build header row
  const headerRow = '| ' + columns.map(c => c.header).join(' | ') + ' |';
  const separatorRow = '| ' + columns.map(() => '---').join(' | ') + ' |';

  // Build data rows (top 10)
  const displayProperties = properties.slice(0, 10);
  const dataRows = displayProperties.map((prop, index) => {
    const cells = columns.map(col => {
      if (col.field === '_index') {
        return String(index + 1);
      }
      // Special handling for Type column: fallback to property_use_group, apply titleCase
      if (col.field === 'property_use_standardized') {
        return titleCase(prop.property_use_standardized || prop.property_use_group) || '—';
      }
      const value = prop[col.field];
      const formatter = formatters[col.format] || formatters.text;
      return formatter(value);
    });
    return '| ' + cells.join(' | ') + ' |';
  });

  return [headerRow, separatorRow, ...dataRows].join('\n');
}

/**
 * Builds the insight narratives section
 */
function buildInsights(searchResult) {
  const insights = searchResult.insights || [];
  const validInsights = insights.filter(i => i.count > 0);

  if (validInsights.length === 0) {
    return '';
  }

  const lines = ['### Insights'];

  for (const insight of validInsights) {
    const template = INSIGHT_NARRATIVES[insight.slug];
    let narrative;

    if (template) {
      narrative = template.replace('{count}', String(insight.count));
    } else {
      narrative = `${insight.count} match the ${insight.slug} criteria`;
    }

    lines.push(`- **${narrative}**`);
  }

  return lines.join('\n');
}

/**
 * Builds the follow-up suggestions section
 */
function buildFollowUps(searchResult, isZeroResults) {
  const lines = ['### Next Steps'];

  if (isZeroResults) {
    lines.push('- Try removing one filter at a time');
    lines.push('- Broaden your geographic search area');
    lines.push('- Check if the data exists for these specific criteria');
    return lines.join('\n');
  }

  const activeCategories = getActiveCategories(searchResult);
  const suggestions = new Set();

  // Collect suggestions from active categories
  for (const category of activeCategories) {
    const categoryFollowups = CATEGORY_FOLLOWUPS[category] || [];
    for (const followup of categoryFollowups) {
      suggestions.add(followup);
    }
  }

  // Add defaults if we have fewer than 2
  const defaultSuggestions = ['"Narrow these by location"', '"Who owns #1?"'];
  for (const def of defaultSuggestions) {
    if (suggestions.size < 2) {
      suggestions.add(def);
    }
  }

  // Take top 3
  const suggestionList = Array.from(suggestions).slice(0, 3);

  for (const suggestion of suggestionList) {
    lines.push(`- ${suggestion}`);
  }

  return lines.join('\n');
}

/**
 * Generates a formatted markdown response from extraction and search results.
 *
 * @param {Object} extractionResult - Result from filterExtractor.js containing filters, spatial info, and explanations
 * @param {Object} searchResult - Result from queryBuilder.executeSearch() containing properties and metadata
 * @param {string} userMessage - The original user message
 * @returns {string} Formatted markdown response with headline, transparency, table, insights, and follow-ups
 */
function generateResponse(extractionResult, searchResult, userMessage) {
  const totalCount = searchResult.total_count || 0;
  const isZeroResults = totalCount === 0;

  const sections = [];

  // SECTION 1: HEADLINE
  sections.push(buildHeadline(searchResult, extractionResult));

  // SECTION 2: TRANSPARENCY BLOCK
  const transparency = buildTransparencyBlock(extractionResult);
  if (transparency) {
    sections.push(transparency);
  }

  if (isZeroResults) {
    // Zero results: no table, show broadening message instead of insights
    sections.push(
      "This could mean the data isn't available for these specific filters, or the criteria are too narrow. Try broadening your search:"
    );
  } else {
    // SECTION 3: DYNAMIC TABLE
    const table = buildTable(searchResult, extractionResult);
    if (table) {
      sections.push(table);
    }

    // SECTION 4: INSIGHT NARRATIVES
    const insights = buildInsights(searchResult);
    if (insights) {
      sections.push(insights);
    }
  }

  // SECTION 5: FOLLOW-UP SUGGESTIONS
  sections.push(buildFollowUps(searchResult, isZeroResults));

  return sections.join('\n\n');
}

module.exports = { generateResponse };
