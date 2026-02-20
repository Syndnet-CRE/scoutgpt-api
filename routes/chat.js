const express = require('express');
const router = express.Router();
const claudeService = require('../services/claudeService');
const { classifyIntent, generateGeneralChatResponse } = require('../services/intentRouter');
const { extractFilters } = require('../services/filterExtractor');
const { executeSearch } = require('../services/queryBuilder');
const { generateResponse } = require('../services/responseGenerator');

router.post('/', async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Extract the user's latest message text
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '') : '';

    // ═══════════════════════════════════════════════════════════════════
    // LAYER 1: Intent Router (Haiku — fast, cheap)
    // Classifies intent BEFORE any expensive processing
    // ═══════════════════════════════════════════════════════════════════
    const intentResult = await classifyIntent(userText, {
      selectedProperty: context?.selectedProperty || null,
      bbox: context?.bbox || null,
    });

    console.log(`[INTENT_ROUTER] "${userText.substring(0, 60)}${userText.length > 60 ? '...' : ''}" → ${intentResult.intent} (${(intentResult.confidence * 100).toFixed(0)}%) — ${intentResult.reasoning}`);

    // ── Handle general_chat: Haiku response only (no Sonnet, no DB) ──
    if (intentResult.intent === 'general_chat') {
      const chatResponse = await generateGeneralChatResponse(userText, context);
      return res.json({
        text: chatResponse.text,
        properties: [],
        propertyMarkers: [],
        intent: 'general_chat',
      });
    }

    // ── Handle clarification_needed: Return question directly ──
    if (intentResult.intent === 'clarification_needed' && intentResult.clarification_question) {
      return res.json({
        text: intentResult.clarification_question,
        properties: [],
        propertyMarkers: [],
        intent: 'clarification_needed',
        awaiting_clarification: true,
      });
    }

    // ── Handle property_search: Layer 2 (Filter Extraction) + Layer 3 (Query Builder) ──
    if (intentResult.intent === 'property_search') {
      try {
        // Layer 2: Extract filters from natural language via Sonnet
        const extraction = await extractFilters(userText, {
          bbox: context?.bbox || null,
          selectedProperty: context?.selectedProperty || null,
        });

        // If clarification needed, return question to user
        if (extraction.clarifications.length > 0 && extraction.filters.length === 0) {
          const clarText = extraction.clarifications.map(c => {
            let msg = c.question;
            if (c.suggestions && c.suggestions.length > 0) {
              msg += '\n' + c.suggestions.map(s => `- ${s}`).join('\n');
            }
            return msg;
          }).join('\n\n');

          return res.json({
            text: clarText,
            properties: [],
            propertyMarkers: [],
            awaiting_clarification: true,
            intent: 'clarification_needed',
          });
        }

        // Layer 3: Build and execute query
        const queryResult = await executeSearch({
          filters: extraction.filters,
          spatial: extraction.spatial,
          sort: extraction.sort,
          limit: extraction.limit,
          insights_to_check: extraction.insights_to_check,
        });

        // Build property markers for map
        const propertyMarkers = (queryResult.properties || []).map(p => ({
          attomId: p.attom_id,
          latitude: parseFloat(p.latitude),
          longitude: parseFloat(p.longitude),
        })).filter(m => m.latitude && m.longitude);

        const attomIds = (queryResult.properties || []).map(p => p.attom_id);

        const text = generateResponse(extraction, queryResult, userText);

        return res.json({
          text,
          properties: attomIds,
          propertyMarkers,
          appliedFilters: extraction.filters,
          intent: 'property_search',
        });

      } catch (err) {
        console.error('[chat] property_search v2 pipeline error:', err.message);
        console.log('[chat] Falling back to existing regex + Sonnet pipeline...');
        // Fall through to existing pipeline below
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // FALLBACK: property_detail, market_analysis → Sonnet pipeline
    // ═══════════════════════════════════════════════════════════════════

    const chatContext = {
      selectedAttomId: context?.selectedProperty || null,
      viewport: context?.bbox || null,
      intent: intentResult.intent,
    };

    const result = await claudeService.chat(messages, chatContext);
    res.json({
      text: result.text,
      properties: result.properties,
      propertyMarkers: result.propertyMarkers,
      intent: intentResult.intent,
    });
  } catch (error) {
    console.error('Error in chat:', error);
    if (error.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }
    res.status(500).json({ error: 'Chat failed', details: error.message });
  }
});

module.exports = router;
