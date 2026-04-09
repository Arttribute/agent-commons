FROM node:22.11.0-bookworm-slim

# Install Chromium and system libraries needed at runtime
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    fonts-noto-color-emoji \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/tmp/.cache

RUN mkdir -p /tmp/.cache && chmod 777 /tmp/.cache

# node_modules and dist are pre-built and deployed by pnpm deploy in cloudbuild.yaml
COPY .deploy/package.json ./package.json
COPY .deploy/node_modules ./node_modules
COPY .deploy/dist ./dist

EXPOSE 8080

CMD ["node", "dist/nest/src/main.js"]
