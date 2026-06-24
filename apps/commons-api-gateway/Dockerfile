FROM public.ecr.aws/docker/library/node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/commons-api-gateway/package.json apps/commons-api-gateway/package.json
RUN pnpm install --filter commons-api-gateway... --frozen-lockfile
COPY apps/commons-api-gateway apps/commons-api-gateway
RUN pnpm --filter commons-api-gateway build \
 && pnpm --filter commons-api-gateway deploy --prod /deploy \
 && cp -r apps/commons-api-gateway/dist /deploy/dist

FROM public.ecr.aws/docker/library/node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /deploy ./
EXPOSE 8080
CMD ["node", "dist/index.js"]
