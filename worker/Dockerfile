FROM node:22-alpine AS frontend-build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_DATA_BASE_URL=
ARG VITE_GEOIP_ENDPOINT=
ENV VITE_DATA_BASE_URL=$VITE_DATA_BASE_URL
ENV VITE_GEOIP_ENDPOINT=$VITE_GEOIP_ENDPOINT
RUN npm run build

FROM python:3.13-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

COPY scripts ./scripts
COPY data ./data
COPY worker ./worker
COPY public ./public
COPY --from=frontend-build /app/dist ./dist

RUN pip install --no-cache-dir -r scripts/requirements.txt

ENV PORT=49173
ENV RUN_SCHEDULER=true
ENV COUNTRIES=AT
ENV UPDATE_TIMEZONE=Europe/Vienna
ENV UPDATE_HOUR_LOCAL=13
ENV UPDATE_MINUTE_LOCAL=7

EXPOSE 49173

CMD ["python3", "worker/server.py"]
