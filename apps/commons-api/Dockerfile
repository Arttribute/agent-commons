FROM public.ecr.aws/docker/library/node:22.11.0-bookworm-slim AS build

WORKDIR /workspace

RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/commons-api/package.json apps/commons-api/package.json

RUN pnpm install --filter commons-api... --frozen-lockfile

COPY apps/commons-api apps/commons-api

RUN pnpm --filter commons-api build \
    && pnpm --filter commons-api deploy --prod --ignore-scripts /deploy \
    && cp -r apps/commons-api/dist /deploy/dist

FROM cgr.dev/chainguard/wolfi-base:latest AS browser

# Wolfi's public Chromium package can lag the browser security channel. Fetch a
# pinned Chrome for Testing build from Google's release bucket and verify its
# digest, so the runtime is current and reproducible without silently accepting
# a mutable download.
ARG CHROME_VERSION=152.0.7977.64
ARG CHROME_SHA256=8b592f066af71f054aab2cc80fc26f73c775c6d44ebb99d16ade924b24756c2e
RUN apk add --no-cache ca-certificates curl unzip \
    && curl --fail --show-error --silent --location \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
      --output /tmp/chrome.zip \
    && echo "${CHROME_SHA256}  /tmp/chrome.zip" | sha256sum -c - \
    && unzip -q /tmp/chrome.zip -d /opt \
    && rm /tmp/chrome.zip

FROM cgr.dev/chainguard/node:latest-dev AS runtime

# Chrome's runtime libraries are required by the pluggable web capture service.
USER root
RUN apk add --no-cache \
    ffmpeg \
    font-liberation \
    font-noto-emoji \
    font-opensans \
    fontconfig \
    gtk-3 \
    icu-data-full \
    libnss \
    mesa \
    mesa-glx \
    nss \
    systemd \
    xdg-utils

COPY --from=browser /opt/chrome-linux64 /opt/chrome-linux64

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOME=/home/node \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/opt/chrome-linux64/chrome \
    CHROME_PATH=/opt/chrome-linux64/chrome \
    PUPPETEER_CACHE_DIR=/tmp/.cache

RUN mkdir -p /tmp/.cache /home/node \
    && chown -R node:node /tmp/.cache /home/node /app

COPY --from=build /deploy ./
COPY --from=build /workspace/apps/commons-api/migrations ./migrations
# scripts/migrate.mjs runs versioned migrations in-container (see buildspec).
COPY --from=build /workspace/apps/commons-api/scripts ./scripts
COPY --from=build /workspace/apps/commons-api/platform-skills ./platform-skills

USER node

EXPOSE 8080

ENTRYPOINT ["node"]
CMD ["dist/nest/src/main.js"]
