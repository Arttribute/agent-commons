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

FROM public.ecr.aws/docker/library/node:22.11.0-bookworm-slim AS runtime

# Chromium and its runtime libraries are required by the web capture service.
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

ENV NODE_ENV=production \
    PORT=8080 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/tmp/.cache

RUN mkdir -p /tmp/.cache && chmod 777 /tmp/.cache

COPY --from=build /deploy ./
COPY --from=build /workspace/apps/commons-api/migrations ./migrations
# scripts/migrate.mjs runs versioned migrations in-container (see buildspec).
COPY --from=build /workspace/apps/commons-api/scripts ./scripts

EXPOSE 8080

CMD ["node", "dist/nest/src/main.js"]
