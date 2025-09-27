/**
 * Gino's Pizza Voice AI Assistant
 * Main application entry point with modular architecture
 */

import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';

// Import configuration and modules
import { SERVER_CONFIG, TWILIO_CONFIG } from './config/index.js';
import { register } from './metrics/index.js';
import { setupRoutes, participantStore } from './routes/index.js';
import { createWebSocketConnection } from './websocket/connection.js';

// Setup Fastify
const app = Fastify({ logger: true });

// Register plugins
app.register(fastifyFormBody);
app.register(fastifyWs);

// Register routes, including the WebSocket handler
app.register(async function (server) {
  // 📡 WebSocket route for the Twilio Media Stream
  server.get('/media-stream', { websocket: true }, (connection, req) => {
    const ws = connection.socket;
    app.log.info('AI WebSocket connection established.');

    ws.on('message', (message) => {
      const data = JSON.parse(message);

      if (data.event === 'start') {
        app.log.info(`Stream started. StreamSid: ${data.streamSid}`);
        // 🚀 Send the first message to kick off the AI conversation (optional)
      }
      if (data.event === 'media') {
        // 🧠 Process inbound audio here (send to OpenAI API)
        // In a real application, the AI response audio would be sent back here.
        // console.log('Received audio chunk...'); 
      }
      if (data.event === 'stop') {
        app.log.info('Media Stream stopped.');
      }
    });

    ws.on('close', () => {
      app.log.info('AI WebSocket connection closed.');
      // 🧹 In a real app, ensure the parent call leg is terminated here if needed
    });
  });
  
  // Setup standard HTTP routes
  setupRoutes(server, TWILIO_CONFIG);
});

// Prometheus metrics endpoint
app.get('/metrics', async (req, reply) => {
  reply.type(register.contentType).send(await register.metrics());
});

/**
 * 🚀 Start the server
 */
const start = async () => {
  try {
    await app.listen({ port: SERVER_CONFIG.port, host: SERVER_CONFIG.host });
    app.log.info(`Server listening on port ${app.server.address().port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
