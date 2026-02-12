const propertyService = require('./propertyService');
const spatialService = require('./spatialService');
const { parseBbox } = require('../utils/normalize');
const { buildSystemPrompt } = require('../knowledge/system-prompt');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const tools = [
  {
    name: 'search_properties',
    description: 'Search for properties in Travis County with filters. Returns up to `limit` properties with attomId, address, property type, year built, beds/baths, building area, lot size, assessed value, last sale date/price. Use bbox for map viewport searches, zipCode for ZIP-based searches. Combine filters for targeted results.',
    input_schema: {
      type: 'object',
      properties: {
        bbox: { type: 'string', description: 'Bounding box as "minLng,minLat,maxLng,maxLat". Use for map viewport searches.' },
        zipCode: { type: 'string', description: 'ZIP code (e.g., "78701")' },
        propertyType: { type: 'string', description: 'Property type filter (e.g., "COMMERCIAL", "RESIDENTIAL", "INDUSTRIAL", "VACANT LAND")' },
        minAcres: { type: 'number', description: 'Minimum lot size in acres' },
        maxAcres: { type: 'number', description: 'Maximum lot size in acres' },
        minValue: { type: 'number', description: 'Minimum assessed value in dollars' },
        maxValue: { type: 'number', description: 'Maximum assessed value in dollars' },
        absenteeOwner: { type: 'boolean', description: 'Filter to absentee owners only' },
        ownerOccupied: { type: 'boolean', description: 'Filter to owner-occupied only' },
        corporateOwned: { type: 'boolean', description: 'Filter to corporate/company owned only' },
        foreclosure: { type: 'boolean', description: 'Filter to properties with foreclosure records' },
        taxDelinquent: { type: 'boolean', description: 'Filter to tax delinquent properties' },
        recentSales: { type: 'boolean', description: 'Filter to properties sold in last 12 months' },
        highEquity: { type: 'boolean', description: 'Filter to properties with high available equity' },
        limit: { type: 'number', description: 'Max results to return (default 20, max 100)' },
      },
    },
  },
  {
    name: 'get_property_details',
    description: 'Get full property details including ownership, tax, sales, loans, valuations, climate risk, permits.',
    input_schema: { type: 'object', properties: { attomId: { type: 'string' } }, required: ['attomId'] },
  },
  {
    name: 'get_market_stats',
    description: 'Get aggregate market statistics for an area.',
    input_schema: { type: 'object', properties: { zipCode: { type: 'string' }, fipsCode: { type: 'string' }, propertyType: { type: 'string' } } },
  },
  {
    name: 'spatial_query',
    description: 'Find properties within a radius of a point.',
    input_schema: { type: 'object', properties: { longitude: { type: 'number' }, latitude: { type: 'number' }, radiusMeters: { type: 'number' }, limit: { type: 'number' } }, required: ['longitude', 'latitude'] },
  },
];

async function executeTool(toolName, toolInput) {
  switch (toolName) {
    case 'search_properties': {
      const bbox = toolInput.bbox ? parseBbox(toolInput.bbox) : null;
      const filters = { ...toolInput }; delete filters.bbox; delete filters.limit; console.log("[SEARCH] filters:", JSON.stringify(filters));
      return await propertyService.searchProperties({ bbox, filters, limit: toolInput.limit || 20 });
    }
    case 'get_property_details':
      return await propertyService.getPropertyDetail(toolInput.attomId);
    case 'get_market_stats':
      return await propertyService.getMarketStats(toolInput);
    case 'spatial_query':
      return await spatialService.propertiesWithinRadius(toolInput.longitude, toolInput.latitude, toolInput.radiusMeters || 1000, toolInput.limit || 50);
    default:
      return { error: 'Unknown tool: ' + toolName };
  }
}

async function chat(messages, context = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt = buildSystemPrompt(context);

  // Collect attom_ids from tool results
  const collectedProperties = [];

  let response = await callClaudeAPI(apiKey, systemPrompt, messages, tools);
  let iterations = 0;

  while (response.stop_reason === 'tool_use' && iterations < 5) {
    iterations++;
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];

    for (const tu of toolUseBlocks) {
      try {
        const result = await executeTool(tu.name, tu.input);

        // Extract attom_ids from search results
        if (tu.name === 'search_properties' || tu.name === 'spatial_query') {
          const properties = result.properties || result;
          if (Array.isArray(properties)) {
            properties.forEach(p => {
              if (p.attomId) collectedProperties.push({ attomId: Number(p.attomId), latitude: p.latitude ? Number(p.latitude) : null, longitude: p.longitude ? Number(p.longitude) : null });
            });
          }
        }
        // Extract attom_id from single property detail
        if (tu.name === 'get_property_details' && result && result.attomId) {
          collectedProperties.push({ attomId: Number(result.attomId), latitude: result.latitude ? Number(result.latitude) : null, longitude: result.longitude ? Number(result.longitude) : null });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      } catch (error) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify({ error: error.message }),
          is_error: true,
        });
      }
    }

    const updatedMessages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
    response = await callClaudeAPI(apiKey, systemPrompt, updatedMessages, tools);
  }

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  const seen = new Set();
  const uniqueProperties = collectedProperties.filter(p => {
    if (seen.has(p.attomId)) return false;
    seen.add(p.attomId);
    return true;
  });

  return { text, properties: uniqueProperties.map(p => p.attomId), propertyMarkers: uniqueProperties };
}

async function callClaudeAPI(apiKey, systemPrompt, messages, toolDefs) {
  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 4096, system: systemPrompt, messages, tools: toolDefs }),
  });
  if (!response.ok) { const error = await response.text(); throw new Error('Claude API error: ' + response.status + ' - ' + error); }
  return await response.json();
}

module.exports = { chat, tools };
