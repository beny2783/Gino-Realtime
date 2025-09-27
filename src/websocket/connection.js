/**
 * WebSocket connection handler for Twilio-OpenAI integration
 * Manages real-time audio streaming and message routing
 */

import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import { OPENAI_CONFIG, PERFORMANCE_CONFIG } from '../config/index.js';
import { 
  hOpenAITTFB, 
  hE2EReply, 
  hRespStream, 
  hWSRttOpenAI, 
  hWSRttTwilio, 
  cBytesIn, 
  cBytesOut, 
  hFeltLatency, 
  cVADCancellations 
} from '../metrics/index.js';
import { createCallLogger } from '../utils/logging.js';
import { handleToolCall } from '../tools/index.js';
import { createLauraConfig } from '../ai/laura.js';
import { makeTurnDetection } from '../vad/index.js';

/**
 * Creates and manages a WebSocket connection between Twilio and OpenAI
 * @param {Object} connection - Twilio WebSocket connection
 * @param {Object} req - Fastify request object
 */
export function createWebSocketConnection(connection, req) {
  console.log('Client connected');

  // Initialize OpenAI WebSocket connection
  const openAiWs = new WebSocket(
    `${OPENAI_CONFIG.realtimeUrl}?model=${OPENAI_CONFIG.model}&temperature=${OPENAI_CONFIG.temperature}`,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_CONFIG.apiKey}`,
      },
    }
  );

  // Connection state
  let streamSid = null;
  let currentTurn = null; // { speechStoppedAt, firstDeltaAt, firstDeltaSentAt, lastDeltaAt, userStopAt, turnId }
  let turnCounter = 0;
  let firstAudioMark = null; // { name, sentAt }
  let currentTurnDeltaCount = 0;
  const pendingToolCalls = new Map(); // tool_call_id -> { name, argsStr }
  
  // Call logging system
  const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logger = createCallLogger(callId);
  
  // Align Twilio's stream-relative timestamps to server wall clock
  let streamStartAt = null; // performance.now() at 'start' event
  let lastUserPacketTs = 0; // Twilio media.timestamp (ms since stream start)

  /**
   * Sends session update to OpenAI with Laura configuration
   */
  const sendSessionUpdate = () => {
    const sessionUpdate = {
      type: 'session.update',
      session: createLauraConfig(makeTurnDetection()),
    };
    console.log('Sending session update:', JSON.stringify(sessionUpdate));
    openAiWs.send(JSON.stringify(sessionUpdate));
  };

  /**
   * Attaches RTT (Round Trip Time) monitoring to a WebSocket
   * @param {WebSocket} ws - WebSocket to monitor
   * @param {Function} observeFn - Function to call with RTT measurements
   * @param {number} intervalMs - Ping interval in milliseconds
   */
  function attachRttMeter(ws, observeFn, intervalMs = PERFORMANCE_CONFIG.rttIntervalMs) {
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

  // OpenAI WebSocket event handlers
  openAiWs.on('open', () => {
    logger.logCallEvent('OPENAI_CONNECTED', { callId }, 'Connected to the OpenAI Realtime API');
    attachRttMeter(openAiWs, (rtt) => hWSRttOpenAI.observe(rtt));
    setTimeout(sendSessionUpdate, PERFORMANCE_CONFIG.sessionUpdateDelayMs);
  });

  openAiWs.on('message', async (data) => {
    const now = performance.now();
    try {
      const response = JSON.parse(data);
      
      // Handle tool call events
      if (response.type === 'response.output_tool_call.begin') {
        logger.logCallEvent('TOOL_CALL_BEGIN', { id: response.id, name: response.name }, 'Tool call begin');
        const { id, name } = response;
        pendingToolCalls.set(id, { name, argsStr: '' });
        return;
      }

      if (response.type === 'response.output_tool_call.delta') {
        const { id, delta } = response;
        const entry = pendingToolCalls.get(id);
        if (entry) entry.argsStr += delta;
        if (delta && delta.length <= 120) {
          console.log('Tool call delta:', { id, delta });
        }
        return;
      }

      if (response.type === 'response.output_tool_call.end') {
        const { id } = response;
        const entry = pendingToolCalls.get(id);
        if (!entry) return;

        try {
          logger.logCallEvent('TOOL_CALL_ARGS', { id, argsStr: entry.argsStr }, 'Tool call args raw');
          const args = entry.argsStr ? JSON.parse(entry.argsStr) : {};
          logger.logCallEvent('TOOL_CALL_END', { id, name: entry.name, args }, 'Tool call end');
          
          await handleToolCall(entry.name, args, (out) => {
            openAiWs.send(JSON.stringify({ 
              type: 'tool.output', 
              tool_output: { tool_call_id: id, output: JSON.stringify(out) }
            }));
            openAiWs.send(JSON.stringify({ type: 'response.create' }));
          });
        } catch (e) {
          console.error('Tool call failed:', e);
          openAiWs.send(JSON.stringify({ 
            type: 'tool.output', 
            tool_output: { tool_call_id: id, output: JSON.stringify({ ok: false, reason: 'ServerError' }) }
          }));
        } finally {
          pendingToolCalls.delete(id);
        }
        return;
      }

      // Log agent messages
      if (response.type === 'conversation.item.created' && 
          response.item?.role === 'assistant' && 
          response.item?.type === 'message') {
        const textContent = response.item.content?.find(content => content.type === 'text');
        if (textContent) {
          logger.logCallEvent('AGENT_MESSAGE', { 
            messageId: response.item.id,
            text: textContent.text 
          }, `Agent said: "${textContent.text}"`);
        }
      }

      // Log user transcriptions
      if (response.type === 'conversation.item.input_audio_transcription.completed') {
        logger.logCallEvent('USER_TRANSCRIPTION', {
          eventId: response.event_id,
          itemId: response.item_id,
          contentIndex: response.content_index,
          transcript: response.transcript,
          usage: response.usage
        }, `User said: "${response.transcript}"`);
      }

      // Handle speech events
      if (response.type === 'input_audio_buffer.speech_started') {
        console.log('User started speaking - clearing audio buffer');
        const clearMessage = {
          event: 'clear',
          streamSid: streamSid,
        };
        connection.send(JSON.stringify(clearMessage));
        console.log('Sent immediate clear message to Twilio');
      }

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
          currentTurn.userStopAt = streamStartAt + lastUserPacketTs;
        }
        currentTurnDeltaCount = 0;
        logger.logCallEvent('SPEECH_STOPPED', { turnId: currentTurn.turnId, speechStoppedAt: now }, 'User speech stopped');
      }

      // Handle audio output
      if (response.type === 'response.output_audio.delta' && response.delta) {
        // First audio delta from OpenAI → TTFB
        if (currentTurn && !currentTurn.firstDeltaAt) {
          currentTurn.firstDeltaAt = now;
          hOpenAITTFB.observe(currentTurn.firstDeltaAt - currentTurn.speechStoppedAt);
          logger.logCallEvent('FIRST_AUDIO_DELTA', { 
            turnId: currentTurn.turnId, 
            ttfb: currentTurn.firstDeltaAt - currentTurn.speechStoppedAt 
          }, 'First audio delta received');
        }
        currentTurn && (currentTurn.lastDeltaAt = now);
        currentTurnDeltaCount++;

        // Forward to Twilio
        const audioDelta = {
          event: 'media',
          streamSid: streamSid,
          media: { payload: response.delta },
        };
        connection.send(JSON.stringify(audioDelta));

        // Count bytes out
        cBytesOut.inc(Math.floor(response.delta.length * 0.75));

        // First chunk sent back → observe e2e
        if (currentTurn && !currentTurn.firstDeltaSentAt) {
          currentTurn.firstDeltaSentAt = performance.now();
          hE2EReply.observe(currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt);

          const name = `first-audio-${Date.now()}`;
          firstAudioMark = { name, sentAt: performance.now() };
          connection.send(JSON.stringify({ event: 'mark', streamSid, mark: { name } }));
        }
      }

      // Handle response completion
      if (response.type === 'response.done') {
        // Check for function_call outputs in response.done
        try {
          const outputs = response?.response?.output || [];
          for (const item of outputs) {
            if (item?.type === 'function_call') {
              console.log('Function call via response.done:', { 
                name: item.name, 
                call_id: item.call_id, 
                arguments: item.arguments 
              });
              
              try {
                let args = {};
                if (typeof item.arguments === 'string' && item.arguments.trim()) {
                  args = JSON.parse(item.arguments);
                }
                
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
            
            // Clear Twilio's audio buffer
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

      // Handle session updates
      if (response.type === 'session.updated') {
        logger.logCallEvent('SESSION_UPDATED', { sessionId: response.session?.id }, 'Session updated successfully');
        setTimeout(() => {
          logger.logCallEvent('INITIAL_GREETING_TRIGGER', {}, 'Triggering initial greeting from Laura');
          openAiWs.send(JSON.stringify({ type: 'response.create' }));
        }, PERFORMANCE_CONFIG.initialGreetingDelayMs);
      }

    } catch (error) {
      console.error('Error processing OpenAI message:', error, 'Raw message:', data);
    }
  });

  // Twilio WebSocket event handlers
  connection.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      switch (data.event) {
        case 'media':
          if (openAiWs.readyState === WebSocket.OPEN) {
            const b64 = data.media?.payload || '';
            cBytesIn.inc(Math.floor(b64.length * 0.75));

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
          logger.logCallEvent('STREAM_STARTED', { streamSid }, 'Incoming stream has started');
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
            logger.logCallEvent('TURN_SUMMARY', summary, 'TURN SUMMARY');

            firstAudioMark = null;
          }
          break;

        default:
          logger.logCallEvent('TWILIO_EVENT', { event: data.event, data }, 'Received non-media event');
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error, 'Message:', message);
    }
  });

  // Connection cleanup
  connection.on('close', async () => {
    if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    logger.logCallEvent('CONNECTION_CLOSED', { callId, totalTurns: turnCounter }, 'Client disconnected');
    await logger.saveCallLogs(streamSid, turnCounter);
  });

  openAiWs.on('close', () => {
    logger.logCallEvent('OPENAI_DISCONNECTED', { callId }, 'Disconnected from the OpenAI Realtime API');
  });

  openAiWs.on('error', (error) => {
    logger.logCallEvent('OPENAI_ERROR', { error: error.message, callId }, 'Error in the OpenAI WebSocket');
  });
}
