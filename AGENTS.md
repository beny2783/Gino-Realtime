# Agent Guidelines for Gino's Pizza Realtime Voice Assistant

## Build/Lint/Test Commands
- **Single test**: `node tests/<test_file>.js` (e.g., `node tests/test_simple.js`)
- **Realtime tests**: `node tests/test_realtime.js`
- **Start server**: `node src/index.js`
- **No linting configured**

## Twilio & OpenAI Integration

### Call Flow Architecture
1. **Incoming Call** (`/incoming-call`): Twilio hits this endpoint, server returns TwiML instructing Twilio to connect to WebSocket
2. **Media Streaming** (`/media-stream`): WebSocket connection established for bidirectional audio streaming
3. **Dual WebSocket Connections**: Server maintains separate WebSocket connections to both Twilio and OpenAI Realtime API

### Audio Pipeline
```
Phone Call → Twilio → WebSocket → Server → OpenAI Realtime API → Server → WebSocket → Twilio → Phone
```

### Response Delivery Files
- **`mediaStream.js`**: `connection.send(JSON.stringify(audioDelta))` - Main audio responses (what users hear)
- **`mediaStream.js`**: Timing markers for latency measurement and performance tracking
- **`mediaStream.js`**: Clear commands to stop audio during VAD interruptions

### Integration Points
- **TwiML**: XML response tells Twilio to stream audio to `/media-stream` WebSocket
- **WebSocket Events**: Handles Twilio events (`start`, `media`, `mark`, `clear`) and OpenAI events (`response.output_audio.delta`, etc.)
- **Real-time Audio**: PCMU format audio forwarded bidirectionally between Twilio and OpenAI
- **VAD Integration**: Voice activity detection triggers immediate audio buffer clearing for natural conversation flow

## Code Structure & Architecture

### Directory Structure
```
src/
├── index.js              # Main entry point - Fastify server setup and startup
├── config.js             # Configuration constants, environment variables, VAD settings
├── laura.js              # Tool handling logic with caching (findNearestStore, getMenuItems, getKbSnippet)
├── metrics.js            # Prometheus metrics setup and counters
├── utils.js              # Helper utilities (pretty, attachRttMeter)
├── routes.js             # HTTP route definitions (/incoming-calls, /metrics, /media-stream)
├── handlers/
│   └── mediaStream.js    # WebSocket handler for Twilio-OpenAI audio streaming
├── audio/
│   └── ffmpegMixer.js    # FFmpeg audio mixing for ambience + AI speech
└── logging/
    └── callLogger.js     # Call event logging and log file persistence
```

### Key Architectural Decisions
- **Modular Design**: Separated concerns into focused modules for maintainability
- **Audio Pipeline**: FFmpegMixer handles ambient noise mixing with configurable volume
- **Centralized Tool Handling**: All OpenAI function calls processed through laura.js with caching
- **Structured Logging**: CallLogger provides consistent event logging and file persistence
- **Metrics Integration**: Prometheus metrics track performance and audio statistics
- **WebSocket Abstraction**: Media streaming logic isolated for easier testing and modification

### Module Responsibilities
- **`index.js`**: Server lifecycle, Fastify setup, route registration
- **`config.js`**: Environment configuration, constants, VAD parameters
- **`laura.js`**: Business logic for menu/store/knowledge base queries with LRU caching
- **`metrics.js`**: Performance monitoring and audio statistics collection
- **`utils.js`**: Shared utilities and WebSocket helpers
- **`routes.js`**: HTTP endpoint definitions and WebSocket route setup
- **`mediaStream.js`**: Real-time audio streaming, OpenAI integration, call state management
- **`ffmpegMixer.js`**: Audio mixing pipeline (AI speech + ambient noise)
- **`callLogger.js`**: Event logging and call session persistence

## Code Style Guidelines
- **Imports**: ES6 modules, named imports, group by type (std lib → third-party → local)
- **Naming**: camelCase vars/functions, UPPER_SNAKE_CASE constants, kebab-case files
- **Formatting**: 2 spaces, no semicolons, single quotes, trailing commas, template literals
- **Structure**: Arrow functions, async/await, try/catch with descriptive errors, JSDoc comments
- **Best Practices**: Never log/commit secrets, use caching, structured logging, input validation, single responsibility