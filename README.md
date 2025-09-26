# Twilio Voice AI Assistant with OpenAI Realtime API

A real-time voice AI assistant built with Twilio Voice and OpenAI's Realtime API. This project creates an interactive voice experience where users can have natural conversations with an AI assistant over the phone.

## Features

- 🎙️ **Real-time Voice Interaction**: Powered by OpenAI's Realtime API
- 📞 **Phone Integration**: Uses Twilio Voice for telephony
- 🤖 **Personality-driven AI**: Bubbly assistant with dad jokes and owl jokes
- 🔄 **Low-latency Audio**: Optimized for natural conversation flow
- 🛠️ **Modern Node.js**: Built with Fastify and ES6 modules

## Setup

### Prerequisites

- Node.js (v16 or higher)
- Twilio account with Voice-enabled phone number
- OpenAI account with Realtime API access
- ngrok for local development

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd "Twillio OpenAI Realtime"
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your credentials:
```env
OPENAI_API_KEY=your_openai_api_key_here
GMAPS_KEY=your_google_maps_api_key_here
PORT=5050
```

### Running the Application

1. Start the server:
```bash
node index.js
```

2. In another terminal, start ngrok:
```bash
ngrok http 5050
```

3. Update your Twilio webhook URL to:
```
https://your-ngrok-url.ngrok-free.app/incoming-call
```

4. Call your Twilio phone number to test!

## Deployment to Google Cloud Run

### Prerequisites for Cloud Run Deployment

- Google Cloud SDK (`gcloud`) installed and authenticated
- Google Cloud project with billing enabled
- Docker installed (for local testing)

### Deploy to Cloud Run

1. **Build and push the Docker image:**
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/gino-realtime .
```

2. **Deploy to Cloud Run:**
```bash
gcloud run deploy gino-realtime \
  --image gcr.io/YOUR_PROJECT_ID/gino-realtime \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10
```

3. **Set environment variables:**
```bash
gcloud run services update gino-realtime \
  --region=us-central1 \
  --set-env-vars="OPENAI_API_KEY=your_actual_openai_key,GMAPS_KEY=your_actual_google_maps_key"
```

4. **Get your service URL:**
```bash
gcloud run services describe gino-realtime --region=us-central1 --format="value(status.url)"
```

### Required Environment Variables

The application requires these environment variables to be set in Cloud Run:

- **`OPENAI_API_KEY`** - Your OpenAI API key for the Realtime API
- **`GMAPS_KEY`** - Your Google Maps API key for geocoding functionality

### Optional Environment Variables

You can also configure Voice Activity Detection (VAD) settings:

- **`VAD_MODE`** - `'server'` or `'semantic'` (default: `'semantic'`)
- **`VAD_SILENCE_MS`** - Server VAD silence duration in ms (default: `'500'`)
- **`VAD_PREFIX_MS`** - Server VAD prefix padding in ms (default: `'80'`)
- **`VAD_THRESHOLD`** - Server VAD sensitivity 0.0-1.0 (default: `'0.5'`)
- **`VAD_EAGERNESS`** - Semantic VAD eagerness: `'low'`, `'medium'`, `'high'`, `'auto'` (default: `'high'`)
- **`VAD_SEMANTIC_ENABLED`** - Enable semantic VAD: `'true'` or `'false'` (default: `'false'`)

### Updating the Deployment

To update your deployment with new code:

1. **Rebuild and push:**
```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/gino-realtime .
```

2. **Redeploy:**
```bash
gcloud run deploy gino-realtime \
  --image gcr.io/YOUR_PROJECT_ID/gino-realtime \
  --region=us-central1
```

### Monitoring and Logs

- **View logs:**
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gino-realtime" --limit 50
```

- **Check service status:**
```bash
gcloud run services describe gino-realtime --region=us-central1
```

## Architecture

The application acts as a proxy between Twilio's Media Streams and OpenAI's Realtime API:

- **Twilio** handles the phone call and audio streaming
- **WebSocket Proxy** bridges Twilio and OpenAI audio data
- **OpenAI Realtime API** processes speech and generates responses
- **Audio Format Conversion** ensures compatibility (G.711 μ-law)

## Configuration

### AI Personality

Customize the AI assistant's personality by modifying the `SYSTEM_MESSAGE` in `index.js`:

```javascript
const SYSTEM_MESSAGE = 'Your custom personality prompt here...';
```

### Voice Settings

Adjust the voice and temperature:

```javascript
const VOICE = 'alloy'; // OpenAI voice options
const TEMPERATURE = 0.8; // Response randomness (0-1)
```

## API Endpoints

- `GET /` - Health check endpoint
- `POST /incoming-call` - Twilio webhook for incoming calls
- `WebSocket /media-stream` - Real-time audio streaming

## Troubleshooting

- **"Application error occurred"**: Check that your Twilio webhook URL matches your current ngrok URL
- **No audio**: Verify your OpenAI API key and Realtime API access
- **Connection issues**: Ensure ngrok is running and accessible

## Based On

This project is based on the [Twilio blog tutorial](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node) for building voice AI assistants.

## License

MIT License
