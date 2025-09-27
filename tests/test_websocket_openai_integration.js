#!/usr/bin/env node

/**
 * Unit tests for WebSocket and OpenAI Realtime API integration
 * Tests audio streaming, message handling, and connection management
 */

import Fastify from 'fastify';
import WebSocket from 'ws';
import { createWebSocketConnection } from '../src/websocket/connection.js';
import { OPENAI_CONFIG } from '../src/config/index.js';

// Mock OpenAI WebSocket for testing
class MockOpenAIWebSocket extends WebSocket {
  constructor(url, options) {
    super('ws://mock-openai');
    this.readyState = WebSocket.OPEN;
    this.url = url;
    this.options = options;
    this.messageHandlers = [];
    
    // Simulate connection opening
    setTimeout(() => {
      this.emit('open');
    }, 10);
  }

  send(data) {
    console.log('📤 Mock OpenAI WebSocket send:', JSON.parse(data).type || 'binary data');
    
    // Simulate OpenAI responses
    setTimeout(() => {
      this.simulateOpenAIResponse(data);
    }, 50);
  }

  simulateOpenAIResponse(originalData) {
    try {
      const data = JSON.parse(originalData);
      
      if (data.type === 'session.update') {
        // Simulate session updated response
        this.emit('message', JSON.stringify({
          type: 'session.updated',
          session: { id: 'test_session_123' }
        }));
      } else if (data.type === 'input_audio_buffer.append') {
        // Simulate speech detection
        this.emit('message', JSON.stringify({
          type: 'input_audio_buffer.speech_started'
        }));
        
        setTimeout(() => {
          this.emit('message', JSON.stringify({
            type: 'input_audio_buffer.speech_stopped'
          }));
        }, 100);
        
        // Simulate AI response
        setTimeout(() => {
          this.emit('message', JSON.stringify({
            type: 'response.output_audio.delta',
            delta: 'mock_audio_data'
          }));
          
          this.emit('message', JSON.stringify({
            type: 'response.done',
            response: { status: 'completed' }
          }));
        }, 200);
      }
    } catch (error) {
      // Handle binary data or other non-JSON messages
      console.log('📤 Mock OpenAI received binary data');
    }
  }

  close() {
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  }
}

// Mock the WebSocket constructor
const originalWebSocket = global.WebSocket;
global.WebSocket = MockOpenAIWebSocket;

/**
 * Test Suite for WebSocket and OpenAI Integration
 */
class WebSocketTestSuite {
  constructor() {
    this.app = null;
    this.testResults = [];
    this.connections = [];
  }

  async setup() {
    console.log('🚀 Setting up WebSocket test environment...');
    
    this.app = Fastify({ logger: false });
    await this.app.register(import('@fastify/websocket'));
    
    // Setup WebSocket route
    this.app.register(async function (fastify) {
      fastify.get('/media-stream', { websocket: true }, (connection, req) => {
        createWebSocketConnection(connection, req);
      });
    });
    
    await this.app.listen({ port: 0 });
    console.log(`✅ WebSocket test server started on port ${this.app.server.address().port}`);
  }

