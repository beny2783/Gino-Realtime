import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import { ENV, APP_CONFIG, TOOL_DEFINITIONS, LAURA_PROMPT, LOG_EVENT_TYPES } from '../config/config.js';
import { metrics } from '../services/metrics.js';
import { CallLogger } from '../services/logger.js';
import { handleToolCall } from '../services/tools.js';
import { attachRttMeter, createAudioDelta, createMarkEvent } from '../utils/utils.js';
import { makeTurnDetection } from '../config/vad.js';

// =====================
// WebSocket Connection Handler
// =====================

export function createWebSocketHandler(connection) {
  console.log('Client connected');

  const openAiWs = new WebSocket(
    `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=${APP_CONFIG.TEMPERATURE}`,
    {
      headers: {
        Authorization: `Bearer ${ENV.OPENAI_API_KEY}`,
      },
    }
  );

  let streamSid = null;
  let currentTurn = null; // { speechStoppedAt, firstDeltaAt, firstDeltaSentAt, lastDeltaAt, userStopAt, turnId, wasInterrupted }
  let turnCounter = 0;
  let firstAudioMark = null; // { name, sentAt }
  let currentTurnDeltaCount = 0;
  const pendingToolCalls = new Map(); // tool_call_id -> { name, argsStr }
  
  // Call logging system
  const callLogger = new CallLogger();
  
  // Align Twilio's stream-relative timestamps to server wall clock
  let streamStartAt = null; // performance.now() at 'start' event
  let lastUserPacketTs = 0; // Twilio media.timestamp (ms since stream start)

  // Helper function to create response with interruption handling
  const createResponseWithInterruptHandling = () => {
    let responseData = { type: 'response.create' };
    
    // If there was an interruption, add reset instruction
    if (currentTurn?.wasInterrupted) {
      responseData.response = {
        instructions: "The user interrupted you. Do not continue your previous answer; respond to the new input instead."
      };
      currentTurn.wasInterrupted = false; // Reset the flag
      callLogger.log('INTERRUPTION_RESET', { turnId: currentTurn?.turnId }, 'Added interruption reset instruction');
    }
    
    return responseData;
  };

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
          output: { format: { type: 'audio/pcmu' }, voice: APP_CONFIG.VOICE },
        },
        tools: TOOL_DEFINITIONS,
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
    callLogger.log('OPENAI_CONNECTED', { callId: callLogger.callId }, 'Connected to the OpenAI Realtime API');
    attachRttMeter(openAiWs, (rtt) => metrics.hWSRttOpenAI.observe(rtt));
    setTimeout(sendSessionUpdate, 250); // Ensure connection stability
  });

  // Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
  openAiWs.on('message', async (data) => {
    const now = performance.now();
    try {
      const response = JSON.parse(data);
      // Tool call started - send immediate acknowledgment
      if (response.type === 'response.output_tool_call.begin') {
        callLogger.log('TOOL_CALL_BEGIN', { id: response.id, name: response.name }, 'Tool call begin');
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
          callLogger.log('TOOL_CALL_ARGS', { id, argsStr: entry.argsStr }, 'Tool call args raw');
          const args = entry.argsStr ? JSON.parse(entry.argsStr) : {};
          callLogger.log('TOOL_CALL_END', { id, name: entry.name, args }, 'Tool call end');
          
          // Use centralized tool handling
          await handleToolCall(entry.name, args, (out) => {
            openAiWs.send(JSON.stringify({ type: 'tool.output', tool_output: { tool_call_id: id, output: JSON.stringify(out) }}));
            openAiWs.send(JSON.stringify(createResponseWithInterruptHandling()));
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
          callLogger.log('AGENT_MESSAGE', { 
            messageId: response.item.id,
            text: textContent.text 
          }, `Agent said: "${textContent.text}"`);
        }
      }

      // Log user speech transcriptions
      if (response.type === 'conversation.item.input_audio_transcription.completed') {
        callLogger.log('USER_TRANSCRIPTION', {
          eventId: response.event_id,
          itemId: response.item_id,
          contentIndex: response.content_index,
          transcript: response.transcript,
          usage: response.usage
        }, `User said: "${response.transcript}"`);
      }

      if (LOG_EVENT_TYPES.includes(response.type)) {
        callLogger.log('OPENAI_EVENT', { type: response.type, data: response }, `Received event: ${response.type}`);
      }
      if (response.type === 'session.updated') {
        callLogger.log('SESSION_UPDATED', { sessionId: response.session?.id }, 'Session updated successfully');
        // Trigger initial greeting from Laura
        setTimeout(() => {
          callLogger.log('INITIAL_GREETING_TRIGGER', {}, 'Triggering initial greeting from Laura');
          openAiWs.send(JSON.stringify(createResponseWithInterruptHandling()));
        }, 100);
      }

      // Handle VAD speech started - interrupt AI response if in progress
      if (response.type === 'input_audio_buffer.speech_started') {
        // Check if AI is currently generating a response
        if (currentTurn && currentTurn.firstDeltaAt) {
          callLogger.log('SPEECH_STARTED_DURING_RESPONSE', { 
            turnId: currentTurn.turnId 
          }, 'User started speaking during AI response - sending interrupt');
          
          // Send interrupt to stop AI response
          openAiWs.send(JSON.stringify({
            type: 'response.interrupt'
          }));
          
          // Track that an interruption occurred
          currentTurn.wasInterrupted = true;
        }
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
          wasInterrupted: false,
        };
        if (streamStartAt !== null && lastUserPacketTs !== null) {
          currentTurn.userStopAt = streamStartAt + lastUserPacketTs; // align Twilio stream time → wall clock
        }
        currentTurnDeltaCount = 0;
        callLogger.log('SPEECH_STOPPED', { turnId: currentTurn.turnId, speechStoppedAt: now }, 'User speech stopped');
      }

      if (response.type === 'response.output_audio.delta' && response.delta) {
        // First audio delta from OpenAI → TTFB
        if (currentTurn && !currentTurn.firstDeltaAt) {
          currentTurn.firstDeltaAt = now;
          metrics.hOpenAITTFB.observe(currentTurn.firstDeltaAt - currentTurn.speechStoppedAt);
          callLogger.log('FIRST_AUDIO_DELTA', { turnId: currentTurn.turnId, ttfb: currentTurn.firstDeltaAt - currentTurn.speechStoppedAt }, 'First audio delta received');
        }
        currentTurn && (currentTurn.lastDeltaAt = now);
        currentTurnDeltaCount++;

        // Forward to Twilio (response.delta is already base64)
        const audioDelta = createAudioDelta(streamSid, response.delta);
        connection.send(JSON.stringify(audioDelta));

        // Count bytes out (approx)
        metrics.cBytesOut.inc(Math.floor(response.delta.length * 0.75));

        // First chunk sent back → observe e2e; also send a Twilio 'mark' to time playback-at-edge
        if (currentTurn && !currentTurn.firstDeltaSentAt) {
          currentTurn.firstDeltaSentAt = performance.now();
          metrics.hE2EReply.observe(currentTurn.firstDeltaSentAt - currentTurn.speechStoppedAt);

          const name = `first-audio-${Date.now()}`;
          firstAudioMark = { name, sentAt: performance.now() };
          connection.send(JSON.stringify(createMarkEvent(streamSid, name)));
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
                  openAiWs.send(JSON.stringify(createResponseWithInterruptHandling()));
                });
              } catch (e) {
                console.error('Error handling function_call via response.done:', e);
              }
            }
          }
        } catch {}
        
        // Response processing complete
        
        if (currentTurn?.firstDeltaAt && currentTurn?.lastDeltaAt) {
          metrics.hRespStream.observe(currentTurn.lastDeltaAt - currentTurn.firstDeltaAt);
        }
        if (response?.response?.status) {
          console.log('Response done status:', response.response.status, 'deltaCount=', currentTurnDeltaCount);
          // Track VAD cancellations
          if (response.response.status === 'cancelled') {
            metrics.cVADCancellations.inc();
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
            metrics.cBytesIn.inc(Math.floor(b64.length * 0.75));

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
          callLogger.log('STREAM_STARTED', { streamSid }, 'Incoming stream has started');
          attachRttMeter(connection, (rtt) => metrics.hWSRttTwilio.observe(rtt));
          break;

        case 'mark':
          // Twilio echoes our mark when audio is buffered/played at its edge
          if (firstAudioMark && data.mark?.name === firstAudioMark.name) {
            const markEchoAt = performance.now();

            let felt = null;
            if (currentTurn?.userStopAt) {
              felt = markEchoAt - currentTurn.userStopAt;
              metrics.hFeltLatency.observe(felt);
            } else if (currentTurn?.speechStoppedAt) {
              const fallback = markEchoAt - currentTurn.speechStoppedAt;
              felt = fallback;
              metrics.hFeltLatency.observe(fallback);
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
            callLogger.log('TURN_SUMMARY', summary, 'TURN SUMMARY');

            firstAudioMark = null;
          }
          break;

        default:
          callLogger.log('TWILIO_EVENT', { event: data.event, data }, 'Received non-media event');
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error, 'Message:', message);
    }
  });

  // Handle connection close
  connection.on('close', async () => {
    if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
    callLogger.log('CONNECTION_CLOSED', { callId: callLogger.callId, totalTurns: turnCounter }, 'Client disconnected');
    await callLogger.save(streamSid, turnCounter);
  });

  // Handle WebSocket close and errors
  openAiWs.on('close', () => {
    callLogger.log('OPENAI_DISCONNECTED', { callId: callLogger.callId }, 'Disconnected from the OpenAI Realtime API');
  });
  openAiWs.on('error', (error) => {
    callLogger.log('OPENAI_ERROR', { error: error.message, callId: callLogger.callId }, 'Error in the OpenAI WebSocket');
  });
}
