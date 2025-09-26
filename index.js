import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import { APP_CONFIG } from './config/config.js';
import { register } from './services/metrics.js';
import { createTwimlResponse } from './utils/utils.js';
import { createWebSocketHandler } from './handlers/websocket.js';

// =====================
// Application Setup
// =====================

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// =====================
// Routes
// =====================

// Health check endpoint
fastify.get('/', async (request, reply) => {
  reply.send({ message: 'Twilio Media Stream Server is running!' });
});

// Prometheus metrics endpoint
fastify.get('/metrics', async (req, reply) => {
  reply.type(register.contentType).send(await register.metrics());
});

// Route for Twilio to handle incoming and outgoing calls
// Direct connection to Laura agent - no pre-recorded greeting
fastify.all('/incoming-call', async (request, reply) => {
  const twimlResponse = createTwimlResponse(request.headers.host);
  reply.type('text/xml').send(twimlResponse);
});

// =====================
// WebSocket route for media-stream
// =====================
fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    createWebSocketHandler(connection);
  });
});

// =====================
// Start server
// =====================
fastify.listen({ port: APP_CONFIG.PORT, host: APP_CONFIG.HOST }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Server is listening on port ${APP_CONFIG.PORT}`);
});