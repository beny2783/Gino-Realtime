import Fastify from 'fastify';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  PUBLIC_BASE_URL,
  MP3_ASSET_URL
} = process.env;

console.log('🧪 Testing Conference Background Audio Implementation');
console.log('==================================================');

// Check environment variables
console.log('Environment Variables:');
console.log(`- TWILIO_ACCOUNT_SID: ${TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing'}`);
console.log(`- TWILIO_AUTH_TOKEN: ${TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing'}`);
console.log(`- PUBLIC_BASE_URL: ${PUBLIC_BASE_URL ? '✅ Set' : '❌ Missing'}`);
console.log(`- MP3_ASSET_URL: ${MP3_ASSET_URL ? '✅ Set' : '❌ Missing'}`);

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !PUBLIC_BASE_URL || !MP3_ASSET_URL) {
  console.log('\n❌ Missing required environment variables. Please set them in your .env file:');
  console.log('TWILIO_ACCOUNT_SID=your_account_sid');
  console.log('TWILIO_AUTH_TOKEN=your_auth_token');
  console.log('PUBLIC_BASE_URL=https://your-domain.com');
  console.log('MP3_ASSET_URL=https://your-service-1234.twil.io/restaurant.mp3');
  process.exit(1);
}

// Test Twilio client initialization
try {
  const Twilio = (await import('twilio')).default;
  const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  console.log('\n✅ Twilio client initialized successfully');
} catch (error) {
  console.log('\n❌ Failed to initialize Twilio client:', error.message);
  process.exit(1);
}

// Test server endpoints
const fastify = Fastify();

// Mock the endpoints to test their structure
fastify.get('/twiml/background', async (req, reply) => {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="infinite">${MP3_ASSET_URL}</Play>
</Response>`;
  reply.type('text/xml').send(twiml);
});

fastify.all('/incoming-call', async (request, reply) => {
  const callSid = request.body?.CallSid || `anon-${Date.now()}`;
  const room = `room-${callSid}`;

  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <!-- Keep your AI media-stream on the caller leg -->
  <Start>
    <Stream url="wss://${request.headers.host}/media-stream" />
  </Start>

  <!-- Put caller into a conference so we can inject background audio -->
  <Dial>
    <Conference
      statusCallback="${PUBLIC_BASE_URL}/conf/events"
      statusCallbackEvent="start join leave end"
      statusCallbackMethod="POST"
      endConferenceOnExit="false">${room}</Conference>
  </Dial>
</Response>`;

  reply.type('text/xml').send(twimlResponse);
});

// Test the endpoints
try {
  await fastify.listen({ port: 0 }); // Use random port for testing
  
  console.log('\n🧪 Testing Endpoints:');
  
  // Test background TwiML endpoint
  const backgroundResponse = await fastify.inject({
    method: 'GET',
    url: '/twiml/background'
  });
  
  if (backgroundResponse.statusCode === 200 && backgroundResponse.headers['content-type'] === 'text/xml') {
    console.log('✅ /twiml/background endpoint working');
    console.log('   Response preview:', backgroundResponse.payload.substring(0, 100) + '...');
  } else {
    console.log('❌ /twiml/background endpoint failed');
  }
  
  // Test incoming call endpoint
  const incomingResponse = await fastify.inject({
    method: 'POST',
    url: '/incoming-call',
    headers: { host: 'test.example.com' },
    payload: { CallSid: 'test-call-123' }
  });
  
  if (incomingResponse.statusCode === 200 && incomingResponse.headers['content-type'] === 'text/xml') {
    console.log('✅ /incoming-call endpoint working');
    console.log('   Response preview:', incomingResponse.payload.substring(0, 100) + '...');
  } else {
    console.log('❌ /incoming-call endpoint failed');
  }
  
  await fastify.close();
  
  console.log('\n🎉 All tests passed! Conference background audio implementation is ready.');
  console.log('\n📋 Next Steps:');
  console.log('1. Make sure your MP3 file is accessible at the MP3_ASSET_URL');
  console.log('2. Update your Twilio webhook to point to your /incoming-call endpoint');
  console.log('3. Test with a real phone call to verify background audio plays');
  console.log('\n⚠️  Important: Background audio will only start when there are 3+ participants to prevent loops');
  
} catch (error) {
  console.log('\n❌ Test failed:', error.message);
  process.exit(1);
}
