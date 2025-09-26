#!/usr/bin/env node

/**
 * Test script for Gino's Pizza Realtime API
 * Tests the system programmatically without phone calls
 */

import WebSocket from 'ws';
import { config } from 'dotenv';
import { findMenuItems } from '../menu.js';
import { getKbSnippet } from '../kb.js';
import { nearestStore } from '../nearestStore.js';
import { geocodeAddress } from '../geocode.js';

config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOICE = 'alloy';

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment variables');
  process.exit(1);
}

// Test scenarios
const TEST_SCENARIOS = [
  {
    name: "Hawaiian Pizza Order",
    messages: [
      "Hello, I'd like to order a Hawaiian pizza",
      "Large please",
      "No extra toppings",
      "Pickup"
    ]
  },
  {
    name: "Location Lookup",
    messages: [
      "Hi, what's the nearest location to me?",
      "I'm at 123 Main Street, Toronto"
    ]
  },
  {
    name: "Menu Search",
    messages: [
      "Do you have any vegetarian options?",
      "What about Caesar salad?"
    ]
  },
  {
    name: "Knowledge Base Query",
    messages: [
      "What are your opening hours?",
      "Do you have any deals?"
    ]
  }
];

class RealtimeTester {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.conversationId = null;
    this.currentScenario = null;
    this.messageIndex = 0;
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
          this.startConversation();
          break;
          
        case 'conversation.item.created':
          if (response.item?.role === 'assistant' && response.item?.type === 'message') {
            const textContent = response.item.content?.find(c => c.type === 'text');
            if (textContent) {
              console.log(`🤖 Laura: "${textContent.text}"`);
              this.responses.push({
                type: 'assistant',
                text: textContent.text,
                timestamp: new Date().toISOString()
              });
            }
          }
          break;
          
