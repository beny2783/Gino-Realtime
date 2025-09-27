/**
 * Gino's Pizza Voice AI Assistant - Legacy Entry Point
 * This file has been refactored into a modular structure.
 * The new main entry point is src/index.js
 * 
 * This file is kept for backward compatibility and will redirect to the new structure.
 */

console.log('🔄 Redirecting to new modular structure...');
console.log('📁 New entry point: src/index.js');
console.log('📚 See README.md for updated documentation');

// Import and start the new modular application
import('./src/index.js').catch(error => {
  console.error('❌ Failed to load new application:', error);
  console.error('💡 Make sure all dependencies are installed: npm install');
  process.exit(1);
});
