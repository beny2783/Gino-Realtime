/**
 * Voice Activity Detection (VAD) configuration
 * Handles both server-side and semantic VAD modes
 */

import { VAD_CONFIG } from '../config/index.js';

/**
 * Creates VAD turn detection configuration based on environment settings
 * @returns {Object} VAD configuration object
 */
export function makeTurnDetection() {
  // Check if semantic VAD is enabled via environment variable
  const useSemanticVAD = VAD_CONFIG.semanticEnabled === 'true' || VAD_CONFIG.mode === 'semantic';
  
  if (useSemanticVAD) {
    const config = {
      type: 'semantic_vad',
      eagerness: VAD_CONFIG.eagerness, // 'low' | 'medium' | 'high' | 'auto'
      create_response: true,
      interrupt_response: true
    };
    console.log('🧠 Using semantic VAD with eagerness:', VAD_CONFIG.eagerness);
    return config;
  }
  
  // Default: server_vad with configurable settings
  const config = {
    type: 'server_vad',
    threshold: Number(VAD_CONFIG.threshold),
    prefix_padding_ms: Number(VAD_CONFIG.prefixMs),
    silence_duration_ms: Number(VAD_CONFIG.silenceMs),
    create_response: true,
    interrupt_response: true
  };
  
  console.log('⚙️ Using server VAD with config:', {
    threshold: config.threshold,
    prefix_padding_ms: config.prefix_padding_ms,
    silence_duration_ms: config.silence_duration_ms
  });
  
  return config;
}