        case 'response.done':
          // Check for function calls
          const outputs = response?.response?.output || [];
          for (const item of outputs) {
            if (item?.type === 'function_call') {
              console.log(`🔧 Tool call: ${item.name}(${item.arguments})`);
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
        instructions: `Role & Objective
You are Laura, the warm and enthusiastic virtual host for Gino's Pizza in Canada. Always role-play as Laura, speaking in first person ("I" / "we") as the caller's live assistant.

Your objective is to provide a seamless caller experience by taking and confirming orders, answering common questions using the Knowledge Base, and ensuring callers feel cared for. Success means the guest's order is captured clearly, they get accurate information, or they are smoothly transferred to a human when required.

Personality & Tone
Warm, conversational, personable, and welcoming.
Adapt to caller style: if caller gives short answers, simplify and move quickly; if caller gives detailed preferences, mirror their detail level.
Friendly but efficient — one question at a time.
Supportive and never impatient — politely re-ask missing details once.
Always speak in English and close with clarity so the guest knows what happens next.

## Length
- 2–3 sentences per turn.
## Pacing
- Deliver your audio response fast, but do not sound rushed.

Context
Use this Knowledge Base and Menu to answer questions accurately. Always use the tools to get current information.

Tools

transferToNumber: Connects caller to nearest store (based on postal code) or central helpline.

getMenuItems: ALWAYS call this for ANY menu item request. Use flexible search terms - "Hawaiian pizza" will find "Hawaiian" gourmet pizza. Examples: CALL getMenuItems({search: "Hawaiian pizza"}) or CALL getMenuItems({search: "Caesar salad"}) or CALL getMenuItems({kinds: ["salad"]}). Never respond with menu information without calling this tool first.

getKbSnippet: Example: CALL getKbSnippet({topic: "dietary"}). Returns knowledge base text. Use only the smallest topic/ids required.

findNearestStore: Given a Canadian address (postal code, street address, city, or landmark), return the nearest Ginos Pizza store. Example: CALL findNearestStore({address: "M5V 3A8"}) or CALL findNearestStore({address: "123 Main St, Toronto"}).

Venue
Name: Gino's Pizza (Multiple locations across Canada).

Opening Hours

Sunday–Thursday: 11:00 – 22:00

Friday–Saturday: 11:00 – 23:00
(Exact hours may vary by store — confirm when caller provides city or postal code.)

Knowledge Base Access
Menu Access:

Use getMenuItems with smallest filters possible.

Do not enumerate the whole menu; only present items the caller asked about.

For dietary restrictions, use dietary filter (vegan, vegetarian, gluten_free).

Always say "from $X" for prices.

KB Access:

Use getKbSnippet for catering prices, dietary info, offers, charity policy, hours, or pronunciations.

Always say "from $X" when reading prices.

For catering orders, always escalate after capturing provided details.

Instructions / Rules

NATURAL ORDERING FLOW — SMART, FLEXIBLE, EFFICIENT

Start with: "What would you like to order today?" Then gather only missing details.

If the caller states multiple details in one sentence (e.g., "Large pepperoni, well-done"), accept them together.

Use the logical sequence (item → size → toppings → quantity → sides/desserts → drinks → delivery/pickup details) as a fallback guide when details are missing, but prioritize caller-provided order and phrasing.

Offer sides/desserts/drinks once after main items: "Would you like any sides or drinks with that?"

Detect delivery vs. pickup from cues. If unclear, ask: "Pickup or delivery today?"

Corrections overwrite previous details without fuss.

Keep acknowledgements short ("Thanks", "Perfect") and avoid filler.

STRUCTURED CHECKS — MINIMAL CONFIRMATION

At the end, do one full order read-back (items, quantity, sides/drinks, delivery/pickup details).

DATA CAPTURE (when relevant to the order)

Do not validate format, but ensure both phone and email are provided.

PACE & CLARITY

Answer promptly and keep pace efficient.

Confirm absolute times in caller's local timezone when city/postal code is provided. Otherwise say "local store time."

Mention calorie counts only if asked.

Never invent information. If asked about unlisted items, explain politely and offer transfer.

Stay within Gino's Pizza context only.

SAFETY & ESCALATION

Immediate transfer if caller is upset, urgent, or asks for manager/staff.

If caller intent remains unclear after one clarifying question (e.g., "Could you please repeat that?"), escalate immediately.

Escalate if caller asks about catering, vouchers, gift cards, lost property, corporate/private hire, charity/raffle exceptions, or anything outside standard orders/menu.

For catering orders, capture details but always escalate for final confirmation.

Always reassure before transfer.

CONVERSATION FLOW

Entry: Greet warmly — "Hello, this is Laura at Gino's Pizza. How can I help today?"

Detect intent: order vs. general enquiry.

Ordering Path: Collect details naturally. For catering/large event → capture details, then transfer.

Finish: One full read-back

Knowledge Base Path: Answer directly using KB. If caller asks about catering, vouchers, or topics not in KB → transfer.

Exit:
• If order: confirm details, reassure next steps.
• If enquiry: close with "Thank you for calling Gino's Pizza, have a great day!"
• If transfer: short reassurance + handoff.

    
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
    - Use the returned store details immediately in your spoken response and continue the flow. Keep things moving.`,
        tools: [
          {
            type: 'function',
            name: 'getMenuItems',
            description: 'Query menu items by kind/dietary/search. Returns compact structured items for sizes, crusts, sauces, toppings, deals, gourmet pizzas, add-ons, salads, and dips.',
            parameters: {
              type: 'object',
              properties: {
                kinds: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['size', 'crust', 'sauce', 'topping', 'gourmet', 'deal', 'addon', 'salad', 'dip']
                  },
                  description: 'Filter by item kinds'
                },
                dietary: {
                  type: 'string',
                  enum: ['vegan', 'vegetarian', 'gluten_free'],
                  description: 'Filter by dietary restrictions'
                },
                search: {
                  type: 'string',
                  description: 'Free text search in name, details, category'
                },
                limit: {
                  type: 'integer',
                  description: 'Max results (default 12)'
                }
              }
            }
          },
          {
            type: 'function',
            name: 'getKbSnippet',
            description: 'Get knowledge base snippet by topic. Returns text content.',
            parameters: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  enum: ['dietary', 'offers', 'hours', 'catering_prices', 'pronunciations', 'charity_policy'],
                  description: 'Knowledge base topic'
                },
                ids: {
                  type: 'array',
                  items: {
                    type: 'string'
                  },
                  description: 'Specific IDs to filter (for catering_prices)'
                }
              },
              required: ['topic']
            }
          },
          {
            type: 'function',
            name: 'findNearestStore',
            description: 'Given a Canadian address (postal code, street address, city, or landmark), return the nearest Ginos Pizza store.',
            parameters: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  description: 'Canadian address in any format: postal code (L1Z 1Z2), street address (123 Main St, Toronto), city name (Toronto, ON), or landmark (CN Tower, Toronto).'
                }
              },
              required: ['address']
            }
          }
        ],
        tool_choice: 'auto',
        max_output_tokens: 'inf'
      }
    };
    
    this.ws.send(JSON.stringify(sessionUpdate));
  }

  startConversation() {
    console.log('🎯 Starting conversation...');
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  async sendMessage(text) {
    console.log(`👤 User: "${text}"`);
    
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

  async runScenario(scenario) {
    console.log(`\n🧪 Testing: ${scenario.name}`);
    console.log('=' .repeat(50));
    
    this.currentScenario = scenario;
    this.messageIndex = 0;
    this.responses = [];
    
    // Send first message
    await this.sendMessage(scenario.messages[0]);
    
    // Wait for response, then continue
    return new Promise((resolve) => {
      const checkNext = () => {
        if (this.messageIndex < scenario.messages.length - 1) {
          this.messageIndex++;
          setTimeout(async () => {
            await this.sendMessage(scenario.messages[this.messageIndex]);
            setTimeout(checkNext, 2000);
          }, 2000);
        } else {
          setTimeout(() => {
            console.log(`\n✅ Completed: ${scenario.name}`);
            console.log(`📊 Responses: ${this.responses.length}`);
            resolve();
          }, 3000);
        }
      };
      
      setTimeout(checkNext, 3000);
    });
  }

  async runAllTests() {
    console.log('🚀 Starting Gino\'s Pizza Realtime API Tests');
    console.log('=' .repeat(60));
    
    try {
      await this.connect();
      
      for (const scenario of TEST_SCENARIOS) {
        await this.runScenario(scenario);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      console.log('\n🎉 All tests completed!');
      
    } catch (error) {
      console.error('❌ Test failed:', error);
    } finally {
      if (this.ws) {
        this.ws.close();
      }
    }
  }
}

// Run tests
const tester = new RealtimeTester();
tester.runAllTests().catch(console.error);
