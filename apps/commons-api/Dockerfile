FROM public.ecr.aws/docker/library/node:22.11.0-alpine3.20 AS base


FROM base AS runtime

RUN npm install -g corepack@latest
RUN corepack enable pnpm

COPY package*.json ./
COPY tsconfig*.json ./
COPY ./dist ./dist/
# COPY pnpm-lock.yaml ./

# Production packages only and ignore running the prepare script
RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts

EXPOSE 8080

CMD ["pnpm", "start"]
