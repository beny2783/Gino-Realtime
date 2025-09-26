# 🚀 Deployment Guide

This guide explains how to deploy the Gino's Pizza Realtime application using the automated deployment script.

## Quick Start

### 1. Prerequisites

Make sure you have the following installed and configured:

- **Google Cloud SDK** (`gcloud`) - [Install Guide](https://cloud.google.com/sdk/docs/install)
- **Docker** - [Install Guide](https://docs.docker.com/get-docker/)
- **Node.js** (v18+) - [Install Guide](https://nodejs.org/)

### 2. Authentication

```bash
# Login to Google Cloud
gcloud auth login

# Set your project (replace with your project ID)
gcloud config set project YOUR_PROJECT_ID
```

### 3. Environment Setup

```bash
# Copy the example environment file
cp env.example .env

# Edit the .env file with your actual API keys
nano .env
```

Required environment variables:
- `OPENAI_API_KEY` - Your OpenAI API key
- `GMAPS_KEY` - Your Google Maps API key

### 4. Deploy

```bash
# Run the deployment script
./deploy.sh
```

That's it! The script will handle everything automatically.

## Deployment Script Options

### Basic Usage

```bash
# Deploy with .env file
./deploy.sh

# Deploy with specific environment file
./deploy.sh --env-file .env.production

# Skip Docker build (use existing image)
./deploy.sh --skip-build

# Show help
./deploy.sh --help
```

### What the Script Does

1. **Prerequisites Check** - Verifies gcloud, Docker, and authentication
2. **Environment Setup** - Loads environment variables from .env file
3. **Docker Build** - Builds and pushes image to Google Container Registry
4. **Cloud Run Deploy** - Deploys service with environment variables
5. **Health Check** - Tests the deployed service
6. **Service Info** - Displays URLs and endpoints

## Manual Deployment (Alternative)

If you prefer to deploy manually:

```bash
# 1. Build and push image
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/gino-realtime .

# 2. Deploy to Cloud Run
gcloud run deploy gino-realtime \
  --image gcr.io/YOUR_PROJECT_ID/gino-realtime \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --set-env-vars="OPENAI_API_KEY=your_key,GMAPS_KEY=your_key"

# 3. Get service URL
gcloud run services describe gino-realtime --region=us-central1 --format="value(status.url)"
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key for Realtime API | `sk-...` |
| `GMAPS_KEY` | Google Maps API key for geocoding | `AIza...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VAD_MODE` | Voice Activity Detection mode | `semantic` |
| `VAD_SILENCE_MS` | Server VAD silence duration | `500` |
| `VAD_PREFIX_MS` | Server VAD prefix padding | `80` |
| `VAD_THRESHOLD` | Server VAD sensitivity | `0.5` |
| `VAD_EAGERNESS` | Semantic VAD eagerness | `high` |
| `VAD_SEMANTIC_ENABLED` | Enable semantic VAD | `false` |
| `PORT` | Application port | `8080` |

## Service Endpoints

After deployment, your service will have these endpoints:

- **Health Check**: `https://your-service-url/`
- **Metrics**: `https://your-service-url/metrics`
- **Twilio Webhook**: `https://your-service-url/incoming-call`
- **WebSocket**: `wss://your-service-url/media-stream`

## Monitoring and Logs

```bash
# View recent logs
gcloud logging read "resource.type=cloud_run_revision" --limit 50

# View service status
gcloud run services describe gino-realtime --region=us-central1

# View metrics
curl https://your-service-url/metrics
```

## Troubleshooting

### Common Issues

1. **Authentication Error**
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```

2. **Permission Denied**
   ```bash
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
     --member="user:YOUR_EMAIL" \
     --role="roles/run.admin"
   ```

3. **Build Fails**
   - Check Docker is running
   - Verify all files are present
   - Check for syntax errors: `node -c index.js`

4. **Service Not Responding**
   - Check environment variables are set
   - Verify API keys are valid
   - Check Cloud Run logs

### Getting Help

- Check the [ARCHITECTURE.md](./ARCHITECTURE.md) for code structure
- Review the [README.md](./README.md) for general information
- Check Cloud Run logs for specific errors

## Updating the Service

To update your deployment:

```bash
# Just run the deploy script again
./deploy.sh
```

The script will:
- Build a new image with your latest code
- Deploy the updated service
- Preserve your environment variables
- Update the service seamlessly
