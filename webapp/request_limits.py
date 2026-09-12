"""Bounded request admission for the single-process public web service."""

import math
import os
import threading
import time

from flask import jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge, TooManyRequests

MAX_BODY_BYTES = 64 * 1024
MAX_FORM_FIELD_BYTES = 16 * 1024
MAX_FORM_PARTS = 8


def _positive_setting(name, default):
    try:
        value = float(os.environ.get(name, default))
    except ValueError as error:
        raise ValueError(f"{name} must be a finite positive number") from error
    if not math.isfinite(value) or value <= 0:
        raise ValueError(f"{name} must be a finite positive number")
    return value


class RequestBudget:
    """One constant-space token bucket; no client-IP or forwarded-header trust."""

    def __init__(self, rate=30, burst=60, clock=time.monotonic):
        if not math.isfinite(rate) or rate <= 0 or not math.isfinite(burst) or burst < 1:
            raise ValueError("Request rate must be positive and burst must be at least one")
        self.rate = rate
        self.burst = burst
        self._tokens = burst
        self._clock = clock
        self._updated = clock()
        self._lock = threading.Lock()

    def retry_after(self):
        """Admit one request or return whole seconds until a token is available."""
        with self._lock:
            now = max(self._updated, self._clock())
            self._tokens = min(self.burst, self._tokens + (now - self._updated) * self.rate)
            self._updated = now
            if self._tokens >= 1:
                self._tokens -= 1
                return 0
            return max(1, math.ceil((1 - self._tokens) / self.rate))


def init_request_limits(app):
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_BODY_BYTES,
        MAX_FORM_MEMORY_SIZE=MAX_FORM_FIELD_BYTES,
        MAX_FORM_PARTS=MAX_FORM_PARTS,
    )
    app.config.setdefault("HTTP_RATE_LIMIT_ENABLED", True)
    app.extensions["http_request_budget"] = RequestBudget(
        rate=_positive_setting("SCHEDULE1_HTTP_RATE_PER_SECOND", 30),
        burst=_positive_setting("SCHEDULE1_HTTP_BURST", 60),
    )
    app.extensions["server_calculation_slot"] = threading.BoundedSemaphore(1)

    @app.before_request
    def admit_request():
        if app.config["HTTP_RATE_LIMIT_ENABLED"]:
            retry = app.extensions["http_request_budget"].retry_after()
            if retry:
                raise TooManyRequests(retry_after=retry)
        # Enforce declared bodies even on routes that do not read request.data.
        if request.content_length is not None and request.content_length > MAX_BODY_BYTES:
            raise RequestEntityTooLarge()

    @app.errorhandler(RequestEntityTooLarge)
    def body_too_large(_error):
        return jsonify({"error": "Request body or form exceeds the allowed size."}), 413

    @app.errorhandler(TooManyRequests)
    def rate_exceeded(error):
        response = jsonify({"error": "Server request limit reached. Please try again shortly."})
        response.status_code = 429
        response.headers["Retry-After"] = str(error.retry_after or 1)
        return response

    @app.after_request
    def prevent_error_caching(response):
        if request.method not in {"GET", "HEAD"} or response.status_code >= 400:
            response.headers["Cache-Control"] = "no-store"
        return response


def run_server_calculation(app, calculate, *args, **kwargs):
    """Reject overlap instead of filling all HTTP threads with private searches."""
    slot = app.extensions["server_calculation_slot"]
    if not slot.acquire(blocking=False):
        raise TooManyRequests(retry_after=1)
    try:
        return calculate(*args, **kwargs)
    finally:
        slot.release()
