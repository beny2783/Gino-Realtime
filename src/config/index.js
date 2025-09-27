/**
 * Configuration module for Gino's Pizza Voice AI Assistant
 * Centralizes all environment variables and application constants
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const { OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

// OpenAI API key is required
if (!OPENAI_API_KEY) {
  console.error('❌ Missing OpenAI API key. Please set OPENAI_API_KEY in environment variables.');
  process.exit(1);
}

// Twilio credentials are optional for startup (will be validated when needed)
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
  console.warn('⚠️  Twilio credentials not set. Some features may not work properly.');
  console.warn('   Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER for full functionality.');
}

// OpenAI Configuration
export const OPENAI_CONFIG = {
  apiKey: OPENAI_API_KEY,
  voice: 'alloy',
  temperature: 0.8,
  model: 'gpt-realtime',
  realtimeUrl: 'wss://api.openai.com/v1/realtime'
};

// VAD (Voice Activity Detection) Configuration
export const VAD_CONFIG = {
  mode: process.env.VAD_MODE || 'semantic',
  silenceMs: process.env.VAD_SILENCE_MS || '200',
  prefixMs: process.env.VAD_PREFIX_MS || '80',
  threshold: process.env.VAD_THRESHOLD || '0.3',
  eagerness: process.env.VAD_EAGERNESS || 'high',
  semanticEnabled: process.env.VAD_SEMANTIC_ENABLED || 'true'
};

// Server Configuration
export const SERVER_CONFIG = {
  port: process.env.PORT || 8080,
  host: '0.0.0.0'
};

// Twilio Configuration
const accountSid = TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const authToken = TWILIO_AUTH_TOKEN || 'your_auth_token';
const phoneNumber = TWILIO_PHONE_NUMBER || '+15005550006';

export const TWILIO_CONFIG = {
  accountSid,
  authToken,
  phoneNumber,
  isConfigured: !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER)
};

// External API Configuration
export const EXTERNAL_APIS = {
  googleMaps: {
    key: process.env.GMAPS_KEY,
    geocodeUrl: 'https://maps.googleapis.com/maps/api/geocode/json'
  }
};

// Logging Configuration
export const LOGGING_CONFIG = {
  logEventTypes: [
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

// Cache Configuration
export const CACHE_CONFIG = {
  menuCacheSize: 200,
  kbCacheSize: 200,
  geocodeCacheSize: 400
};

// Performance Monitoring Configuration
export const PERFORMANCE_CONFIG = {
  rttIntervalMs: 5000,
  sessionUpdateDelayMs: 250,
  initialGreetingDelayMs: 100
};
