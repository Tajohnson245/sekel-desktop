FROM node:22-alpine AS base

# Stage 1: prune the monorepo to web's subgraph
FROM base AS pruner
WORKDIR /app
RUN npm install -g turbo@2
COPY . .
RUN turbo prune @sekel/web --docker

# Stage 2: Install dependencies (layer-cachable, only re-runs if package.json changes)
FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci

# Stage 3: Build
FROM base AS builder
ARG TURBO_TEAM
ARG TURBO_TOKEN
WORKDIR /app
COPY --from=installer /app/node_modules ./node_modules
COPY --from=pruner /app/out/full .
RUN npx turbo build --filter=@sekel/web

# Stage 4: Minimal production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]