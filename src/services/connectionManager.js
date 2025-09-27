/**
 * WebSocket connection manager for handling OpenAI and Twilio connections
 */

import WebSocket from 'ws';
import { performance } from 'perf_hooks';
import { OPENAI_CONFIG, VAD_CONFIG, METRICS_CONFIG } from '../config/index.js';
import { LAURA_TOOLS, LAURA_PROMPT, ADDRESS_CAPTURE_INSTRUCTIONS } from '../config/laura.js';
import { 
  hWSRttOpenAI, 
  hWSRttTwilio, 
  hOpenAITTFB, 
  hE2EReply, 
  hRespStream, 
  hFeltLatency, 
  cBytesIn, 
  cBytesOut, 
  cVADCancellations 
} from './metrics.js';

export class ConnectionManager {
  constructor(twilioConnection, callLogger, toolService) {
    this.twilioConnection = twilioConnection;
    this.callLogger = callLogger;
    this.toolService = toolService;
    
    this.openAiWs = null;
    this.streamSid = null;
    this.currentTurn = null;
    this.turnCounter = 0;
    this.firstAudioMark = null;
    this.currentTurnDeltaCount = 0;
    this.pendingToolCalls = new Map();
    
    // Stream timing
    this.streamStartAt = null;
    this.lastUserPacketTs = 0;
  }

