#!/usr/bin/env node

/**
 * Interactive test script for Gino's Pizza Realtime API
 * Allows you to type messages and see responses in real-time
 */

import WebSocket from 'ws';
import { config } from 'dotenv';
import readline from 'readline';
import { findMenuItems } from '../menu.js';
import { getKbSnippet } from '../kb.js';
import { nearestStore } from '../nearestStore.js';
import { geocodeAddress } from '../geocode.js';
import { LAURA_PROMPT, LAURA_TOOLS } from '../index.js';

config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE = 'alloy';

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  process.exit(1);
}

class InteractiveTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
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
          console.log('📋 Session updated - Ready for messages!');
          // Trigger initial greeting
          setTimeout(() => {
            this.ws.send(JSON.stringify({ type: 'response.create' }));
          }, 100);
          break;
          
        case 'conversation.item.created':
          if (response.item?.role === 'assistant' && response.item?.type === 'message') {
            const textContent = response.item.content?.find(c => c.type === 'text');
            if (textContent) {
              console.log(`\n🤖 Laura: "${textContent.text}"`);
              setTimeout(() => this.promptUser(), 100);
            }
          }
          break;
          
        case 'response.output_text.delta':
          // Handle streaming text responses
          if (response.delta) {
            process.stdout.write(response.delta);
          }
          break;
          
        case 'response.output_text.done':
          // Text response is complete
          console.log('\n');
          setTimeout(() => this.promptUser(), 100);
          break;
          
        case 'response.done':
          // Check for function calls
          const outputs = response?.response?.output || [];
          for (const item of outputs) {
            if (item?.type === 'function_call') {
              console.log(`\n🔧 Tool call: ${item.name}(${item.arguments})`);
              this.handleToolCall(item);
            }
          }
          break;
          
        case 'error':
          console.error('❌ API Error:', response.error);
          setTimeout(() => this.promptUser(), 100);
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
          console.log(`📋 Menu search result:`, JSON.stringify(result, null, 2));
          break;
        case 'getKbSnippet':
          result = { ok: true, data: getKbSnippet(args) };
          console.log(`📚 KB result:`, JSON.stringify(result, null, 2));
          break;
        case 'findNearestStore':
          const { lat, lon, address } = args;
          let finalLat = lat, finalLon = lon;
          
          if ((typeof lat !== 'number' || typeof lon !== 'number') && address) {
            console.log(`🗺️  Geocoding address: ${address}`);
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
          console.log(`📍 Store lookup result:`, JSON.stringify(result, null, 2));
          break;
        default:
          result = { ok: false, reason: 'UnknownTool' };
      }
      
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

  promptUser() {
    if (this.rl.closed) {
      return;
    }
    
    this.rl.question('\n👤 You: ', async (input) => {
      if (input.toLowerCase() === 'quit' || input.toLowerCase() === 'exit') {
        console.log('👋 Goodbye!');
        this.rl.close();
        if (this.ws) {
          this.ws.close();
        }
        return;
      }
      
      if (input.trim()) {
        await this.sendMessage(input);
      } else {
        this.promptUser();
      }
    });
  }

  async sendMessage(text) {
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

  async start() {
    console.log('🚀 Starting Interactive Gino\'s Pizza Test');
    console.log('Type "quit" or "exit" to end the session');
    console.log('=' .repeat(50));
    
    try {
      await this.connect();
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      process.exit(1);
    }
  }
}

// Start interactive test
const tester = new InteractiveTester();
tester.start().catch(console.error);
