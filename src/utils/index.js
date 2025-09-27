/**
 * Utility functions for common operations
 */

/**
 * Pretty print JSON objects
 * @param {*} obj - Object to pretty print
 * @returns {string} Pretty printed JSON string
 */
export function prettyPrint(obj) {
  return JSON.stringify(obj, null, 2);
}

/**
 * Generate a unique call ID
 * @returns {string} Unique call ID
 */
export function generateCallId() {
  return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate required environment variables
 * @param {string[]} requiredVars - Array of required environment variable names
 * @throws {Error} If any required variable is missing
 */
export function validateEnvironment(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Create a delay promise
 * @param {number} ms - Delay in milliseconds
 * @returns {Promise} Promise that resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Safe JSON parse with fallback
 * @param {string} str - String to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed object or fallback
 */
export function safeJsonParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch (error) {
    return fallback;
  }
}

/**
 * Create a timeout promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} message - Error message
 * @returns {Promise} Promise that rejects after timeout
 */
export function createTimeout(ms, message = 'Operation timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Promise that resolves with function result
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
