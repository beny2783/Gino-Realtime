#!/usr/bin/env node

/**
 * Test script to verify menu search functionality
 */

import { findMenuItems } from '../menu.js';

const TEST_SEARCHES = [
  'Hawaiian pizza',
  'Hawaiian',
  'Meat Lovers pizza',
  'Meat Lovers',
  'Cheese pizza',
  'Cheese',
  'Veggie pizza',
  'Vegetarian pizza',
  'Caesar salad',
  'Caesar',
  'Pepperoni pizza',
  'Pepperoni',
  'Supreme pizza',
  'Supreme',
  'BBQ Chicken pizza',
  'BBQ Chicken',
  'Chicken pizza',
  'Chicken'
];

console.log('🧪 Testing Menu Search Functionality');
console.log('=' .repeat(50));

TEST_SEARCHES.forEach(searchTerm => {
  console.log(`\n🔍 Searching for: "${searchTerm}"`);
  const results = findMenuItems({ search: searchTerm });
  
  if (results.length > 0) {
    console.log(`✅ Found ${results.length} item(s):`);
    results.forEach(item => {
      console.log(`   - ${item.name} (${item.kind}): ${item.details || 'No details'}`);
    });
  } else {
    console.log(`❌ No results found`);
  }
});

console.log('\n🎉 Menu search tests completed!');
