import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import { performance } from 'perf_hooks';
import client from 'prom-client';
import fs from 'fs';
import path from 'path';
import { nearestStore } from './nearestStore.js';
import { geocodeAddress } from './geocode.js';
import { findMenuItems } from './menu.js';
import { getKbSnippet } from './kb.js';


// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables. You must have OpenAI Realtime API access.
const { OPENAI_API_KEY } = process.env;

// VAD (Voice Activity Detection) configuration
const {
  VAD_MODE = 'semantic',           // 'server' or 'semantic'
  VAD_SILENCE_MS = '500',        // Server VAD: silence duration (ms)
  VAD_PREFIX_MS = '80',          // Server VAD: prefix padding (ms)
  VAD_THRESHOLD = '0.5',         // Server VAD: sensitivity (0.0-1.0)
  VAD_EAGERNESS = 'high',        // Semantic VAD: 'low', 'medium', 'high', 'auto'
  VAD_SEMANTIC_ENABLED = 'false', // Enable semantic VAD (true/false)
} = process.env;
if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env file.');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// =====================
// Constants
// =====================

// Clean, readable markdown prompt for LAURA (no Tools section)
const LAURA_PROMPT = `
Role & Objective
You are Laura, the warm and enthusiastic virtual host for Gino’s Pizza in Canada. Always role-play as Laura, speaking in first person (“I” / “we”) as the caller’s live assistant.
Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base, and ensuring callers feel cared for. Success means the guest’s order is captured clearly, they get accurate information, or they are smoothly transferred to a human when required.

Personality & Tone
Warm, conversational, personable, and welcoming.
Adapt to caller style: if caller gives short answers, simplify and move quickly; if caller gives detailed preferences, mirror their detail level.
Friendly but efficient — one question at a time.
Supportive and never impatient — politely re-ask missing details once.
Always speak in English and close with clarity so the guest knows what happens next.

Context
Use this Knowledge Base to answer caller questions. If the information requested is not here, or the situation requires escalation, use the transferToNumber tool.

Tools

transferToNumber: Connects caller to nearest store (based on postal code) or central helpline.

getMenuItems: Example: CALL getMenuItems({kind: "toppings"}). Returns available menu items. Do not invent details.

getKbSnippet: Example: CALL getKbSnippet({topic: "dietary"}). Returns knowledge base text. Use only the smallest topic/ids required.

Venue
Name: Gino’s Pizza (Multiple locations across Canada).
Disclaimer: Menu items vary by location. Prices do not include tax and may change.
Accessibility: Most stores are wheelchair accessible.
Timezone: Caller’s local Canadian time. If no city/postal code is provided, confirm time by saying “local store time.”

Opening Hours

Sunday–Thursday: 11:00 – 22:00

Friday–Saturday: 11:00 – 23:00
(Exact hours may vary by store — confirm when caller provides city or postal code.)

Knowledge Base Access
Menu Access:

Use getMenuItems with smallest filters possible.

Do not enumerate the whole menu; only present items the caller asked about.

For dietary restrictions, use dietary filter (vegan, vegetarian, gluten_free).

Always say “from $X” for prices.

KB Access:

Use getKbSnippet for catering prices, dietary info, offers, charity policy, hours, or pronunciations.

Always say “from $X” when reading prices.

For catering orders, always escalate after capturing provided details.

Instructions / Rules

NATURAL ORDERING FLOW — SMART, FLEXIBLE, EFFICIENT

Start with: “What would you like to order today?” Then gather only missing details.

If the caller states multiple details in one sentence (e.g., “Large pepperoni, well-done”), accept them together.

Use the logical sequence (item → size → toppings → quantity → sides/desserts → drinks → delivery/pickup details) as a fallback guide when details are missing, but prioritize caller-provided order and phrasing.

Offer sides/desserts/drinks once after main items: “Would you like any sides or drinks with that?”

Detect delivery vs. pickup from cues. If unclear, ask: “Pickup or delivery today?”

Corrections overwrite previous details without fuss.

Keep acknowledgements short (“Thanks”, “Perfect”) and avoid filler.

STRUCTURED CHECKS — MINIMAL CONFIRMATION

At the end, do one full order read-back (items, quantity, sides/drinks, delivery/pickup details).

DATA CAPTURE (when relevant to the order)

Do not validate format, but ensure both phone and email are provided.

PACE & CLARITY

Answer promptly and keep pace efficient.

Confirm absolute times in caller’s local timezone when city/postal code is provided. Otherwise say “local store time.”

Mention calorie counts only if asked.

Never invent information. If asked about unlisted items, explain politely and offer transfer.

Stay within Gino’s Pizza context only.

SAFETY & ESCALATION

Immediate transfer if caller is upset, urgent, or asks for manager/staff.

If caller intent remains unclear after one clarifying question (e.g., “Could you please repeat that?”), escalate immediately.

Escalate if caller asks about catering, vouchers, gift cards, lost property, corporate/private hire, charity/raffle exceptions, or anything outside standard orders/menu.

For catering orders, capture details but always escalate for final confirmation.

Always reassure before transfer.

CONVERSATION FLOW

Entry: Greet warmly — “Hello, this is Laura at Gino’s Pizza. How can I help today?”

Detect intent: order vs. general enquiry.

Ordering Path: Collect details naturally. For catering/large event → capture details, then transfer.

Finish: One full read-back

Knowledge Base Path: Answer directly using KB. If caller asks about catering, vouchers, or topics not in KB → transfer.

Exit:
• If order: confirm details, reassure next steps.
• If enquiry: close with “Thank you for calling Gino’s Pizza, have a great day!”
• If transfer: short reassurance + handoff.
`;

