/**
 * Simplified Gino's Pizza Voice AI Assistant
 * Main application entry point with basic functionality
 */

import Fastify from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import twilio from 'twilio';

// Basic configuration
const SERVER_CONFIG = {
  port: process.env.PORT || 8080,
  host: '0.0.0.0'
};

const TWILIO_CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID || 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authToken: process.env.TWILIO_AUTH_TOKEN || 'your_auth_token',
  phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+15005550006',
  isConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
};

// Background music configuration - using a longer audio file that won't cause looping issues
const BACKGROUND_MUSIC_URL = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav';

// Store for participant SIDs (in production, use Redis or database)
const participantStore = {};

// Setup Fastify
const app = Fastify({ logger: true });

// Register plugins
app.register(fastifyFormBody);
app.register(fastifyWs);

// Create Twilio client
const client = TWILIO_CONFIG.isConfigured ? twilio(TWILIO_CONFIG.accountSid, TWILIO_CONFIG.authToken) : null;

// Health check endpoint
app.get('/', async (request, reply) => {
  reply.send({ 
    message: 'Gino\'s Pizza Voice AI Assistant is running!',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    uptime: process.uptime()
  });
});

// Debug endpoint
app.get('/debug', async (request, reply) => {
  reply.send({
    twilioConfigured: TWILIO_CONFIG.isConfigured,
    accountSid: TWILIO_CONFIG.accountSid ? 'SET' : 'MISSING',
    authToken: TWILIO_CONFIG.authToken ? 'SET' : 'MISSING',
    phoneNumber: TWILIO_CONFIG.phoneNumber ? 'SET' : 'MISSING',
    clientExists: !!client,
    actualValues: {
      accountSid: TWILIO_CONFIG.accountSid,
      authToken: TWILIO_CONFIG.authToken ? '***' + TWILIO_CONFIG.authToken.slice(-4) : 'MISSING',
      phoneNumber: TWILIO_CONFIG.phoneNumber
    },
    environment: {
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING',
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING',
      TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ? 'SET' : 'MISSING'
    }
  });
});

// WebSocket route
app.register(async function (fastify) {
  fastify.get('/media-stream', { websocket: true }, (connection, req) => {
    console.log('WebSocket connection established');
    connection.socket.close();
  });
});

// Incoming call endpoint
app.post('/incoming-call', async (request, reply) => {
  if (!client) {
    app.log.error('❌ Twilio client not configured');
    reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Service temporarily unavailable. Please try again later.</Say><Hangup/></Response>');
    return;
  }
  
  const parentCallSid = request.body.CallSid;
  const conferenceName = `GinoRoom-${parentCallSid}`;
  const host = request.headers.host;
  
  app.log.info(`📞 Incoming call from ${parentCallSid}, conference: ${conferenceName}, host: ${host}`);
  
  // Conference-based TwiML response
  const cleanupUrl = `https://${host}/cleanup-conference`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" hangupOnExit="true" timeLimit="600" action="${cleanupUrl}" method="POST">${conferenceName}</Conference>
  </Dial>
</Response>`;

  // TODO: Add background music participant back later with proper approach
  // For now, just log that we would inject music
  app.log.info(`🎵 Would inject background music participant into conference: ${conferenceName} (disabled to prevent loops)`);

  reply.type('text/xml').send(twiml);
});

// Cleanup conference endpoint
app.post('/cleanup-conference', async (request, reply) => {
  const parentCallSid = request.body.CallSid;
  const conferenceName = `GinoRoom-${parentCallSid}`;
  
  app.log.info(`🧹 Conference cleanup requested for: ${conferenceName}`);
  
  // Clean up stored participants
  const participantSIDs = participantStore[conferenceName];
  if (participantSIDs && participantSIDs.length > 0) {
    app.log.info(`🧹 Cleaning up ${participantSIDs.length} participants: ${participantSIDs.join(', ')}`);
    
    // Terminate each participant
    for (const sid of participantSIDs) {
      try {
        await client.calls(sid).update({ status: 'completed' });
        app.log.info(`✅ Terminated participant: ${sid}`);
      } catch (err) {
        app.log.error(`❌ Error terminating participant ${sid}: ${err.message}`);
      }
    }
    
    // Remove from store
    delete participantStore[conferenceName];
    app.log.info(`✅ Cleaned up conference: ${conferenceName}`);
  } else {
    app.log.info(`ℹ️ No participants to clean up for conference: ${conferenceName}`);
  }
  
  reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
});

// Start server
const start = async () => {
  try {
    console.log(`🚀 Starting server on port ${SERVER_CONFIG.port} and host ${SERVER_CONFIG.host}`);
    
    await app.listen({ port: SERVER_CONFIG.port, host: SERVER_CONFIG.host });
    
    console.log(`✅ Server successfully started and listening on port ${SERVER_CONFIG.port}`);
    
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

start();
