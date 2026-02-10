const propertyService = require('./propertyService');
const spatialService = require('./spatialService');
const { parseBbox } = require('../utils/normalize');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const tools = [
  {
    name: 'search_properties',
    description: 'Search for properties with filters like location, type, price, acreage, ownership.',
    input_schema: {
      type: 'object',
      properties: {
        bbox: { type: 'string', description: 'Bounding box as "minLng,minLat,maxLng,maxLat"' },
        zipCode: { type: 'string' },
        propertyType: { type: 'string' },
        minAcres: { type: 'number' },
        maxAcres: { type: 'number' },
        minValue: { type: 'number' },
        maxValue: { type: 'number' },
        absenteeOwner: { type: 'boolean' },
        corporateOwned: { type: 'boolean' },
        foreclosure: { type: 'boolean' },
        limit: { type: 'number' },
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
      const filters = { ...toolInput }; delete filters.bbox; delete filters.limit;
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

async function chat(messages) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const systemPrompt = 'You are ScoutGPT, an AI CRE intelligence assistant with access to ATTOM property data for Travis County, Texas (FIPS 48453). Search properties, get details, view market stats, and find nearby properties. Always provide specific data. Austin ZIP codes: 78701-78799.';

  let response = await callClaudeAPI(apiKey, systemPrompt, messages, tools);
  let iterations = 0;

  while (response.stop_reason === 'tool_use' && iterations < 5) {
    iterations++;
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = [];
    for (const tu of toolUseBlocks) {
      try {
        const result = await executeTool(tu.name, tu.input);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
      } catch (error) {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: error.message }), is_error: true });
      }
    }
    const updatedMessages = [...messages, { role: 'assistant', content: response.content }, { role: 'user', content: toolResults }];
    response = await callClaudeAPI(apiKey, systemPrompt, updatedMessages, tools);
  }

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { text, properties: [] };
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
