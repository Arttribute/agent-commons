FROM public.ecr.aws/docker/library/node:22.11.0 AS base


FROM base AS builder

WORKDIR /

RUN npm install -g corepack@latest
RUN corepack enable pnpm

COPY package*.json ./
COPY tsconfig*.json ./
COPY ./dist ./dist/

RUN pnpm install --prod --no-frozen-lockfile --ignore-scripts

EXPOSE 8080

CMD ["node", "dist/src/index.js"]