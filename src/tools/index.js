/**
 * Tool handling logic for Laura AI assistant
 * Centralizes all tool execution and caching
 */

import { nearestStore } from '../../nearestStore.js';
import { geocodeAddress } from '../../geocode.js';
import { findMenuItems } from '../../menu.js';
import { getKbSnippet } from '../../kb.js';
import { makeLRU } from '../utils/cache.js';
import { CACHE_CONFIG } from '../config/index.js';

// Per-call caching for performance with LRU limits
const menuCache = makeLRU(CACHE_CONFIG.menuCacheSize);
const kbCache = makeLRU(CACHE_CONFIG.kbCacheSize);
const geocodeCache = makeLRU(CACHE_CONFIG.geocodeCacheSize);

/**
 * Cached menu item finder
 * @param {Object} filters - Menu search filters
 * @returns {Array} Filtered menu items
 */
function cachedFindMenuItems(filters) {
  const key = JSON.stringify(filters || {});
  const hit = menuCache.get(key);
  if (hit) return hit;
  const res = findMenuItems(filters);
  menuCache.set(key, res);
  return res;
}

/**
 * Cached knowledge base snippet getter
 * @param {Object} args - KB query arguments
 * @returns {*} KB data
 */
function cachedGetKbSnippet(args) {
  const key = JSON.stringify(args || {});
  const hit = kbCache.get(key);
  if (hit) return hit;
  const res = getKbSnippet(args);
  kbCache.set(key, res);
  return res;
}

/**
 * Centralized tool handling to eliminate code duplication
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {Function} send - Callback to send response
 * @returns {Promise} Tool execution result
 */
export async function handleToolCall(name, args, send) {
  if (name === 'findNearestStore') {
    let { lat, lon, address } = args || {};
    
    // Geocode address if coordinates not provided
    if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
      const cached = geocodeCache.get(address.toLowerCase().trim());
      const geo = cached || await geocodeAddress(address);
      geocodeCache.set(address.toLowerCase().trim(), geo);
      lat = geo.lat; 
      lon = geo.lon;
    }
    
    // Validate coordinates
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return send({ 
        ok: false, 
        reason: 'CoordinatesMissing', 
        message: 'Could not derive lat/lon' 
      });
    }
    
    // Find nearest store
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

  if (name === 'getMenuItems') {
    const items = cachedFindMenuItems(args || {});
    return send({ ok: true, items });
  }

  if (name === 'getKbSnippet') {
    const data = cachedGetKbSnippet(args || {});
    return send({ ok: true, data });
  }

  return send({ ok: false, reason: 'UnknownTool' });
}
