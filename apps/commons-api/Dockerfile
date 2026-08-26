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

FROM cgr.dev/chainguard/node:latest-dev AS runtime

# Chromium and its runtime libraries are required by the web capture service.
USER root
RUN apk add --no-cache \
    chromium \
    ffmpeg \
    font-liberation \
    font-noto-emoji

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOME=/home/node \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
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
