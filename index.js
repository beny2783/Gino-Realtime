import Fastify from 'fastify';
import WebSocket from 'ws';
import dotenv from 'dotenv';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import { performance } from 'perf_hooks';
import client from 'prom-client';
import fs from 'fs';
import path from 'path';
import Twilio from 'twilio';
import { nearestStore } from './nearestStore.js';
import { geocodeAddress } from './geocode.js';
import { findMenuItems } from './menu.js';
import { getKbSnippet } from './kb.js';


// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables. You must have OpenAI Realtime API access.
const { 
  OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PUBLIC_BASE_URL,
  MP3_ASSET_URL
} = process.env;

// Initialize Twilio client
const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

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

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Conference state management
const confState = new Map(); // ConferenceSid -> { participants, announced, lastActivity, startTime }

// Safeguard configuration
const MAX_CALL_DURATION = 30 * 60 * 1000; // 30 minutes max call duration
const MAX_ACTIVE_CONFERENCES = 100; // Maximum concurrent conferences
const MAX_WS_CONNECTIONS = 50; // Maximum WebSocket connections
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute rate limit window
const MAX_CALLS_PER_WINDOW = 5; // Max calls per IP per window

// Rate limiting storage
const callRateLimit = new Map(); // IP -> { count, resetTime }

// WebSocket connection tracking
let activeWSConnections = 0;

// Cleanup old conference states every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes
  
  // Cleanup stale conference states
  for (const [conferenceSid, state] of confState.entries()) {
    if (state.lastActivity && (now - state.lastActivity) > maxAge) {
      console.log(`[${conferenceSid}] Cleaning up stale conference state`);
      confState.delete(conferenceSid);
    }
  }
  
  // Cleanup expired rate limit entries
  for (const [ip, data] of callRateLimit.entries()) {
    if (now > data.resetTime) {
      callRateLimit.delete(ip);
    }
  }
  
  // Log current resource usage
  console.log(`📊 Resource Status: ${confState.size}/${MAX_ACTIVE_CONFERENCES} conferences, ${activeWSConnections}/${MAX_WS_CONNECTIONS} WebSocket connections`);
}, 5 * 60 * 1000); // Run every 5 minutes

// =====================
// Constants
// =====================

// Tools configuration for Laura
export const LAURA_TOOLS = [
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
];

