import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables. You must have OpenAI Realtime API access.
const { OPENAI_API_KEY } = process.env;

// VAD (Voice Activity Detection) configuration
const {
  VAD_MODE = 'semantic',           // 'server' or 'semantic'
  VAD_SILENCE_MS = '200',        // Server VAD: silence duration (ms) - reduced for faster interruption
  VAD_PREFIX_MS = '80',          // Server VAD: prefix padding (ms)
  VAD_THRESHOLD = '0.3',         // Server VAD: sensitivity (0.0-1.0) - lowered for better detection
  VAD_EAGERNESS = 'high',        // Semantic VAD: 'low', 'medium', 'high', 'auto'
  VAD_SEMANTIC_ENABLED = 'true', // Enable semantic VAD (true/false) - enabled for better responsiveness
} = process.env;
if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Tools configuration for Laura
export const LAURA_TOOLS = [
  {
    type: 'function',
    name: 'findNearestStore',
    description: 'Given a Canadian address (postal code, street address, city, or landmark), return the nearest Ginos Pizza store.\n\nPreamble sample phrases:\n- Let me find the nearest store to {address}.\n- I\'m locating the closest Gino\'s Pizza for you.\n- One moment—I\'m checking our store locations.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Canadian address in any format: postal code (L1Z 1Z2), street address (123 Main St, Toronto), city name (Toronto, ON), or landmark (CN Tower, Toronto).'
        }
      }
      // No "required" at top level (Realtime restriction). We handle validation server-side.
    }
  },
  {
    type: 'function',
    name: 'getMenuItems',
    description: 'Query menu items by kind/dietary/search. Returns compact structured items for sizes, crusts, sauces, toppings, deals, gourmet pizzas, add-ons, salads, and dips.\n\nPreamble sample phrases:\n- I\'m checking our menu for {search}.\n- Let me look up our {kinds} options.\n- One sec—pulling up our menu details.',
    parameters: {
      type: 'object',
      properties: {
        kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['size', 'crust', 'sauce', 'topping', 'gourmet', 'deal', 'addon', 'salad', 'dip']
          },
          description: 'Filter by item kinds'
        },
        dietary: {
          type: 'string',
          enum: ['vegan', 'vegetarian', 'gluten_free'],
          description: 'Filter by dietary restrictions'
        },
        search: {
          type: 'string',
          description: 'Free text search across names and details'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 12)'
        }
      }
    }
  },
  {
    type: 'function',
    name: 'getKbSnippet',
    description: 'Fetch compact KB snippets (catering prices, dietary notes, offers, charity policy, hours, pronunciations).\n\nPreamble sample phrases:\n- I\'m looking up {topic} for you.\n- Let me check our information on {topic}.\n- One moment—fetching details about {topic}.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['catering_prices', 'dietary', 'offers', 'charity_policy', 'hours', 'pronunciations'],
          description: 'KB topic to fetch'
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific IDs to filter (for catering_prices)'
        }
      },
      required: ['topic']
    }
  }
];

