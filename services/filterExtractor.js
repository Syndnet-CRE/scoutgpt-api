'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { buildRegistryContext } = require('./registryService');
const { buildFilterExtractionPrompt } = require('../knowledge/prompts/filter-extractor');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SONNET_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;

/**
 * Layer 2: Filter Extraction
 * Takes a natural language property search query and returns structured filters
 * validated against the filters_registry.
 *
 * @param {string} userMessage - The user's natural language query
 * @param {object} context - { bbox, selectedProperty, conversationHistory }
 * @returns {object} - { filters, spatial, sort, limit, insights_to_check, clarifications, filter_explanation }
 */
async function extractFilters(userMessage, context = {}) {
  const registryContext = buildRegistryContext();
  if (!registryContext) {
    throw new Error('[filterExtractor] Registry not loaded. Cannot extract filters.');
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const systemPrompt = buildFilterExtractionPrompt(registryContext, today);

  // Build the user message with context
  let fullMessage = userMessage;
  if (context.bbox) {
    fullMessage += `\n\n[Context: User is viewing map area with bounding box: ${context.bbox}]`;
  }
  if (context.selectedProperty) {
    fullMessage += `\n\n[Context: User has property ${context.selectedProperty} selected]`;
  }

  const response = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: fullMessage }],
  });

  const text = response.content?.[0]?.text || '';

  // Parse JSON response — strip markdown fences if Sonnet wraps them
  let parsed;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('[filterExtractor] Failed to parse Sonnet response:', text.substring(0, 500));
    throw new Error(`[filterExtractor] Invalid JSON from Sonnet: ${err.message}`);
  }

  // Validate structure — ensure required fields exist with defaults
  const result = {
    filters: Array.isArray(parsed.filters) ? parsed.filters : [],
    spatial: parsed.spatial || null,
    sort: parsed.sort || null,
    limit: typeof parsed.limit === 'number' ? parsed.limit : 25,
    insights_to_check: Array.isArray(parsed.insights_to_check) ? parsed.insights_to_check : [],
    clarifications: Array.isArray(parsed.clarifications) ? parsed.clarifications : [],
    filter_explanation: parsed.filter_explanation || '',
  };

  // If there are clarifications and no filters, this is a clarification response
  if (result.clarifications.length > 0 && result.filters.length === 0) {
    console.log('[filterExtractor] Returning clarification:', result.clarifications.map(c => c.question).join('; '));
  } else {
    console.log(`[filterExtractor] Extracted ${result.filters.length} filters: ${result.filters.map(f => f.slug).join(', ')}`);
  }

  return result;
}

module.exports = { extractFilters };
