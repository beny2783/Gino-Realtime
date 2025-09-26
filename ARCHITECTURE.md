# Project Architecture

This document describes the organized folder structure and module organization of the Gino's Pizza Realtime Voice AI application.

## 📁 Folder Structure

```
Gino-Realtime/
├── config/                 # Configuration and constants
│   ├── config.js          # Main configuration, environment variables, prompts
│   └── vad.js             # Voice Activity Detection configuration
├── services/              # Business logic and core services
│   ├── logger.js          # Call logging system
│   ├── metrics.js         # Prometheus metrics setup
│   └── tools.js           # Tool handlers for OpenAI functions
├── handlers/              # Request/connection handlers
│   └── websocket.js       # WebSocket connection handling
├── utils/                 # Utility functions and helpers
│   └── utils.js           # Common utility functions
├── assets/                # Static assets
├── Background_noise/      # Audio files
├── index.js              # Main application entry point
├── geocode.js            # Geocoding service
├── kb.js                 # Knowledge base service
├── menu.js               # Menu service
├── nearestStore.js       # Store location service
└── package.json          # Dependencies and scripts
```

## 🏗️ Module Organization

### **Config Module** (`config/`)
Contains all configuration, constants, and environment-specific settings.

- **`config.js`**: Main configuration file with environment variables, application constants, tool definitions, and Laura's system prompt
- **`vad.js`**: Voice Activity Detection configuration and setup

### **Services Module** (`services/`)
Contains core business logic and services that handle data processing and external integrations.

- **`logger.js`**: Call logging system with structured logging and file persistence
- **`metrics.js`**: Prometheus metrics setup and collection
- **`tools.js`**: Tool handlers for OpenAI function calls (menu, knowledge base, store location)

### **Handlers Module** (`handlers/`)
Contains request and connection handlers that manage incoming connections and data flow.

- **`websocket.js`**: Complete WebSocket connection handling for Twilio and OpenAI integration

### **Utils Module** (`utils/`)
Contains utility functions and helpers used across the application.

- **`utils.js`**: Common utility functions for data formatting, RTT monitoring, and message creation

## 🔄 Module Dependencies

```
index.js
├── config/config.js
├── services/metrics.js
├── utils/utils.js
└── handlers/websocket.js
    ├── config/config.js
    ├── config/vad.js
    ├── services/metrics.js
    ├── services/logger.js
    ├── services/tools.js
    └── utils/utils.js
        └── (no dependencies)
```

## 🎯 Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Separation of Concerns**: Configuration, business logic, and utilities are separated
3. **Dependency Direction**: Dependencies flow inward (handlers → services → config)
4. **Modularity**: Each module can be tested and maintained independently
5. **Readability**: Clear folder structure makes code easy to navigate

## 🚀 Benefits

- **Maintainability**: Easy to find and modify specific functionality
- **Testability**: Each module can be unit tested independently
- **Scalability**: New features can be added without affecting existing modules
- **Team Development**: Multiple developers can work on different modules
- **Code Reuse**: Modules can be reused in other projects
- **Debugging**: Issues can be isolated to specific modules

## 📝 Adding New Features

When adding new functionality:

1. **Configuration**: Add constants to `config/config.js`
2. **Business Logic**: Add services to `services/` folder
3. **Request Handling**: Add handlers to `handlers/` folder
4. **Utilities**: Add helper functions to `utils/utils.js`
5. **Update Dependencies**: Ensure proper import paths are maintained
