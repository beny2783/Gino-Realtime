#!/bin/bash

# =============================================================================
# Gino's Pizza Realtime - One-Command Deployment Script
# =============================================================================
# This script handles the complete deployment to Google Cloud Run
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="superfront"
SERVICE_NAME="gino-realtime"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if user is authenticated
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_error "Not authenticated with gcloud. Please run 'gcloud auth login' first."
        exit 1
    fi
    
    # Check if project is set
    if ! gcloud config get-value project &> /dev/null; then
        print_error "No project set. Please run 'gcloud config set project ${PROJECT_ID}' first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to load environment variables
load_env_vars() {
    print_status "Loading environment variables from .env"
    
    if [ ! -f ".env" ]; then
        print_error ".env file not found. Please create one with your API keys."
        print_status "You can copy env.example to .env and add your keys:"
        print_status "  cp env.example .env"
        print_status "  # Then edit .env with your actual API keys"
        exit 1
    fi
    
    # Load environment variables
    export $(grep -v '^#' .env | xargs)
    
    # Validate required variables
    if [ -z "$OPENAI_API_KEY" ]; then
        print_error "OPENAI_API_KEY not found in .env file"
        exit 1
    fi
    
    if [ -z "$GMAPS_KEY" ]; then
        print_error "GMAPS_KEY not found in .env file"
        exit 1
    fi
    
    print_success "Environment variables loaded successfully"
}

# Function to build and push Docker image
build_and_push() {
    print_status "Building and pushing Docker image..."
    
    # Build and push using gcloud
    gcloud builds submit --tag "${IMAGE_NAME}" .
    
    print_success "Docker image built and pushed successfully"
}

# Function to deploy to Cloud Run
deploy_to_cloud_run() {
    print_status "Deploying to Cloud Run..."
    
    # Deploy with environment variables
    gcloud run deploy "${SERVICE_NAME}" \
        --image "${IMAGE_NAME}" \
        --platform managed \
        --region "${REGION}" \
        --allow-unauthenticated \
        --port 8080 \
        --memory 1Gi \
        --cpu 1 \
        --timeout 300 \
        --set-env-vars "OPENAI_API_KEY=${OPENAI_API_KEY},GMAPS_KEY=${GMAPS_KEY}"
    
    print_success "Deployed to Cloud Run successfully"
}

# Function to get service information
get_service_info() {
    print_status "Getting service information..."
    
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="value(status.url)")
    
    if [ -z "$SERVICE_URL" ]; then
        print_error "Could not get service URL"
        exit 1
    fi
    
    print_success "Service deployed successfully!"
    echo ""
    echo "🌐 Service URL: ${SERVICE_URL}"
    echo "📊 Metrics URL: ${SERVICE_URL}/metrics"
    echo "📞 Twilio Webhook: ${SERVICE_URL}/incoming-call"
    echo "🔌 WebSocket: wss://${SERVICE_URL#https://}/media-stream"
    echo ""
}

# Function to test the deployment
test_deployment() {
    print_status "Testing service health..."
    
    if curl -s -f "${SERVICE_URL}/" > /dev/null; then
        print_success "Service is healthy and responding"
    else
        print_warning "Service health check failed, but deployment may still be successful"
    fi
}

# Main deployment function
main() {
    echo "🚀 Gino's Pizza Realtime - Deployment Script"
    echo "=============================================="
    echo ""
    
    # Run deployment steps
    check_prerequisites
    load_env_vars
    build_and_push
    deploy_to_cloud_run
    get_service_info
    test_deployment
    
    echo ""
    print_success "🎉 Deployment completed successfully!"
    echo ""
    print_status "Next steps:"
    print_status "1. Update your Twilio webhook URL to: ${SERVICE_URL}/incoming-call"
    print_status "2. Test the service by calling your Twilio number"
    print_status "3. Monitor logs with: gcloud logging read 'resource.type=cloud_run_revision' --limit 50"
    echo ""
}

# Run main function
main "$@"
