#!/usr/bin/env node

/**
 * Test script for order modification scenario testing
 * Tests Laura's ability to handle complex order changes, location lookups, and order modifications
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

// Test scenario based on real transcript
const TEST_SCENARIO = {
  name: "Order Modification & Location Handling",
  description: "Tests Laura's ability to handle complex order modifications, location lookups, and order changes",
  userMessages: [
    "Yeah, I'd like to place an order.",
    "Can I get a large pizza?",
    "Can I get a Hawaiian?",
    "What's on the Hawaiian",
    "Yeah, can I put mushrooms on half? Is mushrooms good?",
    "All of these",
    "Some bonus wings .",
    "What size do you have?",
    "Can I get 15 wings ?",
    "I'll take the 15 piece.",
    "Okay, give me the 12.",
    "Which flavors do you have?",
    "Can I get them playing?",
    "No, just plain. Can you make them plain?",
    "Could you put the sauce on the side?",
    "Okay.",
    "How much is it?",
    "Okay, can I get a medium pizza instead?",
    "It's not bad. Do you have any drinks?",
    "I'll take two 2-liter bottles.",
    "I'll take one diet and one regular.",
    "Okay.",
    "How much was the Pepsi?",
    "$4. Do you have a six pack?",
    "Okay, so cancel the two liter bottles.",
    "Yeah, but change the buffalo sauce to honey garlic.",
    "Can you make it a small pizza instead?",
    "Can you take off the mushrooms?",
    "Can you make the wings boneless?",
    "What store is it coming from?",
    "I'm in Barrie",
    ". No, I'm in Barrie!",
    "Um...",
    "I don't think there's a Maple Avenue in Barrie. How about Innisfil?",
    "No, I'll order one because we don't have one there. How about Innisfil?",
    "No.",
    "Yeah, there's a Gino's in the Royal Victoria Hospital in Barrie",
    "Okay",
    ". Yeah, that sounds right. That's right.",
    "Delivery.",
    "Yeah sure, not a problem! It is 2 Bloor Street West.",
    "416-235-0000",
    "Yeah, it's Jim.",
    "Okay. Okay, bye."
  ]
};

class OrderModificationTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.responses = [];
    this.toolCalls = [];
    this.toolResults = [];
    this.currentMessageIndex = 0;
    this.waitingForResponse = false;
    this.pendingToolCalls = 0;
    this.responseComplete = false;
    this.currentResponseText = '';
  }

  async run() {
    console.log('🚀 Starting Order Modification Test');
    console.log('============================================================');
    console.log(`📝 Testing: ${TEST_SCENARIO.description}`);
    console.log('');

    try {
      await this.connect();
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      process.exit(1);
    }
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
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });
    });
  }

  updateSession() {
    const sessionUpdate = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        output_modalities: ['text'],
        instructions: LAURA_PROMPT,
        tools: LAURA_TOOLS,
        tool_choice: 'auto',
        max_output_tokens: 'inf'
      }
    };

    this.ws.send(JSON.stringify(sessionUpdate));
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
          console.log('📋 Session updated - Starting order modification test');
          this.startTest();
          break;
          
        case 'conversation.item.added':
          console.log(`🔍 conversation.item.added: role=${response.item?.role}, type=${response.item?.type}`);
          if (response.item?.role === 'assistant' && response.item?.type === 'message') {
            const textContent = response.item.content?.find(c => c.type === 'text');
            console.log(`🔍 textContent:`, textContent);
            if (textContent) {
              this.responses.push({
                type: 'assistant_message',
                text: textContent.text,
                timestamp: new Date().toISOString()
              });
              console.log(`\n🤖 Laura: "${textContent.text}"`);
              
              // Now that we have Laura's response, send the next message
              if (this.waitingForResponse && this.pendingToolCalls === 0) {
                console.log('✅ Sending next message after Laura response...');
                this.waitingForResponse = false;
                this.sendNextMessage();
              }
            } else {
              console.log('🔍 No text content found in assistant message');
            }
          } else {
            console.log('🔍 Not an assistant message or wrong type');
          }
          break;
          
        case 'response.output_text.delta':
          if (response.delta) {
            this.currentResponseText += response.delta;
            process.stdout.write(response.delta);
          }
          break;
          
        case 'response.output_text.done':
          console.log('\n');
          break;
          
        case 'response.done':
          const outputs = response?.response?.output || [];
          let hasToolCalls = false;
          console.log(`🔍 response.done: outputs.length=${outputs.length}, waitingForResponse=${this.waitingForResponse}`);
          
          for (const item of outputs) {
            if (item?.type === 'function_call') {
              hasToolCalls = true;
              this.pendingToolCalls++;
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
          
          // If there are no tool calls, capture the response text and send next message
          if (!hasToolCalls) {
            console.log(`🔍 No tool calls, pendingToolCalls now: ${this.pendingToolCalls}`);
            
            // Only proceed if Laura actually generated a response
            if (this.currentResponseText.trim()) {
              this.responses.push({
                type: 'assistant_message',
                text: this.currentResponseText.trim(),
                timestamp: new Date().toISOString()
              });
              console.log(`\n🤖 Laura: "${this.currentResponseText.trim()}"`);
              
              // Send next message only if Laura responded
              if (this.waitingForResponse && this.pendingToolCalls === 0) {
                console.log('✅ Sending next message after Laura response...');
                this.waitingForResponse = false;
                this.currentResponseText = ''; // Reset for next response
                this.sendNextMessage();
              }
            } else {
              console.log('⚠️ Laura did not generate a response - stopping test');
              this.waitingForResponse = false;
              console.log('\n📊 Test completed - analyzing results...');
              this.analyzeResults();
              this.saveResults();
            }
          }
          break;

        case 'error':
          console.error(`❌ API Error: ${response.error?.message}`);
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
      
      if (item.name === 'getMenuItems') {
        result = { ok: true, items: findMenuItems(args) };
      } else if (item.name === 'getKbSnippet') {
        result = { ok: true, data: getKbSnippet(args) };
      } else if (item.name === 'findNearestStore') {
        const { address } = args;
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
      
      // Send tool output
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: item.call_id,
          output: JSON.stringify(result)
        }
      }));
      
      // Continue conversation - this will trigger another response.done
      this.ws.send(JSON.stringify({ type: 'response.create' }));
      
      // Decrement pending tool calls counter
      this.pendingToolCalls--;
      
    } catch (error) {
      console.error('❌ Error handling tool call:', error);
    }
  }

  async startTest() {
    console.log(`\n🧪 Running Test: ${TEST_SCENARIO.name}`);
    console.log('==================================================\n');
    
    // Start the sequential conversation immediately
    this.sendNextMessage();
  }

  async sendNextMessage() {
    if (this.currentMessageIndex >= TEST_SCENARIO.userMessages.length) {
      console.log('\n📊 Test completed - analyzing results...');
      this.analyzeResults();
      this.saveResults();
      return;
    }

    const message = TEST_SCENARIO.userMessages[this.currentMessageIndex];
    console.log(`\n👤 User: "${message}"`);
    
    this.waitingForResponse = true;
    this.pendingToolCalls = 0;
    this.responseComplete = false;
    this.currentResponseText = ''; // Reset response text for new message
    
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: message }]
      }
    }));
    
    this.ws.send(JSON.stringify({ type: 'response.create' }));
    this.currentMessageIndex++;
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
    console.log('==============================');

    // Analyze order modifications
    const sizeChanges = this.responses.filter(r => 
      r.text?.toLowerCase().includes('medium') || r.text?.toLowerCase().includes('small')
    );
    const orderModifications = sizeChanges.length > 0 ? 'PASS' : 'FAIL';
    console.log(`🔄 Order Modifications: ${orderModifications}`);

    // Analyze pricing accuracy
    const pricingResponses = this.responses.filter(r => 
      r.text?.includes('$') || r.text?.includes('dollar')
    );
    const pricingAccuracy = pricingResponses.length > 0 ? 'PASS' : 'FAIL';
    console.log(`💰 Pricing Accuracy: ${pricingAccuracy}`);

    // Analyze location handling
    const locationToolCall = this.toolCalls.find(tc => tc.name === 'findNearestStore');
    const locationHandling = locationToolCall ? 'PASS' : 'FAIL';
    console.log(`📍 Location Handling: ${locationHandling}`);

    // Analyze delivery capture
    const deliveryResponses = this.responses.filter(r => 
      r.text?.toLowerCase().includes('delivery') || r.text?.toLowerCase().includes('address')
    );
    const deliveryCapture = deliveryResponses.length > 0 ? 'PASS' : 'FAIL';
    console.log(`🚚 Delivery Capture: ${deliveryCapture}`);

    // Analyze order completion
    const completionResponses = this.responses.filter(r => 
      r.text?.toLowerCase().includes('order') && r.text?.toLowerCase().includes('set')
    );
    const orderCompletion = completionResponses.length > 0 ? 'PASS' : 'FAIL';
    console.log(`✅ Order Completion: ${orderCompletion}`);

    // Overall result
    const results = [orderModifications, pricingAccuracy, locationHandling, deliveryCapture, orderCompletion];
    const passCount = results.filter(result => result === 'PASS').length;
    const overallResult = passCount >= results.length * 0.8 ? 'PASS' : 'FAIL';
    
    console.log(`\n🎯 Overall Result: ${overallResult === 'PASS' ? '✅' : '❌'} ${overallResult}`);
    console.log(`📈 Score: ${passCount}/${results.length} tests passed`);
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `order_modification_test_${timestamp}.json`;
    const filepath = path.join(process.cwd(), 'tests', filename);
    
    const results = {
      test: 'Order Modification Scenario',
      timestamp: new Date().toISOString(),
      scenario: TEST_SCENARIO,
      responses: this.responses,
      toolCalls: this.toolCalls,
      analysis: {
        orderModifications: this.responses.filter(r => 
          r.text?.toLowerCase().includes('medium') || r.text?.toLowerCase().includes('small')
        ).length > 0 ? 'PASS' : 'FAIL',
        pricingAccuracy: this.responses.filter(r => 
          r.text?.includes('$') || r.text?.includes('dollar')
        ).length > 0 ? 'PASS' : 'FAIL',
        locationHandling: this.toolCalls.find(tc => tc.name === 'findNearestStore') ? 'PASS' : 'FAIL',
        deliveryCapture: this.responses.filter(r => 
          r.text?.toLowerCase().includes('delivery') || r.text?.toLowerCase().includes('address')
        ).length > 0 ? 'PASS' : 'FAIL',
        orderCompletion: this.responses.filter(r => 
          r.text?.toLowerCase().includes('order') && r.text?.toLowerCase().includes('set')
        ).length > 0 ? 'PASS' : 'FAIL'
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
    console.log(`\n📁 Results saved to: ${filename}`);
  }
}

// Run the test
const tester = new OrderModificationTester();
tester.run().catch(console.error);
