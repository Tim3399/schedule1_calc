"""Production HTTP server configuration and real socket boundary tests."""

import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from webapp import serve


ROOT = Path(__file__).resolve().parents[1]


def _unused_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def _exchange(port, request, *, shutdown_write=False):
    with socket.create_connection(("127.0.0.1", port), timeout=2) as connection:
        connection.settimeout(2)
        connection.sendall(request)
        if shutdown_write:
            connection.shutdown(socket.SHUT_WR)
        response = bytearray()
        while True:
            try:
                block = connection.recv(65_536)
            except ConnectionResetError:
                if response:
                    return bytes(response)
                raise
            if not block:
                return bytes(response)
            response.extend(block)


def _status(response):
    return int(response.split(b"\r\n", 1)[0].split()[1])


def _headers(response):
    header_block = response.partition(b"\r\n\r\n")[0]
    return {
        name.decode("ascii").lower(): value.decode("ascii").strip()
        for line in header_block.split(b"\r\n")[1:]
        for name, value in (line.split(b":", 1),)
    }


class ProductionServerConfigurationTests(unittest.TestCase):
    @mock.patch.object(serve, "serve")
    def test_main_supplies_all_resource_bounds_without_proxy_trust(self, waitress_serve):
        serve.main(["--host", "127.0.0.1", "--port", "41234"])

        _, settings = waitress_serve.call_args
        self.assertEqual(
            settings,
            {
                "listen": "127.0.0.1:41234",
                "threads": 4,
                "connection_limit": 32,
                "backlog": 64,
                "channel_timeout": 30,
                "cleanup_interval": 5,
                "max_request_header_size": 16_384,
                "max_request_body_size": 65_536,
                "inbuf_overflow": 65_536,
                "outbuf_overflow": 262_144,
                "outbuf_high_watermark": 1_048_576,
                "expose_tracebacks": False,
                "trusted_proxy": None,
            },
        )

    def test_bad_arguments_are_rejected_before_application_import(self):
        with mock.patch.dict(sys.modules, {"webapp.app": None}):
            for arguments in (["--port", "0"], ["--port", "65536"], ["--host", ""]):
                with self.subTest(arguments=arguments):
                    with self.assertRaises(SystemExit):
                        serve.main(arguments)

    def test_disabled_api_rejects_post_without_starting_calculation(self):
        from webapp import app as app_module

        with app_module.app.test_client() as client:
            with mock.patch.dict(app_module.app.config, {"SERVER_CALCULATION_TOKEN": None}):
                with mock.patch.object(app_module, "get_best_mix") as calculate:
                    response = client.post(
                        "/",
                        json={
                            "level": "street_rat_i",
                            "combination_size": 8,
                            "product_name": "og_kush",
                        },
                    )

        self.assertEqual(response.status_code, 404)
        calculate.assert_not_called()


class ProductionServerSocketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = _unused_port()
        environment = os.environ.copy()
        environment.pop("SCHEDULE1_API_TOKEN", None)
        environment["PYTHONPATH"] = os.pathsep.join((str(ROOT), str(ROOT / "src")))
        environment["SCHEDULE1_LOG_STDOUT_ONLY"] = "1"
        cls.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "webapp.serve",
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.port),
            ],
            cwd=ROOT,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        cls.addClassCleanup(cls._stop_server)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise RuntimeError(f"production server exited with {cls.process.returncode}")
            try:
                response = _exchange(
                    cls.port,
                    b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n",
                )
            except OSError:
                time.sleep(0.05)
                continue
            if _status(response) == 200:
                return
        cls._stop_server()
        raise RuntimeError("production server did not become ready within 10 seconds")

    @classmethod
    def tearDownClass(cls):
        cls._stop_server()

    @classmethod
    def _stop_server(cls):
        process = getattr(cls, "process", None)
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    def test_get_and_head_are_served_normally(self):
        get_response = _exchange(
            self.port,
            b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )
        head_response = _exchange(
            self.port,
            b"HEAD / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        )

        self.assertEqual(_status(get_response), 200)
        self.assertIn(b"Best Mix Calculator", get_response)
        self.assertEqual(_status(head_response), 200, head_response)
        self.assertEqual(head_response.partition(b"\r\n\r\n")[2], b"")

    def test_declared_oversized_body_is_rejected_before_body_is_sent(self):
        response = _exchange(
            self.port,
            b"POST / HTTP/1.0\r\n"
            b"Host: localhost\r\n"
            b"Content-Type: application/json\r\n"
            b"Content-Length: 65537\r\n\r\n",
        )

        self.assertEqual(_status(response), 413)

    def test_oversized_header_is_rejected(self):
        response = _exchange(
            self.port,
            b"GET / HTTP/1.0\r\nHost: localhost\r\nX-Large: " + (b"x" * 16_384) + b"\r\n\r\n",
        )

        self.assertEqual(_status(response), 431)

    def test_oversized_chunked_body_is_rejected(self):
        body = b"x" * 65_537
        response = _exchange(
            self.port,
            b"POST / HTTP/1.1\r\n"
            b"Host: localhost\r\n"
            b"Transfer-Encoding: chunked\r\n"
            b"Content-Type: application/json\r\n"
            b"Connection: close\r\n\r\n"
            + f"{len(body):x}\r\n".encode("ascii")
            + body
            + b"\r\n0\r\n\r\n",
            shutdown_write=True,
        )

        self.assertEqual(_status(response), 413)

    def test_anonymous_post_cannot_start_a_server_calculation(self):
        payload = b'{"level":"street_rat_i","combination_size":8,"product_name":"og_kush"}'
        response = _exchange(
            self.port,
            b"POST / HTTP/1.0\r\n"
            b"Host: localhost\r\n"
            b"Content-Type: application/json\r\n"
            + f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii")
            + payload,
        )

        self.assertEqual(_status(response), 404)
        self.assertIn(b"disabled", response)


class ProductionServerRateLimitSocketTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = _unused_port()
        environment = os.environ.copy()
        environment.pop("SCHEDULE1_API_TOKEN", None)
        environment["PYTHONPATH"] = os.pathsep.join((str(ROOT), str(ROOT / "src")))
        environment["SCHEDULE1_LOG_STDOUT_ONLY"] = "1"
        environment["SCHEDULE1_HTTP_RATE_PER_SECOND"] = "0.01"
        environment["SCHEDULE1_HTTP_BURST"] = "2"
        cls.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "webapp.serve",
                "--host",
                "127.0.0.1",
                "--port",
                str(cls.port),
            ],
            cwd=ROOT,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        cls.addClassCleanup(cls._stop_server)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if cls.process.poll() is not None:
                raise RuntimeError(f"rate-limited server exited with {cls.process.returncode}")
            try:
                response = _exchange(
                    cls.port,
                    b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n",
                )
            except OSError:
                time.sleep(0.05)
                continue
            if _status(response) == 200:
                return
        raise RuntimeError("rate-limited production server did not become ready within 10 seconds")

    @classmethod
    def _stop_server(cls):
        process = getattr(cls, "process", None)
        if process is None or process.poll() is not None:
            return
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    def test_forwarded_client_addresses_share_one_immediate_global_budget(self):
        admitted = _exchange(
            self.port,
            b"GET / HTTP/1.0\r\nHost: localhost\r\nX-Forwarded-For: 192.0.2.1\r\n\r\n",
        )
        started = time.monotonic()
        limited = _exchange(
            self.port,
            b"GET / HTTP/1.0\r\nHost: localhost\r\nX-Forwarded-For: 198.51.100.2\r\n\r\n",
        )
        elapsed = time.monotonic() - started

        self.assertEqual(_status(admitted), 200)
        self.assertEqual(_status(limited), 429)
        headers = _headers(limited)
        self.assertGreaterEqual(int(headers["retry-after"]), 90)
        self.assertEqual(headers["cache-control"], "no-store")
        self.assertLess(elapsed, 1)


if __name__ == "__main__":
    unittest.main()
