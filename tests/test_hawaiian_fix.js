#!/usr/bin/env node

/**
 * Focused test for the Hawaiian pizza fix
 * Tests the exact scenario that was failing before
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

class HawaiianFixTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.responses = [];
    this.toolCalls = [];
    this.toolResults = [];
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
      
      switch (response.type) {
        case 'session.created':
          this.sessionId = response.session.id;
          console.log(`📋 Session created: ${this.sessionId}`);
          this.updateSession();
          break;
          
        case 'session.updated':
          console.log('📋 Session updated - Starting Hawaiian pizza test');
          setTimeout(() => this.startTest(), 1000);
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
          if (response.delta) {
            process.stdout.write(response.delta);
          }
          break;
          
        case 'response.output_text.done':
          console.log('\n');
          break;
          
        case 'response.done':
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
          
          // Check if Hawaiian pizza was found
          const hawaiian = result.items.find(item => item.id === 'gourmet-hawaiian');
          if (hawaiian) {
            console.log(`✅ SUCCESS: Hawaiian pizza found!`);
            console.log(`   Name: ${hawaiian.name}`);
            console.log(`   Details: ${hawaiian.details}`);
          } else {
            console.log(`❌ FAILED: Hawaiian pizza not found`);
            console.log(`   Found items: ${result.items.map(i => i.name).join(', ')}`);
          }
          break;
        case 'getKbSnippet':
          result = { ok: true, data: getKbSnippet(args) };
          break;
        case 'findNearestStore':
          const { lat, lon, address } = args;
          let finalLat = lat, finalLon = lon;
          
          if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
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

  async startTest() {
    console.log('\n🧪 Testing Hawaiian Pizza Fix');
    console.log('=' .repeat(50));
    console.log('📝 This test verifies that "Hawaiian pizza" correctly finds the Hawaiian gourmet pizza');
    
    // Wait for initial greeting
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send the exact message that was failing
    await this.sendMessage("I'd like to order a Hawaiian pizza");
    
    // Wait for response and tool call
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Send follow-up
    await this.sendMessage("Large please");
    
    // Wait for final response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Analyze results
    this.analyzeResults();
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

  analyzeResults() {
    console.log('\n📊 Test Analysis:');
    console.log('=' .repeat(30));
    
    // Check if getMenuItems was called
    const menuToolCall = this.toolCalls.find(tc => tc.name === 'getMenuItems');
    if (menuToolCall) {
      console.log('✅ getMenuItems tool was called');
      console.log(`   Arguments: ${menuToolCall.arguments}`);
      
      // Check if Hawaiian pizza was found
      const menuResult = this.toolResults.find(tr => tr.tool === 'getMenuItems');
      if (menuResult && menuResult.result.items) {
        const hawaiian = menuResult.result.items.find(item => item.id === 'gourmet-hawaiian');
        if (hawaiian) {
          console.log('✅ Hawaiian pizza was found in results');
          console.log(`   Name: ${hawaiian.name}`);
          console.log(`   Details: ${hawaiian.details}`);
        } else {
          console.log('❌ Hawaiian pizza was NOT found in results');
          console.log(`   Found items: ${menuResult.result.items.map(i => i.name).join(', ')}`);
        }
      }
    } else {
      console.log('❌ getMenuItems tool was NOT called');
    }
    
    // Check Laura's responses
    console.log(`\n📝 Laura's responses (${this.responses.length}):`);
    this.responses.forEach((response, index) => {
      console.log(`   ${index + 1}. "${response.text}"`);
    });
    
    // Check if Laura mentioned Hawaiian pizza
    const allResponses = this.responses.map(r => r.text).join(' ').toLowerCase();
    if (allResponses.includes('hawaiian')) {
      console.log('✅ Laura mentioned "Hawaiian" in her responses');
    } else {
      console.log('❌ Laura did NOT mention "Hawaiian" in her responses');
    }
    
    // Overall assessment
    const success = menuToolCall && 
                   this.toolResults.find(tr => tr.tool === 'getMenuItems')?.result?.items?.find(item => item.id === 'gourmet-hawaiian') &&
                   allResponses.includes('hawaiian');
    
    console.log(`\n🎯 Overall Result: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
    
    if (success) {
      console.log('🎉 The Hawaiian pizza fix is working correctly!');
    } else {
      console.log('🔧 The Hawaiian pizza fix needs more work.');
    }
    
    // Save results
    this.saveResults(success);
  }

  saveResults(success) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hawaiian_fix_test_${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'tests', filename);
    
    const results = {
      test: 'Hawaiian Pizza Fix',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      success: success,
      responses: this.responses,
      toolCalls: this.toolCalls,
      toolResults: this.toolResults,
      analysis: {
        menuToolCalled: this.toolCalls.some(tc => tc.name === 'getMenuItems'),
        hawaiianFound: this.toolResults.some(tr => 
          tr.tool === 'getMenuItems' && 
          tr.result?.items?.some(item => item.id === 'gourmet-hawaiian')
        ),
        hawaiianMentioned: this.responses.some(r => 
          r.text.toLowerCase().includes('hawaiian')
        )
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${filename}`);
  }

  async run() {
    console.log('🚀 Starting Hawaiian Pizza Fix Test');
    console.log('=' .repeat(60));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      process.exit(1);
    }
  }
}

// Run the test
const tester = new HawaiianFixTester();
tester.run().catch(console.error);
