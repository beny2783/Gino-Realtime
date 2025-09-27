/**
 * HTTP routes for the Gino's Pizza Voice AI Assistant
 * Handles Twilio webhooks and health checks
 */

import twilio from 'twilio';
import { TWILIO_CONFIG } from '../config/index.js';

const { VoiceResponse } = twilio.twiml;

// ⚠️ This is a temporary in-memory store. 
// For production, use Redis, Memcached, or a database.
export const participantStore = {}; 

// 🎧 Background music URL hosted on Twilio Assets
const BACKGROUND_MUSIC_URL = 'https://sangria-peacock-9774.twil.io/assets/background%20noise.mp3';

/**
 * Creates and configures all HTTP routes
 * @param {Object} fastify - Fastify instance
 * @param {Object} config - Application configuration (Twilio SID/Token)
 */
export function setupRoutes(fastify, config = TWILIO_CONFIG) {
  // Only create Twilio client if credentials are configured
  const client = config.isConfigured ? twilio(config.accountSid, config.authToken) : null;

  // Health check endpoint
  fastify.get('/', async (request, reply) => {
    reply.send({ 
      message: 'Gino\'s Pizza Voice AI Assistant is running!',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      uptime: process.uptime()
    });
  });

  // Debug endpoint to check configuration
  fastify.get('/debug', async (request, reply) => {
    reply.send({
      twilioConfigured: config.isConfigured,
      accountSid: config.accountSid ? 'SET' : 'MISSING',
      authToken: config.authToken ? 'SET' : 'MISSING',
      phoneNumber: config.phoneNumber ? 'SET' : 'MISSING',
      clientExists: !!client,
      actualValues: {
        accountSid: config.accountSid,
        authToken: config.authToken ? '***' + config.authToken.slice(-4) : 'MISSING',
        phoneNumber: config.phoneNumber
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'SET' : 'MISSING',
        TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING',
        TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER ? 'SET' : 'MISSING'
      }
    });
  });

  // 📞 Twilio webhook for incoming calls
  fastify.post('/incoming-call', async (request, reply) => {
    if (!client) {
      fastify.log.error('❌ Twilio client not configured');
      reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Service temporarily unavailable. Please try again later.</Say><Hangup/></Response>');
      return;
    }
    
    const parentCallSid = request.body.CallSid;
    const conferenceName = `GinoRoom-${parentCallSid}`;
    const host = request.headers.host;
    
    fastify.log.info(`📞 Incoming call from ${parentCallSid}, conference: ${conferenceName}, host: ${host}`);
    
    // Validate Twilio configuration
    if (!config.accountSid || !config.authToken || !config.phoneNumber) {
      fastify.log.error('❌ Incomplete Twilio configuration');
      reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Service configuration error. Please try again later.</Say><Hangup/></Response>');
      return;
    }
    
    // 1. TwiML for the main caller (places them into the conference)
    const cleanupUrl = `https://${host}/cleanup-conference`; 
    const timeLimitInSeconds = 600; // 10 minutes

    const dial = new VoiceResponse().dial({
      // Crucial: posts to /cleanup-conference when the caller's <Dial> finishes (hangs up or times out)
      action: cleanupUrl, 
      method: 'POST'
    });
    
    dial.conference({
      startConferenceOnEnter: true,
      // 💡 False allows conference to continue briefly if the AI/Music start first
      endConferenceOnExit: true, 
      // 💡 True ensures the caller's call leg is terminated when they hang up or timeLimit is reached
      hangupOnExit: true, 
      timeLimit: timeLimitInSeconds 
    }, conferenceName);

    const twimlResponse = dial.toString();

    // 2. Fire and forget: Immediately inject the AI and Music participants via REST API
    
    // Ensure we have the correct public URL for WebSocket
    const publicHost = host.includes('localhost') ? 'gino-realtime-644796342855.us-central1.run.app' : host;
    const websocketUrl = `wss://${publicHost}/media-stream`;
    const aiTwiML = `<Response><Connect><Stream url="${websocketUrl}" /></Connect></Response>`;
    const musicTwiML = `<Response><Play loop="0">${BACKGROUND_MUSIC_URL}</Play></Response>`;
    
    fastify.log.info(`WebSocket URL: ${websocketUrl}`);
    fastify.log.info(`Conference Name: ${conferenceName}`);
    
    // Array to store the SIDs of the injected participants for later cleanup
    const injectedSIDs = [];

    // a) Inject the AI Stream Participant
    const aiPromise = client.conferences(conferenceName).participants.create({
      from: config.phoneNumber,
      to: config.phoneNumber, // Use the same phone number as from
      twiml: aiTwiML
    }).then(participant => {
      injectedSIDs.push(participant.sid);
      fastify.log.info(`✅ AI Participant created: ${participant.sid}`);
    }).catch(err => {
      fastify.log.error(`❌ Error starting AI participant: ${err.message}`);
      fastify.log.error(`❌ AI Participant error details:`, err);
    });

    // b) Inject the Background Music Participant
    const musicPromise = client.conferences(conferenceName).participants.create({
      from: config.phoneNumber,
      to: config.phoneNumber, // Use the same phone number as from
      twiml: musicTwiML
    }).then(participant => {
      injectedSIDs.push(participant.sid);
      fastify.log.info(`✅ Music Participant created: ${participant.sid}`);
    }).catch(err => {
      fastify.log.error(`❌ Error starting Music participant: ${err.message}`);
      fastify.log.error(`❌ Music Participant error details:`, err);
    });

    // 3. Store the SIDs for the cleanup route
    Promise.all([aiPromise, musicPromise]).then(() => {
      participantStore[conferenceName] = injectedSIDs;
      fastify.log.info(`✅ Stored ${injectedSIDs.length} participant SIDs for cleanup`);
    }).catch(err => {
      fastify.log.error('❌ Failed to store SIDs for cleanup:', err.message);
      // Still store what we have
      participantStore[conferenceName] = injectedSIDs;
    });

    // 4. Send the initial TwiML response back to Twilio
    fastify.log.info(`📤 Sending TwiML response: ${twimlResponse}`);
    reply.type('text/xml').send(twimlResponse);
  });

  // 🧹 Endpoint to terminate the remaining participants after the caller disconnects.
  fastify.post('/cleanup-conference', async (request, reply) => {
    if (!client) {
      reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
      return;
    }
    
    const parentCallSid = request.body.CallSid;
    const conferenceName = `GinoRoom-${parentCallSid}`;

    const participantSIDs = participantStore[conferenceName] || [];

    // Terminate the remaining AI and Music participants
    for (const sid of participantSIDs) {
      try {
        // Forcefully terminate the call leg
        await client.calls(sid).update({ status: 'completed' });
        fastify.log.info(`Cleaned up participant: ${sid}`);
      } catch (err) {
        // This can fail if the participant already exited (e.g., stream closed)
        fastify.log.warn(`Could not terminate participant ${sid}: ${err.message}`);
      }
    }
    
    // Clean up the stored SIDs
    delete participantStore[conferenceName];

    // Send a final TwiML response
    reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  });
}
