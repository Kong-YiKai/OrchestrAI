FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit

FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime
WORKDIR /app
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node migrations ./migrations
USER node
ENV NODE_ENV=production
EXPOSE 8090
CMD ["node", "src/api.mjs"]

FROM runtime AS test
COPY --chown=node:node tests ./tests
CMD ["node", "--test", "--test-concurrency=1", "tests/workflow.test.mjs"]
