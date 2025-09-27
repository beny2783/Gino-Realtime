# Gino's Pizza Voice AI Assistant

A sophisticated voice AI assistant for Gino's Pizza built with Twilio Voice and OpenAI's Realtime API. This application provides natural, real-time voice interactions for pizza ordering and customer service.

## 🚀 Features

- 🎙️ **Real-time Voice Interaction**: Powered by OpenAI's Realtime API
- 📞 **Phone Integration**: Uses Twilio Voice for telephony
- 🤖 **Intelligent Assistant**: Laura, the warm and enthusiastic virtual host
- 🔄 **Low-latency Audio**: Optimized for natural conversation flow
- 🛠️ **Modular Architecture**: Clean, maintainable codebase
- 📊 **Performance Monitoring**: Prometheus metrics and detailed logging
- 🗺️ **Location Services**: Find nearest Gino's Pizza locations
- 🍕 **Menu Integration**: Comprehensive pizza menu and ordering system

## 📁 Project Structure

```
ginos-pizza-voice-ai/
├── src/                          # Source code
│   ├── ai/                       # AI configuration
│   │   └── laura.js             # Laura assistant config & tools
│   ├── config/                   # Configuration management
│   │   └── index.js             # Environment variables & constants
│   ├── metrics/                  # Performance monitoring
│   │   └── index.js             # Prometheus metrics setup
│   ├── routes/                   # HTTP routes
│   │   └── index.js             # Twilio webhooks & health checks
│   ├── tools/                    # Tool handling
│   │   └── index.js             # Centralized tool execution
│   ├── utils/                    # Utilities
│   │   ├── cache.js             # LRU caching implementation
│   │   └── logging.js           # Call logging system
│   ├── vad/                      # Voice Activity Detection
│   │   └── index.js             # VAD configuration
│   ├── websocket/                # WebSocket handling
│   │   └── connection.js        # Twilio-OpenAI connection management
│   └── index.js                  # Main application entry point
├── tests/                        # Test files
├── logs/                         # Call logs (auto-generated)
├── assets/                       # Static assets
├── Background_noise/             # Audio files
├── ginos_locations.json          # Store location data
├── menu.js                       # Menu database
├── kb.js                         # Knowledge base
├── nearestStore.js               # Location services
├── geocode.js                    # Address geocoding
├── package.json                  # Dependencies & scripts
├── Dockerfile                    # Container configuration
├── deploy.sh                     # Deployment script
└── README.md                     # This file
```

## 🛠️ Setup

### Prerequisites

- Node.js (v18 or higher)
- Twilio account with Voice-enabled phone number
- OpenAI account with Realtime API access
- Google Maps API key (for geocoding)
- ngrok for local development

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd ginos-pizza-voice-ai
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp env.example .env
   ```

4. **Configure environment variables:**
   ```env
   # Required
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Optional (with defaults)
   PORT=5050
   VAD_MODE=semantic
   VAD_EAGERNESS=high
   VAD_SEMANTIC_ENABLED=true
   
   # Google Maps (for geocoding)
   GMAPS_KEY=your_google_maps_api_key
   ```

### Running the Application

1. **Start the server:**
   ```bash
   npm start
   # or for development with auto-reload:
   npm run dev
   ```

2. **Start ngrok (in another terminal):**
   ```bash
   ngrok http 5050
   ```

3. **Configure Twilio webhook:**
   - Set your Twilio phone number webhook to:
   ```
   https://your-ngrok-url.ngrok-free.app/incoming-call
   ```

4. **Test the system:**
   - Call your Twilio phone number
   - You'll be connected to Laura, the AI assistant

## 🏗️ Architecture

### Modular Design

The application follows a clean, modular architecture:

- **Configuration**: Centralized environment and app configuration
- **AI Layer**: Laura assistant configuration and tools
- **WebSocket Layer**: Real-time audio streaming between Twilio and OpenAI
- **Tools Layer**: Centralized tool execution with caching
- **Metrics Layer**: Performance monitoring and analytics
- **Utilities**: Logging, caching, and helper functions

### Key Components

1. **Laura AI Assistant**: The voice personality with tools for:
   - Finding nearest stores
   - Menu item queries
   - Knowledge base lookups

2. **Voice Activity Detection**: Configurable VAD for natural conversation flow

3. **Performance Monitoring**: Comprehensive metrics for:
   - Response latency
   - Audio quality
   - System health

4. **Call Logging**: Detailed logs for debugging and analytics

## 🔧 Configuration

### Voice Activity Detection

Configure VAD behavior via environment variables:

```env
VAD_MODE=semantic          # 'semantic' or 'server'
VAD_EAGERNESS=high         # 'low', 'medium', 'high', 'auto'
VAD_SEMANTIC_ENABLED=true  # Enable semantic VAD
```

### Performance Tuning

Adjust performance settings in `src/config/index.js`:

```javascript
export const PERFORMANCE_CONFIG = {
  rttIntervalMs: 5000,           // RTT monitoring interval
  sessionUpdateDelayMs: 250,     // Session update delay
  initialGreetingDelayMs: 100    // Initial greeting delay
};
```

## 📊 Monitoring

### Metrics Endpoint

Access Prometheus metrics at:
```
http://localhost:5050/metrics
```

### Key Metrics

- `openai_ttfb_ms`: Time to first audio byte from OpenAI
- `e2e_reply_latency_ms`: End-to-end response latency
- `felt_latency_ms`: User-perceived latency
- `vad_cancellations_total`: VAD interruption count

### Call Logs

Detailed call logs are saved to `logs/` directory with:
- Conversation transcripts
- Tool call details
- Performance metrics
- Error tracking

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run integration tests only
npm run test:integration

# Run unit tests only
npm run test:unit
```

## 🚀 Deployment

### Docker Deployment

```bash
# Build the image
docker build -t ginos-pizza-voice-ai .

# Run the container
docker run -p 5050:5050 --env-file .env ginos-pizza-voice-ai
```

### Manual Deployment

```bash
# Deploy using the provided script
npm run deploy
```

## 🔍 Troubleshooting

### Common Issues

1. **"Application error occurred"**
   - Check that your Twilio webhook URL matches your current ngrok URL
   - Verify all environment variables are set correctly

2. **No audio response**
   - Verify your OpenAI API key and Realtime API access
   - Check the console logs for error messages

3. **Connection issues**
   - Ensure ngrok is running and accessible
   - Check firewall settings

4. **High latency**
   - Monitor the metrics endpoint for performance data
   - Adjust VAD settings for your use case

### Debug Mode

Enable detailed logging by setting the log level in `src/index.js`:

```javascript
const fastify = Fastify({
  logger: {
    level: 'debug'  // Change from 'info' to 'debug'
  }
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Twilio Voice](https://www.twilio.com/voice)
- Powered by [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)
- Web framework: [Fastify](https://www.fastify.io/)
- Monitoring: [Prometheus](https://prometheus.io/)

## 📞 Support

For support and questions:
- Create an issue in this repository
- Contact the development team
- Check the troubleshooting section above

---

**Made with ❤️ for Gino's Pizza**