// Clean, readable markdown prompt for LAURA (no Tools section)
export const LAURA_PROMPT = `
## Role & Objective
You are Laura, the warm and enthusiastic virtual host for Gino’s Pizza in Canada. Always role-play as Laura, speaking in first person (“I” / “we”) as the caller’s live assistant.  
Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base, and ensuring callers feel cared for. Success means the guest’s order is accurately captured and confirmed, their enquiry answered with correct information, or they are smoothly transferred when required.  

## Personality & Tone
Warm, conversational, personable, and welcoming.  
Adapt to caller style: if caller gives short answers, simplify and move quickly; if caller gives detailed preferences, mirror their detail level.  
Friendly but efficient — ask one clear question at a time. If the response is unclear (like "okay" or "sure"), make a reasonable assumption and continue. For example, if asking about wing style and getting "okay", say "I'll go with breaded wings, which are popular. Now, what's your total order so far?"  
Supportive and never impatient.  
Always speak in English and close with clarity so the guest knows what happens next.  

## Length
- 2–3 sentences per turn.  

## Pacing
- Deliver your audio response fast, but do not sound rushed.  

## Context
Use this Knowledge Base to answer caller questions. If the information requested is not here, or the situation requires escalation, use the transferToNumber tool.  

## Tools
- **transferToNumber**: Connects caller to nearest store (based on postal code) or central helpline.  
- **getMenuItems**: ALWAYS call this for ANY menu item request. Use flexible search terms - "Hawaiian pizza" will find "Hawaiian" gourmet pizza. Examples: CALL getMenuItems({search: "Hawaiian pizza"}) or CALL getMenuItems({search: "Caesar salad"}) or CALL getMenuItems({kinds: ["salad"]}). Never respond with menu information without calling this tool first. If a tool call returns no results, politely inform the caller and offer transfer if needed.  
- **getKbSnippet**: Example: CALL getKbSnippet({topic: "dietary"}). Returns knowledge base text. Use only the smallest topic/ids required.  

## Venue
Name: Gino’s Pizza (Multiple locations across Canada).  
Disclaimer: Menu items vary by location. Prices do not include tax and may change.  
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
- Always say “from $X” for prices.  

**KB Access:**  
- Use getKbSnippet for catering prices, dietary info, offers, charity policy, hours, or pronunciations.  
- Always say “from $X” when reading prices.  
- For catering orders, always escalate after capturing provided details.  

## Instructions / Rules
**NATURAL ORDERING FLOW — SMART, FLEXIBLE, EFFICIENT**  
- Start with: “What would you like to order today?” Then gather only missing details.  
- If the caller states multiple details in one sentence (e.g., “Large pepperoni, well-done”), accept them together.  
- Use the logical sequence (item → size → toppings → quantity → sides/desserts → drinks → delivery/pickup details) as a fallback guide when details are missing, but prioritize caller-provided order and phrasing.  
- Offer sides/desserts/drinks once after main items: “Would you like any sides or drinks with that?”  
- Detect delivery vs. pickup from cues. If unclear, ask: “Pickup or delivery today?”  
- Corrections replace earlier details. When a caller requests changes (like "medium instead of large" or "remove mushrooms"), acknowledge the change, update your understanding, and continue naturally. Example: "Sure, I'll change that to a medium Hawaiian pizza with mushrooms on half. Anything else you'd like to adjust?"  
- Keep acknowledgements short (“Thanks”, “Perfect”) and avoid filler.  

**STRUCTURED CHECKS — MINIMAL CONFIRMATION**  
- At the end, do one full order read-back (items, quantity, sides/drinks, delivery/pickup details).  

**DATA CAPTURE (when relevant to the order)**  
- Do not validate format, but ensure a phone number is provided.  

**PACE & CLARITY**  
- Answer promptly and keep pace efficient.  
- Confirm absolute times in caller’s local timezone when city/postal code is provided. Otherwise say “local store time.”  
- Mention calorie counts only if asked.  
- Never invent information. If asked about unlisted items, explain politely and offer transfer.  
- Stay within Gino’s Pizza context only.  

**SAFETY & ESCALATION**  
- Immediate transfer if caller explicitly requests a manager/staff, expresses dissatisfaction, or describes an urgent/emergency situation.  
- If caller intent remains unclear after one clarifying question (e.g., “Could you please repeat that?”), escalate immediately.  
- Escalate if caller asks about catering, vouchers, gift cards, lost property, corporate/private hire, charity/raffle exceptions, or anything outside standard orders/menu.  
- For catering orders, capture details but always escalate for final confirmation.  
- Always reassure before transfer.  

## CONVERSATION FLOW
- Entry: Greet warmly — “Hello, this is Laura at Gino’s Pizza. How can I help today?”  
- Detect intent: order vs. general enquiry.  
- Ordering Path: Collect details naturally. For catering/large event → capture details, then transfer.  
- Finish: One full read-back  
- Knowledge Base Path: Answer directly using KB. If caller asks about catering, vouchers, or topics not in KB → transfer.  
- Exit:  
  - If order: confirm details, reassure next steps.  
  - If enquiry: close with “Thank you for calling Gino’s Pizza, have a great day!”  
  - If transfer: short reassurance + handoff.  
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

// TwiML that loops your MP3 forever
fastify.get('/twiml/background', async (req, reply) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="infinite">${MP3_ASSET_URL}</Play>
</Response>`;
  reply.type('text/xml').send(twiml);
});

