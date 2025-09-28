import { performance } from 'perf_hooks';

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

export { pretty, attachRttMeter };