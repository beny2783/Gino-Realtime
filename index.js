// index.js
// Realtime voice + Twilio Conference with a BOT participant leg (or graceful fallback to speaking on the caller leg)

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

// ───────────────────────────────────────────────────────────────────────────────
// Env
// ───────────────────────────────────────────────────────────────────────────────
dotenv.config();

const {
  OPENAI_API_KEY,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PUBLIC_BASE_URL,
  PORT = 5050,
  VOICE = 'alloy',
  TEMPERATURE = 0.8,
  // Optional: dial a second "bot" participant into the conference
  // e.g. BOT_DESTINATION=client:bot   (Twilio Client identity that auto-answers)
  // or BOT_DESTINATION=sip:bot@your.sip.domain (auto-answers)
  // You must also set TWILIO_FROM_NUMBER (your Twilio number) for the outbound call.
  BOT_DESTINATION,
  TWILIO_FROM_NUMBER,
} = process.env;

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ───────────────────────────────────────────────────────────────────────────────
// VAD config
// ───────────────────────────────────────────────────────────────────────────────
const {
  VAD_MODE = 'semantic',
  VAD_SILENCE_MS = '200',
  VAD_PREFIX_MS = '80',
  VAD_THRESHOLD = '0.3',
  VAD_EAGERNESS = 'high',
  VAD_SEMANTIC_ENABLED = 'true',
} = process.env;

function makeTurnDetection() {
  const useSemantic = VAD_SEMANTIC_ENABLED === 'true' || VAD_MODE === 'semantic';
  if (useSemantic) {
    console.log('🧠 Using semantic VAD with eagerness:', VAD_EAGERNESS);
    return {
      type: 'semantic_vad',
      eagerness: VAD_EAGERNESS, // 'low' | 'medium' | 'high' | 'auto'
      create_response: true,
      interrupt_response: true,
    };
  }
  const cfg = {
    type: 'server_vad',
    threshold: Number(VAD_THRESHOLD),
    prefix_padding_ms: Number(VAD_PREFIX_MS),
    silence_duration_ms: Number(VAD_SILENCE_MS),
    create_response: true,
    interrupt_response: true,
  };
  console.log('⚙️ Using server VAD with config:', {
    threshold: cfg.threshold,
    prefix_padding_ms: cfg.prefix_padding_ms,
    silence_duration_ms: cfg.silence_duration_ms,
  });
  return cfg;
}

// ───────────────────────────────────────────────────────────────────────────────
// Constants / Prompt / Tools
// ───────────────────────────────────────────────────────────────────────────────
export const LAURA_TOOLS = [
  {
    type: 'function',
    name: 'findNearestStore',
    description:
      'Given a Canadian address (postal code, street address, city, or landmark), return the nearest Ginos Pizza store.',
    parameters: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description:
            'Canadian address in any format: postal code (L1Z 1Z2), street address (123 Main St, Toronto), city name (Toronto, ON), or landmark (CN Tower, Toronto).',
        },
      },
    },
  },
  {
    type: 'function',
    name: 'getMenuItems',
    description:
      'Query menu items by kind/dietary/search. Returns compact structured items for sizes, crusts, sauces, toppings, deals, gourmet pizzas, add-ons, salads, and dips.',
    parameters: {
      type: 'object',
      properties: {
        kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['size', 'crust', 'sauce', 'topping', 'gourmet', 'deal', 'addon', 'salad', 'dip'],
          },
          description: 'Filter by item kinds',
        },
        dietary: {
          type: 'string',
          enum: ['vegan', 'vegetarian', 'gluten_free'],
          description: 'Filter by dietary restrictions',
        },
        search: {
          type: 'string',
          description: 'Free text search across names and details',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 12)',
        },
      },
    },
  },
  {
    type: 'function',
    name: 'getKbSnippet',
    description:
      'Fetch compact KB snippets (catering prices, dietary notes, offers, charity policy, hours, pronunciations).',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: ['catering_prices', 'dietary', 'offers', 'charity_policy', 'hours', 'pronunciations'],
          description: 'KB topic to fetch',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific IDs to filter (for catering_prices)',
        },
      },
      required: ['topic'],
    },
  },
];

