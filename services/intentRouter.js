const { INTENT_ROUTER_PROMPT } = require('../knowledge/prompts/intent-router');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const VALID_INTENTS = ['property_search', 'property_detail', 'market_analysis', 'general_chat', 'clarification_needed'];

/**
 * Calls Haiku to classify the user's intent.
 * Returns: { intent, confidence, needs_clarification, clarification_question, reasoning }
 */
async function classifyIntent(userMessage, context = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[INTENT_ROUTER] No API key — defaulting to property_search');
    return defaultIntent();
  }

  // Build context string for the classifier
  let input = userMessage;
  if (context.selectedProperty) {
    input += `\n[Context: User has property ${context.selectedProperty} selected on the map]`;
  }
  if (context.bbox) {
    input += `\n[Context: User is viewing map area ${context.bbox}]`;
  }

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 256,
        system: INTENT_ROUTER_PROMPT,
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[INTENT_ROUTER] API error ${response.status}: ${errText}`);
      return defaultIntent();
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Parse JSON from response — handle potential markdown wrapping
    const jsonStr = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Validate intent is one of our known types
    if (!VALID_INTENTS.includes(parsed.intent)) {
      console.warn(`[INTENT_ROUTER] Unknown intent "${parsed.intent}" — defaulting to property_search`);
      return defaultIntent();
    }

    return {
      intent: parsed.intent,
      confidence: parsed.confidence || 0.5,
      needs_clarification: parsed.needs_clarification || false,
      clarification_question: parsed.clarification_question || null,
      reasoning: parsed.reasoning || '',
    };
  } catch (err) {
    console.error(`[INTENT_ROUTER] Failed: ${err.message}`);
    return defaultIntent();
  }
}

/**
 * Calls Haiku to generate a response for general_chat intent (no DB, no Sonnet).
 * Returns: { text }
 */
async function generateGeneralChatResponse(userMessage, context = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { text: "I'm having trouble connecting right now. Please try again." };
  }

  const systemPrompt = `You are ScoutGPT, a commercial real estate intelligence assistant built by Syndnet Corp. You help users find and analyze commercial properties using ATTOM property data.

You can:
- Search for properties by type, location, financial characteristics, ownership, distress signals, and 90+ other filters
- Look up detailed property information (owner, tax, loan, valuation, climate risk)
- Analyze market trends and statistics
- Explain CRE concepts and terminology

You cover Travis County, TX with 444,000+ properties. Keep responses concise and helpful. If the user seems to want property data, suggest they try a specific search query.`;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      return { text: "I'm having trouble right now. Please try again in a moment." };
    }

    const data = await response.json();
    return { text: data.content?.[0]?.text || "I'm not sure how to respond to that. Try asking me to search for properties!" };
  } catch (err) {
    console.error(`[INTENT_ROUTER] General chat failed: ${err.message}`);
    return { text: "I'm having trouble right now. Please try again in a moment." };
  }
}

function defaultIntent() {
  return {
    intent: 'property_search',
    confidence: 0.3,
    needs_clarification: false,
    clarification_question: null,
    reasoning: 'Fallback — could not classify intent.',
  };
}

module.exports = { classifyIntent, generateGeneralChatResponse };
