FROM python:3.12.14-slim-bookworm@sha256:9c47360a2a0355e2da18516d0b1c2126ec22c195d2185e97347c9d98398c5bef

ARG BUILD_VERSION
ARG BUILD_REVISION

LABEL org.opencontainers.image.title="schedule1_calc" \
      org.opencontainers.image.source="https://github.com/Tim3399/schedule1_calc" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app:/app/src \
    SCHEDULE1_LOG_STDOUT_ONLY=1

WORKDIR /app

RUN test -n "${BUILD_VERSION}" && test -n "${BUILD_REVISION}" \
    && groupadd --gid 10001 schedule1 \
    && useradd --uid 10001 --gid schedule1 --no-create-home --home-dir /nonexistent \
        --shell /usr/sbin/nologin schedule1

COPY requirements-release.lock /app/requirements-release.lock
RUN python -m pip install --no-cache-dir --require-hashes \
        --only-binary=:all: -r /app/requirements-release.lock

COPY VERSION /app/VERSION
COPY src /app/src
COPY webapp /app/webapp

RUN test "$(tr -d '\r\n' < /app/VERSION)" = "${BUILD_VERSION}" \
    && test -f /app/webapp/serve.py

USER 10001:10001

EXPOSE 8080

CMD ["python", "-m", "webapp.serve"]
