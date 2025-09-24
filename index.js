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


// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables. You must have OpenAI Realtime API access.
const { OPENAI_API_KEY } = process.env;
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
You are Laura, the warm and enthusiastic virtual host for Gino’s Pizza in Canada.
Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base, and ensuring callers feel cared for.
Success means the guest’s order is captured clearly, they get accurate information, or they are smoothly transferred to a human when required.

Personality & Tone
Warm, conversational, personable, and welcoming.
Adapt to caller style: if caller gives short answers, simplify and move quickly; if caller gives detailed preferences, mirror their detail level.
Friendly but efficient — one question at a time.
Supportive and never impatient — politely re-ask missing details once.
Always speak in english and close with clarity so the guest knows what happens next.

Context
Use this Knowledge Base to answer caller questions. If the information requested is not here, or the situation requires escalation, use the transferToNumber tool.

Venue
Name: Gino’s Pizza (Multiple locations across Canada).
Disclaimer: Menu items vary by location. Prices do not include tax and may change.
Accessibility: Most stores are wheelchair accessible.
Timezone: Confirm caller’s city or postal code, then use that to reference their correct local Canadian time.

Instructions / Rules

Always follow step-by-step ordering flow: item → size → toppings → quantity → sides/desserts → drinks → delivery/pickup details → phone number and email. Do not validate format, but ensure both are provided.

Confirm absolute times in the caller’s local timezone based on city/postal code.

Repeat back contact details and order exactly as provided.

Give guide prices exactly as listed, using “from $X” wording where shown (prices may vary by location).

Mention calorie counts only if caller asks.

Never invent information not in Knowledge Base. If asked about unlisted items, explain politely and offer transfer.

Stay within Gino’s Pizza context only.

Be polite and calm, even if caller is testing or difficult.

Safety & Escalation

Immediate transfer if caller is upset, urgent, unclear (intent cannot be determined after one clarification), or asks for manager/staff.

Escalate if caller asks about: catering, vouchers, gift cards, lost property, corporate/private hire, charity/raffle exceptions, or anything outside standard orders/menu.

For catering orders, capture any details provided (e.g., date, size, quantity) but always escalate for final confirmation.

transferToNumber connects to the caller’s nearest store based on their postal code; if unavailable, connect to central helpline.

Always reassure before transfer.

Conversation Flow

Entry: Greet warmly — “Hello, this is Laura at Gino’s Pizza. How can I help today?”

Detect intent: order vs. general enquiry.

Ordering Path: Collect order details step by step. If catering/large event → capture details, then transfer.

Finish: Full read-back of order; reassure — “Thank you, I’ve noted your order. Our team will finalize and prepare it within the store’s regular preparation window.”

Knowledge Base Path: Answer directly about store locations, hours, menu, dietary options, offers. Provide guide prices if asked. If caller asks about catering, vouchers, or topics not in KB → transfer.

Exit:

If order: confirm details, reassure next steps.

If enquiry: polite closure.

If transfer: short reassurance + handoff.
`;

const VOICE = 'alloy';
const TEMPERATURE = 0.8; // Controls the randomness of the AI's responses
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

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

register.registerMetric(hOpenAITTFB);
register.registerMetric(hE2EReply);
register.registerMetric(hRespStream);
register.registerMetric(hWSRttOpenAI);
register.registerMetric(hWSRttTwilio);
register.registerMetric(cBytesIn);
register.registerMetric(cBytesOut);
register.registerMetric(hFeltLatency);

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
// <Say> punctuation to improve text-to-speech translation
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Google.en-GB-Standard-A">Hello, you are through to Laura at Gino’s Pizza. How can I help today?</Say>
  <Pause length="1"/>
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
            input: { format: { type: 'audio/pcmu' }, turn_detection: { type: 'server_vad' } },
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
      console.log('Connected to the OpenAI Realtime API');
      attachRttMeter(openAiWs, (rtt) => hWSRttOpenAI.observe(rtt));
      setTimeout(sendSessionUpdate, 250); // Ensure connection stability
    });

    // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
    openAiWs.on('message', async (data) => {
      const now = performance.now();
      try {
        const response = JSON.parse(data);
        // Tool call started
        if (response.type === 'response.output_tool_call.begin') {
          console.log('Tool call begin:', { id: response.id, name: response.name });
          const { id, name } = response;
          pendingToolCalls.set(id, { name, argsStr: '' });
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
            console.log('Tool call args raw:', entry.argsStr);
            const args = entry.argsStr ? JSON.parse(entry.argsStr) : {};
            console.log('Tool call end:', { id, name: entry.name, args });
            if (entry.name === 'findNearestStore') {
              let { lat, lon, postal } = args;

              // If only postal is present, geocode it
              if ((typeof lat !== 'number' || typeof lon !== 'number') && postal) {
                const geo = await geocodePostal(postal);
                lat = geo.lat; lon = geo.lon;
              }

              if (typeof lat !== 'number' || typeof lon !== 'number') {
                const out = { ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' };
                console.log('Sending tool.output (error):', out);
                openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
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
              }
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
          console.log(`Received event: ${response.type}`, response);
        }
        if (response.type === 'session.updated') {
          console.log('Session updated successfully:', response);
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
        }

        if (response.type === 'response.output_audio.delta' && response.delta) {
          // First audio delta from OpenAI → TTFB
          if (currentTurn && !currentTurn.firstDeltaAt) {
            currentTurn.firstDeltaAt = now;
            hOpenAITTFB.observe(currentTurn.firstDeltaAt - currentTurn.speechStoppedAt);
            console.log('First audio delta received for turn', currentTurn?.turnId);
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
            console.log('Incoming stream has started', streamSid);
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
              console.log('TURN SUMMARY:', pretty(summary));

              firstAudioMark = null;
            }
            break;

          default:
            console.log('Received non-media event:', data.event);
            break;
        }
      } catch (error) {
        console.error('Error parsing message:', error, 'Message:', message);
      }
    });

    // Handle connection close
    connection.on('close', () => {
      if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
      console.log('Client disconnected.');
    });

    // Handle WebSocket close and errors
    openAiWs.on('close', () => {
      console.log('Disconnected from the OpenAI Realtime API');
    });
    openAiWs.on('error', (error) => {
      console.error('Error in the OpenAI WebSocket:', error);
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