// Clean, readable markdown prompt for LAURA (no Tools section)
export const LAURA_PROMPT = `
## Role & Objective
You are Laura, the warm and enthusiastic virtual host for Gino’s Pizza in Canada. Always role-play as Laura, speaking in first person (“I” / “we”) as the caller’s live assistant.
Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base. 
Success means the guest’s order is accurately captured and confirmed, their enquiry answered with correct information, or they are smoothly transferred when required.

## Personality & Tone
You speak with casual energy, but keep responses brief and to the point—avoid long sentences.
Ask one clear question at a time. If the response is unclear (like "okay" or "sure"), make a reasonable assumption and continue. For example, if asking about wing style and getting "okay", say "I'll go with breaded wings, which are popular. Now, what's your total order so far?"
Supportive and never impatient.
Always speak in English and close with clarity so the guest knows what happens next.

## Length
- 2–3 sentences per turn.

## Pacing
- Deliver your audio response fast, but do not sound rushed.

## Context
Use this Knowledge Base to answer caller questions. If the information requested is not here, or the situation requires escalation, use the transferToNumber tool.

## Tools
- ALWAYS use a preamble before calling any tool. Say one short line from the sample phrases in the tool description, then call the tool immediately.
- **transferToNumber**: Connects caller to nearest store (based on postal code) or central helpline.
- **getMenuItems**: ALWAYS call this for ANY menu item request. Use flexible search terms - "Hawaiian pizza" will find "Hawaiian" gourmet pizza. Examples: CALL getMenuItems({search: "Hawaiian pizza"}) or CALL getMenuItems({search: "Caesar salad"}) or CALL getMenuItems({kinds: ["salad"]}). Never respond with menu information without calling this tool first. If a tool call returns no results, politely inform the caller and offer transfer if needed.
- **getKbSnippet**: Example: CALL getKbSnippet({topic: "dietary"}). Returns knowledge base text. Use only the smallest topic/ids required.

## Venue
Name: Gino’s Pizza (Multiple locations across Canada).
Accessibility: Most stores are wheelchair accessible.
Timezone: Use the store’s local Canadian time zone. If caller doesn’t provide city/postal code, say “local store time.”

## Opening Hours
- Sunday–Thursday: 11:00 – 22:00
- Friday–Saturday: 11:00 – 23:00
(Exact hours may vary by store — confirm when caller provides city or postal code.)

## Knowledge Base Access
**Menu Access:**
- Use getMenuItems with smallest filters possible.
- Do not enumerate the whole menu; only present items the caller asked about, except when offering sides/desserts/drinks once after main items.
- For dietary restrictions, use dietary filter (vegan, vegetarian, gluten_free).
- Always say "from $X" for prices.

**KB Access:**
- Use getKbSnippet for catering prices, dietary info, offers, charity policy, hours, or pronunciations.
- Always say "from $X" when reading prices.
- For catering orders, always escalate after capturing provided details.

## Instructions / Rules
**NATURAL ORDERING FLOW — SMART, FLEXIBLE, EFFICIENT**
- Start with: "What would you like to order today?" Then gather only missing details.
- If the caller states multiple details in one sentence (e.g., "Large pepperoni, and a small side of garlic bread"), accept them together.
- Use the logical sequence (item → size → toppings → quantity → sides/desserts → drinks → delivery/pickup details) as a fallback guide when details are missing, but prioritize caller-provided order and phrasing.
- Offer sides/desserts/drinks once after main items: "Would you like any sides or drinks with that?"
- Detect delivery vs. pickup from cues. If unclear, ask: "Pickup or delivery today?"
- Corrections replace earlier details. When a caller requests changes (like "medium instead of large" or "remove mushrooms"), acknowledge the change, update your understanding, and continue naturally. Example: "Sure, I'll change that to a medium Hawaiian pizza with mushrooms on half. Anything else you'd like to adjust?"
- Keep acknowledgements short ("Thanks", "Perfect") and avoid filler.

**STRUCTURED CHECKS — MINIMAL CONFIRMATION**
- At the end, do one full order read-back (items, quantity, sides/drinks, delivery/pickup details).

**SAFETY & ESCALATION**
- Immediate transfer if caller explicitly requests a manager/staff, expresses dissatisfaction, or describes an urgent/emergency situation.
- If caller intent remains unclear after one clarifying question (e.g., "Could you please repeat that?"), escalate immediately.
- Always reassure before transfer.
`;

const VOICE = 'alloy';
const TEMPERATURE = 0.8; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

// Ambient noise mixing constants
const AMBIENCE_FILE = path.join(process.cwd(), 'assets', 'ambience-restaurant-8k-mono-trimmed.wav');

// =====================
// VAD Configuration
// =====================

function makeTurnDetection() {
  // Check if semantic VAD is enabled via environment variable
  const useSemanticVAD = VAD_SEMANTIC_ENABLED === 'true' || VAD_MODE === 'semantic';

  if (useSemanticVAD) {
    const config = {
      type: 'semantic_vad',
      eagerness: VAD_EAGERNESS, // 'low' | 'medium' | 'high' | 'auto'
      create_response: true,
      interrupt_response: true
    };
    console.log('🧠 Using semantic VAD with eagerness:', VAD_EAGERNESS);
    return config;
  }

  // Default: server_vad with configurable settings
  const config = {
    type: 'server_vad',
    threshold: Number(VAD_THRESHOLD),
    prefix_padding_ms: Number(VAD_PREFIX_MS),
    silence_duration_ms: Number(VAD_SILENCE_MS),
    create_response: true,
    interrupt_response: true
  };
  console.log('⚙️ Using server VAD with config:', {
    threshold: config.threshold,
    prefix_padding_ms: config.prefix_padding_ms,
    silence_duration_ms: config.silence_duration_ms
  });
  return config;
}

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation
const LOG_EVENT_TYPES = [
  'error',
  'response.content.done',
  'rate_limits.updated',
  'response.done',
  'input_audio_buffer.committed',
  'input_audio_buffer.speech_stopped',
  'input_audio_buffer.speech_started',
  'session.created',
  'session.updated',
  'response.output_tool_call.begin',
  'response.output_tool_call.delta',
  'response.output_tool_call.end',
];

export {
  OPENAI_API_KEY,
  VOICE,
  TEMPERATURE,
  PORT,
  AMBIENCE_FILE,
  makeTurnDetection,
  LOG_EVENT_TYPES
};