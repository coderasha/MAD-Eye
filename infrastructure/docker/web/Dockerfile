FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages packages
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @madeye/ui build && pnpm --filter @madeye/api-client build && pnpm --filter @madeye/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@madeye/web", "start"]
