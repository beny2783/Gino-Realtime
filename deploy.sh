#!/bin/bash

# =============================================================================
# Gino's Pizza Realtime - Deployment Script
# =============================================================================
# This script handles the complete deployment process including:
# - Building the Docker image
# - Pushing to Google Container Registry
# - Deploying to Cloud Run
# - Setting environment variables
# =============================================================================

set -e  # Exit on any error

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

# Function to check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check if logged in to gcloud
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_error "Not logged in to gcloud. Please run 'gcloud auth login' first."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Function to get environment variables
get_env_vars() {
    print_status "Setting up environment variables..."
    
    # Check if .env file exists
    if [ -f ".env" ]; then
        print_status "Loading environment variables from .env file..."
        export $(grep -v '^#' .env | xargs)
    else
        print_warning "No .env file found. Using environment variables from current shell."
    fi
    
    # Check for required environment variables
    if [ -z "$OPENAI_API_KEY" ]; then
        print_error "OPENAI_API_KEY environment variable is required"
        print_status "Please set it in your .env file or export it:"
        print_status "  export OPENAI_API_KEY='your-openai-api-key'"
        exit 1
    fi
    
    if [ -z "$GMAPS_KEY" ]; then
        print_error "GMAPS_KEY environment variable is required"
        print_status "Please set it in your .env file or export it:"
        print_status "  export GMAPS_KEY='your-google-maps-api-key'"
        exit 1
    fi
    
    print_success "Environment variables configured"
}

# Function to build and push Docker image
build_and_push() {
    print_status "Building and pushing Docker image..."
    
    # Build the image
    print_status "Building Docker image: ${IMAGE_NAME}"
    gcloud builds submit --tag "${IMAGE_NAME}" .
    
    print_success "Docker image built and pushed successfully"
}

# Function to deploy to Cloud Run
deploy_to_cloud_run() {
    print_status "Deploying to Cloud Run..."
    
    # Deploy the service
    gcloud run deploy "${SERVICE_NAME}" \
        --image "${IMAGE_NAME}" \
        --platform managed \
        --region "${REGION}" \
        --allow-unauthenticated \
        --port 8080 \
        --memory 1Gi \
        --cpu 1 \
        --max-instances 10 \
        --set-env-vars="OPENAI_API_KEY=${OPENAI_API_KEY},GMAPS_KEY=${GMAPS_KEY}"
    
    print_success "Deployed to Cloud Run successfully"
}

# Function to get service URL and test
get_service_info() {
    print_status "Getting service information..."
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="value(status.url)")
    
    print_success "Service deployed successfully!"
    echo ""
    echo "🌐 Service URL: ${SERVICE_URL}"
    echo "📊 Metrics URL: ${SERVICE_URL}/metrics"
    echo "📞 Twilio Webhook: ${SERVICE_URL}/incoming-call"
    echo "🔌 WebSocket: wss://$(echo ${SERVICE_URL} | sed 's|https://||')/media-stream"
    echo ""
    
    # Test the service
    print_status "Testing service health..."
    if curl -s -f "${SERVICE_URL}" > /dev/null; then
        print_success "Service is healthy and responding"
    else
        print_warning "Service deployed but health check failed"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help     Show this help message"
    echo "  --skip-build   Skip Docker build and push (use existing image)"
    echo "  --env-file     Path to .env file (default: .env)"
    echo ""
    echo "Environment Variables:"
    echo "  OPENAI_API_KEY    Required: Your OpenAI API key"
    echo "  GMAPS_KEY         Required: Your Google Maps API key"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy with .env file"
    echo "  $0 --env-file .env.production        # Deploy with specific env file"
    echo "  $0 --skip-build                      # Deploy without rebuilding"
    echo ""
}

# Main function
main() {
    echo "🚀 Gino's Pizza Realtime - Deployment Script"
    echo "=============================================="
    echo ""
    
    # Parse command line arguments
    SKIP_BUILD=false
    ENV_FILE=".env"
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_usage
                exit 0
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --env-file)
                ENV_FILE="$2"
                shift 2
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    check_prerequisites
    
    # Get environment variables
    if [ -f "$ENV_FILE" ]; then
        print_status "Loading environment variables from $ENV_FILE"
        export $(grep -v '^#' "$ENV_FILE" | xargs)
    fi
    get_env_vars
    
    # Build and push (unless skipped)
    if [ "$SKIP_BUILD" = false ]; then
        build_and_push
    else
        print_warning "Skipping Docker build and push"
    fi
    
    # Deploy to Cloud Run
    deploy_to_cloud_run
    
    # Get service information and test
    get_service_info
    
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
