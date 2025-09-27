/**
 * Caching utilities for performance optimization
 * Implements LRU cache to prevent memory leaks
 */

/**
 * Creates an LRU (Least Recently Used) cache with size limit
 * @param {number} max - Maximum number of items to store
 * @returns {Object} LRU cache instance
 */
export function makeLRU(max = 200) {
  const m = new Map();
  return {
    get(k) {
      if (!m.has(k)) return undefined;
      const v = m.get(k);
      m.delete(k); 
      m.set(k, v);
      return v;
    },
    set(k, v) {
      if (m.has(k)) m.delete(k);
      m.set(k, v);
      if (m.size > max) m.delete(m.keys().next().value);
    },
    has: (k) => m.has(k),
    size: () => m.size,
    clear: () => m.clear()
  };
}
