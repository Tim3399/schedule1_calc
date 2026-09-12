"""Request admission, body limits and private-search concurrency contracts."""

from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path
import sys
import threading
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]

from flask import Flask, request
from werkzeug.exceptions import TooManyRequests
from functionality.logging import logging_config
from webapp.request_limits import MAX_BODY_BYTES, RequestBudget, init_request_limits

with mock.patch.object(logging_config, "setup_logging", return_value=mock.Mock()):
    from webapp import app as app_module


class RequestBudgetTests(unittest.TestCase):
    def test_burst_refills_without_early_admission_or_unbounded_credit(self):
        now = [0.0]
        budget = RequestBudget(rate=2, burst=2, clock=lambda: now[0])
        self.assertEqual([budget.retry_after() for _ in range(3)], [0, 0, 1])
        now[0] = 0.49
        self.assertEqual(budget.retry_after(), 1)
        now[0] = 0.5
        self.assertEqual(budget.retry_after(), 0)
        now[0] = 100
        self.assertEqual([budget.retry_after() for _ in range(3)], [0, 0, 1])

    def test_simultaneous_admission_cannot_exceed_burst(self):
        budget = RequestBudget(rate=1, burst=7, clock=lambda: 0)
        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(lambda _: budget.retry_after(), range(60)))
        self.assertEqual(results.count(0), 7)
        self.assertEqual(results.count(1), 53)

    def test_invalid_resource_settings_fail_instead_of_disabling_limits(self):
        for rate, burst in [(0, 2), (-1, 2), (float("inf"), 2), (1, 0.5), (1, float("nan"))]:
            with self.subTest(rate=rate, burst=burst), self.assertRaises(ValueError):
                RequestBudget(rate=rate, burst=burst)


class RequestLimitHttpTests(unittest.TestCase):
    def setUp(self):
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        init_request_limits(self.app)
        self.now = [0.0]
        self.app.extensions["http_request_budget"] = RequestBudget(
            rate=2, burst=3, clock=lambda: self.now[0]
        )

        @self.app.route("/", methods=["GET", "POST"])
        def body():
            return {"size": len(request.get_data())}

        self.client = self.app.test_client()

    def test_budget_applies_to_all_paths_and_does_not_trust_spoofed_ip_headers(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.client.head("/").status_code, 200)
        self.assertEqual(self.client.get("/missing").status_code, 404)
        limited = self.client.get("/?fresh=1", headers={"X-Forwarded-For": "203.0.113.1"})
        self.assertEqual(limited.status_code, 429)
        self.assertEqual(limited.headers["Retry-After"], "1")
        self.assertEqual(limited.headers["Cache-Control"], "no-store")
        self.now[0] = 0.5
        self.assertEqual(self.client.get("/").status_code, 200)

    def test_declared_and_streamed_body_boundaries(self):
        self.app.config["HTTP_RATE_LIMIT_ENABLED"] = False
        response = self.client.post("/", data=b"x" * MAX_BODY_BYTES)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["size"], MAX_BODY_BYTES)
        for method in ("GET", "POST"):
            response = self.client.open("/", method=method, data=b"x" * (MAX_BODY_BYTES + 1))
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.headers["Cache-Control"], "no-store")
        response = self.client.open(
            "/",
            method="POST",
            environ_overrides={
                "wsgi.input": BytesIO(b"x" * (MAX_BODY_BYTES + 1)),
                "wsgi.input_terminated": True,
                "CONTENT_LENGTH": "",
            },
        )
        # The WSGI stream is never read past its budget; Waitress independently
        # rejects an oversized chunked body before dispatching to Flask.
        self.assertIn(response.status_code, (200, 413))
        if response.status_code == 200:
            self.assertEqual(response.json["size"], MAX_BODY_BYTES)


class PrivateRequestLimitTests(unittest.TestCase):
    def setUp(self):
        self.configuration = mock.patch.dict(
            app_module.app.config,
            {
                "TESTING": True,
                "SERVER_CALCULATION_TOKEN": "test-request-limits",
                "HTTP_RATE_LIMIT_ENABLED": False,
            },
        )
        self.configuration.start()
        self.addCleanup(self.configuration.stop)
        self.client = app_module.app.test_client()
        self.client.environ_base["HTTP_AUTHORIZATION"] = "Bearer test-request-limits"
        self.valid = {"combination_size": 1, "product_name": "og_kush", "level": "max"}

    def test_large_json_and_multipart_return_413_without_a_calculation(self):
        with mock.patch.object(app_module, "get_best_mix") as calculate:
            responses = [
                self.client.post(
                    "/get_best_mix", json={**self.valid, "padding": "x" * MAX_BODY_BYTES}
                ),
                self.client.post(
                    "/",
                    data={**self.valid, "padding": "x" * 20_000},
                    content_type="multipart/form-data",
                ),
                self.client.post(
                    "/",
                    data={**self.valid, **{f"extra{i}": "x" for i in range(9)}},
                    content_type="multipart/form-data",
                ),
            ]
        calculate.assert_not_called()
        for response in responses:
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_only_one_private_search_runs_and_releases_slot_after_failure(self):
        entered, release = threading.Event(), threading.Event()

        def calculation(*_args, **_kwargs):
            entered.set()
            if not release.wait(3):
                raise AssertionError("Test did not release its private search")
            raise ValueError("simulated calculation failure")

        def first_request():
            with app_module.app.test_client() as client:
                return client.post(
                    "/get_best_mix",
                    json=self.valid,
                    headers={"Authorization": "Bearer test-request-limits"},
                )

        with mock.patch.object(app_module, "get_best_mix", side_effect=calculation) as calculate:
            with ThreadPoolExecutor(max_workers=1) as pool:
                first = pool.submit(first_request)
                try:
                    self.assertTrue(entered.wait(2))
                    for path, kwargs in [
                        ("/get_best_mix", {"json": self.valid}),
                        ("/", {"data": self.valid}),
                    ]:
                        response = self.client.post(path, **kwargs)
                        self.assertEqual(response.status_code, 429)
                        self.assertEqual(response.headers["Retry-After"], "1")
                        self.assertEqual(response.headers["Cache-Control"], "no-store")
                    self.assertEqual(calculate.call_count, 1)
                    self.assertEqual(self.client.get("/").status_code, 200)
                finally:
                    release.set()
                self.assertEqual(first.result(timeout=3).status_code, 500)
        with mock.patch.object(
            app_module, "get_best_mix", side_effect=TooManyRequests(retry_after=2)
        ):
            self.assertEqual(self.client.post("/get_best_mix", json=self.valid).status_code, 429)
        slot = app_module.app.extensions["server_calculation_slot"]
        self.assertTrue(slot.acquire(blocking=False))
        slot.release()


if __name__ == "__main__":
    unittest.main()
