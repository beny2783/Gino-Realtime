import { nearestStore } from '../nearestStore.js';
import { geocodeAddress } from '../geocode.js';
import { findMenuItems } from '../menu.js';
import { getKbSnippet } from '../kb.js';

// =====================
// Tool Handlers
// =====================

// LRU cache implementation to prevent memory leaks
function makeLRU(max = 200) {
  const m = new Map();
  return {
    get(k) {
      if (!m.has(k)) return undefined;
      const v = m.get(k);
      m.delete(k); m.set(k, v);
      return v;
    },
    set(k, v) {
      if (m.has(k)) m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
    },
    has: (k) => m.has(k)
  };
}

// Per-call caching for performance with LRU limits
const menuCache = makeLRU(200);
const kbCache = makeLRU(200);
const geocodeCache = makeLRU(400);

function cachedFindMenuItems(filters) {
  const key = JSON.stringify(filters || {});
  const hit = menuCache.get(key);
  if (hit) return hit;
  const res = findMenuItems(filters);
  menuCache.set(key, res);
  return res;
}

function cachedGetKbSnippet(args) {
  const key = JSON.stringify(args || {});
  const hit = kbCache.get(key);
  if (hit) return hit;
  const res = getKbSnippet(args);
  kbCache.set(key, res);
  return res;
}

// Centralized tool handling to eliminate code duplication
export async function handleToolCall(name, args, send) {
  try {
    switch (name) {
      case 'findNearestStore':
        return await handleFindNearestStore(args, send);
      case 'getMenuItems':
        return handleGetMenuItems(args, send);
      case 'getKbSnippet':
        return handleGetKbSnippet(args, send);
      default:
        return send({ ok: false, reason: 'UnknownTool' });
    }
  } catch (error) {
    console.error(`Error handling tool call ${name}:`, error);
    return send({ ok: false, reason: 'ServerError', message: error.message });
  }
}

async function handleFindNearestStore(args, send) {
  let { lat, lon, address } = args || {};
  
  if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
    const cached = geocodeCache.get(address.toLowerCase().trim());
    const geo = cached || await geocodeAddress(address);
    geocodeCache.set(address.toLowerCase().trim(), geo);
    lat = geo.lat; 
    lon = geo.lon;
  }
  
  if (typeof lat !== 'number' || typeof lon !== 'number') {
    return send({ ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' });
  }
  
  const { store, distanceKm } = nearestStore(lat, lon);
  return send({
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
  });
}

function handleGetMenuItems(args, send) {
  const items = cachedFindMenuItems(args || {});
  return send({ ok: true, items });
}

function handleGetKbSnippet(args, send) {
  const data = cachedGetKbSnippet(args || {});
  return send({ ok: true, data });
}
