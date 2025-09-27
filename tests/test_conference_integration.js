#!/usr/bin/env node

/**
 * Comprehensive unit tests for Gino's Pizza Conference Integration
 * Tests conference creation, participant management, TwiML generation, and cleanup
 */

import Fastify from 'fastify';
import WebSocket from 'ws';
import { setupRoutes, participantStore } from '../src/routes/index.js';
import { TWILIO_CONFIG } from '../src/config/index.js';
import { createWebSocketConnection } from '../src/websocket/connection.js';

// Mock Twilio client for testing
const mockTwilioClient = {
  conferences: (conferenceName) => ({
    participants: {
      create: async (params) => {
        const mockParticipant = {
          sid: `CA${Math.random().toString(36).substr(2, 32)}`,
          conferenceSid: conferenceName,
          callSid: params.from,
          to: params.to,
          twiml: params.twiml
        };
        console.log(`✅ Mock participant created: ${mockParticipant.sid} for ${conferenceName}`);
        return mockParticipant;
      }
    })
  }),
  calls: (callSid) => ({
    update: async (params) => {
      console.log(`✅ Mock call ${callSid} updated with status: ${params.status}`);
      return { sid: callSid, status: params.status };
    })
  })
};

// Mock Twilio module
const mockTwilio = () => mockTwilioClient;

// Override the twilio import
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Mock the twilio module
const originalTwilio = require.cache[require.resolve('twilio')];
if (originalTwilio) {
  delete require.cache[require.resolve('twilio')];
}

// Test configuration
const TEST_CONFIG = {
  accountSid: 'ACtest123456789',
  authToken: 'test_auth_token',
  phoneNumber: '+1234567890'
};

/**
 * Test Suite Class
 */
class ConferenceTestSuite {
  constructor() {
    this.app = null;
    this.testResults = [];
    this.mockParticipants = new Map();
  }

  async setup() {
    console.log('🚀 Setting up test environment...');
    
    // Create Fastify app
    this.app = Fastify({ logger: false });
    
    // Register required plugins
    await this.app.register(import('@fastify/formbody'));
    await this.app.register(import('@fastify/websocket'));
    
    // Setup routes with mock Twilio
    setupRoutes(this.app, TEST_CONFIG);
    
    // Start server on random port
    await this.app.listen({ port: 0 });
    
    console.log(`✅ Test server started on port ${this.app.server.address().port}`);
  }

  async teardown() {
    if (this.app) {
      await this.app.close();
      console.log('✅ Test server closed');
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

  // Test 1: Conference Creation
  async testConferenceCreation() {
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

    if (!response.headers['content-type']?.includes('text/xml')) {
      throw new Error('Expected TwiML response');
    }

    const twiml = response.body;
    if (!twiml.includes('<Dial>') || !twiml.includes('<Conference>')) {
      throw new Error('TwiML should contain Dial and Conference elements');
    }

    if (!twiml.includes('GinoRoom-CA123456789')) {
      throw new Error('TwiML should contain correct conference name');
    }

    if (!twiml.includes('endConferenceOnExit="false"')) {
      throw new Error('TwiML should have endConferenceOnExit="false"');
    }

    if (!twiml.includes('hangupOnExit="true"')) {
      throw new Error('TwiML should have hangupOnExit="true"');
    }

    if (!twiml.includes('timeLimit="600"')) {
      throw new Error('TwiML should have 10-minute time limit');
    }
  }

  // Test 2: Participant Store Management
  async testParticipantStoreManagement() {
    // Clear any existing data
    Object.keys(participantStore).forEach(key => delete participantStore[key]);

    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA987654321'
    });

    // Wait a bit for async participant creation
    await new Promise(resolve => setTimeout(resolve, 100));

    const conferenceName = 'GinoRoom-CA987654321';
    if (!participantStore[conferenceName]) {
      throw new Error('Participant store should contain conference entry');
    }

    const participants = participantStore[conferenceName];
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new Error('Participant store should contain participant SIDs');
    }

