#!/bin/bash

# Analyze interruption performance from recent logs
# Usage: ./analyze_interruption.sh

echo "📊 Analyzing interruption performance from recent logs..."
echo ""

# Get recent logs with interruption events
gcloud logging read "resource.type=cloud_run_revision" \
  --limit=100 \
  --format="value(timestamp,textPayload)" \
  --freshness=1h \
  --filter="textPayload:('🚨' OR '🔄' OR '🛑' OR '⚡' OR '✅' OR '⚠️' OR '🔇' OR '🎤' OR '🏁')" \
  | while read timestamp payload; do
    echo "[$timestamp] $payload"
  done | sort

echo ""
echo "🔍 Key metrics to look for:"
echo "  - 🚨 INTERRUPTION TRIGGER: When interruption starts"
echo "  - ⚡ FAST TWILIO CLEAR: Good performance (<500ms)"
echo "  - ⚠️ SLOW TWILIO CLEAR: Poor performance (>500ms)"
echo "  - 🏁 RESPONSE DONE: Final status (completed/cancelled)"
echo ""
echo "💡 Tips:"
echo "  - Look for time gaps between trigger and clear confirmation"
echo "  - Check if responses are being cancelled vs completed"
echo "  - Monitor for multiple interruption attempts"
