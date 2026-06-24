FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/commons-identity/package.json apps/commons-identity/package.json
RUN pnpm install --frozen-lockfile --filter commons-identity...

COPY apps/commons-identity apps/commons-identity
RUN pnpm --filter commons-identity build
RUN pnpm --filter commons-identity deploy --prod /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3010
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /workspace/apps/commons-identity/dist ./dist
USER node
EXPOSE 3010
CMD ["node", "dist/index.js"]
