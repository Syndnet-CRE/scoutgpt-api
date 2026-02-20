const pool = require('../db/pool');

// Module-level cache
let registryCache = null;
let joinsCache = null;

/**
 * Loads the filters_registry and v_filter_joins from the database.
 * Caches results in module-level variables.
 * @throws {Error} If database query fails
 */
async function loadRegistry() {
  const registryQuery = `
    SELECT *
    FROM filters_registry
    WHERE is_active = true
    ORDER BY priority DESC
  `;

  const joinsQuery = `
    SELECT *
    FROM v_filter_joins
  `;

  const [registryResult, joinsResult] = await Promise.all([
    pool.query(registryQuery),
    pool.query(joinsQuery)
  ]);

  registryCache = registryResult.rows;
  joinsCache = joinsResult.rows;

  console.log(`[registryService] Loaded ${registryCache.length} filters, ${joinsCache.length} join clauses`);
}

/**
 * Returns the cached array of all active filters.
 * @returns {Array|null} Array of filter objects, or null if not loaded
 */
function getRegistry() {
  return registryCache;
}

/**
 * Returns a single filter object by slug.
 * @param {string} slug - The filter_slug to look up
 * @returns {Object|null} Filter object or null if not found/not loaded
 */
function getFilterBySlug(slug) {
  if (!registryCache) return null;
  return registryCache.find(f => f.filter_slug === slug) || null;
}

/**
 * Returns array of filters in a given category.
 * @param {string} category - The category to filter by
 * @returns {Array} Array of filter objects, empty if not loaded or no matches
 */
function getFiltersByCategory(category) {
  if (!registryCache) return [];
  return registryCache.filter(f => f.category === category);
}

/**
 * Returns the join_clause for a given source_table.
 * @param {string} sourceTable - The source_table to look up
 * @returns {string|null} Join clause string or null if not found/not loaded
 */
function getJoinClause(sourceTable) {
  if (!joinsCache) return null;
  const join = joinsCache.find(j => j.source_table === sourceTable);
  return join ? join.join_clause : null;
}

/**
 * Builds a JSON string of the registry grouped by category for LLM context injection.
 * @returns {string} JSON string with categories as keys and arrays of filter summaries as values
 */
function buildRegistryContext() {
  if (!registryCache) return JSON.stringify({});

  const grouped = {};

  for (const filter of registryCache) {
    const category = filter.category || 'uncategorized';

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push({
      slug: filter.filter_slug,
      name: filter.filter_name,
      type: filter.operator_type,
      unit: filter.default_range,
      aliases: filter.nlq_aliases,
      values: filter.allowed_values,
      description: filter.description
    });
  }

  return JSON.stringify(grouped);
}

module.exports = {
  loadRegistry,
  getRegistry,
  getFilterBySlug,
  getFiltersByCategory,
  getJoinClause,
  buildRegistryContext
};
