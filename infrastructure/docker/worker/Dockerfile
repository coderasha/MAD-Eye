FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
COPY prisma prisma
COPY prisma.config.ts ./
RUN pnpm install --frozen-lockfile
COPY apps/worker apps/worker
ENV DATABASE_URL_MIGRATE=postgresql://madeye:madeye@localhost:5432/madeye
RUN pnpm --filter @madeye/shared-types build && pnpm --filter @madeye/config build && pnpm db:generate && pnpm --filter @madeye/database exec tsc -p tsconfig.json && pnpm --filter @madeye/worker build
CMD ["node", "apps/worker/dist/main.js"]
