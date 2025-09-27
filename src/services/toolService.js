/**
 * Tool service for handling OpenAI Realtime API tool calls
 */

import { nearestStore } from '../../nearestStore.js';
import { geocodeAddress } from '../../geocode.js';
import { findMenuItems } from '../../menu.js';
import { getKbSnippet } from '../../kb.js';

export class ToolService {
  constructor(cacheService) {
    this.cacheService = cacheService;
  }

  /**
   * Handle tool call execution
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @param {Function} send - Callback function to send response
   * @returns {Promise<void>}
   */
  async handleToolCall(name, args, send) {
    try {
      switch (name) {
        case 'findNearestStore':
          await this.handleFindNearestStore(args, send);
          break;
        case 'getMenuItems':
          await this.handleGetMenuItems(args, send);
          break;
        case 'getKbSnippet':
          await this.handleGetKbSnippet(args, send);
          break;
        default:
          send({ ok: false, reason: 'UnknownTool' });
      }
    } catch (error) {
      console.error(`Error handling tool call ${name}:`, error);
      send({ ok: false, reason: 'ServerError', message: error.message });
    }
  }

  /**
   * Handle findNearestStore tool call
   * @param {Object} args - Tool arguments
   * @param {Function} send - Callback function to send response
   */
  async handleFindNearestStore(args, send) {
    let { lat, lon, address } = args || {};
    
    // If coordinates not provided, geocode the address
    if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
      const cached = this.cacheService.geocodeCache.get(address.toLowerCase().trim());
      const geo = cached || await geocodeAddress(address);
      this.cacheService.geocodeCache.set(address.toLowerCase().trim(), geo);
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

  /**
   * Handle getMenuItems tool call
   * @param {Object} args - Tool arguments
   * @param {Function} send - Callback function to send response
   */
  async handleGetMenuItems(args, send) {
    const key = JSON.stringify(args || {});
    const cached = this.cacheService.menuCache.get(key);
    
    if (cached) {
      return send({ ok: true, items: cached });
    }
    
    const items = findMenuItems(args || {});
    this.cacheService.menuCache.set(key, items);
    
    return send({ ok: true, items });
  }

  /**
   * Handle getKbSnippet tool call
   * @param {Object} args - Tool arguments
   * @param {Function} send - Callback function to send response
   */
  async handleGetKbSnippet(args, send) {
    const key = JSON.stringify(args || {});
    const cached = this.cacheService.kbCache.get(key);
    
    if (cached) {
      return send({ ok: true, data: cached });
    }
    
    const data = getKbSnippet(args || {});
    this.cacheService.kbCache.set(key, data);
    
    return send({ ok: true, data });
  }
}
