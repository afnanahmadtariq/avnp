# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# Node is pinned by exact version and multi-platform digest. The same image is
# used for building and running so native dependencies cannot drift between
# stages or host architectures.
ARG NODE_IMAGE=node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d

FROM ${NODE_IMAGE} AS base

# Prisma detects libssl while generating its client, and the runtime calls
# external HTTPS providers. Install only the corresponding Debian runtime
# packages, then remove apt metadata from the immutable layer.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS toolchain

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
ENV CI=true

WORKDIR /workspace

RUN corepack enable \
  && corepack prepare pnpm@11.15.0 --activate \
  && node --version \
  && pnpm --version

FROM toolchain AS dependencies

# Copy dependency manifests separately so application-only changes reuse the
# expensive dependency installation layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/domain/package.json ./packages/domain/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/integrations/package.json ./packages/integrations/package.json
COPY packages/queue/package.json ./packages/queue/package.json
COPY packages/runtime-config/package.json ./packages/runtime-config/package.json
COPY packages/schema-admin/package.json ./packages/schema-admin/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/verticals/package.json ./packages/verticals/package.json

RUN --mount=type=cache,id=relay-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile \
    --filter . \
    --filter @relay/api... \
    --filter @relay/worker... \
    --filter @relay/schema-admin...

FROM dependencies AS build

COPY . .

# Turbo includes every transitive workspace build needed by the two services.
# Prisma generation is part of @relay/database's build dependency graph.
RUN pnpm exec turbo run build \
  --filter @relay/api \
  --filter @relay/worker

# pnpm deploy materializes two self-contained production dependency trees.
# Legacy deploy is explicit because this workspace deliberately does not use
# injectWorkspacePackages. The frozen install and committed lockfile pin every
# version and integrity hash; the shared store lets deploy reuse those artifacts.
RUN --mount=type=cache,id=relay-pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm --filter @relay/api deploy --prod --legacy /opt/relay/api \
  && pnpm --filter @relay/worker deploy --prod --legacy /opt/relay/worker \
  && pnpm --config.strict-peer-dependencies=false \
    --filter @relay/schema-admin deploy --prod --legacy /opt/relay/schema-admin \
  && cp packages/database/prisma.config.ts /opt/relay/schema-admin/prisma.config.ts \
  && cp -R packages/database/prisma /opt/relay/schema-admin/prisma \
  && cd /opt/relay/schema-admin \
  && ./node_modules/.bin/prisma validate --config prisma.config.ts

FROM base AS runtime

ARG APP_VERSION=unknown
ARG VCS_REF=unknown

ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}

RUN groupadd --system --gid 10001 relay \
  && useradd --system --uid 10001 --gid relay --home-dir /opt/relay relay

WORKDIR /opt/relay

COPY --from=build --chown=relay:relay /opt/relay/api ./api
COPY --from=build --chown=relay:relay /opt/relay/worker ./worker
COPY --from=build --chown=relay:relay /opt/relay/schema-admin ./schema-admin
COPY --chown=relay:relay infra/production/worker-healthcheck.mjs ./healthchecks/worker.mjs

USER 10001:10001

EXPOSE 4000

LABEL org.opencontainers.image.title="Relay API and worker runtime" \
  org.opencontainers.image.description="Immutable production runtime for Relay backend services" \
  org.opencontainers.image.source="https://github.com/afnanahmadtariq/avnp" \
  org.opencontainers.image.revision=${VCS_REF} \
  org.opencontainers.image.version=${APP_VERSION}

WORKDIR /opt/relay/api

CMD ["node", "--enable-source-maps", "dist/main.js"]
