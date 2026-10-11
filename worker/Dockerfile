# Coolify builds this file (dockerfile_location=/worker/Dockerfile) with the repo root as context.
FROM node:22-alpine AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_DATA_BASE_URL=
ARG VITE_GEOIP_ENDPOINT=
ENV VITE_DATA_BASE_URL=$VITE_DATA_BASE_URL
ENV VITE_GEOIP_ENDPOINT=$VITE_GEOIP_ENDPOINT
# Vite copies public/ into dist/, including the price artifacts. Those copies would
# go stale after the first refresh; the worker serves the live ones from DATA_DIR.
RUN npm run build && rm -f dist/*.bin

FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# curl/wget: Coolify's health check runs one of them inside the container.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl wget \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 10001 eepa \
  && useradd --system --uid 10001 --gid eepa --home-dir /app --no-create-home --shell /usr/sbin/nologin eepa

# Dependencies first so code changes do not invalidate the pip layer.
COPY scripts/requirements.txt ./scripts/requirements.txt
RUN pip install --no-cache-dir -r scripts/requirements.txt

COPY scripts ./scripts
COPY data ./data
COPY worker ./worker
COPY public ./public
COPY --from=frontend-build /app/dist ./dist

# The app user owns only the directories it writes to. /app/storage is DATA_DIR
# (mount a persistent volume there); it is seeded from public/ and scripts/data/
# on startup. The other three are the fallback if DATA_DIR is not writable.
RUN mkdir -p /app/storage \
  && chown eepa:eepa /app/storage /app/public /app/scripts/data /app/data

ENV PORT=49173
ENV RUN_SCHEDULER=true
ENV COUNTRIES=AT,DE-LU,FR
ENV UPDATE_TIMEZONE=Europe/Vienna
ENV UPDATE_HOUR_LOCAL=13
ENV UPDATE_MINUTE_LOCAL=7
ENV DATA_DIR=/app/storage

USER eepa

EXPOSE 49173

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-49173}/health" || exit 1

CMD ["python3", "worker/server.py"]
