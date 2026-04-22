# syntax=docker/dockerfile:1.7
# Multi-stage build for Next.js 16 with better-sqlite3 (native addon) and pdfkit.

FROM node:20-slim AS base
WORKDIR /app
# Keep npm aligned with the repository toolchain metadata.
# Using Corepack avoids brittle npm self-upgrades in slim images.
RUN corepack enable && corepack prepare npm@11.12.1 --activate
# Packages required to build better-sqlite3 from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---------- deps stage ----------
FROM base AS deps
COPY package.json package-lock.json ./
# Install all deps (including dev) so we can build. Audit/fund noise stripped.
RUN corepack npm ci --no-audit --no-fund

# ---------- build stage ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack npm run build

# ---------- runtime stage ----------
FROM gcr.io/distroless/nodejs20-debian13:nonroot AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Copy the standalone output + static assets + public assets.
COPY --from=build --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=build --chown=nonroot:nonroot /app/public ./public

# Migration runner + SQL files
COPY --from=build --chown=nonroot:nonroot /app/scripts ./scripts
COPY --from=build --chown=nonroot:nonroot /app/migrations ./migrations
# node_modules needed for the migrate script (better-sqlite3)
COPY --from=build --chown=nonroot:nonroot /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=build --chown=nonroot:nonroot /app/node_modules/bindings ./node_modules/bindings
COPY --from=build --chown=nonroot:nonroot /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

USER nonroot
EXPOSE 3000

# Run migrations then start Next.js standalone server without requiring a shell.
CMD ["scripts/start-runtime.mjs"]
