FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:56b8272e43a0525f67aed68d1e0794a712d10e3e45a563e118e9a77c817e6f86
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
# Base-image packages with fixes published after the pinned digest (2026-10-19 scan).
USER root
RUN apk upgrade --no-cache libexpat libx11
USER 101
COPY --from=client /app/client/dist/assets /srv/ui/assets
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