    console.log(`✅ Found ${participants.length} participants in store`);
  }

  // Test 3: Cleanup Endpoint
  async testCleanupEndpoint() {
    // First create a conference
    const conferenceName = 'GinoRoom-CA111111111';
    participantStore[conferenceName] = ['CA111', 'CA222'];

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

    if (!response.headers['content-type']?.includes('text/xml')) {
      throw new Error('Expected TwiML response');
    }

    if (!response.body.includes('<Hangup/>')) {
      throw new Error('Cleanup should return Hangup TwiML');
    }

    // Check that participant store is cleaned up
    if (participantStore[conferenceName]) {
      throw new Error('Participant store should be cleaned up');
    }
  }

  // Test 4: TwiML Validation
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
    
    // Validate XML structure
    if (!twiml.startsWith('<?xml')) {
      throw new Error('TwiML should start with XML declaration');
    }

    // Validate required attributes
    const requiredAttributes = [
      'action=',
      'method="POST"',
      'startConferenceOnEnter="true"',
      'endConferenceOnExit="false"',
      'hangupOnExit="true"',
      'timeLimit="600"'
    ];

    for (const attr of requiredAttributes) {
      if (!twiml.includes(attr)) {
        throw new Error(`TwiML missing required attribute: ${attr}`);
      }
    }

    // Validate cleanup URL format
    const host = `localhost:${this.app.server.address().port}`;
    const expectedCleanupUrl = `https://${host}/cleanup-conference`;
    if (!twiml.includes(expectedCleanupUrl)) {
      throw new Error('TwiML should contain correct cleanup URL');
    }
  }

  // Test 5: WebSocket Connection
  async testWebSocketConnection() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);

      let connectionEstablished = false;
      let messageReceived = false;

      ws.on('open', () => {
        connectionEstablished = true;
        console.log('✅ WebSocket connection established');
        
        // Send a test message
        const testMessage = {
          event: 'start',
          streamSid: 'test_stream_123'
        };
        ws.send(JSON.stringify(testMessage));
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          console.log('✅ WebSocket message received:', message.event);
          messageReceived = true;
        } catch (error) {
          console.log('✅ WebSocket binary data received');
          messageReceived = true;
        }
      });

      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      // Close after 2 seconds
      setTimeout(() => {
        ws.close();
        if (connectionEstablished && messageReceived) {
          resolve();
        } else {
          reject(new Error('WebSocket connection or message handling failed'));
        }
      }, 2000);
    });
  }

  // Test 6: Background Music Integration
  async testBackgroundMusicIntegration() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA555555555'
    });

    // Wait for async participant creation
    await new Promise(resolve => setTimeout(resolve, 100));

    const conferenceName = 'GinoRoom-CA555555555';
    const participants = participantStore[conferenceName] || [];

    if (participants.length < 2) {
      throw new Error('Should have at least 2 participants (AI + Music)');
    }

    console.log(`✅ Background music integration: ${participants.length} participants created`);
  }

  // Test 7: Conference Timeout Handling
  async testConferenceTimeoutHandling() {
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'CallSid=CA777777777'
    });

    const twiml = response.body;
    
    // Check that timeout is set to 10 minutes (600 seconds)
    if (!twiml.includes('timeLimit="600"')) {
      throw new Error('Conference should have 10-minute timeout');
    }

    // Check that hangupOnExit is true for proper cleanup
    if (!twiml.includes('hangupOnExit="true"')) {
      throw new Error('Conference should have hangupOnExit="true" for cleanup');
    }
  }

  // Test 8: Error Handling
  async testErrorHandling() {
    // Test with invalid CallSid
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'InvalidField=test'
    });

    // Should still return TwiML even with invalid data
    if (response.statusCode !== 200) {
      throw new Error('Should handle invalid data gracefully');
    }
  }

  async runAllTests() {
    console.log('🧪 Starting Conference Integration Test Suite\n');
    
    await this.setup();

    try {
      await this.runTest('Conference Creation', () => this.testConferenceCreation());
      await this.runTest('Participant Store Management', () => this.testParticipantStoreManagement());
      await this.runTest('Cleanup Endpoint', () => this.testCleanupEndpoint());
      await this.runTest('TwiML Validation', () => this.testTwiMLValidation());
      await this.runTest('WebSocket Connection', () => this.testWebSocketConnection());
      await this.runTest('Background Music Integration', () => this.testBackgroundMusicIntegration());
      await this.runTest('Conference Timeout Handling', () => this.testConferenceTimeoutHandling());
      await this.runTest('Error Handling', () => this.testErrorHandling());
    } finally {
      await this.teardown();
    }

    this.printResults();
  }

  printResults() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
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
      console.log('\n🎉 All tests passed! Conference integration is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Run the test suite
const testSuite = new ConferenceTestSuite();
testSuite.runAllTests().catch(console.error);
