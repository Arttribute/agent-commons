# Docker Deployment Guide

## Puppeteer/Web Capture Service Configuration

The web capture service uses Puppeteer to capture web pages in real-time. When deploying to containerized environments like GCP Cloud Run, special configuration is required.

### Docker Configuration

The Dockerfile includes:

1. **Chromium Installation**: System-level Chromium browser and all required dependencies
2. **Environment Variables**: Pre-configured paths to use the system Chromium
3. **Cache Directory**: Writable cache directory at `/tmp/.cache`

### Environment Variables

The following environment variables are configured in the Dockerfile:

- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` - Prevents downloading Chromium during npm install
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` - Points to system-installed Chromium
- `CHROME_PATH=/usr/bin/chromium` - Alternative path variable
- `PUPPETEER_CACHE_DIR=/tmp/.cache` - Writable cache directory

### Optional Runtime Configuration

You can override these via environment variables in your deployment:

```bash
# Disable web capture entirely
DISABLE_WEB_CAPTURE=true

# Adjust timeouts (milliseconds)
PUPPETEER_LAUNCH_TIMEOUT=60000
WEB_CAPTURE_NAV_TIMEOUT_PRIMARY=12000
WEB_CAPTURE_NAV_TIMEOUT_FALLBACK=20000

# Change headless mode
PUPPETEER_HEADLESS_MODE=new
```

### Building the Docker Image

```bash
# From the project root
docker build -t commons-api -f apps/commons-api/Dockerfile .
```

### GCP Cloud Run Deployment

The Dockerfile is optimized for Cloud Run with:

- Minimal image size (dependencies cleaned up)
- Proper sandbox flags (--no-sandbox, --disable-setuid-sandbox)
- Optimized for rootless container execution

### Troubleshooting

If you encounter Puppeteer errors:

1. **Check Chromium is installed**: Verify `/usr/bin/chromium` exists in container
2. **Verify permissions**: Ensure `/tmp/.cache` is writable
3. **Check logs**: Look for browser launch errors in Cloud Run logs
4. **Memory limits**: Ensure Cloud Run has sufficient memory (recommend 2GB+)

### Local Development

For local development, Puppeteer will download and use its bundled Chromium automatically. No special configuration needed.
