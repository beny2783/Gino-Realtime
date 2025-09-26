# =============================================================================
# Gino's Pizza Realtime - Makefile
# =============================================================================
# Common commands for development and deployment
# =============================================================================

.PHONY: help install test deploy test-deployment clean logs status

# Default target
help:
	@echo "🚀 Gino's Pizza Realtime - Available Commands"
	@echo "=============================================="
	@echo ""
	@echo "Development:"
	@echo "  install          Install dependencies"
	@echo "  test             Run syntax check"
	@echo "  dev              Start development server"
	@echo ""
	@echo "Deployment:"
	@echo "  deploy           Deploy to Cloud Run"
	@echo "  deploy-quick     Deploy without rebuilding"
	@echo "  test-deployment  Test deployed service"
	@echo ""
	@echo "Monitoring:"
	@echo "  logs             View recent logs"
	@echo "  status           Check service status"
	@echo ""
	@echo "Utilities:"
	@echo "  clean            Clean up temporary files"
	@echo "  help             Show this help message"

# Development commands
install:
	@echo "📦 Installing dependencies..."
	npm install

test:
	@echo "🧪 Running syntax check..."
	node -c index.js
	node -c config/config.js
	node -c config/vad.js
	node -c services/logger.js
	node -c services/metrics.js
	node -c services/tools.js
	node -c utils/utils.js
	node -c handlers/websocket.js
	@echo "✅ All syntax checks passed"

dev:
	@echo "🚀 Starting development server..."
	node index.js

# Deployment commands
deploy:
	@echo "🚀 Deploying to Cloud Run..."
	./deploy.sh

deploy-quick:
	@echo "⚡ Quick deploy (skip build)..."
	./deploy.sh --skip-build

test-deployment:
	@echo "🧪 Testing deployment..."
	./test-deployment.sh

# Monitoring commands
logs:
	@echo "📋 Viewing recent logs..."
	gcloud logging read "resource.type=cloud_run_revision" --limit 50

status:
	@echo "📊 Checking service status..."
	gcloud run services describe gino-realtime --region=us-central1 --format="table(metadata.name,status.url,spec.template.spec.template.spec.containers[0].image,status.conditions[0].status)"

# Utility commands
clean:
	@echo "🧹 Cleaning up..."
	rm -rf logs/
	rm -f .env
	@echo "✅ Cleanup complete"

# Environment setup
setup-env:
	@echo "⚙️ Setting up environment..."
	@if [ ! -f .env ]; then \
		cp env.example .env; \
		echo "📝 Created .env file from example"; \
		echo "⚠️  Please edit .env with your actual API keys"; \
	else \
		echo "✅ .env file already exists"; \
	fi
