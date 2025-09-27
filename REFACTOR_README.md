# Gino's Pizza Realtime API - Refactored Structure

This document describes the refactored structure of the Gino's Pizza Realtime API, which has been reorganized for better maintainability, readability, and scalability while preserving all original functionality.

## 🏗️ New Structure

```
src/
├── config/
│   ├── index.js          # Main configuration (env vars, constants)
│   └── laura.js          # Laura AI agent configuration
├── services/
│   ├── callLogger.js     # Call logging and persistence
│   ├── cache.js          # LRU cache implementation
│   ├── connectionManager.js # WebSocket connection management
│   ├── metrics.js        # Prometheus metrics setup
│   └── toolService.js    # Tool call handling
├── routes/
│   └── index.js          # HTTP route handlers
├── utils/
│   └── index.js          # Utility functions
└── index.js              # Main application entry point
```

## 🔧 Key Improvements

### 1. **Modular Architecture**
- **Separation of Concerns**: Each module has a single responsibility
- **Dependency Injection**: Services are injected rather than tightly coupled
- **Clean Interfaces**: Well-defined APIs between modules

### 2. **Configuration Management**
- **Centralized Config**: All environment variables and constants in one place
- **Type Safety**: Proper validation of required environment variables
- **Environment-Specific**: Easy to manage different environments

### 3. **Service Layer**
- **CallLogger**: Handles all call logging and persistence
- **CacheService**: Manages LRU caches for performance
- **ToolService**: Centralized tool call execution
- **ConnectionManager**: WebSocket connection lifecycle management
- **MetricsService**: Prometheus metrics collection

### 4. **Error Handling**
- **Graceful Degradation**: Proper error handling throughout
- **Logging**: Comprehensive error logging
- **Recovery**: Automatic retry mechanisms where appropriate

### 5. **Performance Optimizations**
- **Caching**: LRU caches prevent memory leaks
- **Metrics**: Comprehensive performance monitoring
- **Efficient Data Structures**: Optimized for real-time performance

## 🚀 Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## 📊 Monitoring

The refactored application includes comprehensive metrics:

- **TTFB (Time to First Byte)**: OpenAI response latency
- **E2E Reply Latency**: End-to-end response time
- **Response Stream Duration**: Audio generation time
- **WebSocket RTT**: Connection latency
- **Felt Latency**: User-perceived latency
- **VAD Cancellations**: Voice activity detection metrics
- **Data Transfer**: Bytes in/out tracking

Access metrics at: `http://localhost:5050/metrics`

## 🔧 Configuration

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key

# Optional
PORT=5050
VAD_MODE=semantic
VAD_EAGERNESS=high
GMAPS_KEY=your_google_maps_key
```

### VAD Configuration

The application supports two VAD modes:

1. **Semantic VAD** (default): AI-powered voice detection
2. **Server VAD**: Traditional threshold-based detection

## 🏛️ Architecture Patterns

### 1. **Service Pattern**
Each service encapsulates related functionality:
- `CallLogger`: Logging and persistence
- `CacheService`: Caching operations
- `ToolService`: Tool execution
- `ConnectionManager`: WebSocket management

### 2. **Dependency Injection**
Services are injected rather than instantiated directly:
```javascript
const callLogger = new CallLogger();
const cacheService = new CacheService();
const toolService = new ToolService(cacheService);
const connectionManager = new ConnectionManager(connection, callLogger, toolService);
```

### 3. **Event-Driven Architecture**
WebSocket events are handled through dedicated methods:
- `handleOpenAIMessage()`: OpenAI WebSocket events
- `handleTwilioMessage()`: Twilio WebSocket events
- `handleToolCall*()`: Tool call lifecycle events

## 🔍 Code Quality

### 1. **Documentation**
- Comprehensive JSDoc comments
- Clear function signatures
- Usage examples

### 2. **Error Handling**
- Try-catch blocks where appropriate
- Graceful error recovery
- Detailed error logging

### 3. **Performance**
- LRU caches prevent memory leaks
- Efficient data structures
- Minimal object creation

## 🧪 Testing

The refactored structure makes testing easier:

- **Unit Tests**: Each service can be tested independently
- **Integration Tests**: Service interactions can be tested
- **Mocking**: Dependencies can be easily mocked

## 🔄 Migration from Original

The refactored code maintains 100% functional compatibility with the original:

- **Same API endpoints**: All routes work identically
- **Same WebSocket behavior**: Real-time functionality preserved
- **Same metrics**: All Prometheus metrics maintained
- **Same logging**: Call logs format unchanged

## 📈 Benefits

1. **Maintainability**: Easier to understand and modify
2. **Testability**: Each component can be tested independently
3. **Scalability**: Easy to add new features or services
4. **Debugging**: Clear separation makes issues easier to trace
5. **Performance**: Better memory management and caching
6. **Monitoring**: Comprehensive metrics and logging

## 🚨 Breaking Changes

**None!** The refactored code maintains complete backward compatibility. All existing functionality works exactly as before.

## 🔮 Future Enhancements

The new structure makes it easy to add:

- **Health Checks**: Service health monitoring
- **Rate Limiting**: API rate limiting
- **Authentication**: API key management
- **Load Balancing**: Multiple instance support
- **Database Integration**: Persistent storage
- **Analytics**: Advanced call analytics

## 📝 Notes

- All original functionality is preserved
- Performance is maintained or improved
- Code is more readable and maintainable
- Better error handling and logging
- Comprehensive monitoring and metrics
