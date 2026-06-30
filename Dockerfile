# Multi-stage build producing a small standalone image. Node 22 is within Next 16's support range
# (floor 20.9). The runner copies only the standalone server + static assets, runs as a non-root
# user, and owns a writable /data dir for the SQLite database.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Placeholder secret for build-time route collection only (Better Auth is constructed at module
# load). This stage is discarded; the runner gets the real secret at run time via the environment.
ENV BETTER_AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
# output: 'standalone' (next.config.ts) emits .next/standalone with a minimal server.js.
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# The SQLite database lives on a mounted volume so data survives container restarts.
ENV SENTOU_DB=/data/sentou.db

# Standalone server, plus the static assets and public dir it does not copy itself.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Drizzle migrations are read from disk at boot by the instrumentation hook (migrate()).
# Next's standalone tracer does not bundle them (they are read by path, not imported), so
# copy the folder explicitly or the server crashes on startup with "Can't find meta/_journal.json".
COPY --from=build /app/lib/db/migrations ./lib/db/migrations

# Run unprivileged and let that user own the data dir so the runtime can write the database.
RUN groupadd --system --gid 1001 sentou \
  && useradd --system --uid 1001 --gid sentou sentou \
  && mkdir -p /data \
  && chown -R sentou:sentou /data /app
USER sentou

EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
