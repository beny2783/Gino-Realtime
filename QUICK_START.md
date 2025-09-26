# 🚀 Quick Start Guide

Get your Gino's Pizza Realtime Voice AI up and running in minutes!

## ⚡ One-Command Deploy

```bash
# 1. Set up environment
cp env.example .env
nano .env  # Add your API keys

# 2. Deploy everything
./deploy.sh
```

That's it! Your service will be live and ready to use.

## 📋 What You Need

- **OpenAI API Key** - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Google Maps API Key** - Get from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- **Google Cloud Account** - With billing enabled

## 🔧 Available Commands

### Using Make (Recommended)
```bash
make help              # Show all commands
make install           # Install dependencies
make test              # Check syntax
make deploy            # Deploy to Cloud Run
make test-deployment   # Test deployed service
make logs              # View logs
make status            # Check service status
```

### Using Scripts Directly
```bash
./deploy.sh            # Full deployment
./deploy.sh --skip-build  # Deploy without rebuilding
./test-deployment.sh   # Test the deployment
```

## 🌐 After Deployment

Your service will be available at:
- **Service URL**: `https://gino-realtime-xxxxx.run.app`
- **Twilio Webhook**: `https://gino-realtime-xxxxx.run.app/incoming-call`
- **WebSocket**: `wss://gino-realtime-xxxxx.run.app/media-stream`

## 📞 Next Steps

1. **Update Twilio Webhook**: Set your Twilio phone number's webhook URL to the service URL + `/incoming-call`
2. **Test the Service**: Call your Twilio number to test the voice AI
3. **Monitor**: Use `make logs` to check the logs

## 🆘 Need Help?

- **Deployment Issues**: Check [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Code Structure**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **General Info**: Read [README.md](./README.md)

## 🔄 Updating

To update your deployment with new code:
```bash
make deploy
```

The script will automatically:
- Build a new Docker image
- Deploy the updated service
- Preserve your environment variables
- Test the deployment
