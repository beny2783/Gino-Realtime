# Gino's Pizza Realtime API

> **🔄 Recently Refactored**: This codebase has been refactored for better maintainability and structure. See [REFACTOR_README.md](./REFACTOR_README.md) for details.

A real-time voice AI assistant built with Twilio Voice and OpenAI's Realtime API for Gino's Pizza. This project creates an interactive voice experience where customers can place orders and get information through natural conversations with Laura, the AI assistant.

## Features

- 🎙️ **Real-time Voice Interaction**: Powered by OpenAI's Realtime API
- 📞 **Phone Integration**: Uses Twilio Voice for telephony
- 🤖 **Laura AI Assistant**: Warm and enthusiastic virtual host for Gino's Pizza
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
PORT=5050
```

### Running the Application

1. Start the server:
```bash
npm start
# or for development with auto-reload:
npm run dev
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
- `GET /metrics` - Prometheus metrics endpoint
- `POST /incoming-call` - Twilio webhook for incoming calls
- `WebSocket /media-stream` - Real-time audio streaming

## Laura's Capabilities

Laura can help customers with:

- 🍕 **Menu Information**: Browse pizzas, toppings, deals, and more
- 📍 **Store Locations**: Find the nearest Gino's Pizza location
- 🛒 **Order Taking**: Natural conversation-based ordering
- ❓ **General Questions**: Hours, dietary options, special offers
- 📞 **Transfer Support**: Escalate to human staff when needed

## Troubleshooting

- **"Application error occurred"**: Check that your Twilio webhook URL matches your current ngrok URL
- **No audio**: Verify your OpenAI API key and Realtime API access
- **Connection issues**: Ensure ngrok is running and accessible

## Based On

This project is based on the [Twilio blog tutorial](https://www.twilio.com/en-us/blog/voice-ai-assistant-openai-realtime-api-node) for building voice AI assistants.

## License

MIT License
