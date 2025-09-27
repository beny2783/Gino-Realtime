/**
 * LRU Cache implementation for performance optimization
 */

import { CACHE_CONFIG } from '../config/index.js';

/**
 * LRU Cache implementation to prevent memory leaks
 * @param {number} max - Maximum number of items to store
 * @returns {Object} Cache instance with get, set, has methods
 */
export function createLRUCache(max = 200) {
  const map = new Map();
  
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    
    set(key, value) {
      if (map.has(key)) map.delete(key);
      map.set(key, value);
      if (map.size > max) map.delete(map.keys().next().value);
    },
    
    has(key) {
      return map.has(key);
    },
    
    size() {
      return map.size;
    },
    
    clear() {
      map.clear();
    }
  };
}

/**
 * Cache service for managing different types of caches
 */
export class CacheService {
  constructor() {
    this.menuCache = createLRUCache(CACHE_CONFIG.MENU_CACHE_SIZE);
    this.kbCache = createLRUCache(CACHE_CONFIG.KB_CACHE_SIZE);
    this.geocodeCache = createLRUCache(CACHE_CONFIG.GEOCODE_CACHE_SIZE);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      menu: this.menuCache.size(),
      kb: this.kbCache.size(),
      geocode: this.geocodeCache.size()
    };
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this.menuCache.clear();
    this.kbCache.clear();
    this.geocodeCache.clear();
  }
}
