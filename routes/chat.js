const express = require('express');
const router = express.Router();
const claudeService = require('../services/claudeService');
const { processQuery } = require('../knowledge/intent-classifier');

router.post('/', async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Extract the user's latest message text
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = lastUserMsg ? (typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '') : '';

    // Run intent classifier to extract CRE parameters
    const classification = processQuery(userText, {
      selectedAttomId: context?.selectedProperty || null,
      bbox: context?.bbox || null,
    });

    console.log(`[INTENT] "${userText.substring(0, 60)}..." → ${classification.intent} (${(classification.primary.confidence * 100).toFixed(0)}%)`);
    if (classification.params.assetCodes) {
      console.log(`[INTENT] Asset codes: [${classification.params.assetCodes.join(',')}]`);
    }
    if (classification.params.zipCodes) {
      console.log(`[INTENT] ZIP codes: [${classification.params.zipCodes.join(',')}]`);
    }

    // Build context for Claude's system prompt
    const chatContext = {
      selectedAttomId: context?.selectedProperty || null,
      viewport: context?.bbox || null,
      // Pass classified intent and extracted params so system prompt can include them
      intent: classification.intent,
      params: classification.params,
    };

    // Inject classified parameters into the user message as structured context
    // This ensures Claude uses the correct codes regardless of its own interpretation
    if (classification.intent !== 'GENERAL' && lastUserMsg) {
      const hints = [];

      if (classification.params.assetCodes && classification.params.assetCodes.length > 0) {
        hints.push(`Property type codes to use: [${classification.params.assetCodes.join(',')}] (${classification.params.assetLabel || classification.params.assetClass})`);
      }
      if (classification.params.zipCodes && classification.params.zipCodes.length > 0) {
        hints.push(`ZIP codes: ${classification.params.zipCodes.join(', ')}`);
      }
      if (classification.params.maxPrice) {
        hints.push(`Max price: $${classification.params.maxPrice.toLocaleString()}`);
      }
      if (classification.params.minPrice) {
        hints.push(`Min price: $${classification.params.minPrice.toLocaleString()}`);
      }
      if (classification.params.minBuildingSf) {
        hints.push(`Min building SF: ${classification.params.minBuildingSf.toLocaleString()}`);
      }
      if (classification.params.minLotAcres) {
        hints.push(`Min lot acres: ${classification.params.minLotAcres}`);
      }
      if (classification.params.unitsNote) {
        hints.push(classification.params.unitsNote);
      }
      if (classification.params.absenteeOwner) hints.push('Filter: absentee owners');
      if (classification.params.corporateOwned) hints.push('Filter: corporate owned');
      if (classification.params.taxDelinquent) hints.push('Filter: tax delinquent');
      if (classification.params.foreclosure) hints.push('Filter: foreclosure');
      if (classification.params.propertyClass) hints.push(`Target property class: ${classification.params.propertyClass}`);

      if (context?.bbox) {
        hints.push(`Map viewport bbox: ${context.bbox}`);
      }
      if (context?.selectedProperty) {
        hints.push(`Selected property attomId: ${context.selectedProperty}`);
      }

      if (hints.length > 0) {
        const hintBlock = `[ScoutGPT Classification: ${classification.intent} | ${hints.join(' | ')}]`;
        // Prepend hints to the user message
        if (typeof lastUserMsg.content === 'string') {
          lastUserMsg.content = `${hintBlock}\n\n${lastUserMsg.content}`;
        }
      }
    }

    const result = await claudeService.chat(messages, chatContext);
    res.json({ text: result.text, properties: result.properties, propertyMarkers: result.propertyMarkers });
  } catch (error) {
    console.error('Error in chat:', error);
    if (error.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }
    res.status(500).json({ error: 'Chat failed', details: error.message });
  }
});

module.exports = router;