  /**
   * Initialize OpenAI WebSocket connection
   */
  initializeOpenAI() {
    this.openAiWs = new WebSocket(
      `${OPENAI_CONFIG.REALTIME_URL}?model=${OPENAI_CONFIG.MODEL}&temperature=${OPENAI_CONFIG.TEMPERATURE}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_CONFIG.API_KEY}`,
        },
      }
    );

    this.setupOpenAIEventHandlers();
    this.setupTwilioEventHandlers();
  }

  /**
   * Setup OpenAI WebSocket event handlers
   */
  setupOpenAIEventHandlers() {
    this.openAiWs.on('open', () => {
      this.callLogger.logEvent('OPENAI_CONNECTED', { callId: this.callLogger.getCallId() }, 'Connected to the OpenAI Realtime API');
      this.attachRttMeter(this.openAiWs, (rtt) => hWSRttOpenAI.observe(rtt));
      setTimeout(() => this.sendSessionUpdate(), 250);
    });

    this.openAiWs.on('message', async (data) => {
      await this.handleOpenAIMessage(data);
    });

    this.openAiWs.on('close', () => {
      this.callLogger.logEvent('OPENAI_DISCONNECTED', { callId: this.callLogger.getCallId() }, 'Disconnected from the OpenAI Realtime API');
    });

    this.openAiWs.on('error', (error) => {
      this.callLogger.logEvent('OPENAI_ERROR', { error: error.message, callId: this.callLogger.getCallId() }, 'Error in the OpenAI WebSocket');
    });
  }

  /**
   * Setup Twilio WebSocket event handlers
   */
  setupTwilioEventHandlers() {
    this.twilioConnection.on('message', (message) => {
      this.handleTwilioMessage(message);
    });

    this.twilioConnection.on('close', async () => {
      if (this.openAiWs.readyState === WebSocket.OPEN) {
        this.openAiWs.close();
      }
      this.callLogger.logEvent('CONNECTION_CLOSED', { 
        callId: this.callLogger.getCallId(), 
        totalTurns: this.turnCounter 
      }, 'Client disconnected');
      await this.callLogger.saveCallLogs(this.streamSid, this.turnCounter);
    });
  }

  /**
   * Send session update to OpenAI
   */
  sendSessionUpdate() {
    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: OPENAI_CONFIG.MODEL,
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: {
              model: 'whisper-1'
            },
            turn_detection: this.makeTurnDetection(),
          },
          output: { 
            format: { type: 'audio/pcmu' }, 
            voice: OPENAI_CONFIG.VOICE 
          },
        },
        tools: LAURA_TOOLS,
        tool_choice: 'auto',
        instructions: (LAURA_PROMPT + ADDRESS_CAPTURE_INSTRUCTIONS).trim(),
      },
    };
    
    console.log('Sending session update:', JSON.stringify(sessionUpdate));
    this.openAiWs.send(JSON.stringify(sessionUpdate));
  }

  /**
   * Create turn detection configuration
   * @returns {Object} Turn detection config
   */
  makeTurnDetection() {
    if (VAD_CONFIG.SEMANTIC_ENABLED) {
      const config = {
        type: 'semantic_vad',
        eagerness: VAD_CONFIG.EAGERNESS,
        create_response: true,
        interrupt_response: true
      };
      console.log('🧠 Using semantic VAD with eagerness:', VAD_CONFIG.EAGERNESS);
      return config;
    }
    
    const config = {
      type: 'server_vad',
      threshold: VAD_CONFIG.THRESHOLD,
      prefix_padding_ms: VAD_CONFIG.PREFIX_MS,
      silence_duration_ms: VAD_CONFIG.SILENCE_MS,
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

  /**
   * Handle OpenAI WebSocket messages
   * @param {Buffer} data - Message data
   */
  async handleOpenAIMessage(data) {
    const now = performance.now();
    try {
      const response = JSON.parse(data);
      
      // Handle different message types
      if (response.type === 'response.output_tool_call.begin') {
        await this.handleToolCallBegin(response);
      } else if (response.type === 'response.output_tool_call.delta') {
        this.handleToolCallDelta(response);
      } else if (response.type === 'response.output_tool_call.end') {
        await this.handleToolCallEnd(response);
      } else if (response.type === 'conversation.item.created' && 
                 response.item?.role === 'assistant' && 
                 response.item?.type === 'message') {
        this.handleAgentMessage(response);
      } else if (response.type === 'conversation.item.input_audio_transcription.completed') {
        this.handleUserTranscription(response);
      } else if (response.type === 'input_audio_buffer.speech_started') {
        this.handleSpeechStarted();
      } else if (response.type === 'input_audio_buffer.speech_stopped') {
        this.handleSpeechStopped(now);
      } else if (response.type === 'response.output_audio.delta' && response.delta) {
        this.handleAudioDelta(response, now);
      } else if (response.type === 'response.done') {
        this.handleResponseDone(response);
      } else if (response.type === 'session.updated') {
        this.handleSessionUpdated();
      }
    } catch (error) {
      console.error('Error processing OpenAI message:', error, 'Raw message:', data);
    }
  }

  /**
   * Handle Twilio WebSocket messages
   * @param {string} message - Message string
   */
  handleTwilioMessage(message) {
    try {
      const data = JSON.parse(message);
      switch (data.event) {
        case 'media':
          this.handleTwilioMedia(data);
          break;
        case 'start':
          this.handleTwilioStart(data);
          break;
        case 'mark':
          this.handleTwilioMark(data);
          break;
        default:
          this.callLogger.logEvent('TWILIO_EVENT', { event: data.event, data }, 'Received non-media event');
      }
    } catch (error) {
      console.error('Error parsing Twilio message:', error, 'Message:', message);
    }
  }

  /**
   * Attach RTT meter to WebSocket
   * @param {WebSocket} ws - WebSocket instance
   * @param {Function} observeFn - Function to observe RTT
   * @param {number} intervalMs - Ping interval in milliseconds
   */
  attachRttMeter(ws, observeFn, intervalMs = METRICS_CONFIG.RTT_INTERVAL_MS) {
    let lastPingAt = null;
    const timer = setInterval(() => {
      lastPingAt = performance.now();
      try { 
        ws.ping(); 
      } catch (error) {
        // Ignore ping errors
      }
    }, intervalMs);

    ws.on('pong', () => {
      if (lastPingAt) observeFn(performance.now() - lastPingAt);
    });
    ws.on('close', () => clearInterval(timer));
  }

  /**
   * Handle tool call begin
   * @param {Object} response - Tool call begin response
   */
  async handleToolCallBegin(response) {
    this.callLogger.logEvent('TOOL_CALL_BEGIN', { id: response.id, name: response.name }, 'Tool call begin');
    const { id, name } = response;
    this.pendingToolCalls.set(id, { name, argsStr: '' });
  }

  /**
   * Handle tool call delta
   * @param {Object} response - Tool call delta response
   */
  handleToolCallDelta(response) {
    const { id, delta } = response;
    const entry = this.pendingToolCalls.get(id);
    if (entry) entry.argsStr += delta;
    if (delta && delta.length <= 120) {
      console.log('Tool call delta:', { id, delta });
    }
  }

  /**
   * Handle tool call end
   * @param {Object} response - Tool call end response
   */
  async handleToolCallEnd(response) {
    const { id } = response;
    const entry = this.pendingToolCalls.get(id);
    if (!entry) return;

    try {
      this.callLogger.logEvent('TOOL_CALL_ARGS', { id, argsStr: entry.argsStr }, 'Tool call args raw');
      const args = entry.argsStr ? JSON.parse(entry.argsStr) : {};
      this.callLogger.logEvent('TOOL_CALL_END', { id, name: entry.name, args }, 'Tool call end');
      
      await this.toolService.handleToolCall(entry.name, args, (out) => {
        this.openAiWs.send(JSON.stringify({ 
          type: 'tool.output', 
          tool_output: { tool_call_id: id, output: JSON.stringify(out) }
        }));
        this.openAiWs.send(JSON.stringify({ type: 'response.create' }));
      });
    } catch (error) {
      console.error('Tool call failed:', error);
      this.openAiWs.send(JSON.stringify({ 
        type: 'tool.output', 
        tool_output: { tool_call_id: id, output: JSON.stringify({ ok: false, reason: 'ServerError' }) }
      }));
    } finally {
      this.pendingToolCalls.delete(id);
    }
  }

  /**
   * Handle agent message
   * @param {Object} response - Agent message response
   */
  handleAgentMessage(response) {
    const textContent = response.item.content?.find(content => content.type === 'text');
    if (textContent) {
      this.callLogger.logEvent('AGENT_MESSAGE', { 
        messageId: response.item.id,
        text: textContent.text 
      }, `Agent said: "${textContent.text}"`);
    }
  }

  /**
   * Handle user transcription
   * @param {Object} response - User transcription response
   */
  handleUserTranscription(response) {
    this.callLogger.logEvent('USER_TRANSCRIPTION', {
      eventId: response.event_id,
      itemId: response.item_id,
      contentIndex: response.content_index,
      transcript: response.transcript,
      usage: response.usage
    }, `User said: "${response.transcript}"`);
  }

  /**
   * Handle speech started
   */
  handleSpeechStarted() {
    console.log('User started speaking - clearing audio buffer');
    const clearMessage = {
      event: 'clear',
      streamSid: this.streamSid,
    };
    this.twilioConnection.send(JSON.stringify(clearMessage));
    console.log('Sent immediate clear message to Twilio');
  }

  /**
   * Handle speech stopped
   * @param {number} now - Current timestamp
   */
  handleSpeechStopped(now) {
    this.currentTurn = {
      speechStoppedAt: now,
      firstDeltaAt: null,
      firstDeltaSentAt: null,
      lastDeltaAt: null,
      userStopAt: null,
      turnId: ++this.turnCounter,
    };
    
    if (this.streamStartAt !== null && this.lastUserPacketTs !== null) {
      this.currentTurn.userStopAt = this.streamStartAt + this.lastUserPacketTs;
    }
    
    this.currentTurnDeltaCount = 0;
    this.callLogger.logEvent('SPEECH_STOPPED', { 
      turnId: this.currentTurn.turnId, 
      speechStoppedAt: now 
    }, 'User speech stopped');
  }

  /**
   * Handle audio delta
   * @param {Object} response - Audio delta response
   * @param {number} now - Current timestamp
   */
  handleAudioDelta(response, now) {
    // First audio delta from OpenAI → TTFB
    if (this.currentTurn && !this.currentTurn.firstDeltaAt) {
      this.currentTurn.firstDeltaAt = now;
      hOpenAITTFB.observe(this.currentTurn.firstDeltaAt - this.currentTurn.speechStoppedAt);
      this.callLogger.logEvent('FIRST_AUDIO_DELTA', { 
        turnId: this.currentTurn.turnId, 
        ttfb: this.currentTurn.firstDeltaAt - this.currentTurn.speechStoppedAt 
      }, 'First audio delta received');
    }
    
    this.currentTurn && (this.currentTurn.lastDeltaAt = now);
    this.currentTurnDeltaCount++;

    // Forward to Twilio
    const audioDelta = {
      event: 'media',
      streamSid: this.streamSid,
      media: { payload: response.delta },
    };
    this.twilioConnection.send(JSON.stringify(audioDelta));

    // First chunk sent back → observe e2e
    if (this.currentTurn && !this.currentTurn.firstDeltaSentAt) {
      this.currentTurn.firstDeltaSentAt = performance.now();
      // E2E metric would be observed here

      const name = `first-audio-${Date.now()}`;
      this.firstAudioMark = { name, sentAt: performance.now() };
      this.twilioConnection.send(JSON.stringify({ 
        event: 'mark', 
        streamSid: this.streamSid, 
        mark: { name } 
      }));
    }
  }

  /**
   * Handle response done
   * @param {Object} response - Response done event
   */
  handleResponseDone(response) {
    // Handle function calls in response.done
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
            
            this.toolService.handleToolCall(item.name, args, (out) => {
              this.openAiWs.send(JSON.stringify({
                type: 'conversation.item.create',
                item: { 
                  type: 'function_call_output', 
                  call_id: item.call_id, 
                  output: JSON.stringify(out) 
                }
              }));
              this.openAiWs.send(JSON.stringify({ type: 'response.create' }));
            });
          } catch (error) {
            console.error('Error handling function_call via response.done:', error);
          }
        }
      }
    } catch (error) {
      // Ignore parsing errors
    }
    
    // Handle VAD cancellations
    if (response?.response?.status === 'cancelled') {
      console.log('VAD cancellation detected - response was cancelled due to turn detection');
      
      const clearMessage = {
        event: 'clear',
        streamSid: this.streamSid,
      };
      this.twilioConnection.send(JSON.stringify(clearMessage));
      console.log('Sent clear message to Twilio to stop audio playback');
    }
    
    this.currentTurn = null;
  }

  /**
   * Handle session updated
   */
  handleSessionUpdated() {
    this.callLogger.logEvent('SESSION_UPDATED', { 
      sessionId: 'session_updated' 
    }, 'Session updated successfully');
    
    // Trigger initial greeting from Laura
    setTimeout(() => {
      this.callLogger.logEvent('INITIAL_GREETING_TRIGGER', {}, 'Triggering initial greeting from Laura');
      this.openAiWs.send(JSON.stringify({ type: 'response.create' }));
    }, 100);
  }

  /**
   * Handle Twilio media
   * @param {Object} data - Twilio media data
   */
  handleTwilioMedia(data) {
    if (this.openAiWs.readyState === WebSocket.OPEN) {
      const b64 = data.media?.payload || '';
      
      // Track Twilio's notion of elapsed time since stream start (ms)
      const ts = Number(data.media?.timestamp);
      if (!Number.isNaN(ts)) {
        this.lastUserPacketTs = ts;
      }

      const audioAppend = {
        type: 'input_audio_buffer.append',
        audio: b64,
      };
      this.openAiWs.send(JSON.stringify(audioAppend));
    }
  }

  /**
   * Handle Twilio start
   * @param {Object} data - Twilio start data
   */
  handleTwilioStart(data) {
    this.streamSid = data.start.streamSid;
    this.streamStartAt = performance.now();
    this.lastUserPacketTs = 0;
    this.callLogger.logEvent('STREAM_STARTED', { streamSid: this.streamSid }, 'Incoming stream has started');
    this.attachRttMeter(this.twilioConnection, (rtt) => hWSRttTwilio.observe(rtt));
  }

  /**
   * Handle Twilio mark
   * @param {Object} data - Twilio mark data
   */
  handleTwilioMark(data) {
    if (this.firstAudioMark && data.mark?.name === this.firstAudioMark.name) {
      const markEchoAt = performance.now();
      
      let felt = null;
      if (this.currentTurn?.userStopAt) {
        felt = markEchoAt - this.currentTurn.userStopAt;
        // Felt latency metric would be observed here
      } else if (this.currentTurn?.speechStoppedAt) {
        const fallback = markEchoAt - this.currentTurn.speechStoppedAt;
        felt = fallback;
        // Felt latency metric would be observed here
      }

      const summary = {
        turn: this.currentTurn?.turnId ?? null,
        streamSid: this.streamSid,
        felt_latency_ms: felt !== null ? Math.round(felt) : null,
      };
      this.callLogger.logEvent('TURN_SUMMARY', summary, 'TURN SUMMARY');

      this.firstAudioMark = null;
    }
  }
}
