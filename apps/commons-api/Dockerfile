FROM public.ecr.aws/docker/library/node:22.11.0-bookworm-slim AS base

# Builder stage to compile NestJS
FROM base AS builder
WORKDIR /app

RUN npm install -g corepack@latest && corepack enable pnpm

# Copy workspace root manifests if needed; fallback to app-level
COPY package.json pnpm-lock.yaml ./
COPY ./ .

# Install deps and build
RUN pnpm install --frozen-lockfile && pnpm --filter commons-api build

# Runtime stage with Chromium dependencies for Puppeteer
FROM public.ecr.aws/docker/library/node:22.11.0-bookworm-slim AS runner
WORKDIR /app

# Install system libraries required by Chromium
RUN apt-get update && apt-get install -y --no-install-recommends \
		ca-certificates \
		fonts-liberation \
		libasound2 \
		libatk-bridge2.0-0 \
		libatk1.0-0 \
		libc6 \
		libcairo2 \
		libcups2 \
		libdbus-1-3 \
		libdrm2 \
		libexpat1 \
		libgbm1 \
		libgcc1 \
		libglib2.0-0 \
		libgtk-3-0 \
		libnspr4 \
		libnss3 \
		libpango-1.0-0 \
		libx11-6 \
		libx11-xcb1 \
		libxcb1 \
		libxcomposite1 \
		libxdamage1 \
		libxext6 \
		libxfixes3 \
		libxrandr2 \
		libxshmfence1 \
		wget \
	&& rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
		PORT=8080

# Copy built app and node_modules from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/commons-api/dist ./dist

EXPOSE 8080

CMD ["node", "dist/main.js"]
