import { register } from './metrics.js';
import { createMediaStreamHandler } from './handlers/mediaStream.js';

// =====================
// Routes
// =====================
export function setupRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    reply.send({ message: 'Twilio Media Stream Server is running!' });
  });

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    reply.type(register.contentType).send(await register.metrics());
  });

  // Route for Twilio to handle incoming and outgoing calls
  // Direct connection to Laura agent - no pre-recorded greeting
  fastify.all('/incoming-calls', async (request, reply) => {
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Connect>
</Response>`;

    reply.type('text/xml').send(twimlResponse);
  });

  // WebSocket route for media-stream
  fastify.register(async (fastify) => {
    fastify.get('/media-stream', { websocket: true }, createMediaStreamHandler());
  });
}