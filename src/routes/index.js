/**
 * Route handlers for the Gino's Pizza Realtime API
 */

import { getMetrics } from '../services/metrics.js';

/**
 * Health check route
 * @param {Object} request - Fastify request object
 * @param {Object} reply - Fastify reply object
 */
export async function healthCheck(request, reply) {
  return reply.send({ 
    message: 'Twilio Media Stream Server is running!',
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
}

/**
 * Prometheus metrics route
 * @param {Object} request - Fastify request object
 * @param {Object} reply - Fastify reply object
 */
export async function metrics(request, reply) {
  try {
    const { contentType, data } = await getMetrics();
    return reply.type(contentType).send(data);
  } catch (error) {
    console.error('Error serving metrics:', error);
    return reply.status(500).send({ error: 'Failed to serve metrics' });
  }
}

/**
 * Incoming call route - handles Twilio webhook
 * @param {Object} request - Fastify request object
 * @param {Object} reply - Fastify reply object
 */
export async function incomingCall(request, reply) {
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Connect>
</Response>`;

  return reply.type('text/xml').send(twimlResponse);
}