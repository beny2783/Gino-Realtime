#!/usr/bin/env node

/**
 * Test script for transcript-based scenario testing
 * Tests Laura's handling of unusual requests, language barriers, and large orders
 */

import WebSocket from 'ws';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { findMenuItems } from '../menu.js';
import { getKbSnippet } from '../kb.js';
import { nearestStore } from '../nearestStore.js';
import { geocodeAddress } from '../geocode.js';
import { LAURA_PROMPT, LAURA_TOOLS } from '../index.js';

config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Test scenario based on real transcript
const TEST_SCENARIO = {
  name: "Unusual Request Handling",
  description: "Tests Laura's ability to handle non-English requests, unusual items (batteries), and large quantity orders",
  userMessages: [
    "Como sa va?",
    "Um... Can I order some stuff?",
    "Um... batteries, I need batteries.",
    "Um... what do you sell",
    "What kind of salad do you have ?",
    "I haven't even ordered yet.",
    "How much",
    "for 20 salads?",
    "20 Caesar salads",
    "Yeah, can I get 1,000 chicken wings?",
    "I'll take the breaded and give me a thousand pieces",
    "Yeah yeah I am",
    "What's the total?",
    "That's right",
    "1,000 pieces",
    "That's okay yeah But what time do you open till?",
    "I'll give you my postal code M6N1T4",
    "Actually, that's the furthest Geno's away so yeah, okay you can deliver it",
    "Yeah, that's good",
    "You know what? Cancel the order",
    "No, that's it",
    "Okay, thanks Okay, bye"
  ],
  expectedBehaviors: [
    "Should politely redirect non-English to English",
    "Should decline non-pizza items (batteries) and redirect to menu",
    "Should handle large quantity requests professionally",
    "Should provide accurate pricing calculations",
    "Should handle location lookup correctly",
    "Should gracefully handle order cancellation"
  ]
};

class TranscriptTester {
  constructor() {
    this.ws = null;
    this.testResults = {
      scenario: TEST_SCENARIO.name,
      timestamp: new Date().toISOString(),
      messages: [],
      toolCalls: [],
      analysis: {
        languageHandling: null,
        menuRedirect: null,
        largeOrderHandling: null,
        pricingAccuracy: null,
        locationLookup: null,
        cancellationHandling: null
      },
      overallResult: null
    };
  }

