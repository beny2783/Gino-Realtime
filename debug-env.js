#!/usr/bin/env node

// =============================================================================
// Environment Variables Debug Script
// =============================================================================
// This script helps debug environment variable loading
// =============================================================================

// No need to import dotenv - config.js already loads it

console.log('🔍 Environment Variables Debug');
console.log('================================');
console.log('');

// Load environment variables
console.log('📁 Loading .env file...');
console.log('✅ .env file will be loaded by config.js');

console.log('');
console.log('🔧 Environment Variables:');
console.log('==========================');

// Check required variables
const requiredVars = [
  'OPENAI_API_KEY',
  'GMAPS_KEY'
];

const optionalVars = [
  'VAD_MODE',
  'VAD_SILENCE_MS',
  'VAD_PREFIX_MS',
  'VAD_THRESHOLD',
  'VAD_EAGERNESS',
  'VAD_SEMANTIC_ENABLED',
  'PORT'
];

console.log('');
console.log('📋 Required Variables:');
requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`  ✅ ${varName}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`  ❌ ${varName}: Not set`);
  }
});

console.log('');
console.log('📋 Optional Variables:');
optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`  ✅ ${varName}: ${value}`);
  } else {
    console.log(`  ⚪ ${varName}: Not set (using default)`);
  }
});

console.log('');
console.log('🧪 Testing Configuration Loading:');
console.log('==================================');

try {
  // Test importing the config
  const { ENV, VAD_CONFIG, APP_CONFIG } = await import('./config/config.js');
  
  console.log('✅ Config module loaded successfully');
  console.log('');
  console.log('📊 Loaded Configuration:');
  console.log('  ENV.OPENAI_API_KEY:', ENV.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('  ENV.GMAPS_KEY:', ENV.GMAPS_KEY ? '✅ Set' : '❌ Missing');
  console.log('  VAD_CONFIG.MODE:', VAD_CONFIG.MODE);
  console.log('  APP_CONFIG.PORT:', APP_CONFIG.PORT);
  console.log('  APP_CONFIG.VOICE:', APP_CONFIG.VOICE);
  console.log('  APP_CONFIG.TEMPERATURE:', APP_CONFIG.TEMPERATURE);
  
} catch (error) {
  console.log('❌ Error loading config module:', error.message);
}

console.log('');
console.log('💡 Next Steps:');
console.log('==============');
console.log('1. If any required variables are missing, add them to your .env file');
console.log('2. Run: cp env.example .env');
console.log('3. Edit .env with your actual API keys');
console.log('4. Run this script again to verify');
console.log('5. Deploy with: ./deploy.sh');
