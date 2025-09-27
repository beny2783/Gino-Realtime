#!/usr/bin/env node

/**
 * Simplified Conference Integration Tests
 * Tests conference creation, participant management, and cleanup without complex mocking
 */

import Fastify from 'fastify';
import WebSocket from 'ws';
import { setupRoutes, participantStore } from '../src/routes/index.js';
import { TWILIO_CONFIG } from '../src/config/index.js';

/**
 * Simplified Test Suite
 */
class ConferenceTestSuite {
  constructor() {
    this.app = null;
    this.testResults = [];
  }

  async setup() {
    console.log('🚀 Setting up test environment...');
    
    this.app = Fastify({ logger: false });
    await this.app.register(import('@fastify/formbody'));
    await this.app.register(import('@fastify/websocket'));
    
    // Setup WebSocket route
    this.app.register(async function (fastify) {
      fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        console.log('✅ WebSocket connection handler called');
        connection.socket.close();
      });
    });
    
    setupRoutes(this.app, TWILIO_CONFIG);
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
    if (!twiml.includes('<Dial') || !twiml.includes('<Conference')) {
      throw new Error('TwiML should contain Dial and Conference elements');
    }

    if (!twiml.includes('GinoRoom-CA123456789')) {
      throw new Error('TwiML should contain correct conference name');
    }
  }

  // Test 2: TwiML Validation
  async testTwiMLValidation() {
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
    
    // Check required attributes
    const requiredAttributes = [
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
  }

  // Test 3: Cleanup Endpoint
  async testCleanupEndpoint() {
    // First create a conference entry
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

  // Test 4: WebSocket Connection
  async testWebSocketConnection() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);

      let connected = false;
      const timeout = setTimeout(() => {
        if (!connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);

      ws.on('open', () => {
        connected = true;
        clearTimeout(timeout);
        console.log('✅ WebSocket connection established');
        ws.close();
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });
    });
  }

  // Test 5: Health Check
  async testHealthCheck() {
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
  }

  // Test 6: Error Handling
  async testErrorHandling() {
    // Test with invalid data
    const response = await this.app.inject({
      method: 'POST',
      url: '/incoming-call',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'host': `localhost:${this.app.server.address().port}`
      },
      payload: 'InvalidField=test'
    });

    // Should still return valid TwiML
    if (response.statusCode !== 200) {
      throw new Error('Should handle invalid data gracefully');
    }
  }

  async runAllTests() {
    console.log('🧪 Starting Simplified Conference Integration Test Suite\n');
    
    await this.setup();

    try {
      await this.runTest('Conference Creation', () => this.testConferenceCreation());
      await this.runTest('TwiML Validation', () => this.testTwiMLValidation());
      await this.runTest('Cleanup Endpoint', () => this.testCleanupEndpoint());
      await this.runTest('WebSocket Connection', () => this.testWebSocketConnection());
      await this.runTest('Health Check', () => this.testHealthCheck());
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
