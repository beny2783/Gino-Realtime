#!/bin/bash

# =============================================================================
# Gino's Pizza Realtime - Deployment Test Script
# =============================================================================
# This script tests the deployed service to ensure it's working correctly
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
    print_status "Getting service URL..."
    SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="value(status.url)" 2>/dev/null)
    
    if [ -z "$SERVICE_URL" ]; then
        print_error "Could not get service URL. Is the service deployed?"
        exit 1
    fi
    
    print_success "Service URL: ${SERVICE_URL}"
}

# Function to test health endpoint
test_health() {
    print_status "Testing health endpoint..."
    
    if curl -s -f "${SERVICE_URL}" > /dev/null; then
        print_success "Health endpoint is responding"
    else
        print_error "Health endpoint is not responding"
        return 1
    fi
}

# Function to test metrics endpoint
test_metrics() {
    print_status "Testing metrics endpoint..."
    
    if curl -s -f "${SERVICE_URL}/metrics" > /dev/null; then
        print_success "Metrics endpoint is responding"
    else
        print_warning "Metrics endpoint is not responding"
        return 1
    fi
}

# Function to test Twilio webhook endpoint
test_webhook() {
    print_status "Testing Twilio webhook endpoint..."
    
    # Test with a simple POST request
    if curl -s -f -X POST "${SERVICE_URL}/incoming-call" > /dev/null; then
        print_success "Twilio webhook endpoint is responding"
    else
        print_warning "Twilio webhook endpoint is not responding"
        return 1
    fi
}

# Function to check service status
check_service_status() {
    print_status "Checking service status..."
    
    # Get service details
    gcloud run services describe "${SERVICE_NAME}" --region="${REGION}" --format="table(metadata.name,status.url,spec.template.spec.template.spec.containers[0].image,status.conditions[0].status)"
}

# Function to show service information
show_service_info() {
    echo ""
    print_success "🎉 Service is running successfully!"
    echo ""
    echo "📋 Service Information:"
    echo "  Service Name: ${SERVICE_NAME}"
    echo "  Region: ${REGION}"
    echo "  Service URL: ${SERVICE_URL}"
    echo ""
    echo "🔗 Available Endpoints:"
    echo "  Health Check: ${SERVICE_URL}/"
    echo "  Metrics: ${SERVICE_URL}/metrics"
    echo "  Twilio Webhook: ${SERVICE_URL}/incoming-call"
    echo "  WebSocket: wss://$(echo ${SERVICE_URL} | sed 's|https://||')/media-stream"
    echo ""
    echo "📞 Next Steps:"
    echo "  1. Update your Twilio webhook URL to: ${SERVICE_URL}/incoming-call"
    echo "  2. Test by calling your Twilio number"
    echo "  3. Monitor logs with: gcloud logging read 'resource.type=cloud_run_revision' --limit 50"
    echo ""
}

# Main function
main() {
    echo "🧪 Gino's Pizza Realtime - Deployment Test"
    echo "=========================================="
    echo ""
    
    # Get service URL
    get_service_url
    
    # Test endpoints
    test_health
    test_metrics
    test_webhook
    
    # Check service status
    check_service_status
    
    # Show service information
    show_service_info
}

# Run main function
main "$@"