export const LAURA_PROMPT = `
## Role & Objective
You are Laura, the warm and enthusiastic virtual host for Gino’s Pizza in Canada. Always role-play as Laura, speaking in first person (“I” / “we”) as the caller’s live assistant.
Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base, and ensuring callers feel cared for.

## Personality & Tone
Warm, conversational, personable, and welcoming. Keep 2–3 short sentences per turn.

## Tools & Rules
- **getMenuItems**: ALWAYS call for any menu info.
- **getKbSnippet**: Use for dietary, hours, offers, etc.
- **findNearestStore**: When caller provides an address or postal, repeat back once and confirm. Then call this tool.
- Never invent info. Keep confirmations minimal. End with a clear next step.

## Hours (may vary by store)
- Sun–Thu: 11:00–22:00
- Fri–Sat: 11:00–23:00

## Address Capture — Be Flexible
- Postal codes, street addresses, cities, landmarks, or neighborhoods are all valid.
- After confirmation, immediately call findNearestStore({ address }).

`.trim();

// ───────────────────────────────────────────────────────────────────────────────
// Metrics
// ───────────────────────────────────────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const hOpenAITTFB = new client.Histogram({
  name: 'openai_ttfb_ms',
  help: 'Time from VAD speech_stopped → first audio delta',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const hE2EReply = new client.Histogram({
  name: 'e2e_reply_latency_ms',
  help: 'speech_stopped → first chunk sent to Twilio',
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
  help: 'Bytes received from Twilio (approx base64_len*0.75)',
});
const cBytesOut = new client.Counter({
  name: 'twilio_audio_bytes_out_total',
  help: 'Bytes sent to Twilio (approx base64_len*0.75)',
});
const hFeltLatency = new client.Histogram({
  name: 'felt_latency_ms',
  help: 'User-perceived latency: user stop speaking → audio buffered at Twilio edge',
  buckets: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});
