import { VAD_CONFIG } from './config.js';

// =====================
// VAD Configuration
// =====================

export function makeTurnDetection() {
  // Check if semantic VAD is enabled via environment variable
  const useSemanticVAD = VAD_CONFIG.SEMANTIC_ENABLED === 'true' || VAD_CONFIG.MODE === 'semantic';
  
  if (useSemanticVAD) {
    // Ensure eagerness is a valid value
    const validEagerness = ['low', 'medium', 'high', 'auto'].includes(VAD_CONFIG.EAGERNESS) 
      ? VAD_CONFIG.EAGERNESS 
      : 'high';
    
    console.log('🔧 VAD Config Debug:', {
      original: VAD_CONFIG.EAGERNESS,
      validated: validEagerness,
      isValid: ['low', 'medium', 'high', 'auto'].includes(VAD_CONFIG.EAGERNESS)
    });
    
    const config = {
      type: 'semantic_vad',
      eagerness: validEagerness, // 'low' | 'medium' | 'high' | 'auto'
      create_response: true,
      interrupt_response: true
    };
    console.log('🧠 Using semantic VAD with eagerness:', validEagerness);
    return config;
  }
  
  // Default: server_vad with configurable settings
  const config = {
    type: 'server_vad',
    threshold: Number(VAD_CONFIG.THRESHOLD),
    prefix_padding_ms: Number(VAD_CONFIG.PREFIX_MS),
    silence_duration_ms: Number(VAD_CONFIG.SILENCE_MS),
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
