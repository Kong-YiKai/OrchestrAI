# syntax=docker/dockerfile:1.7

# ── Builder stage ────────────────────────────────────────────────────────────
# Compile / install all wheels here so the runtime image never carries gcc,
# headers, or the apt index. Anything we install here that the app needs at
# runtime must be either (a) pure-python copied via /usr/local/lib/python3.12
# or (b) explicitly re-installed in the runtime stage (e.g. libpq5).
FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --prefix=/install -r requirements.txt


# ── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libpq5 is the runtime shared library that asyncpg / psycopg link against.
# We deliberately do NOT install libpq-dev or gcc here — those only belong in
# the builder stage.
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

WORKDIR /app
COPY . .

# Phase 6 will flip the Chromium install on for real web_automation node
# execution. Until then we ship only the playwright python wrapper.
# RUN playwright install --with-deps chromium

EXPOSE 8000

CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