const cVADCancellations = new client.Counter({
  name: 'vad_cancellations_total',
  help: 'Responses cancelled due to VAD turn detection',
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

// ───────────────────────────────────────────────────────────────────────────────
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Limits / State
const MAX_ACTIVE_CONFERENCES = 100;
const MAX_WS_CONNECTIONS = 50;
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 5;

const callRateLimit = new Map(); // ip -> {count, resetTime}
let activeWSConnections = 0;

const confState = new Map(); // ConferenceSid -> { participants, lastActivity, startTime, botDialed }

// Cleanups
setInterval(() => {
  const now = Date.now();
  // Clean stale rate limit entries
  for (const [ip, d] of callRateLimit.entries()) if (now > d.resetTime) callRateLimit.delete(ip);
  console.log(
    `📊 Resource Status: ${confState.size}/${MAX_ACTIVE_CONFERENCES} conferences, ${activeWSConnections}/${MAX_WS_CONNECTIONS} WS`
  );
}, 5 * 60 * 1000);

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function attachRttMeter(ws, observeFn, intervalMs = 5000) {
  let lastPingAt = null;
  const timer = setInterval(() => {
    lastPingAt = performance.now();
    try {
      ws.ping();
    } catch {}
  }, intervalMs);
  ws.on('pong', () => {
    if (lastPingAt) observeFn(performance.now() - lastPingAt);
  });
  ws.on('close', () => clearInterval(timer));
}

function makeLRU(max = 200) {
  const m = new Map();
  return {
    get(k) {
      if (!m.has(k)) return undefined;
      const v = m.get(k);
      m.delete(k);
      m.set(k, v);
      return v;
    },
    set(k, v) {
      if (m.has(k)) m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
    },
    has: (k) => m.has(k),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// Per-room routing: caller <-> OpenAI -> (bot || caller)
// ───────────────────────────────────────────────────────────────────────────────
/**
 * rooms: Map<roomName, {
 *   callerConn?: WebSocket, callerSid?: string,
 *   botConn?: WebSocket,    botSid?: string,
 *   openAiWs?: WebSocket,
 *   streamStartAt?: number,
 *   lastUserPacketTs?: number,
 *   firstAudioMark?: { name: string, sentAt: number } | null,
 *   currentTurn?: {speechStoppedAt:number, firstDeltaAt:number|null, firstDeltaSentAt:number|null, lastDeltaAt:number|null, userStopAt:number|null, turnId:number},
 *   turnCounter:number,
 *   menuCache, kbCache, geocodeCache
 * }>
 */
const rooms = new Map();

function getTarget(room) {
  const r = rooms.get(room) || {};
  if (r.botConn && r.botSid) return { conn: r.botConn, sid: r.botSid, label: 'bot' };
  if (r.callerConn && r.callerSid) return { conn: r.callerConn, sid: r.callerSid, label: 'caller' };
  return { conn: null, sid: null, label: 'none' };
}

// Twilio expects PCMU 8kHz @ 20ms frames (160 bytes) per media event.
function sendPcmuToTwilio(base64Audio, conn, sid) {
  if (!conn || !sid || !base64Audio) return;
  const raw = Buffer.from(base64Audio, 'base64');
  for (let i = 0; i < raw.length; i += 160) {
    const frame = raw.slice(i, i + 160).toString('base64');
    const media = { event: 'media', streamSid: sid, media: { payload: frame } };
    try {
      conn.send(JSON.stringify(media));
      cBytesOut.inc(Math.floor(frame.length * 0.75));
    } catch (e) {
      console.error('❌ Failed sending media frame:', e.message);
      break;
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────────────
fastify.get('/', async (_req, reply) => {
  reply.send({ ok: true, message: 'Twilio Realtime (Conference+Bot) server up' });
});

fastify.get('/metrics', async (_req, reply) => {
  reply.type(register.contentType).send(await register.metrics());
});

// TwiML for the BOT leg: starts a bidirectional stream and joins the same conference
fastify.get('/twiml/bot/:room', async (req, reply) => {
  const { room } = req.params;
  const host = req.headers.host;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream url="wss://${host}/media-stream?role=bot&room=${encodeURIComponent(room)}" track="both_tracks"/>
  </Start>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${room}</Conference>
  </Dial>
</Response>`;
  reply.type('text/xml').send(twiml);
});

// Incoming call -> stream caller inbound audio to server, then join conference
fastify.all('/incoming-call', async (request, reply) => {
  const callSid = request.body?.CallSid || `anon-${Date.now()}`;
  const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
  const room = `room-${callSid}`;

  // conf cap
  if (confState.size >= MAX_ACTIVE_CONFERENCES) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Sorry, we are at capacity. Please try again shortly.</Say><Hangup/></Response>`;
    return reply.type('text/xml').send(twiml);
  }

  // rate limit
  const now = Date.now();
  const slot = callRateLimit.get(ip) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  if (now > slot.resetTime) {
    slot.count = 0;
    slot.resetTime = now + RATE_LIMIT_WINDOW;
  }
  if (slot.count >= MAX_CALLS_PER_WINDOW) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Too many calls from your location. Please wait a moment and try again.</Say><Hangup/></Response>`;
    return reply.type('text/xml').send(twiml);
  }
  slot.count++;
  callRateLimit.set(ip, slot);

  const host = request.headers.host;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <!-- Caller leg: we only need inbound audio from the human -->
    <Stream url="wss://${host}/media-stream?role=caller&room=${encodeURIComponent(room)}" track="inbound_track"/>
  </Start>
  <Dial>
    <Conference
      statusCallback="${PUBLIC_BASE_URL}/conf/events"
      statusCallbackEvent="start join leave end"
      statusCallbackMethod="POST"
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      beep="false"
      maxParticipants="5">${room}</Conference>
  </Dial>
</Response>`;

  console.log('📞 [INCOMING_CALL] -> Conference TwiML', { callSid, room });
  reply.type('text/xml').send(twiml);
});

// Conference events: dial in a BOT leg once the first human joins
fastify.post('/conf/events', async (req, reply) => {
  const {
    ConferenceSid,
    StatusCallbackEvent,
    FriendlyName, // this is our room name
  } = req.body || {};

  const state = confState.get(ConferenceSid) || {
    participants: 0,
    botDialed: false,
    startTime: Date.now(),
    lastActivity: Date.now(),
  };
  state.lastActivity = Date.now();

  if (StatusCallbackEvent === 'participant-join') {
    state.participants = Math.max(0, (state.participants || 0) + 1);
    console.log(`[${ConferenceSid}] participant-join -> ${state.participants}`);
  }
  if (StatusCallbackEvent === 'participant-leave') {
    state.participants = Math.max(0, (state.participants || 1) - 1);
    console.log(`[${ConferenceSid}] participant-leave -> ${state.participants}`);
  }
  if (StatusCallbackEvent === 'conference-end') {
    console.log(`[${ConferenceSid}] conference-end (cleanup)`);
    confState.delete(ConferenceSid);
    reply.send('OK');
    return;
  }

  confState.set(ConferenceSid, state);

  // When first participant arrives, optionally dial a BOT leg (if configured)
  if (
    BOT_DESTINATION &&
    TWILIO_FROM_NUMBER &&
    !state.botDialed &&
    state.participants >= 1 &&
    typeof FriendlyName === 'string'
  ) {
    state.botDialed = true;
    confState.set(ConferenceSid, state);
    try {
      const url = `${PUBLIC_BASE_URL}/twiml/bot/${encodeURIComponent(FriendlyName)}`;
      console.log('🤖 Dialing BOT leg into conference', { to: BOT_DESTINATION, url });
      await twilio.calls.create({
        from: TWILIO_FROM_NUMBER,
        to: BOT_DESTINATION,
        url, // this TwiML starts the media stream and joins the same conference
      });
    } catch (e) {
      console.error('❌ Failed to dial BOT leg:', e.status, e.code, e.message);
    }
  }

  reply.send('OK');
});

// ───────────────────────────────────────────────────────────────────────────────
// WebSocket: Twilio Media Streams for caller/bot legs
// ───────────────────────────────────────────────────────────────────────────────
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

fastify.register(async (app) => {
  app.get('/media-stream', { websocket: true }, (conn, req) => {
    const url = new URL(`http://x${req.url}`); // quick parse trick
    const role = url.searchParams.get('role') || 'caller'; // 'caller' | 'bot'
    const room = url.searchParams.get('room') || `room-${Date.now()}`;

    console.log('🔌 WS connected', { role, room, ip: req.ip, ua: req.headers['user-agent'] });

    if (activeWSConnections >= MAX_WS_CONNECTIONS) {
      conn.close(1013, 'Server overloaded - too many connections');
      return;
    }
    activeWSConnections++;

    const r = rooms.get(room) || {
      turnCounter: 0,
      streamStartAt: null,
      lastUserPacketTs: 0,
      firstAudioMark: null,
      currentTurn: null,
      // per-room caches (LRU)
      menuCache: makeLRU(200),
      kbCache: makeLRU(200),
      geocodeCache: makeLRU(400),
    };
    if (role === 'caller') r.callerConn = conn;
    else r.botConn = conn;
    rooms.set(room, r);

    // OpenAI Realtime WS (create when caller leg starts)
    function ensureOpenAI(roomName) {
      const rr = rooms.get(roomName);
      if (rr.openAiWs) return rr.openAiWs;

      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${TEMPERATURE}`,
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );
      rr.openAiWs = ws;
      rooms.set(roomName, rr);
      attachRttMeter(ws, (rtt) => hWSRttOpenAI.observe(rtt));

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
                transcription: { model: 'whisper-1' },
                turn_detection: makeTurnDetection(),
              },
              output: { format: { type: 'audio/pcmu' }, voice: VOICE },
            },
            tools: LAURA_TOOLS,
            tool_choice: 'auto',
            instructions: LAURA_PROMPT,
          },
        };
        ws.send(JSON.stringify(sessionUpdate));
      };

      ws.on('open', () => {
        setTimeout(sendSessionUpdate, 200);
      });

      // Tool handling (centralized)
      async function handleToolCall(name, args, replyFn) {
        const rr2 = rooms.get(roomName);
        const { menuCache, kbCache, geocodeCache } = rr2;

        const cachedFindMenuItems = (filters) => {
          const key = JSON.stringify(filters || {});
          const hit = menuCache.get(key);
          if (hit) return hit;
          const res = findMenuItems(filters);
          menuCache.set(key, res);
          return res;
        };
        const cachedGetKbSnippet = (a) => {
          const key = JSON.stringify(a || {});
          const hit = kbCache.get(key);
          if (hit) return hit;
          const res = getKbSnippet(a);
          kbCache.set(key, res);
          return res;
        };

        if (name === 'findNearestStore') {
          let { lat, lon, address } = args || {};
          if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
            const key = address.toLowerCase().trim();
            const cached = geocodeCache.get(key);
            const geo = cached || (await geocodeAddress(address));
            geocodeCache.set(key, geo);
            lat = geo.lat;
            lon = geo.lon;
          }
          if (typeof lat !== 'number' || typeof lon !== 'number') {
            return replyFn({ ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' });
          }
          const { store, distanceKm } = nearestStore(lat, lon);
          return replyFn({
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
              hours: store.hours,
            },
          });
        }

        if (name === 'getMenuItems') {
          const items = cachedFindMenuItems(args || {});
          return replyFn({ ok: true, items });
        }

        if (name === 'getKbSnippet') {
          const data = cachedGetKbSnippet(args || {});
          return replyFn({ ok: true, data });
        }

        return replyFn({ ok: false, reason: 'UnknownTool' });
      }

      const pendingToolCalls = new Map();

      ws.on('message', async (buf) => {
        const rr3 = rooms.get(roomName);
        if (!rr3) return;
        const now = performance.now();
        try {
          const msg = JSON.parse(buf);

          if (LOG_EVENT_TYPES.includes(msg.type)) {
            if (msg.type === 'session.updated') {
              // Trigger first greeting
              setTimeout(() => ws.send(JSON.stringify({ type: 'response.create' })), 100);
            }
          }

          if (msg.type === 'response.output_tool_call.begin') {
            pendingToolCalls.set(msg.id, { name: msg.name, argsStr: '' });
            return;
          }
          if (msg.type === 'response.output_tool_call.delta') {
            const e = pendingToolCalls.get(msg.id);
            if (e) e.argsStr += msg.delta || '';
            return;
          }
          if (msg.type === 'response.output_tool_call.end') {
            const e = pendingToolCalls.get(msg.id);
            pendingToolCalls.delete(msg.id);
            if (!e) return;
            let args = {};
            try {
              if (e.argsStr) args = JSON.parse(e.argsStr);
            } catch {}
            try {
              await handleToolCall(e.name, args, (out) => {
                ws.send(
                  JSON.stringify({
                    type: 'tool.output',
                    tool_output: { tool_call_id: msg.id, output: JSON.stringify(out) },
                  })
                );
                ws.send(JSON.stringify({ type: 'response.create' }));
              });
            } catch (err) {
              console.error('Tool error:', err);
              ws.send(
                JSON.stringify({
                  type: 'tool.output',
                  tool_output: { tool_call_id: msg.id, output: JSON.stringify({ ok: false, reason: 'ServerError' }) },
                })
              );
            }
            return;
          }

          // VAD markers
          if (msg.type === 'input_audio_buffer.speech_started') {
            // barge-in: clear any buffered audio on the target leg (bot if present)
            const tgt = getTarget(roomName);
            if (tgt.conn && tgt.sid) {
              try {
                tgt.conn.send(JSON.stringify({ event: 'clear', streamSid: tgt.sid }));
              } catch {}
            }
            return;
          }

          if (msg.type === 'input_audio_buffer.speech_stopped') {
            rr3.currentTurn = {
              speechStoppedAt: now,
              firstDeltaAt: null,
              firstDeltaSentAt: null,
              lastDeltaAt: null,
              userStopAt:
                rr3.streamStartAt != null && rr3.lastUserPacketTs != null
                  ? rr3.streamStartAt + rr3.lastUserPacketTs
                  : null,
              turnId: ++rr3.turnCounter,
            };
            rooms.set(roomName, rr3);
            return;
          }

          // Audio out to Twilio (prefer bot leg)
          if (msg.type === 'response.output_audio.delta' && msg.delta) {
            const tgt = getTarget(roomName);
            if (!rr3.currentTurn?.firstDeltaAt) {
              rr3.currentTurn && (rr3.currentTurn.firstDeltaAt = now);
              rr3.currentTurn &&
                hOpenAITTFB.observe(rr3.currentTurn.firstDeltaAt - rr3.currentTurn.speechStoppedAt);
            }
            rr3.currentTurn && (rr3.currentTurn.lastDeltaAt = now);
            // chunked send
            sendPcmuToTwilio(msg.delta, tgt.conn, tgt.sid);

            // mark once when first chunk flushed
            if (rr3.currentTurn && !rr3.currentTurn.firstDeltaSentAt) {
              rr3.currentTurn.firstDeltaSentAt = performance.now();
              hE2EReply.observe(rr3.currentTurn.firstDeltaSentAt - rr3.currentTurn.speechStoppedAt);
              const name = `first-audio-${Date.now()}`;
              rr3.firstAudioMark = { name, sentAt: performance.now() };
              try {
                tgt.conn?.send(JSON.stringify({ event: 'mark', streamSid: tgt.sid, mark: { name } }));
              } catch {}
            }
            rooms.set(roomName, rr3);
            return;
          }

          if (msg.type === 'response.done') {
            if (rr3.currentTurn?.firstDeltaAt && rr3.currentTurn?.lastDeltaAt) {
              hRespStream.observe(rr3.currentTurn.lastDeltaAt - rr3.currentTurn.firstDeltaAt);
            }
            if (msg?.response?.status === 'cancelled') cVADCancellations.inc();
            rr3.currentTurn = null;
            rooms.set(roomName, rr3);
            return;
          }
        } catch (e) {
          console.error('Error processing OpenAI msg:', e);
        }
      });

      ws.on('close', () => {
        const rr4 = rooms.get(roomName);
        if (rr4) rr4.openAiWs = null;
      });

      return ws;
    }

    // Twilio → Server messages per leg
    conn.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        const rr = rooms.get(room) || {};
        switch (data.event) {
          case 'start': {
            const sid = data.start.streamSid;
            rr.streamStartAt ??= performance.now();
            rr.lastUserPacketTs = 0;
            if (role === 'caller') rr.callerSid = sid;
            else rr.botSid = sid;
            rooms.set(room, rr);
            attachRttMeter(conn, (rtt) => hWSRttTwilio.observe(rtt));
            // Only when caller leg starts do we ensure the OpenAI WS
            if (role === 'caller') ensureOpenAI(room);
            break;
          }
          case 'media': {
            if (role === 'caller' && rr.openAiWs?.readyState === WebSocket.OPEN) {
              const b64 = data.media?.payload || '';
              cBytesIn.inc(Math.floor(b64.length * 0.75));
              const ts = Number(data.media?.timestamp);
              if (!Number.isNaN(ts)) rr.lastUserPacketTs = ts;
              rr.openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
              rooms.set(room, rr);
            }
            break;
          }
          case 'mark': {
            const rr2 = rooms.get(room);
            if (rr2?.firstAudioMark && data.mark?.name === rr2.firstAudioMark.name) {
              const markEchoAt = performance.now();
              const t = rr2.currentTurn;
              const felt =
                (t?.userStopAt != null ? markEchoAt - t.userStopAt : markEchoAt - (t?.speechStoppedAt ?? markEchoAt)) ||
                0;
              hFeltLatency.observe(felt);
            }
            break;
          }
          case 'stop': {
            // Twilio stopped the stream
            break;
          }
          default: {
            // ignore
          }
        }
      } catch (e) {
        console.error('WS parse error:', e.message);
      }
    });

    conn.on('close', () => {
      activeWSConnections--;
      const rr = rooms.get(room) || {};
      if (role === 'caller') {
        rr.callerConn = null;
        rr.callerSid = null;
        // Close OpenAI if both legs gone
        if (rr.openAiWs?.readyState === WebSocket.OPEN) rr.openAiWs.close();
        rr.openAiWs = null;
      } else {
        rr.botConn = null;
        rr.botSid = null;
      }
      rooms.set(room, rr);
      // If both legs closed, drop room
      if (!rr.callerConn && !rr.botConn) rooms.delete(room);
    });

    conn.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// Start server
// ───────────────────────────────────────────────────────────────────────────────
fastify.listen({ port: Number(PORT), host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`✅ Server listening on :${PORT}`);
});
