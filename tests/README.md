# Gino's Pizza Realtime API Tests

This folder contains test scripts for the Gino's Pizza Realtime API system.

## Test Scripts

### 1. Interactive Test (`test_interactive.js`)
**Real-time conversation testing with Laura**

```bash
node tests/test_interactive.js
```

**Features:**
- Chat with Laura in real-time
- See tool calls and responses
- Test specific scenarios
- Type "quit" or "exit" to end

**Example session:**
```
👤 You: I'd like a Hawaiian pizza
🔧 Tool call: getMenuItems({"search": "Hawaiian pizza"})
📋 Menu search result: [{"id": "gourmet-hawaiian", "name": "Hawaiian", "details": "Ham, Pineapple, Bacon Crumble"}]
🤖 Laura: "Great! We have our Hawaiian pizza with Ham, Pineapple, and Bacon Crumble. What size would you like?"
```

### 2. Automated Test Suite (`test_realtime.js`)
**Runs predefined test scenarios automatically**

```bash
node tests/test_realtime.js
```

**Test scenarios:**
- Hawaiian Pizza Order
- Location Lookup
- Menu Search
- Knowledge Base Queries

### 3. Menu Search Test (`test_menu_search.js`)
**Verifies menu search functionality**

```bash
node tests/test_menu_search.js
```

**Tests:**
- Hawaiian pizza → Hawaiian gourmet pizza
- Meat Lovers pizza → Meat Lovers gourmet pizza
- Cheese pizza → Cheese gourmet pizza
- And many more variations

### 4. Simple Test (`test_simple.js`)
**Quick verification of Hawaiian pizza fix**

```bash
node tests/test_simple.js
```

### 5. Hawaiian Pizza Fix Test (`test_hawaiian_fix.js`)
**Focused test for the Hawaiian pizza search fix**

```bash
node tests/test_hawaiian_fix.js
```

**Features:**
- Tests the exact scenario that was failing
- Captures detailed tool calls and responses
- Analyzes if Hawaiian pizza is found correctly
- Saves detailed JSON report

### 6. Detailed Response Test (`test_detailed_responses.js`)
**Captures detailed model responses for multiple scenarios**

```bash
node tests/test_detailed_responses.js
```

**Features:**
- Tests multiple scenarios with detailed logging
- Captures all tool calls and responses
- Saves individual JSON reports for each test
- Shows exact model behavior

### 7. Comprehensive Test Suite (`test_comprehensive.js`)
**Full automated test suite with performance metrics**

```bash
node tests/test_comprehensive.js
```

**Features:**
- Tests 6 different scenarios automatically
- Captures performance metrics
- Generates comprehensive analysis
- Creates detailed JSON report with success/failure rates

## Prerequisites

1. **Environment Variables**: Ensure `.env` file contains:
   ```
   OPENAI_API_KEY=your_openai_api_key
   ```

2. **Dependencies**: Install required packages:
   ```bash
   npm install
   ```

## Usage Examples

### Test Hawaiian Pizza Fix
```bash
# Quick test
node tests/test_simple.js

# Interactive test
node tests/test_interactive.js
# Then type: "I'd like a Hawaiian pizza"
```

### Test Location Lookup
```bash
node tests/test_interactive.js
# Then type: "What's the nearest location to 123 Main Street, Toronto?"
```

### Test Menu Search
```bash
node tests/test_menu_search.js
```

## Test Reports

All tests generate detailed JSON reports in the `tests/` folder:

- **`hawaiian_fix_test_*.json`**: Detailed Hawaiian pizza fix analysis
- **`detailed_response_*.json`**: Individual scenario responses
- **`test_report_*.json`**: Comprehensive test suite results

Each report includes:
- Complete conversation flow
- All tool calls and results
- Performance metrics
- Success/failure analysis
- Model response analysis

## Benefits

- **⚡ Fast Testing**: No phone calls needed
- **🔍 Debugging**: See exact tool calls and responses
- **💰 Cost Effective**: No Twilio charges
- **🔄 Iterative**: Test changes immediately
- **📊 Comprehensive**: All scenarios covered
- **📁 Detailed Reports**: JSON files with complete analysis

## Troubleshooting

### Connection Issues
- Verify `OPENAI_API_KEY` is set correctly
- Check internet connection
- Ensure OpenAI API has sufficient credits

### Import Errors
- Run tests from the project root directory
- Ensure all dependencies are installed

### No Responses
- Check that the session is properly initialized
- Verify tool functions are working correctly
- Look for error messages in the console
