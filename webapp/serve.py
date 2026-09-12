"""Run the application with bounded production HTTP server settings."""

import argparse

from waitress import serve


DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8080
THREADS = 4
CONNECTION_LIMIT = 32
BACKLOG = 64
CHANNEL_TIMEOUT = 30
CLEANUP_INTERVAL = 5
MAX_REQUEST_HEADER_SIZE = 16_384
MAX_REQUEST_BODY_SIZE = 65_536
INBUF_OVERFLOW = 65_536
OUTBUF_OVERFLOW = 262_144
OUTBUF_HIGH_WATERMARK = 1_048_576


def _port(value):
    try:
        port = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("port must be an integer") from error
    if not 1 <= port <= 65_535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", default=DEFAULT_PORT, type=_port)
    arguments = parser.parse_args(argv)
    if not arguments.host.strip():
        parser.error("host must not be empty")
    return arguments


def main(argv=None):
    arguments = parse_args(argv)
    from webapp.app import app

    serve(
        app,
        listen=f"{arguments.host}:{arguments.port}",
        threads=THREADS,
        connection_limit=CONNECTION_LIMIT,
        backlog=BACKLOG,
        channel_timeout=CHANNEL_TIMEOUT,
        cleanup_interval=CLEANUP_INTERVAL,
        max_request_header_size=MAX_REQUEST_HEADER_SIZE,
        max_request_body_size=MAX_REQUEST_BODY_SIZE,
        inbuf_overflow=INBUF_OVERFLOW,
        outbuf_overflow=OUTBUF_OVERFLOW,
        outbuf_high_watermark=OUTBUF_HIGH_WATERMARK,
        expose_tracebacks=False,
        trusted_proxy=None,
    )


if __name__ == "__main__":
    main()
