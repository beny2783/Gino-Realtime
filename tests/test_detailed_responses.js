#!/usr/bin/env node

/**
 * Detailed response testing for specific scenarios
 * Captures exact model responses and tool interactions
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

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  process.exit(1);
}

class DetailedResponseTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.currentTest = null;
    this.responses = [];
    this.toolCalls = [];
    this.toolResults = [];
    this.allMessages = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=gpt-realtime&temperature=0.8`;
      
      this.ws = new WebSocket(url, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      });
      
      this.ws.on('open', () => {
        console.log('✅ Connected to OpenAI Realtime API');
        resolve();
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  handleMessage(data) {
    try {
      const response = JSON.parse(data);
      this.allMessages.push({
        type: response.type,
        data: response,
        timestamp: new Date().toISOString()
      });
      
      switch (response.type) {
        case 'session.created':
          this.sessionId = response.session.id;
          console.log(`📋 Session created: ${this.sessionId}`);
          this.updateSession();
          break;
          
        case 'session.updated':
          console.log('📋 Session updated - Ready for testing');
          break;
          
        case 'conversation.item.created':
          if (response.item?.role === 'assistant' && response.item?.type === 'message') {
            const textContent = response.item.content?.find(c => c.type === 'text');
            if (textContent) {
              this.responses.push({
                type: 'assistant_message',
                text: textContent.text,
                timestamp: new Date().toISOString()
              });
              console.log(`\n🤖 Laura: "${textContent.text}"`);
            }
          }
          break;
          
        case 'response.output_text.delta':
          // Capture streaming text
          if (response.delta) {
            process.stdout.write(response.delta);
          }
          break;
          
        case 'response.output_text.done':
          console.log('\n');
          break;
          
        case 'response.done':
          // Check for function calls
          const outputs = response?.response?.output || [];
          for (const item of outputs) {
            if (item?.type === 'function_call') {
              console.log(`\n🔧 Tool Call: ${item.name}`);
              console.log(`📝 Arguments: ${item.arguments}`);
              
              this.toolCalls.push({
                name: item.name,
                arguments: item.arguments,
                timestamp: new Date().toISOString()
              });
              
              this.handleToolCall(item);
            }
          }
          break;
          
        case 'error':
          console.error('❌ API Error:', response.error);
          break;
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error);
    }
  }

  async handleToolCall(item) {
    try {
      const args = JSON.parse(item.arguments || '{}');
      let result;
      
      switch (item.name) {
        case 'getMenuItems':
          result = { ok: true, items: findMenuItems(args) };
          console.log(`📋 Menu Results: ${result.items.length} items found`);
          if (result.items.length > 0) {
            console.log(`   First item: ${result.items[0].name} (${result.items[0].kind})`);
          }
          break;
        case 'getKbSnippet':
          result = { ok: true, data: getKbSnippet(args) };
          console.log(`📚 KB Result: ${result.data ? 'Data retrieved' : 'No data'}`);
          break;
        case 'findNearestStore':
          const { lat, lon, address } = args;
          let finalLat = lat, finalLon = lon;
          
          if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
            console.log(`🗺️  Geocoding: ${address}`);
            const geo = await geocodeAddress(address);
            finalLat = geo.lat;
            finalLon = geo.lon;
          }
          
          if (typeof finalLat !== 'number' || typeof finalLon !== 'number') {
            result = { ok: false, reason: 'CoordinatesMissing', message: 'Could not derive lat/lon' };
          } else {
            const { store, distanceKm } = nearestStore(finalLat, finalLon);
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
          }
          console.log(`📍 Store Result: ${result.ok ? `${result.store?.city} (${result.distanceKm}km)` : 'Failed'}`);
          break;
        default:
          result = { ok: false, reason: 'UnknownTool' };
      }
      
      this.toolResults.push({
        tool: item.name,
        arguments: args,
        result: result,
        timestamp: new Date().toISOString()
      });
      
      // Send tool output
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify(result)
        }
      }));
      
      // Continue conversation
      this.ws.send(JSON.stringify({ type: 'response.create' }));
      
    } catch (error) {
      console.error('❌ Error handling tool call:', error);
    }
  }

  updateSession() {
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

  async runTest(testName, messages) {
    console.log(`\n🧪 Running Test: ${testName}`);
    console.log('=' .repeat(50));
    
    this.currentTest = {
      name: testName,
      messages: messages,
      startTime: new Date().toISOString()
    };
    
    // Clear previous data
    this.responses = [];
    this.toolCalls = [];
    this.toolResults = [];
    this.allMessages = [];
    
    // Wait for session to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Send first message
    await this.sendMessage(messages[0]);
    
    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Send follow-up messages if any
    for (let i = 1; i < messages.length; i++) {
      await this.sendMessage(messages[i]);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Wait for final responses
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Save results
    await this.saveResults();
  }

  async sendMessage(text) {
    console.log(`\n👤 User: "${text}"`);
    
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }]
      }
    }));
    
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `detailed_response_${this.currentTest.name.replace(/\s+/g, '_').toLowerCase()}_${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'tests', filename);
    
    const results = {
      test: this.currentTest,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      responses: this.responses,
      toolCalls: this.toolCalls,
      toolResults: this.toolResults,
      allMessages: this.allMessages,
      analysis: {
        totalResponses: this.responses.length,
        totalToolCalls: this.toolCalls.length,
        toolsUsed: [...new Set(this.toolCalls.map(tc => tc.name))],
        responseTexts: this.responses.map(r => r.text)
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    
    console.log(`\n📊 Test Results for ${this.currentTest.name}:`);
    console.log(`   Responses: ${this.responses.length}`);
    console.log(`   Tool Calls: ${this.toolCalls.length}`);
    console.log(`   Tools Used: ${results.analysis.toolsUsed.join(', ') || 'None'}`);
    console.log(`   Results saved to: ${filename}`);
    
    return results;
  }

  async runAllTests() {
    console.log('🚀 Starting Detailed Response Testing');
    console.log('=' .repeat(60));
    
    try {
      await this.connect();
      
      // Wait for session to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Test 1: Hawaiian Pizza Order
      await this.runTest('Hawaiian Pizza Order', [
        "I'd like to order a Hawaiian pizza",
        "Large please",
        "Pickup"
      ]);
      
      // Test 2: Location Lookup
      await this.runTest('Location Lookup', [
        "What's the nearest location to me?",
        "I'm at 123 Main Street, Toronto, ON"
      ]);
      
      // Test 3: Menu Search
      await this.runTest('Menu Search', [
        "Do you have vegetarian options?",
        "What about Caesar salad?"
      ]);
      
      // Test 4: Knowledge Base
      await this.runTest('Knowledge Base Query', [
        "What are your opening hours?",
        "Do you have any deals?"
      ]);
      
      console.log('\n🎉 All detailed response tests completed!');
      console.log('📁 Check the tests/ folder for detailed JSON reports');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }
}

// Run detailed response tests
const tester = new DetailedResponseTester();
tester.runAllTests().catch(console.error);
