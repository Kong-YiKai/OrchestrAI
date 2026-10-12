FROM python:3.12-slim@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1 AS runtime
WORKDIR /app
ARG BUILD_REVISION=local
LABEL org.opencontainers.image.revision=$BUILD_REVISION
LABEL org.opencontainers.image.source="https://github.com/Kong-YiKai/OrchestrAI"
RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 && rm -rf /var/lib/apt/lists/*
# Context is the checksum-verified RAG source with the tracked hardening patch.
COPY --from=orchestrai requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN useradd --uid 10001 --create-home app && mkdir uploads && chown app:app uploads
COPY --chown=app:app app ./app
COPY --chown=app:app main.py LICENSE ./
COPY --from=orchestrai --chown=app:app migrate.py ./
COPY --from=orchestrai --chown=app:app migrations ./migrations
USER app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCARF_NO_ANALYTICS=true
EXPOSE 8000
CMD ["python", "main.py"]
