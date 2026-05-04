FROM python:3.13-slim

WORKDIR /app

COPY scripts ./scripts
COPY data ./data
COPY worker ./worker
COPY public ./public

RUN pip install --no-cache-dir -r scripts/requirements.txt

ENV PORT=49173
ENV RUN_SCHEDULER=true
ENV COUNTRIES=AT
ENV UPDATE_HOUR_UTC=3

EXPOSE 49173

CMD ["python3", "worker/server.py"]
