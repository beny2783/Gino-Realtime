#!/usr/bin/env node

/**
 * Simple test to verify the Hawaiian pizza fix
 */

import { findMenuItems } from '../menu.js';

console.log('🧪 Testing Hawaiian Pizza Search Fix');
console.log('=' .repeat(40));

// Test the exact scenario from the logs
const searchTerm = 'Hawaiian pizza';
console.log(`\n🔍 Searching for: "${searchTerm}"`);

const results = findMenuItems({ search: searchTerm });

if (results.length > 0) {
  console.log(`✅ SUCCESS: Found ${results.length} item(s):`);
  results.forEach(item => {
    console.log(`   - ${item.name} (${item.kind}): ${item.details || 'No details'}`);
  });
  
  // Check if it's the correct Hawaiian pizza
  const hawaiian = results.find(item => item.id === 'gourmet-hawaiian');
  if (hawaiian) {
    console.log(`\n🎉 PERFECT! Found the correct Hawaiian pizza:`);
    console.log(`   ID: ${hawaiian.id}`);
    console.log(`   Name: ${hawaiian.name}`);
    console.log(`   Details: ${hawaiian.details}`);
  } else {
    console.log(`\n❌ Found items but not the correct Hawaiian pizza`);
  }
} else {
  console.log(`❌ FAILED: No results found for "${searchTerm}"`);
}

console.log('\n✅ Test completed!');
