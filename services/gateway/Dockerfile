FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS runtime
WORKDIR /app
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN useradd --uid 10001 --create-home app && mkdir /data && chown app:app /data
COPY budget.py config.yaml ./
USER app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 LITELLM_TELEMETRY=False
EXPOSE 4000
CMD ["litellm", "--config", "/app/config.yaml", "--host", "0.0.0.0", "--port", "4000", "--num_workers", "1"]
