/**
 * Gino's Pizza Realtime API Server
 * Refactored for better maintainability and structure
 */

import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';

// Configuration
import { SERVER_CONFIG, LOGGING_CONFIG } from './config/index.js';

// Services
import { CallLogger } from './services/callLogger.js';
import { CacheService } from './services/cache.js';
import { ToolService } from './services/toolService.js';
import { ConnectionManager } from './services/connectionManager.js';

// Routes
import { healthCheck, metrics, incomingCall } from './routes/index.js';

// Initialize Fastify
const fastify = Fastify({
  logger: {
    level: 'info',
    prettyPrint: process.env.NODE_ENV !== 'production'
  }
});

// Register plugins
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// =====================
// Routes
// =====================

// Health check
fastify.get('/', healthCheck);

// Prometheus metrics
fastify.get('/metrics', metrics);

// Twilio webhook for incoming calls
fastify.all('/incoming-call', incomingCall);

// =====================
// WebSocket route for media-stream
// =====================

fastify.register(async (fastify) => {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('Client connected');

    // Initialize services
    const callLogger = new CallLogger();
    const cacheService = new CacheService();
    const toolService = new ToolService(cacheService);
    const connectionManager = new ConnectionManager(connection, callLogger, toolService);

    // Initialize the connection
    connectionManager.initializeOpenAI();
  });
});

// =====================
// Error handling
// =====================

fastify.setErrorHandler((error, request, reply) => {
  console.error('Server error:', error);
  reply.status(500).send({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// =====================
// Graceful shutdown
// =====================

const gracefulShutdown = async (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    await fastify.close();
    console.log('Server closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// =====================
// Start server
// =====================

const start = async () => {
  try {
    await fastify.listen({ 
      port: SERVER_CONFIG.PORT, 
      host: SERVER_CONFIG.HOST 
    });
    console.log(`🚀 Server is listening on port ${SERVER_CONFIG.PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();