const VOICE = 'alloy';
const TEMPERATURE = 0.8; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

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

// =====================
// Prometheus metrics setup
// =====================
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const hOpenAITTFB = new client.Histogram({
  name: 'openai_ttfb_ms',
  help: 'Time from OpenAI server VAD speech_stopped → first audio delta',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const hE2EReply = new client.Histogram({
  name: 'e2e_reply_latency_ms',
  help: 'speech_stopped → first audio chunk sent back to Twilio',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const hRespStream = new client.Histogram({
  name: 'response_stream_duration_ms',
  help: 'first audio delta → response.done',
  buckets: [100, 300, 600, 1000, 2000, 4000, 8000],
});
const hWSRttOpenAI = new client.Histogram({
  name: 'ws_rtt_openai_ms',
  help: 'WebSocket RTT to OpenAI',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});
const hWSRttTwilio = new client.Histogram({
  name: 'ws_rtt_twilio_ms',
  help: 'WebSocket RTT to Twilio',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});
const cBytesIn = new client.Counter({
  name: 'twilio_audio_bytes_in_total',
  help: 'Bytes received from Twilio (decoded ~ base64_len*0.75)',
});
const cBytesOut = new client.Counter({
  name: 'twilio_audio_bytes_out_total',
  help: 'Bytes sent to Twilio (decoded ~ base64_len*0.75)',
});

// Felt (user-perceived) latency: user stops speaking → Twilio has audio buffered to play
const hFeltLatency = new client.Histogram({
  name: 'felt_latency_ms',
  help: 'User perceived latency: user stop speaking → audio buffered at Twilio edge',
  buckets: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});

// VAD cancellation tracking
const cVADCancellations = new client.Counter({
  name: 'vad_cancellations_total',
  help: 'Number of responses cancelled due to VAD turn detection',
});

register.registerMetric(hOpenAITTFB);
register.registerMetric(hE2EReply);
register.registerMetric(hRespStream);
register.registerMetric(hWSRttOpenAI);
register.registerMetric(hWSRttTwilio);
register.registerMetric(cBytesIn);
register.registerMetric(cBytesOut);
register.registerMetric(hFeltLatency);
register.registerMetric(cVADCancellations);

// =====================
// Routes
// =====================
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Prometheus metrics endpoint
fastify.get('/metrics', async (req, reply) => {
  reply.type(register.contentType).send(await register.metrics());
});

// Route for Twilio to handle incoming and outgoing calls
// Direct connection to Laura agent - no pre-recorded greeting
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Connect>
</Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// =====================
// Helpers
// =====================
function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function attachRttMeter(ws, observeFn, intervalMs = 5000) {
  let lastPingAt = null;
  const timer = setInterval(() => {
    lastPingAt = performance.now();
    try { ws.ping(); } catch {}
  }, intervalMs);

  ws.on('pong', () => {
    if (lastPingAt) observeFn(performance.now() - lastPingAt);
  });
  ws.on('close', () => clearInterval(timer));
}

// =====================
// WebSocket route for media-stream
// =====================
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected');

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      }
    );

    let streamSid = null;
    let currentTurn = null; // { speechStoppedAt, firstDeltaAt, firstDeltaSentAt, lastDeltaAt, userStopAt, turnId }
    let turnCounter = 0;
    let firstAudioMark = null; // { name, sentAt }
    let currentTurnDeltaCount = 0;
    const pendingToolCalls = new Map(); // tool_call_id -> { name, argsStr }
    
    // Call logging system
    const callLogs = [];
    const callStartTime = new Date().toISOString();
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    function logCallEvent(type, data, message = '') {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type,
        data: data || {},
        message
      };
      callLogs.push(logEntry);
      console.log(`[${type}] ${message}`, data || '');
    }
    
    async function saveCallLogs() {
      try {
        const callEndTime = new Date().toISOString();
        const logData = {
          callId,
          callStartTime,
          callEndTime,
          streamSid,
          totalTurns: turnCounter,
          totalLogs: callLogs.length,
          logs: callLogs
        };
        
        const logsDir = path.join(process.cwd(), 'logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        
        const filename = `${callId}.json`;
        const filepath = path.join(logsDir, filename);
        
        await fs.promises.writeFile(filepath, JSON.stringify(logData, null, 2));
        console.log(`📝 Call logs saved to: ${filepath}`);
      } catch (error) {
        console.error('❌ Failed to save call logs:', error);
      }
    }
    
    // Per-call caching for performance
    const menuCache = new Map(); // key -> JSON string
    const kbCache = new Map(); // key -> JSON string
    const geocodeCache = new Map(); // address -> { lat, lon }
    
    function cachedFindMenuItems(filters) {
      const key = JSON.stringify(filters || {});
      if (menuCache.has(key)) return menuCache.get(key);
      const res = findMenuItems(filters);
      menuCache.set(key, res);
      return res;
    }
    
    function cachedGetKbSnippet(args) {
      const key = JSON.stringify(args || {});
      if (kbCache.has(key)) return kbCache.get(key);
      const res = getKbSnippet(args);
      kbCache.set(key, res);
      return res;
    }
    
    function cachedGeocode(address) {
      const normalized = address.toLowerCase().trim();
      if (geocodeCache.has(normalized)) return geocodeCache.get(normalized);
      return null; // Will be set after geocoding
    }
    
    function setGeocodeCache(address, result) {
      const normalized = address.toLowerCase().trim();
      geocodeCache.set(normalized, result);
    }

    // Align Twilio's stream-relative timestamps to server wall clock
    let streamStartAt = null; // performance.now() at 'start' event
    let lastUserPacketTs = 0; // Twilio media.timestamp (ms since stream start)

    const sendSessionUpdate = () => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          type: 'realtime',
          model: 'gpt-realtime',
          output_modalities: ['audio'],
          audio: {
            input: {
              format: { type: 'audio/pcmu' },
              turn_detection: makeTurnDetection(),
            },
            output: { format: { type: 'audio/pcmu' }, voice: VOICE },
          },
          tools: [
            {
              type: 'function',
              name: 'findNearestStore',
              description: 'Given a Canadian address (postal code, street address, city, or landmark), return the nearest Ginos Pizza store.',
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
              description: 'Query menu items by kind/dietary/search. Returns compact structured items for sizes, crusts, sauces, toppings, deals, gourmet pizzas, add-ons, salads, and dips.',
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
              description: 'Fetch compact KB snippets (catering prices, dietary notes, offers, charity policy, hours, pronunciations).',
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
          ],
          tool_choice: 'auto',
          instructions: (
            LAURA_PROMPT +
            `
    
    ADDRESS CAPTURE — BE FLEXIBLE:
    - Listen for ANY Canadian address format: postal codes, street addresses, city names, landmarks, or neighborhoods.
    - When you hear an address, REPEAT IT BACK ONCE and ask for confirmation: "I heard <ADDRESS>. Is that right?"
    - If the caller confirms, IMMEDIATELY call findNearestStore with { "address": "<ADDRESS>" }.
    - If the caller corrects you, use their correction and call the tool.
    - Examples of valid addresses:
      • Postal codes: "L1Z 1Z2", "M5V 3A8", "K1A 0A6"
      • Street addresses: "123 Main Street, Toronto", "456 Queen St, Ottawa, ON"
      • City names: "Toronto", "Ottawa, Ontario", "Vancouver, BC"
      • Landmarks: "CN Tower", "Parliament Hill", "Stanley Park"
      • Neighborhoods: "Downtown Toronto", "Old Montreal"
    - If the address is unclear, ask for clarification once, then proceed with the best address heard.
    
    AFTER TOOL RETURNS:
    - Use the returned store details immediately in your spoken response and continue the flow. Keep things moving.`
          ).trim(),
        },
      };
      console.log('Sending session update:', JSON.stringify(sessionUpdate));
      openAiWs.send(JSON.stringify(sessionUpdate));
    };

    // Open event for OpenAI WebSocket
    openAiWs.on('open', () => {
      logCallEvent('OPENAI_CONNECTED', { callId }, 'Connected to the OpenAI Realtime API');
      attachRttMeter(openAiWs, (rtt) => hWSRttOpenAI.observe(rtt));
      setTimeout(sendSessionUpdate, 250); // Ensure connection stability
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', async (data) => {
      const now = performance.now();
      try {
        const response = JSON.parse(data);
        // Tool call started - send immediate acknowledgment
        if (response.type === 'response.output_tool_call.begin') {
          logCallEvent('TOOL_CALL_BEGIN', { id: response.id, name: response.name }, 'Tool call begin');
          const { id, name } = response;
          pendingToolCalls.set(id, { name, argsStr: '' });
          
          // Send immediate acknowledgment based on tool type
          let acknowledgment = '';
          if (name === 'getMenuItems') {
            acknowledgment = 'Let me check our menu for you.';
          } else if (name === 'getKbSnippet') {
            acknowledgment = 'Let me look that up for you.';
          } else if (name === 'findNearestStore') {
            acknowledgment = 'Let me find the nearest store for you.';
          } else {
            acknowledgment = 'Let me check that for you.';
          }
          
          // Send immediate response
          const immediateResponse = {
            type: 'response.create',
            response: {
              modalities: ['audio'],
              instructions: `Say exactly this: "${acknowledgment}" Keep it brief and natural.`
            }
          };
          logCallEvent('TOOL_ACK_SENT', { toolName: name, acknowledgment }, 'Sent immediate acknowledgment');
          openAiWs.send(JSON.stringify(immediateResponse));
          return;
        }

        // Tool call args streaming
        if (response.type === 'response.output_tool_call.delta') {
          const { id, delta } = response;
          const entry = pendingToolCalls.get(id);
          if (entry) entry.argsStr += delta;
          // For visibility, log small deltas only
          if (delta && delta.length <= 120) {
            console.log('Tool call delta:', { id, delta });
          }
          return;
        }

        // Tool call finished → execute + return result
        if (response.type === 'response.output_tool_call.end') {
          const { id } = response;
          const entry = pendingToolCalls.get(id);
          if (!entry) return;

          try {
            logCallEvent('TOOL_CALL_ARGS', { id, argsStr: entry.argsStr }, 'Tool call args raw');
            const args = entry.argsStr ? JSON.parse(entry.argsStr) : {};
            logCallEvent('TOOL_CALL_END', { id, name: entry.name, args }, 'Tool call end');
            if (entry.name === 'findNearestStore') {
              let { lat, lon, address } = args;

              // Check cache first
              if (address) {
                const cached = cachedGeocode(address);
                if (cached) {
                  lat = cached.lat; lon = cached.lon;
                } else {
                  const geo = await geocodeAddress(address);
                  lat = geo.lat; lon = geo.lon;
                  setGeocodeCache(address, geo);
                }
              }

              if (typeof lat !== 'number' || typeof lon !== 'number') {
                const out = { ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' };
                console.log('Sending tool.output (error):', out);
                openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
                
                // Trigger Laura to respond with the error message
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
              } else {
                const { store, distanceKm } = nearestStore(lat, lon);
                const out = {
                  ok: true,
                  distanceKm,
                  store: {
                    id: store.id,
                    brand: store.brand,
                    address: `${store.address}, ${store.city}, ${store.province}, ${store.country} ${store.postal}`,
                    city: store.city,
                    province: store.province,
                    postal: store.postal,
                    url: store.url,
                    lat: store.lat,
                    lon: store.lon,
                    hours: store.hours
                  }
                };
                console.log('Sending tool.output (success):', { id, outSummary: { ok: out.ok, distanceKm: out.distanceKm, storeId: out.store.id } });
                openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
                
                // Trigger Laura to respond with the store information
                openAiWs.send(JSON.stringify({ type: 'response.create' }));
              }
            } else if (entry.name === 'getMenuItems') {
              let args = {};
              try { args = entry.argsStr ? JSON.parse(entry.argsStr) : {}; } catch {}
              const items = cachedFindMenuItems(args);
              const out = { ok: true, items }; // keep it small
              logCallEvent('TOOL_OUTPUT_MENU', { id, itemCount: items.length, filters: args }, 'Sending tool.output (menu)');
              
              // Send tool output and trigger follow-up response
              openAiWs.send(JSON.stringify({
                type: 'tool.output',
                tool_output: { tool_call_id: id, output: JSON.stringify(out) }
              }));
              
              // Trigger Laura to respond with the menu data
              openAiWs.send(JSON.stringify({ type: 'response.create' }));
            } else if (entry.name === 'getKbSnippet') {
              let args = {};
              try { args = entry.argsStr ? JSON.parse(entry.argsStr) : {}; } catch {}
              const data = cachedGetKbSnippet(args);
              const out = { ok: true, data }; // keep it small
              logCallEvent('TOOL_OUTPUT_KB', { id, topic: args.topic, dataType: typeof data }, 'Sending tool.output (kb)');
              
              // Send tool output and trigger follow-up response
              openAiWs.send(JSON.stringify({
                type: 'tool.output',
                tool_output: { tool_call_id: id, output: JSON.stringify(out) }
              }));
              
              // Trigger Laura to respond with the KB data
              openAiWs.send(JSON.stringify({ type: 'response.create' }));
            } else {
              const out = { ok:false, reason:'UnknownTool' };
              console.log('Sending tool.output (unknown tool):', out);
              openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
            }
          } catch (e) {
            console.error('Tool call failed:', e);
            openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify({ ok:false, reason:'ServerError' }) }}));
          } finally {
            pendingToolCalls.delete(id);
          }
          return;
        }

        if (LOG_EVENT_TYPES.includes(response.type)) {
          logCallEvent('OPENAI_EVENT', { type: response.type, data: response }, `Received event: ${response.type}`);
        }
        if (response.type === 'session.updated') {
          logCallEvent('SESSION_UPDATED', { sessionId: response.session?.id }, 'Session updated successfully');
        }

        // Track VAD stop as turn boundary (and compute user stop wall-clock if we can)
        if (response.type === 'input_audio_buffer.speech_stopped') {
          currentTurn = {
            speechStoppedAt: now,
            firstDeltaAt: null,
            firstDeltaSentAt: null,
            lastDeltaAt: null,
            userStopAt: null,
            turnId: ++turnCounter,
          };
          if (streamStartAt !== null && lastUserPacketTs !== null) {
            currentTurn.userStopAt = streamStartAt + lastUserPacketTs; // align Twilio stream time → wall clock
          }
          currentTurnDeltaCount = 0;
          logCallEvent('SPEECH_STOPPED', { turnId: currentTurn.turnId, speechStoppedAt: now }, 'User speech stopped');
        }

        if (response.type === 'response.output_audio.delta' && response.delta) {
          // First audio delta from OpenAI → TTFB
          if (currentTurn && !currentTurn.firstDeltaAt) {
            currentTurn.firstDeltaAt = now;
            hOpenAITTFB.observe(currentTurn.firstDeltaAt - currentTurn.speechStoppedAt);
            logCallEvent('FIRST_AUDIO_DELTA', { turnId: currentTurn.turnId, ttfb: currentTurn.firstDeltaAt - currentTurn.speechStoppedAt }, 'First audio delta received');
          }
          currentTurn && (currentTurn.lastDeltaAt = now);
          currentTurnDeltaCount++;

          // Forward to Twilio (response.delta is already base64)
          const audioDelta = {
            event: 'media',
            streamSid: streamSid,
            media: { payload: response.delta },
          };
          connection.send(JSON.stringify(audioDelta));

          // Count bytes out (approx)
          cBytesOut.inc(Math.floor(response.delta.length * 0.75));

          // First chunk sent back → observe e2e; also send a Twilio 'mark' to time playback-at-edge
          if (currentTurn && !currentTurn.firstDeltaSentAt) {
            currentTurn.firstDeltaSentAt = performance.now();
            hE2EReply.observe(currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt);

            const name = `first-audio-${Date.now()}`;
            firstAudioMark = { name, sentAt: performance.now() };
            connection.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
          }
        }

        if (response.type === 'response.done') {
          // Check for function_call outputs in response.done (alternative pattern)
          try {
            const outputs = response?.response?.output || [];
            for (const item of outputs) {
              if (item?.type === 'function_call') {
                console.log('Function call via response.done:', { name: item.name, call_id: item.call_id, arguments: item.arguments });
                try {
                  let args = {};
                  if (typeof item.arguments === 'string' && item.arguments.trim()) {
                    args = JSON.parse(item.arguments);
                  }
                  if (item.name === 'findNearestStore') {
                    let { lat, lon, address } = args;
                    if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
                      const geo = await geocodeAddress(address);
                      lat = geo.lat; lon = geo.lon;
                    }
                    let output;
                    if (typeof lat !== 'number' || typeof lon !== 'number') {
                      output = { ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' };
                    } else {
                      const { store, distanceKm } = nearestStore(lat, lon);
                      output = { ok: true, distanceKm, store };
                    }
                    // Send function_call_output
                    const convoItem = {
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: item.call_id,
                        output: JSON.stringify(output),
                      },
                    };
                    openAiWs.send(JSON.stringify(convoItem));
                    // Trigger model to respond using the tool result
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                  } else if (item.name === 'getMenuItems') {
                    let args = {};
                    try { args = typeof item.arguments === 'string' && item.arguments.trim() ? JSON.parse(item.arguments) : {}; } catch {}
                    const items = cachedFindMenuItems(args);
                    const output = { ok: true, items };
                    console.log('Function call via response.done (menu):', { name: item.name, call_id: item.call_id, itemCount: items.length });
                    // Send function_call_output
                    const convoItem = {
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: item.call_id,
                        output: JSON.stringify(output),
                      },
                    };
                    openAiWs.send(JSON.stringify(convoItem));
                    // Trigger model to respond using the tool result
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                  } else if (item.name === 'getKbSnippet') {
                    let args = {};
                    try { args = typeof item.arguments === 'string' && item.arguments.trim() ? JSON.parse(item.arguments) : {}; } catch {}
                    const data = cachedGetKbSnippet(args);
                    const output = { ok: true, data };
                    console.log('Function call via response.done (kb):', { name: item.name, call_id: item.call_id, topic: args.topic });
                    // Send function_call_output
                    const convoItem = {
                      type: 'conversation.item.create',
                      item: {
                        type: 'function_call_output',
                        call_id: item.call_id,
                        output: JSON.stringify(output),
                      },
                    };
                    openAiWs.send(JSON.stringify(convoItem));
                    // Trigger model to respond using the tool result
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                  }
                } catch (e) {
                  console.error('Error handling function_call via response.done:', e);
                }
              }
            }
          } catch {}
          if (currentTurn?.firstDeltaAt && currentTurn?.lastDeltaAt) {
            hRespStream.observe(currentTurn.lastDeltaAt - currentTurn.firstDeltaAt);
          }
          if (response?.response?.status) {
            console.log('Response done status:', response.response.status, 'deltaCount=', currentTurnDeltaCount);
            // Track VAD cancellations
            if (response.response.status === 'cancelled') {
              cVADCancellations.inc();
              console.log('VAD cancellation detected - response was cancelled due to turn detection');
            }
          }
          currentTurn = null;
        }
      } catch (error) {
        console.error('Error processing OpenAI message:', error, 'Raw message:', data);
      }
    });

    // Handle incoming messages from Twilio
    connection.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        switch (data.event) {
          case 'media':
            if (openAiWs.readyState === WebSocket.OPEN) {
              const b64 = data.media?.payload || '';
              // Count bytes in (approx)
              cBytesIn.inc(Math.floor(b64.length * 0.75));

              // Track Twilio's notion of elapsed time since stream start (ms)
              const ts = Number(data.media?.timestamp);
              if (!Number.isNaN(ts)) {
                lastUserPacketTs = ts;
              }

              const audioAppend = {
                type: 'input_audio_buffer.append',
                audio: b64,
              };
              openAiWs.send(JSON.stringify(audioAppend));
            }
            break;

          case 'start':
            streamSid = data.start.streamSid;
            streamStartAt = performance.now();
            lastUserPacketTs = 0;
            logCallEvent('STREAM_STARTED', { streamSid }, 'Incoming stream has started');
            attachRttMeter(connection, (rtt) => hWSRttTwilio.observe(rtt));
            break;

          case 'mark':
            // Twilio echoes our mark when audio is buffered/played at its edge
            if (firstAudioMark && data.mark?.name === firstAudioMark.name) {
              const markEchoAt = performance.now();

              let felt = null;
              if (currentTurn?.userStopAt) {
                felt = markEchoAt - currentTurn.userStopAt;
                hFeltLatency.observe(felt);
              } else if (currentTurn?.speechStoppedAt) {
                const fallback = markEchoAt - currentTurn.speechStoppedAt;
                felt = fallback;
                hFeltLatency.observe(fallback);
              }

              // Compute TTFB and E2E if available
              const ttfb = (currentTurn?.firstDeltaAt && currentTurn?.speechStoppedAt)
                ? currentTurn.firstDeltaAt - currentTurn.speechStoppedAt
                : null;
              const e2e = (currentTurn?.firstDeltaSentAt && currentTurn?.speechStoppedAt)
                ? currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt
                : null;

              const summary = {
                turn: currentTurn?.turnId ?? null,
                streamSid,
                felt_latency_ms: felt !== null ? Math.round(felt) : null,
                ttfb_ms: ttfb !== null ? Math.round(ttfb) : null,
                e2e_first_byte_ms: e2e !== null ? Math.round(e2e) : null,
              };
              logCallEvent('TURN_SUMMARY', summary, 'TURN SUMMARY');

              firstAudioMark = null;
            }
            break;

          default:
            logCallEvent('TWILIO_EVENT', { event: data.event, data }, 'Received non-media event');
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message);
      }
    });

    // Handle connection close
    connection.on('close', async () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      logCallEvent('CONNECTION_CLOSED', { callId, totalTurns: turnCounter }, 'Client disconnected');
      await saveCallLogs();
    });

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      logCallEvent('OPENAI_DISCONNECTED', { callId }, 'Disconnected from the OpenAI Realtime API');
    });
    openAiWs.on('error', (error) => {
      logCallEvent('OPENAI_ERROR', { error: error.message, callId }, 'Error in the OpenAI WebSocket');
    });
  });
});

// =====================
// Start server
// =====================
fastify.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${PORT}`);
});