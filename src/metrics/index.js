/**
 * Prometheus metrics setup for performance monitoring
 * Tracks latency, throughput, and system health metrics
 */

import client from 'prom-client';

// Create metrics registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Time-to-First-Byte metrics
export const hOpenAITTFB = new client.Histogram({
  name: 'openai_ttfb_ms',
  help: 'Time from OpenAI server VAD speech_stopped → first audio delta',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});

// End-to-end reply latency
export const hE2EReply = new client.Histogram({
  name: 'e2e_reply_latency_ms',
  help: 'speech_stopped → first audio chunk sent back to Twilio',
  buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});

// Response stream duration
export const hRespStream = new client.Histogram({
  name: 'response_stream_duration_ms',
  help: 'first audio delta → response.done',
  buckets: [100, 300, 600, 1000, 2000, 4000, 8000],
});

// WebSocket RTT metrics
export const hWSRttOpenAI = new client.Histogram({
  name: 'ws_rtt_openai_ms',
  help: 'WebSocket RTT to OpenAI',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});

export const hWSRttTwilio = new client.Histogram({
  name: 'ws_rtt_twilio_ms',
  help: 'WebSocket RTT to Twilio',
  buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
});

// Data transfer metrics
export const cBytesIn = new client.Counter({
  name: 'twilio_audio_bytes_in_total',
  help: 'Bytes received from Twilio (decoded ~ base64_len*0.75)',
});

export const cBytesOut = new client.Counter({
  name: 'twilio_audio_bytes_out_total',
  help: 'Bytes sent to Twilio (decoded ~ base64_len*0.75)',
});

// User-perceived latency
export const hFeltLatency = new client.Histogram({
  name: 'felt_latency_ms',
  help: 'User perceived latency: user stop speaking → audio buffered at Twilio edge',
  buckets: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
});

// VAD cancellation tracking
export const cVADCancellations = new client.Counter({
  name: 'vad_cancellations_total',
  help: 'Number of responses cancelled due to VAD turn detection',
});

// Register all metrics
register.registerMetric(hOpenAITTFB);
register.registerMetric(hE2EReply);
register.registerMetric(hRespStream);
register.registerMetric(hWSRttOpenAI);
register.registerMetric(hWSRttTwilio);
register.registerMetric(cBytesIn);
register.registerMetric(cBytesOut);
register.registerMetric(hFeltLatency);
register.registerMetric(cVADCancellations);

// Export the registry for use in the main application
export { register };
