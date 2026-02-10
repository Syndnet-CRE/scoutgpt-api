const express = require('express');
const router = express.Router();
const claudeService = require('../services/claudeService');

router.post('/', async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    if (context) {
      const contextNote = [];
      if (context.bbox) contextNote.push(`User viewing map area: ${context.bbox}`);
      if (context.selectedProperty) contextNote.push(`Selected property ATTOM ID: ${context.selectedProperty}`);
      if (contextNote.length > 0) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
          lastUserMsg.content = `[Map context: ${contextNote.join('. ')}]\n\n${lastUserMsg.content}`;
        }
      }
    }

    const result = await claudeService.chat(messages);
    res.json({ text: result.text, properties: result.properties });
  } catch (error) {
    console.error('Error in chat:', error);
    if (error.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'Claude API not configured' });
    }
    res.status(500).json({ error: 'Chat failed', details: error.message });
  }
});

module.exports = router;
