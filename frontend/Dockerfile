FROM oven/bun:1-alpine AS base

# ── Build stage ──────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy manifests + local packages before install (file: deps need their src at install time)
COPY package.json bun.lock ./
COPY packages/ packages/

RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time stubs — satisfy Zod schema; replaced by real env at runtime
ENV NEXT_PUBLIC_SITE_URL="http://localhost:3000"

RUN bun run build

# ── Production runner ─────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=4711
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 4711

CMD ["bun", "server.js"]
