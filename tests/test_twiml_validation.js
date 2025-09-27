#!/usr/bin/env node

/**
 * Unit tests for TwiML generation and validation
 * Tests all TwiML responses for proper structure and content
 */

import Fastify from 'fastify';
import { setupRoutes } from '../src/routes/index.js';
import { TWILIO_CONFIG } from '../src/config/index.js';

/**
 * TwiML Test Suite
 */
class TwiMLTestSuite {
  constructor() {
    this.app = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 Setting up TwiML test environment...');
    
    this.app = Fastify({ logger: false });
    await this.app.register(import('@fastify/formbody'));
    
    setupRoutes(this.app, TWILIO_CONFIG);
    await this.app.listen({ port: 0 });
    
    console.log(`✅ TwiML test server started on port ${this.app.server.address().port}`);
  }

  async teardown() {
    if (this.app) {
      await this.app.close();
      console.log('✅ TwiML test server closed');
    }
  }

  async runTest(testName, testFn) {
    console.log(`\n🧪 Running test: ${testName}`);
    try {
      await testFn();
      this.testResults.push({ name: testName, status: 'PASS' });
      console.log(`✅ ${testName} - PASSED`);
    } catch (error) {
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
      console.log(`❌ ${testName} - FAILED: ${error.message}`);
    }
  }

