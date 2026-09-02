# syntax=docker/dockerfile:1
# Cloud Run image for the IronMan API. Multi-stage: build deps in a full
# image, run in a slim one — keeps the deployed image small and free of
# compilers, which matters for both cold-start time and attack surface.

FROM python:3.12-slim AS builder

WORKDIR /build

# libpq isn't needed at build time (psycopg[binary] ships its own), but
# weasyprint (billing PDFs, a later phase — docs/08 Phase 3) needs Pango/
# Cairo to *build* its Python bindings even before it's ever called.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/base.txt requirements/base.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements/base.txt gunicorn

FROM python:3.12-slim AS runtime

# Runtime-only shared libraries weasyprint needs (no compiler, no headers).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 appuser

COPY --from=builder /install /usr/local

WORKDIR /app
COPY . .

# Cloud Run injects PORT; static assets are collected at build time
# (not at container start) so a cold start never waits on disk I/O for
# something that doesn't change between deploys.
ENV DJANGO_SETTINGS_MODULE=config.settings.prod \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080

RUN DJANGO_SECRET_KEY=build-time-placeholder \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    python manage.py collectstatic --noinput

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# --workers sized for Cloud Run's default 1 vCPU; --timeout above Cloud
# Run's own request timeout so Cloud Run's limit governs, not gunicorn's.
CMD exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:${PORT} \
    --workers 2 \
    --threads 4 \
    --timeout 0 \
    --access-logfile - \
    --error-logfile -