// Route for Twilio to handle incoming and outgoing calls
// Conference-based approach with background audio
fastify.all('/incoming-call', async (request, reply) => {
  const callSid = request.body?.CallSid || `anon-${Date.now()}`;
  const clientIP = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  const room = `room-${callSid}`;
  
  // 1. Conference Count Limit Check
  if (confState.size >= MAX_ACTIVE_CONFERENCES) {
    console.log(`🚫 Conference limit reached: ${confState.size}/${MAX_ACTIVE_CONFERENCES}`);
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, our system is currently at capacity. Please try again in a few minutes.</Say>
  <Hangup/>
</Response>`;
    return reply.type('text/xml').send(errorTwiml);
  }
  
  // 2. Rate Limiting Check
  const now = Date.now();
  const clientData = callRateLimit.get(clientIP) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
  }
  
  if (clientData.count >= MAX_CALLS_PER_WINDOW) {
    console.log(`🚫 Rate limit exceeded for IP ${clientIP}: ${clientData.count}/${MAX_CALLS_PER_WINDOW}`);
    const rateLimitTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Too many calls from your location. Please wait a moment before calling again.</Say>
  <Hangup/>
</Response>`;
    return reply.type('text/xml').send(rateLimitTwiml);
  }
  
  clientData.count++;
  callRateLimit.set(clientIP, clientData);
  
  console.log(`📞 New call from ${clientIP}: ${clientData.count}/${MAX_CALLS_PER_WINDOW} in current window`);

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- Keep your AI media-stream on the caller leg -->
  <Start>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Start>

  <!-- Put caller into a conference so we can inject background audio -->
  <Dial>
    <Conference
      statusCallback="${PUBLIC_BASE_URL}/conf/events"
      statusCallbackEvent="start join leave end"
      statusCallbackMethod="POST"
      endConferenceOnExit="true"
      waitUrl=""
      beep="false"
      maxParticipants="3">${room}</Conference>
  </Dial>
</Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// Conference events handler - manages conference state and injects background audio
fastify.post('/conf/events', async (req, reply) => {
  const { ConferenceSid, StatusCallbackEvent } = req.body || {};
  const state = confState.get(ConferenceSid) || { 
    participants: 0, 
    announced: false, 
    lastActivity: Date.now(),
    startTime: Date.now() // Track when conference started
  };

  // Update last activity timestamp
  state.lastActivity = Date.now();

  // 3. Call Duration Limit Check
  if (state.startTime && (Date.now() - state.startTime) > MAX_CALL_DURATION) {
    console.log(`⏰ Conference ${ConferenceSid} exceeded max duration (${MAX_CALL_DURATION/60000} minutes) - terminating`);
    try {
      await twilio.conferences(ConferenceSid).update({ status: 'completed' });
      confState.delete(ConferenceSid);
      reply.send('OK');
      return;
    } catch (e) {
      console.error('Failed to terminate long-running conference:', e);
    }
  }

  if (StatusCallbackEvent === 'participant-join') {
    state.participants += 1;
    console.log(`[${ConferenceSid}] Participant joined. Total: ${state.participants}`);
  }
  if (StatusCallbackEvent === 'participant-leave') {
    state.participants = Math.max(0, state.participants - 1);
    console.log(`[${ConferenceSid}] Participant left. Total: ${state.participants}`);
  }
  if (StatusCallbackEvent === 'conference-end') {
    console.log(`[${ConferenceSid}] Conference ended - cleaning up state`);
    confState.delete(ConferenceSid);
    reply.send('OK');
    return;
  }
  confState.set(ConferenceSid, state);

  // Start background as soon as the caller is in the room
  if (!state.announced && state.participants >= 1) {
    try {
      await twilio.conferences(ConferenceSid).update({
        announceUrl: `${PUBLIC_BASE_URL}/twiml/background`,
        announceMethod: 'GET'
      });
      state.announced = true;
      confState.set(ConferenceSid, state);
      console.log(`[${ConferenceSid}] Background noise started with ${state.participants} participants`);
    } catch (e) {
      console.error('announceUrl failed:', e);
    }
  }

  // Terminate conference if no participants remain (prevents hanging conferences)
  if (state.participants === 0) {
    try {
      console.log(`[${ConferenceSid}] No participants remaining - terminating conference`);
      await twilio.conferences(ConferenceSid).update({
        status: 'completed'
      });
      confState.delete(ConferenceSid);
    } catch (e) {
      console.error('Failed to terminate empty conference:', e);
    }
  }

  reply.send('OK');
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
    // 4. WebSocket Connection Limit Check
    if (activeWSConnections >= MAX_WS_CONNECTIONS) {
      console.log(`🚫 WebSocket connection limit reached: ${activeWSConnections}/${MAX_WS_CONNECTIONS}`);
      connection.close(1013, 'Server overloaded - too many connections');
      return;
    }
    
    activeWSConnections++;
    console.log(`🔌 Client connected (${activeWSConnections}/${MAX_WS_CONNECTIONS} connections)`);

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
    
    // LRU cache implementation to prevent memory leaks
    function makeLRU(max = 200) {
      const m = new Map();
      return {
        get(k) {
          if (!m.has(k)) return undefined;
          const v = m.get(k);
          m.delete(k); m.set(k, v);
          return v;
        },
        set(k, v) {
          if (m.has(k)) m.delete(k);
          m.set(k, v);
          if (m.size > max) m.delete(m.keys().next().value);
        },
        has: (k) => m.has(k)
      };
    }

// Per-call caching for performance with LRU limits
const menuCache = makeLRU(200);
const kbCache = makeLRU(200);
const geocodeCache = makeLRU(400);
    
    function cachedFindMenuItems(filters) {
      const key = JSON.stringify(filters || {});
      const hit = menuCache.get(key);
      if (hit) return hit;
      const res = findMenuItems(filters);
      menuCache.set(key, res);
      return res;
    }
    
    function cachedGetKbSnippet(args) {
      const key = JSON.stringify(args || {});
      const hit = kbCache.get(key);
      if (hit) return hit;
      const res = getKbSnippet(args);
      kbCache.set(key, res);
      return res;
    }

    // Centralized tool handling to eliminate code duplication
    async function handleToolCall(name, args, send) {
      if (name === 'findNearestStore') {
        let { lat, lon, address } = args || {};
        if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
          const cached = geocodeCache.get(address.toLowerCase().trim());
          const geo = cached || await geocodeAddress(address);
          geocodeCache.set(address.toLowerCase().trim(), geo);
          lat = geo.lat; lon = geo.lon;
        }
        if (typeof lat !== 'number' || typeof lon !== 'number') {
          return send({ ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' });
        }
        const { store, distanceKm } = nearestStore(lat, lon);
        return send({
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
        });
      }

      if (name === 'getMenuItems') {
        const items = cachedFindMenuItems(args || {});
        return send({ ok: true, items });
      }

      if (name === 'getKbSnippet') {
        const data = cachedGetKbSnippet(args || {});
        return send({ ok: true, data });
      }

      return send({ ok: false, reason: 'UnknownTool' });
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
                transcription: {
                  model: 'whisper-1'
                },
                turn_detection: makeTurnDetection(),
              },
              output: { format: { type: 'audio/pcmu' }, voice: VOICE },
            },
          tools: LAURA_TOOLS,
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
          
          // Acknowledgment system temporarily disabled to fix race condition
          // TODO: Re-enable with proper state management
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
            
            // Use centralized tool handling
            await handleToolCall(entry.name, args, (out) => {
              openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
              openAiWs.send(JSON.stringify({ type: 'response.create' }));
            });
          } catch (e) {
            console.error('Tool call failed:', e);
            openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify({ ok:false, reason:'ServerError' }) }}));
          } finally {
            pendingToolCalls.delete(id);
          }
          return;
        }

        // Log agent text messages
        if (response.type === 'conversation.item.created' && 
            response.item?.role === 'assistant' && 
            response.item?.type === 'message') {
          const textContent = response.item.content?.find(content => content.type === 'text');
          if (textContent) {
            logCallEvent('AGENT_MESSAGE', { 
              messageId: response.item.id,
              text: textContent.text 
            }, `Agent said: "${textContent.text}"`);
          }
        }

        // Log user speech transcriptions
        if (response.type === 'conversation.item.input_audio_transcription.completed') {
          logCallEvent('USER_TRANSCRIPTION', {
            eventId: response.event_id,
            itemId: response.item_id,
            contentIndex: response.content_index,
            transcript: response.transcript,
            usage: response.usage
          }, `User said: "${response.transcript}"`);
        }

        if (LOG_EVENT_TYPES.includes(response.type)) {
          logCallEvent('OPENAI_EVENT', { type: response.type, data: response }, `Received event: ${response.type}`);
        }
        if (response.type === 'session.updated') {
          logCallEvent('SESSION_UPDATED', { sessionId: response.session?.id }, 'Session updated successfully');
          // Trigger initial greeting from Laura
          setTimeout(() => {
            logCallEvent('INITIAL_GREETING_TRIGGER', {}, 'Triggering initial greeting from Laura');
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
          }, 100);
        }

        // Handle speech started - clear audio immediately when user starts speaking
        if (response.type === 'input_audio_buffer.speech_started') {
          console.log('User started speaking - clearing audio buffer');
          const clearMessage = {
            event: 'clear',
            streamSid: streamSid,
          };
          connection.send(JSON.stringify(clearMessage));
          console.log('Sent immediate clear message to Twilio');
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
                
                // Acknowledgment system temporarily disabled to fix race condition
                // TODO: Re-enable with proper state management
                
                try {
                  let args = {};
                  if (typeof item.arguments === 'string' && item.arguments.trim()) {
                    args = JSON.parse(item.arguments);
                  }
                  
                  // Use centralized tool handling
                  await handleToolCall(item.name, args, (out) => {
                    openAiWs.send(JSON.stringify({
                      type: 'conversation.item.create',
                      item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(out) }
                    }));
                    openAiWs.send(JSON.stringify({ type: 'response.create' }));
                  });
                } catch (e) {
                  console.error('Error handling function_call via response.done:', e);
                }
              }
            }
          } catch {}
          
          // Response processing complete
          
          if (currentTurn?.firstDeltaAt && currentTurn?.lastDeltaAt) {
            hRespStream.observe(currentTurn.lastDeltaAt - currentTurn.firstDeltaAt);
          }
          if (response?.response?.status) {
            console.log('Response done status:', response.response.status, 'deltaCount=', currentTurnDeltaCount);
            // Track VAD cancellations
            if (response.response.status === 'cancelled') {
              cVADCancellations.inc();
              console.log('VAD cancellation detected - response was cancelled due to turn detection');
              
              // Clear Twilio's audio buffer to stop playback immediately
              const clearMessage = {
                event: 'clear',
                streamSid: streamSid,
              };
              connection.send(JSON.stringify(clearMessage));
              console.log('Sent clear message to Twilio to stop audio playback');
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
      activeWSConnections--;
      console.log(`🔌 Client disconnected (${activeWSConnections}/${MAX_WS_CONNECTIONS} connections)`);
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
      // Ensure connection counter is decremented on error
      if (activeWSConnections > 0) {
        activeWSConnections--;
        console.log(`🔌 WebSocket error - connection closed (${activeWSConnections}/${MAX_WS_CONNECTIONS} connections)`);
      }
    });
    
    // Handle connection errors
    connection.on('error', (error) => {
      console.error('WebSocket connection error:', error);
      if (activeWSConnections > 0) {
        activeWSConnections--;
        console.log(`🔌 Connection error - connection closed (${activeWSConnections}/${MAX_WS_CONNECTIONS} connections)`);
      }
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