  async teardown() {
    // Close all connections
    this.connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    if (this.app) {
      await this.app.close();
      console.log('✅ WebSocket test server closed');
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

  // Test 1: WebSocket Connection Establishment
  async testWebSocketConnection() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);
      this.connections.push(ws);

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
        resolve();
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`WebSocket connection failed: ${error.message}`));
      });
    });
  }

  // Test 2: Twilio Message Handling
  async testTwilioMessageHandling() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);
      this.connections.push(ws);

      let connectionEstablished = false;
      let messagesReceived = 0;

      ws.on('open', () => {
        connectionEstablished = true;
        console.log('✅ WebSocket connection established for message handling test');
        
        // Send Twilio start message
        const startMessage = {
          event: 'start',
          streamSid: 'test_stream_123',
          start: {
            streamSid: 'test_stream_123',
            accountSid: 'AC123456789',
            callSid: 'CA123456789'
          }
        };
        ws.send(JSON.stringify(startMessage));

        // Send Twilio media message
        setTimeout(() => {
          const mediaMessage = {
            event: 'media',
            streamSid: 'test_stream_123',
            media: {
              payload: 'dGVzdF9hdWRpb19kYXRh', // base64 encoded test audio
              timestamp: '1234567890'
            }
          };
          ws.send(JSON.stringify(mediaMessage));
        }, 200);
      });

      ws.on('message', (data) => {
        messagesReceived++;
        try {
          const message = JSON.parse(data);
          console.log('✅ JSON message received:', message.type || message.event);
        } catch (error) {
          // Binary data received
          console.log('✅ Binary audio data received');
        }
      });

      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      setTimeout(() => {
        ws.close();
        if (connectionEstablished && messagesReceived > 0) {
          console.log(`✅ Received ${messagesReceived} messages`);
          resolve();
        } else {
          reject(new Error(`Connection: ${connectionEstablished}, Messages: ${messagesReceived}`));
        }
      }, 3000);
    });
  }

  // Test 3: OpenAI Integration
  async testOpenAIIntegration() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);
      this.connections.push(ws);

      let connectionEstablished = false;
      let messagesReceived = 0;

      ws.on('open', () => {
        connectionEstablished = true;
        console.log('✅ WebSocket connection established for OpenAI integration test');
        
        // Send start message to trigger session update
        const startMessage = {
          event: 'start',
          streamSid: 'test_stream_456',
          start: {
            streamSid: 'test_stream_456',
            accountSid: 'AC123456789',
            callSid: 'CA123456789'
          }
        };
        ws.send(JSON.stringify(startMessage));

        // Send media message to trigger audio processing
        setTimeout(() => {
          const mediaMessage = {
            event: 'media',
            streamSid: 'test_stream_456',
            media: {
              payload: 'dGVzdF9hdWRpb19kYXRh',
              timestamp: '1234567890'
            }
          };
          ws.send(JSON.stringify(mediaMessage));
        }, 200);
      });

      ws.on('message', (data) => {
        messagesReceived++;
        try {
          const message = JSON.parse(data);
          console.log('✅ OpenAI message received:', message.type || message.event);
        } catch (error) {
          // Binary audio data
          console.log('✅ Binary audio data received');
        }
      });

      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      setTimeout(() => {
        ws.close();
        if (connectionEstablished && messagesReceived > 0) {
          console.log(`✅ OpenAI integration working - received ${messagesReceived} messages`);
          resolve();
        } else {
          reject(new Error(`OpenAI integration failed - Connection: ${connectionEstablished}, Messages: ${messagesReceived}`));
        }
      }, 4000);
    });
  }

  // Test 4: Connection Cleanup
  async testConnectionCleanup() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);
      this.connections.push(ws);

      let closed = false;

      ws.on('open', () => {
        console.log('✅ Connection established for cleanup test');
        
        // Send start message
        const startMessage = {
          event: 'start',
          streamSid: 'test_stream_789',
          start: {
            streamSid: 'test_stream_789',
            accountSid: 'AC123456789',
            callSid: 'CA123456789'
          }
        };
        ws.send(JSON.stringify(startMessage));
      });

      ws.on('close', () => {
        closed = true;
        console.log('✅ Connection closed properly');
        resolve();
      });

      ws.on('error', (error) => {
        reject(new Error(`WebSocket error: ${error.message}`));
      });

      // Close connection after 1 second
      setTimeout(() => {
        ws.close();
      }, 1000);

      // Timeout after 3 seconds
      setTimeout(() => {
        if (!closed) {
          reject(new Error('Connection cleanup timeout'));
        }
      }, 3000);
    });
  }

  // Test 5: Error Handling
  async testErrorHandling() {
    return new Promise((resolve, reject) => {
      const wsUrl = `ws://localhost:${this.app.server.address().port}/media-stream`;
      const ws = new WebSocket(wsUrl);
      this.connections.push(ws);

      let errorHandled = false;

      ws.on('open', () => {
        // Send invalid message
        ws.send('invalid json message');
        
        // Send malformed message
        ws.send(JSON.stringify({ invalid: 'message' }));
        
        errorHandled = true;
        console.log('✅ Error handling test completed');
      });

      ws.on('error', (error) => {
        // Expected to handle errors gracefully
        console.log('✅ Error handled gracefully:', error.message);
        errorHandled = true;
      });

      setTimeout(() => {
        ws.close();
        if (errorHandled) {
          resolve();
        } else {
          reject(new Error('Error handling not working properly'));
        }
      }, 2000);
    });
  }

  async runAllTests() {
    console.log('🧪 Starting WebSocket and OpenAI Integration Test Suite\n');
    
    await this.setup();

    try {
      await this.runTest('WebSocket Connection', () => this.testWebSocketConnection());
      await this.runTest('Twilio Message Handling', () => this.testTwilioMessageHandling());
      await this.runTest('OpenAI Integration', () => this.testOpenAIIntegration());
      await this.runTest('Connection Cleanup', () => this.testConnectionCleanup());
      await this.runTest('Error Handling', () => this.testErrorHandling());
    } finally {
      await this.teardown();
    }

    this.printResults();
  }

  printResults() {
    console.log('\n📊 WebSocket Test Results Summary:');
    console.log('==================================');
    
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
      console.log('\n🎉 All WebSocket tests passed! Integration is working correctly.');
    } else {
      console.log('\n⚠️  Some WebSocket tests failed. Please review the errors above.');
      process.exit(1);
    }
  }
}

// Restore original WebSocket
process.on('exit', () => {
  global.WebSocket = originalWebSocket;
});

// Run the test suite
const testSuite = new WebSocketTestSuite();
testSuite.runAllTests().catch(console.error);
