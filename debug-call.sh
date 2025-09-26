#!/bin/bash

# =============================================================================
# Gino's Pizza Realtime - Call Debug Script
# =============================================================================
# This script helps debug call flow and logs
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="gino-realtime"
REGION="us-central1"

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

# Function to get service URL
get_service_url() {
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="value(status.url)" 2>/dev/null)
    
    if [ -z "$SERVICE_URL" ]; then
        print_error "Could not get service URL. Is the service deployed?"
        exit 1
    fi
    
    print_success "Service URL: ${SERVICE_URL}"
}

# Function to show recent logs
show_recent_logs() {
    print_status "Showing recent logs (last 20 entries)..."
    echo ""
    gcloud logging read "resource.type=cloud_run_revision" --limit 20 --format="value(textPayload)" --project=superfront
    echo ""
}

# Function to show call-specific logs
show_call_logs() {
    print_status "Showing call-specific logs..."
    echo ""
    gcloud logging read "resource.type=cloud_run_revision AND (textPayload:\"Client connected\" OR textPayload:\"WebSocket\" OR textPayload:\"audio\" OR textPayload:\"OpenAI\")" --limit 30 --format="value(textPayload)" --project=superfront
    echo ""
}

# Function to show environment variable logs
show_env_logs() {
    print_status "Showing environment variable logs..."
    echo ""
    gcloud logging read "resource.type=cloud_run_revision AND (textPayload:\"Environment Variables\" OR textPayload:\"API Key\" OR textPayload:\"OPENAI\" OR textPayload:\"GMAPS\")" --limit 10 --format="value(textPayload)" --project=superfront
    echo ""
}

# Function to test webhook
test_webhook() {
    print_status "Testing Twilio webhook endpoint..."
    
    if curl -s -f -X POST "${SERVICE_URL}/incoming-call" > /dev/null; then
        print_success "Twilio webhook is responding"
    else
        print_error "Twilio webhook is not responding"
    fi
}

# Function to show service status
show_service_status() {
    print_status "Service Status:"
    echo ""
    gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="table(metadata.name,status.url,spec.template.spec.template.spec.containers[0].image,status.conditions[0].status)"
    echo ""
}

# Function to show environment variables in Cloud Run
show_cloud_run_env() {
    print_status "Environment Variables in Cloud Run:"
    echo ""
    gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="export" | grep -A 20 "env:" || echo "No environment variables found"
    echo ""
}

# Main function
main() {
    echo "🔍 Gino's Pizza Realtime - Call Debug"
    echo "====================================="
    echo ""
    
    # Get service URL
    get_service_url
    
    # Show service status
    show_service_status
    
    # Show environment variables
    show_cloud_run_env
    
    # Test webhook
    test_webhook
    
    # Show logs
    show_env_logs
    show_call_logs
    show_recent_logs
    
    echo ""
    print_success "🎉 Debug information collected!"
    echo ""
    print_status "Next steps:"
    print_status "1. Make a test call to your Twilio number"
    print_status "2. Run this script again to see call logs"
    print_status "3. Check for any error messages in the logs"
    echo ""
}

# Run main function
main "$@"
