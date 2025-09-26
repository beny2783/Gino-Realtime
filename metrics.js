import client from 'prom-client';

// =====================
// Prometheus Metrics Setup
// =====================

const register = new client.Registry();
client.collectDefaultMetrics({ register });

// Create metrics
export const metrics = {
  // Latency metrics
  hOpenAITTFB: new client.Histogram({
    name: 'openai_ttfb_ms',
    help: 'Time from OpenAI server VAD speech_stopped → first audio delta',
    buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
  }),
  hE2EReply: new client.Histogram({
    name: 'e2e_reply_latency_ms',
    help: 'speech_stopped → first audio chunk sent back to Twilio',
    buckets: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
  }),
  hRespStream: new client.Histogram({
    name: 'response_stream_duration_ms',
    help: 'first audio delta → response.done',
    buckets: [100, 300, 600, 1000, 2000, 4000, 8000],
  }),
  hFeltLatency: new client.Histogram({
    name: 'felt_latency_ms',
    help: 'User perceived latency: user stop speaking → audio buffered at Twilio edge',
    buckets: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
  }),
  
  // WebSocket RTT metrics
  hWSRttOpenAI: new client.Histogram({
    name: 'ws_rtt_openai_ms',
    help: 'WebSocket RTT to OpenAI',
    buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
  }),
  hWSRttTwilio: new client.Histogram({
    name: 'ws_rtt_twilio_ms',
    help: 'WebSocket RTT to Twilio',
    buckets: [10, 20, 50, 100, 200, 400, 800, 1600],
  }),
  
  // Data transfer metrics
  cBytesIn: new client.Counter({
    name: 'twilio_audio_bytes_in_total',
    help: 'Bytes received from Twilio (decoded ~ base64_len*0.75)',
  }),
  cBytesOut: new client.Counter({
    name: 'twilio_audio_bytes_out_total',
    help: 'Bytes sent to Twilio (decoded ~ base64_len*0.75)',
  }),
  
  // VAD metrics
  cVADCancellations: new client.Counter({
    name: 'vad_cancellations_total',
    help: 'Number of responses cancelled due to VAD turn detection',
  }),
};

// Register all metrics
Object.values(metrics).forEach(metric => register.registerMetric(metric));

export { register };
