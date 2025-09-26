import { performance } from 'perf_hooks';

// =====================
// Helper Functions
// =====================

export function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

export function attachRttMeter(ws, observeFn, intervalMs = 5000) {
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

export function createTwimlResponse(host) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream" />
  </Connect>
</Response>`;
}

export function createAudioDelta(streamSid, delta) {
  return {
    event: 'media',
    streamSid: streamSid,
    media: { payload: delta },
  };
}

export function createMarkEvent(streamSid, name) {
  return {
    event: 'mark',
    streamSid,
    mark: { name }
  };
}