  async runTest() {
    console.log('🚀 Starting Transcript Scenario Test');
    console.log('============================================================');
    console.log(`📝 Testing: ${TEST_SCENARIO.description}`);
    console.log('');

    try {
      await this.connectToOpenAI();
      this.analyzeResults();
      this.saveResults();
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      this.testResults.overallResult = 'FAILED';
      this.testResults.error = error.message;
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }

  async connectToOpenAI() {
    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=0.8`;
      
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });

      this.ws.on('open', () => {
        console.log('✅ Connected to OpenAI Realtime API');
        this.sendSessionUpdate();
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  sendSessionUpdate() {
    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        output_modalities: ['text'],
        instructions: (
          LAURA_PROMPT +
          `
    
    ADDRESS CAPTURE — BE FLEXIBLE:
    - Listen for ANY Canadian address format: postal codes, street addresses, city names, landmarks, or neighborhoods.
    - When you hear an address, REPEAT IT BACK ONCE and ask for confirmation: "I heard <ADDRESS>. Is that right?"
    - If the caller confirms, IMMEDIATELY call findNearestStore with { "address": "<ADDRESS>" }.
    - If the caller corrects you, use their correction and call the tool.
    - Examples of valid addresses:
      • Postal codes: "L1Z 1Z2", "M5V 3A8", "K1A 0A6"
      • Street addresses: "123 Main Street, Toronto", "456 Queen St, Ottawa, ON"
      • City names: "Toronto", "Ottawa, Ontario", "Vancouver, BC"
      • Landmarks: "CN Tower", "Parliament Hill", "Stanley Park"
      • Neighborhoods: "Downtown Toronto", "Old Montreal"
    - If the address is unclear, ask for clarification once, then proceed with the best address heard.
    
    AFTER TOOL RETURNS:
    - Use the returned store details immediately in your spoken response and continue the flow. Keep things moving.`
        ).trim(),
        tools: LAURA_TOOLS,
        tool_choice: 'auto',
        max_output_tokens: 'inf'
      }
    };

    this.ws.send(JSON.stringify(sessionUpdate));
  }

  handleMessage(data) {
    const response = JSON.parse(data.toString());
    
    // Log all responses for analysis
    this.testResults.messages.push({
      timestamp: new Date().toISOString(),
      type: response.type,
      data: response
    });

    switch (response.type) {
      case 'session.created':
        console.log(`📋 Session created: ${response.session?.id}`);
        break;
        
      case 'session.updated':
        console.log('📋 Session updated - Starting transcript test');
        setTimeout(() => this.startScenario(), 1000);
        break;

      case 'response.output_text.delta':
        if (response.delta) {
          process.stdout.write(response.delta);
        }
        break;
        
      case 'response.output_text.done':
        console.log('\n');
        setTimeout(() => this.sendNextMessage(), 500);
        break;

      case 'response.output_tool_call.begin':
        console.log(`\n🔧 Tool Call: ${response.name}`);
        if (response.parameters) {
          console.log(`📝 Arguments:`, JSON.stringify(response.parameters, null, 2));
        }
        break;

      case 'response.output_tool_call.end':
        this.handleToolCall(response.name, response.parameters, response.tool_call_id);
        break;

      case 'error':
        console.error(`❌ API Error: ${response.error?.message}`);
        break;
    }
  }

  async handleToolCall(name, args, toolCallId) {
    this.testResults.toolCalls.push({
      timestamp: new Date().toISOString(),
      name,
      args,
      result: null
    });

    let result;
    
    if (name === 'getMenuItems') {
      result = { ok: true, items: findMenuItems(args || {}) };
    } else if (name === 'getKbSnippet') {
      result = { ok: true, data: getKbSnippet(args || {}) };
    } else if (name === 'findNearestStore') {
      const { address } = args || {};
      if (address) {
        const geo = await geocodeAddress(address);
        const { store, distanceKm } = nearestStore(geo.lat, geo.lon);
        result = {
          ok: true,
          distanceKm,
          store: {
            id: store.id,
            brand: store.brand,
            address: `${store.address}, ${store.city}, ${store.province}, ${store.country} ${store.postal}`,
            city: store.city,
            province: store.province,
            postal: store.postal,
            url: store.url,
            lat: store.lat,
            lon: store.lon,
            hours: store.hours
          }
        };
      } else {
        result = { ok: false, reason: 'AddressMissing' };
      }
    } else {
      result = { ok: false, reason: 'UnknownTool' };
    }

    // Update the tool call result
    const lastToolCall = this.testResults.toolCalls[this.testResults.toolCalls.length - 1];
    if (lastToolCall) {
      lastToolCall.result = result;
    }

    this.ws.send(JSON.stringify({
      type: 'tool.output',
      tool_output: {
        tool_call_id: toolCallId,
        output: JSON.stringify(result)
      }
    }));

    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  async startScenario() {
    console.log(`\n🧪 Running Test: ${TEST_SCENARIO.name}`);
    console.log('==================================================\n');
    
    this.currentMessageIndex = 0;
    await this.sendNextMessage();
  }

  async sendNextMessage() {
    if (this.currentMessageIndex >= TEST_SCENARIO.userMessages.length) {
      console.log('\n📊 Test completed - analyzing results...');
      return;
    }

    const message = TEST_SCENARIO.userMessages[this.currentMessageIndex];
    console.log(`👤 User: "${message}"`);
    
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'input_text',
        input_text: message
      }
    }));

    this.ws.send(JSON.stringify({ type: 'response.create' }));
    this.currentMessageIndex++;
  }

  analyzeResults() {
    console.log('\n📊 Test Analysis:');
    console.log('==============================');

    const messages = this.testResults.messages;
    const toolCalls = this.testResults.toolCalls;

    // Analyze language handling
    const languageResponse = messages.find(m => 
      m.data.type === 'response.output_text.done' && 
      m.data.content?.some(c => c.text?.toLowerCase().includes('english'))
    );
    this.testResults.analysis.languageHandling = languageResponse ? 'PASS' : 'FAIL';
    console.log(`🌐 Language Handling: ${this.testResults.analysis.languageHandling}`);

    // Analyze menu redirect
    const menuRedirect = messages.find(m => 
      m.data.type === 'response.output_text.done' && 
      m.data.content?.some(c => c.text?.toLowerCase().includes('menu'))
    );
    this.testResults.analysis.menuRedirect = menuRedirect ? 'PASS' : 'FAIL';
    console.log(`🍕 Menu Redirect: ${this.testResults.analysis.menuRedirect}`);

    // Analyze large order handling
    const largeOrderHandling = messages.find(m => 
      m.data.type === 'response.output_text.done' && 
      m.data.content?.some(c => c.text?.toLowerCase().includes('thousand'))
    );
    this.testResults.analysis.largeOrderHandling = largeOrderHandling ? 'PASS' : 'FAIL';
    console.log(`📦 Large Order Handling: ${this.testResults.analysis.largeOrderHandling}`);

    // Analyze pricing accuracy
    const pricingResponse = messages.find(m => 
      m.data.type === 'response.output_text.done' && 
      m.data.content?.some(c => c.text?.includes('$') || c.text?.includes('dollar'))
    );
    this.testResults.analysis.pricingAccuracy = pricingResponse ? 'PASS' : 'FAIL';
    console.log(`💰 Pricing Accuracy: ${this.testResults.analysis.pricingAccuracy}`);

    // Analyze location lookup
    const locationToolCall = toolCalls.find(tc => tc.name === 'findNearestStore');
    this.testResults.analysis.locationLookup = locationToolCall ? 'PASS' : 'FAIL';
    console.log(`📍 Location Lookup: ${this.testResults.analysis.locationLookup}`);

    // Analyze cancellation handling
    const cancellationResponse = messages.find(m => 
      m.data.type === 'response.output_text.done' && 
      m.data.content?.some(c => c.text?.toLowerCase().includes('cancel'))
    );
    this.testResults.analysis.cancellationHandling = cancellationResponse ? 'PASS' : 'FAIL';
    console.log(`❌ Cancellation Handling: ${this.testResults.analysis.cancellationHandling}`);

    // Overall result
    const passCount = Object.values(this.testResults.analysis).filter(result => result === 'PASS').length;
    const totalTests = Object.keys(this.testResults.analysis).length;
    this.testResults.overallResult = passCount >= totalTests * 0.8 ? 'PASS' : 'FAIL';
    
    console.log(`\n🎯 Overall Result: ${this.testResults.overallResult === 'PASS' ? '✅' : '❌'} ${this.testResults.overallResult}`);
    console.log(`📈 Score: ${passCount}/${totalTests} tests passed`);
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `transcript_test_${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(this.testResults, null, 2));
    console.log(`\n📁 Results saved to: ${filename}`);
  }
}

// Run the test
const tester = new TranscriptTester();
tester.runTest().catch(console.error);
