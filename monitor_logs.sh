#!/bin/bash

# Real-time log monitoring script for interruption testing
# Usage: ./monitor_logs.sh

echo "🔍 Starting real-time log monitoring for interruption testing..."
echo "📱 Make a test call and interrupt Laura while she's speaking"
echo "⏹️  Press Ctrl+C to stop monitoring"
echo ""

# Monitor logs with emoji filtering for interruption events
# Use continuous polling since tail is not available
while true; do
  gcloud logging read "resource.type=cloud_run_revision" \
    --limit=20 \
    --format="value(timestamp,textPayload)" \
    --freshness=30s \
    --filter="textPayload:('🚨' OR '🔄' OR '🛑' OR '⚡' OR '✅' OR '⚠️' OR '🔇' OR '🎤' OR '🏁' OR '🔍' OR '📊')" \
    | while read timestamp payload; do
    # Format timestamp for readability
    formatted_time=$(date -d "$timestamp" '+%H:%M:%S.%3N' 2>/dev/null || echo "$timestamp")
    
    # Color code different types of events
    case "$payload" in
      *"🚨"*) echo -e "\033[31m[$formatted_time] $payload\033[0m" ;;  # Red for triggers
      *"🔄"*) echo -e "\033[33m[$formatted_time] $payload\033[0m" ;;  # Yellow for Twilio
      *"🛑"*) echo -e "\033[35m[$formatted_time] $payload\033[0m" ;;  # Magenta for OpenAI
      *"⚡"*) echo -e "\033[32m[$formatted_time] $payload\033[0m" ;;  # Green for success
      *"✅"*) echo -e "\033[32m[$formatted_time] $payload\033[0m" ;;  # Green for success
      *"⚠️"*) echo -e "\033[33m[$formatted_time] $payload\033[0m" ;;  # Yellow for warnings
      *"🔇"*) echo -e "\033[36m[$formatted_time] $payload\033[0m" ;;  # Cyan for silence
      *"🎤"*) echo -e "\033[34m[$formatted_time] $payload\033[0m" ;;  # Blue for speech
      *"🏁"*) echo -e "\033[37m[$formatted_time] $payload\033[0m" ;;  # White for completion
      *"🔍"*) echo -e "\033[90m[$formatted_time] $payload\033[0m" ;;  # Gray for debug
      *"📊"*) echo -e "\033[90m[$formatted_time] $payload\033[0m" ;;  # Gray for stats
      *) echo "[$formatted_time] $payload" ;;
    esac
  done
  sleep 2  # Poll every 2 seconds
done
