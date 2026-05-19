FROM python:3.12-slim

WORKDIR /app

# Install system deps for asyncpg and playwright
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install playwright browsers (chromium only to keep image small).
# Skipped by default — only Phase 6 (real web_automation node execution) needs
# the Chromium binary, and pulling it adds ~500MB / ~10 min to the first build.
# Re-enable when starting Phase 6.
# RUN playwright install --with-deps chromium

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
