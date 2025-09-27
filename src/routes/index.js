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
  const client = twilio(config.accountSid, config.authToken);

  // Health check endpoint
  fastify.get('/', async (request, reply) => {
    reply.send({ 
      message: 'Gino\'s Pizza Voice AI Assistant is running!',
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // 📞 Twilio webhook for incoming calls
  fastify.post('/incoming-call', async (request, reply) => {
    const parentCallSid = request.body.CallSid;
    const conferenceName = `GinoRoom-${parentCallSid}`;
    const host = request.headers.host;
    
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
      endConferenceOnExit: false, 
      // 💡 True ensures the caller's call leg is terminated when they hang up or timeLimit is reached
      hangupOnExit: true, 
      timeLimit: timeLimitInSeconds 
    }, conferenceName);

    const twimlResponse = dial.toString();

    // 2. Fire and forget: Immediately inject the AI and Music participants via REST API
    
    const websocketUrl = `wss://${host}/media-stream`;
    const aiTwiML = `<Response><Connect><Stream url="${websocketUrl}" /></Connect></Response>`;
    const musicTwiML = `<Response><Play loop="0">${BACKGROUND_MUSIC_URL}</Play></Response>`;
    
    // Array to store the SIDs of the injected participants for later cleanup
    const injectedSIDs = [];

    // a) Inject the AI Stream Participant
    const aiPromise = client.conferences(conferenceName).participants.create({
      from: config.phoneNumber,
      to: 'client:AI_STREAM', // Dummy endpoint
      twiml: aiTwiML
    }).then(participant => {
      injectedSIDs.push(participant.sid);
      fastify.log.info(`AI Participant created: ${participant.sid}`);
    }).catch(err => fastify.log.error('Error starting AI participant:', err.message));

    // b) Inject the Background Music Participant
    const musicPromise = client.conferences(conferenceName).participants.create({
      from: config.phoneNumber,
      to: 'client:MUSIC_BOT', // Dummy endpoint
      twiml: musicTwiML
    }).then(participant => {
      injectedSIDs.push(participant.sid);
      fastify.log.info(`Music Participant created: ${participant.sid}`);
    }).catch(err => fastify.log.error('Error starting Music participant:', err.message));

    // 3. Store the SIDs for the cleanup route
    Promise.all([aiPromise, musicPromise]).then(() => {
      participantStore[conferenceName] = injectedSIDs;
    }).catch(err => fastify.log.error('Failed to store SIDs for cleanup:', err.message));

    // 4. Send the initial TwiML response back to Twilio
    reply.type('text/xml').send(twimlResponse);
  });

  // 🧹 Endpoint to terminate the remaining participants after the caller disconnects.
  fastify.post('/cleanup-conference', async (request, reply) => {
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
    reply.type('text/xml').send('<Response><Hangup/></Response>');
  });
}
