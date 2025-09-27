/**
 * Prometheus metrics service for monitoring performance and usage
 */

import client from 'prom-client';
import { METRICS_CONFIG } from '../config/index.js';

// Create registry and collect default metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Time to First Byte (TTFB) metrics
const hOpenAITTFB = new client.Histogram({
  name: 'openai_ttfb_ms',
  help: 'Time from OpenAI server VAD speech_stopped → first audio delta',
  buckets: METRICS_CONFIG.BUCKETS.TTFB,
});

// End-to-end reply latency
const hE2EReply = new client.Histogram({
  name: 'e2e_reply_latency_ms',
  help: 'speech_stopped → first audio chunk sent back to Twilio',
  buckets: METRICS_CONFIG.BUCKETS.E2E_REPLY,
});

// Response stream duration
const hRespStream = new client.Histogram({
  name: 'response_stream_duration_ms',
  help: 'first audio delta → response.done',
  buckets: METRICS_CONFIG.BUCKETS.RESPONSE_STREAM,
});

// WebSocket RTT metrics
const hWSRttOpenAI = new client.Histogram({
  name: 'ws_rtt_openai_ms',
  help: 'WebSocket RTT to OpenAI',
  buckets: METRICS_CONFIG.BUCKETS.WS_RTT,
});

const hWSRttTwilio = new client.Histogram({
  name: 'ws_rtt_twilio_ms',
  help: 'WebSocket RTT to Twilio',
  buckets: METRICS_CONFIG.BUCKETS.WS_RTT,
});

// Data transfer metrics
const cBytesIn = new client.Counter({
  name: 'twilio_audio_bytes_in_total',
  help: 'Bytes received from Twilio (decoded ~ base64_len*0.75)',
});

const cBytesOut = new client.Counter({
  name: 'twilio_audio_bytes_out_total',
  help: 'Bytes sent to Twilio (decoded ~ base64_len*0.75)',
});

// User-perceived latency
const hFeltLatency = new client.Histogram({
  name: 'felt_latency_ms',
  help: 'User perceived latency: user stop speaking → audio buffered at Twilio edge',
  buckets: METRICS_CONFIG.BUCKETS.FELT_LATENCY,
});

// VAD cancellation tracking
const cVADCancellations = new client.Counter({
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

// Export metrics and registry
export {
  register,
  hOpenAITTFB,
  hE2EReply,
  hRespStream,
  hWSRttOpenAI,
  hWSRttTwilio,
  cBytesIn,
  cBytesOut,
  hFeltLatency,
  cVADCancellations
};

// Helper function to get metrics content type and data
export async function getMetrics() {
  return {
    contentType: register.contentType,
    data: await register.metrics()
  };
}