  // Test 1: Incoming Call TwiML Structure
  async testIncomingCallTwiMLStructure() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA123456789'
    });

    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    const twiml = response.body;
    
    // Check XML declaration
    if (!twiml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
      throw new Error('TwiML should start with proper XML declaration');
    }

    // Check Response root element
    if (!twiml.includes('<Response>') || !twiml.includes('</Response>')) {
      throw new Error('TwiML should have Response root element');
    }

    // Check Dial element
    if (!twiml.includes('<Dial') || !twiml.includes('</Dial>')) {
      throw new Error('TwiML should contain Dial element');
    }

    // Check Conference element
    if (!twiml.includes('<Conference') || !twiml.includes('</Conference>')) {
      throw new Error('TwiML should contain Conference element');
    }
  }

  // Test 2: Incoming Call TwiML Attributes
  async testIncomingCallTwiMLAttributes() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA987654321'
    });

    const twiml = response.body;
    const host = `localhost:${this.app.server.address().port}`;
    
    // Check Dial attributes
    const dialAttributes = [
      `action="https://${host}/cleanup-conference"`,
      'method="POST"'
    ];

    for (const attr of dialAttributes) {
      if (!twiml.includes(attr)) {
        throw new Error(`TwiML missing Dial attribute: ${attr}`);
      }
    }

    // Check Conference attributes
    const conferenceAttributes = [
      'startConferenceOnEnter="true"',
      'endConferenceOnExit="false"',
      'hangupOnExit="true"',
      'timeLimit="600"'
    ];

    for (const attr of conferenceAttributes) {
      if (!twiml.includes(attr)) {
        throw new Error(`TwiML missing Conference attribute: ${attr}`);
      }
    }

    // Check conference name format
    if (!twiml.includes('GinoRoom-CA987654321')) {
      throw new Error('TwiML should contain correct conference name format');
    }
  }

  // Test 3: Cleanup TwiML Structure
  async testCleanupTwiMLStructure() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/cleanup-conference',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      payload: 'CallSid=CA111111111'
    });

    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    const twiml = response.body;
    
    // Check XML declaration
    if (!twiml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
      throw new Error('Cleanup TwiML should start with proper XML declaration');
    }

    // Check Response root element
    if (!twiml.includes('<Response>') || !twiml.includes('</Response>')) {
      throw new Error('Cleanup TwiML should have Response root element');
    }

    // Check Hangup element
    if (!twiml.includes('<Hangup/>')) {
      throw new Error('Cleanup TwiML should contain Hangup element');
    }
  }

  // Test 4: Health Check Response
  async testHealthCheckResponse() {
    const response = await this.app.inject({
      method: 'GET',
      url: '/'
    });

    if (response.statusCode !== 200) {
      throw new Error(`Expected status 200, got ${response.statusCode}`);
    }

    const data = JSON.parse(response.body);
    
    if (!data.message || !data.status || !data.timestamp) {
      throw new Error('Health check should return message, status, and timestamp');
    }

    if (data.status !== 'healthy') {
      throw new Error('Health check status should be "healthy"');
    }

    if (!data.message.includes("Gino's Pizza Voice AI Assistant")) {
      throw new Error('Health check message should mention Gino\'s Pizza');
    }
  }

  // Test 5: TwiML Content Type
  async testTwiMLContentType() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA555555555'
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('text/xml')) {
      throw new Error('TwiML response should have text/xml content type');
    }
  }

  // Test 6: Conference Name Uniqueness
  async testConferenceNameUniqueness() {
    const callSids = ['CA111111111', 'CA222222222', 'CA333333333'];
    const conferenceNames = [];

    for (const callSid of callSids) {
      const response = await this.app.inject({
        method: 'POST',
        url: '/incoming-call',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'host': `localhost:${this.app.server.address().port}`
        },
        payload: `CallSid=${callSid}`
      });

      const twiml = response.body;
      const conferenceName = `GinoRoom-${callSid}`;
      
      if (!twiml.includes(conferenceName)) {
        throw new Error(`TwiML should contain conference name: ${conferenceName}`);
      }
      
      conferenceNames.push(conferenceName);
    }

    // Check that all conference names are unique
    const uniqueNames = new Set(conferenceNames);
    if (uniqueNames.size !== conferenceNames.length) {
      throw new Error('Conference names should be unique');
    }

    console.log(`✅ Generated ${conferenceNames.length} unique conference names`);
  }

  // Test 7: Error Handling
  async testErrorHandling() {
    // Test with missing CallSid
    const response1 = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'InvalidField=test'
    });

    // Should still return valid TwiML
    if (response1.statusCode !== 200) {
      throw new Error('Should handle missing CallSid gracefully');
    }

    // Test with empty payload
    const response2 = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: ''
    });

    if (response2.statusCode !== 200) {
      throw new Error('Should handle empty payload gracefully');
    }
  }

  // Test 8: TwiML Validation
  async testTwiMLValidation() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA999999999'
    });

    const twiml = response.body;
    
    // Basic XML structure validation
    const openResponse = (twiml.match(/<Response>/g) || []).length;
    const closeResponse = (twiml.match(/<\/Response>/g) || []).length;
    
    if (openResponse !== 1 || closeResponse !== 1) {
      throw new Error('TwiML should have exactly one Response element');
    }

    const openDial = (twiml.match(/<Dial/g) || []).length;
    const closeDial = (twiml.match(/<\/Dial>/g) || []).length;
    
    if (openDial !== 1 || closeDial !== 1) {
      throw new Error('TwiML should have exactly one Dial element');
    }

    const openConference = (twiml.match(/<Conference/g) || []).length;
    const closeConference = (twiml.match(/<\/Conference>/g) || []).length;
    
    if (openConference !== 1 || closeConference !== 1) {
      throw new Error('TwiML should have exactly one Conference element');
    }
  }

  async runAllTests() {
    console.log('🧪 Starting TwiML Validation Test Suite\n');
    
    await this.setup();

    try {
      await this.runTest('Incoming Call TwiML Structure', () => this.testIncomingCallTwiMLStructure());
      await this.runTest('Incoming Call TwiML Attributes', () => this.testIncomingCallTwiMLAttributes());
      await this.runTest('Cleanup TwiML Structure', () => this.testCleanupTwiMLStructure());
      await this.runTest('Health Check Response', () => this.testHealthCheckResponse());
      await this.runTest('TwiML Content Type', () => this.testTwiMLContentType());
      await this.runTest('Conference Name Uniqueness', () => this.testConferenceNameUniqueness());
      await this.runTest('Error Handling', () => this.testErrorHandling());
      await this.runTest('TwiML Validation', () => this.testTwiMLValidation());
    } finally {
      await this.teardown();
    }

    this.printResults();
  }

  printResults() {
    console.log('\n📊 TwiML Test Results Summary:');
    console.log('==============================');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const status = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${status} ${result.name}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    console.log(`\n📈 Total: ${this.testResults.length} tests`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed === 0) {
      console.log('\n🎉 All TwiML tests passed! TwiML generation is working correctly.');
    } else {
      console.log('\n⚠️  Some TwiML tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Run the test suite
const testSuite = new TwiMLTestSuite();
testSuite.runAllTests().catch(console.error);
