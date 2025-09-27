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
import { setupRoutes } from './routes/index.js';
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
    createWebSocketConnection(connection, req);
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
    console.log(`🚀 Starting server on port ${SERVER_CONFIG.port} and host ${SERVER_CONFIG.host}`);
    
    // Start the server
    await app.listen({ port: SERVER_CONFIG.port, host: SERVER_CONFIG.host });
    
    // Log successful startup
    console.log(`✅ Server successfully started and listening on port ${SERVER_CONFIG.port}`);
    app.log.info(`Server listening on port ${app.server.address().port}`);
    
    // Log health check endpoint
    console.log(`🏥 Health check available at: http://localhost:${SERVER_CONFIG.port}/`);
    console.log(`📊 Metrics available at: http://localhost:${SERVER_CONFIG.port}/metrics`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${SERVER_CONFIG.port}/media-stream`);
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    app.log.error(err);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await app.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await app.close();
  process.exit(0);
});

start();
