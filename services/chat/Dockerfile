# Build context: verified .build/librechat, with the tracked OrchestrAI UI patch.
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build
WORKDIR /app
ENV SCARF_ANALYTICS=false HUSKY=0
RUN apk add --no-cache python3 make g++
COPY . .
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit
RUN npm run frontend && cd client && npx tsc --noEmit
# A fresh filtered installation excludes client/build dependencies. Pruning an
# already-populated workspace retains other workspaces' production dependencies.
RUN --mount=type=cache,target=/root/.npm rm -rf node_modules api/node_modules packages/api/node_modules packages/data-schemas/node_modules packages/data-provider/node_modules && \
    npm ci --prefer-offline --omit=dev --include-workspace-root=false --workspace=api --workspace=packages/api --workspace=packages/data-schemas --workspace=packages/data-provider --no-audit

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3080 SCARF_ANALYTICS=false
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/api ./api
COPY --from=build --chown=node:node /app/config ./config
COPY --from=build --chown=node:node /app/package.json /app/LICENSE ./
# Upstream serves the SPA with its CSP nonce/bootstrap injection. Keep that path.
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY --from=build --chown=node:node /app/client/public ./client/public
RUN mkdir -p uploads logs data skill; chown -R node:node uploads logs data skill
USER node
EXPOSE 3080
CMD ["node", "api/server/index.js"]
