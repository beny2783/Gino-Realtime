#!/usr/bin/env node

/**
 * Comprehensive test suite for Gino's Pizza Realtime API
 * Captures detailed model responses and performance metrics
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

// Comprehensive test scenarios
const TEST_SCENARIOS = [
  {
    id: 'hawaiian_pizza_order',
    name: 'Hawaiian Pizza Order',
    description: 'Test the Hawaiian pizza search fix',
    messages: [
      "I'd like to order a Hawaiian pizza",
      "Large please",
      "No extra toppings",
      "Pickup"
    ],
    expectedToolCalls: ['getMenuItems'],
    expectedKeywords: ['Hawaiian', 'Ham', 'Pineapple', 'Bacon']
  },
  {
    id: 'location_lookup',
    name: 'Location Lookup',
    description: 'Test store location finding',
    messages: [
      "What's the nearest location to me?",
      "I'm at 123 Main Street, Toronto, ON"
    ],
    expectedToolCalls: ['findNearestStore'],
    expectedKeywords: ['nearest', 'store', 'location']
  },
  {
    id: 'menu_search_general',
    name: 'General Menu Search',
    description: 'Test general menu queries',
    messages: [
      "What do you have?",
      "Do you have vegetarian options?"
    ],
    expectedToolCalls: ['getMenuItems'],
    expectedKeywords: ['vegetarian', 'options']
  },
  {
    id: 'knowledge_base_query',
    name: 'Knowledge Base Query',
    description: 'Test knowledge base access',
    messages: [
      "What are your opening hours?",
      "Do you have any deals?"
    ],
    expectedToolCalls: ['getKbSnippet'],
    expectedKeywords: ['hours', 'deals']
  },
  {
    id: 'complex_order',
    name: 'Complex Order',
    description: 'Test complex multi-item order',
    messages: [
      "I'd like a large pepperoni pizza and a Caesar salad",
      "Medium pizza is fine",
      "No extra toppings",
      "Pickup"
    ],
    expectedToolCalls: ['getMenuItems'],
    expectedKeywords: ['pepperoni', 'Caesar', 'salad']
  },
  {
    id: 'dietary_restrictions',
    name: 'Dietary Restrictions',
    description: 'Test dietary restriction handling',
    messages: [
      "I'm vegetarian, what can I order?",
      "Do you have gluten-free options?"
    ],
    expectedToolCalls: ['getMenuItems'],
    expectedKeywords: ['vegetarian', 'gluten-free']
  }
];

class ComprehensiveTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.currentScenario = null;
    this.messageIndex = 0;
    this.testResults = [];
    this.currentTestResult = null;
    this.startTime = null;
    this.toolCalls = [];
    this.responses = [];
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
          console.log('📋 Session updated');
          this.startNextScenario();
          break;
          
        case 'conversation.item.created':
          if (response.item?.role === 'assistant' && response.item?.type === 'message') {
            const textContent = response.item.content?.find(c => c.type === 'text');
            if (textContent) {
              this.responses.push({
                type: 'assistant',
                text: textContent.text,
                timestamp: new Date().toISOString()
              });
            }
          }
          break;
          
        case 'response.output_text.delta':
          // Capture streaming text
          if (response.delta) {
            // We'll capture the full response in response.done
          }
          break;
          
        case 'response.done':
          // Check for function calls
          const outputs = response?.response?.output || [];
          for (const item of outputs) {
            if (item?.type === 'function_call') {
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
          this.currentTestResult.errors = this.currentTestResult.errors || [];
          this.currentTestResult.errors.push(response.error);
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
      
      // Store tool result
      this.currentTestResult.toolResults = this.currentTestResult.toolResults || [];
      this.currentTestResult.toolResults.push({
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
      this.currentTestResult.errors = this.currentTestResult.errors || [];
      this.currentTestResult.errors.push({ type: 'tool_error', error: error.message });
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

  async startNextScenario() {
    if (this.currentScenario) {
      await this.completeCurrentScenario();
    }
    
    if (this.messageIndex >= TEST_SCENARIOS.length) {
      await this.generateReport();
      return;
    }
    
    this.currentScenario = TEST_SCENARIOS[this.messageIndex];
    this.currentTestResult = {
      scenario: this.currentScenario,
      startTime: new Date().toISOString(),
      messages: [],
      responses: [],
      toolCalls: [],
      toolResults: [],
      errors: [],
      performance: {}
    };
    
    console.log(`\n🧪 Testing: ${this.currentScenario.name}`);
    console.log(`📝 ${this.currentScenario.description}`);
    console.log('=' .repeat(60));
    
    this.startTime = Date.now();
    await this.sendMessage(this.currentScenario.messages[0]);
  }

  async sendMessage(text) {
    console.log(`👤 User: "${text}"`);
    
    this.currentTestResult.messages.push({
      text: text,
      timestamp: new Date().toISOString()
    });
    
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

  async completeCurrentScenario() {
    const endTime = Date.now();
    this.currentTestResult.endTime = new Date().toISOString();
    this.currentTestResult.performance.duration = endTime - this.startTime;
    this.currentTestResult.responses = this.responses;
    this.currentTestResult.toolCalls = this.toolCalls;
    
    // Analyze results
    this.analyzeScenario();
    
    this.testResults.push(this.currentTestResult);
    this.messageIndex++;
    this.responses = [];
    this.toolCalls = [];
    
    // Wait before next scenario
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  analyzeScenario() {
    const scenario = this.currentScenario;
    const result = this.currentTestResult;
    
    // Check if expected tool calls were made
    const expectedTools = scenario.expectedToolCalls || [];
    const actualTools = result.toolCalls.map(tc => tc.name);
    
    result.analysis = {
      expectedToolCalls: expectedTools,
      actualToolCalls: actualTools,
      toolCallMatch: expectedTools.every(tool => actualTools.includes(tool)),
      unexpectedToolCalls: actualTools.filter(tool => !expectedTools.includes(tool)),
      missingToolCalls: expectedTools.filter(tool => !actualTools.includes(tool))
    };
    
    // Check for expected keywords in responses
    const allResponses = result.responses.map(r => r.text).join(' ').toLowerCase();
    result.analysis.keywordMatches = scenario.expectedKeywords?.map(keyword => ({
      keyword,
      found: allResponses.includes(keyword.toLowerCase())
    })) || [];
    
    // Performance metrics
    result.analysis.performance = {
      totalDuration: result.performance.duration,
      averageResponseTime: result.performance.duration / (result.responses.length || 1),
      toolCallCount: result.toolCalls.length,
      responseCount: result.responses.length
    };
    
    // Print analysis
    console.log(`\n📊 Analysis for ${scenario.name}:`);
    console.log(`   Duration: ${result.performance.duration}ms`);
    console.log(`   Tool Calls: ${actualTools.join(', ') || 'None'}`);
    console.log(`   Expected Tools: ${expectedTools.join(', ') || 'None'}`);
    console.log(`   Tool Match: ${result.analysis.toolCallMatch ? '✅' : '❌'}`);
    
    if (result.analysis.keywordMatches.length > 0) {
      console.log(`   Keywords:`);
      result.analysis.keywordMatches.forEach(km => {
        console.log(`     ${km.keyword}: ${km.found ? '✅' : '❌'}`);
      });
    }
    
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.length}`);
    }
  }

  async generateReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(process.cwd(), 'tests', `test_report_${timestamp}.json`);
    
    const report = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      totalScenarios: TEST_SCENARIOS.length,
      results: this.testResults,
      summary: this.generateSummary()
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n🎉 Comprehensive Test Suite Completed!');
    console.log('=' .repeat(60));
    console.log(`📊 Total Scenarios: ${TEST_SCENARIOS.length}`);
    console.log(`✅ Successful: ${report.summary.successful}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`⏱️  Average Duration: ${report.summary.averageDuration}ms`);
    console.log(`🔧 Total Tool Calls: ${report.summary.totalToolCalls}`);
    console.log(`📝 Report saved to: ${reportPath}`);
    
    // Print detailed summary
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach((result, index) => {
      const scenario = result.scenario;
      const analysis = result.analysis;
      console.log(`\n${index + 1}. ${scenario.name}`);
      console.log(`   Status: ${analysis.toolCallMatch ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   Duration: ${result.performance.duration}ms`);
      console.log(`   Tool Calls: ${analysis.actualToolCalls.join(', ') || 'None'}`);
      
      if (analysis.keywordMatches.length > 0) {
        const keywordStatus = analysis.keywordMatches.every(km => km.found) ? '✅' : '❌';
        console.log(`   Keywords: ${keywordStatus}`);
      }
    });
  }

  generateSummary() {
    const successful = this.testResults.filter(r => r.analysis.toolCallMatch).length;
    const failed = this.testResults.length - successful;
    const totalDuration = this.testResults.reduce((sum, r) => sum + r.performance.duration, 0);
    const totalToolCalls = this.testResults.reduce((sum, r) => sum + r.toolCalls.length, 0);
    
    return {
      successful,
      failed,
      averageDuration: Math.round(totalDuration / this.testResults.length),
      totalToolCalls,
      successRate: Math.round((successful / this.testResults.length) * 100)
    };
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Gino\'s Pizza Test Suite');
    console.log('=' .repeat(60));
    console.log(`📋 Testing ${TEST_SCENARIOS.length} scenarios:`);
    TEST_SCENARIOS.forEach((scenario, index) => {
      console.log(`   ${index + 1}. ${scenario.name}`);
    });
    
    try {
      await this.connect();
    } catch (error) {
      console.error('❌ Failed to connect:', error);
      process.exit(1);
    }
  }
}

// Run comprehensive tests
const tester = new ComprehensiveTester();
tester.runAllTests().catch(console.error);
