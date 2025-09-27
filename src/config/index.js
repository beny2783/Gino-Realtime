/**
 * Configuration module for Gino's Pizza Realtime API
 * Centralizes all environment variables and application constants
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['OPENAI_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// OpenAI Configuration
export const OPENAI_CONFIG = {
  API_KEY: process.env.OPENAI_API_KEY,
  MODEL: 'gpt-realtime',
  VOICE: 'alloy',
  TEMPERATURE: 0.8,
  REALTIME_URL: 'wss://api.openai.com/v1/realtime'
};

// VAD (Voice Activity Detection) Configuration
export const VAD_CONFIG = {
  MODE: process.env.VAD_MODE || 'semantic',
  SILENCE_MS: parseInt(process.env.VAD_SILENCE_MS || '200'),
  PREFIX_MS: parseInt(process.env.VAD_PREFIX_MS || '80'),
  THRESHOLD: parseFloat(process.env.VAD_THRESHOLD || '0.3'),
  EAGERNESS: process.env.VAD_EAGERNESS || 'high',
  SEMANTIC_ENABLED: process.env.VAD_SEMANTIC_ENABLED === 'true' || process.env.VAD_MODE === 'semantic'
};

// Server Configuration
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '5050'),
  HOST: '0.0.0.0'
};

// Google Maps Configuration
export const GEOCODING_CONFIG = {
  API_KEY: process.env.GMAPS_KEY,
  TIMEOUT_MS: 4000,
  COUNTRY_RESTRICTION: 'CA'
};

// Cache Configuration
export const CACHE_CONFIG = {
  MENU_CACHE_SIZE: 200,
  KB_CACHE_SIZE: 200,
  GEOCODE_CACHE_SIZE: 400
};

// Logging Configuration
export const LOGGING_CONFIG = {
  LOG_EVENT_TYPES: [
    'error',
    'response.content.done',
    'rate_limits.updated',
    'response.done',
    'input_audio_buffer.committed',
    'input_audio_buffer.speech_stopped',
    'input_audio_buffer.speech_started',
    'session.created',
    'session.updated',
    'response.output_tool_call.begin',
    'response.output_tool_call.delta',
    'response.output_tool_call.end'
  ]
};

// Metrics Configuration
export const METRICS_CONFIG = {
  BUCKETS: {
    TTFB: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
    E2E_REPLY: [50, 100, 200, 300, 500, 800, 1200, 2000, 3000, 5000],
    RESPONSE_STREAM: [100, 300, 600, 1000, 2000, 4000, 8000],
    WS_RTT: [10, 20, 50, 100, 200, 400, 800, 1600],
    FELT_LATENCY: [100, 200, 300, 500, 800, 1200, 2000, 3000, 5000]
  },
  RTT_INTERVAL_MS: 5000
};