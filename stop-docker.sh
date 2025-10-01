#!/bin/bash

# Gino Realtime Docker Stop Script
set -e

if [ -f .container_id ]; then
    CONTAINER_ID=$(cat .container_id)
    echo "🛑 Stopping container: $CONTAINER_ID"
    
    if docker stop $CONTAINER_ID; then
        echo "✅ Container stopped successfully"
        rm -f .container_id
        echo "🗑️  Cleaned up .container_id file"
    else
        echo "❌ Failed to stop container or container was already stopped"
        echo "🧹 Cleaning up .container_id file anyway"
        rm -f .container_id
    fi
else
    echo "❌ No .container_id file found"
    echo "💡 Either no container is running or it was started manually"
    echo ""
    echo "🔍 Here are the currently running containers:"
    docker ps --filter "ancestor=superfront/gino-realtime" --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
    echo ""
    echo "💡 To stop a specific container manually, run: docker stop <container_id>"
fi
