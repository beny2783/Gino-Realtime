#!/bin/bash

# Gino Realtime Docker Build and Run Script
set -e

echo "🔨 Building Docker image..."
docker build . -t superfront/gino-realtime

echo "🚀 Starting container..."
CONTAINER_ID=$(docker run -d --env-file .env --memory=4g --cpus=4 --rm -p 8080:8080 superfront/gino-realtime)

echo "✅ Container started with ID: $CONTAINER_ID"
echo "📝 Saving container ID to .container_id file..."
echo $CONTAINER_ID > .container_id

echo "📋 Following logs (saving to container_logs.txt)..."
echo "   Press Ctrl+C to stop following logs (container will keep running)"
echo "   Use ./stop-docker.sh to stop the container"
echo ""

# Follow logs and save to file
docker logs --since 15m --follow --timestamps $CONTAINER_ID 2>&1 | tee container_logs.txt
