"""Failure-path and integration checks for the project tooling, not calculator correctness."""

import contextlib
import http.server
import importlib.metadata
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import project


class VersionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "VERSION").write_text("1.0.2\n")
        (self.root / "package.json").write_text('{"version":"1.0.2","keep":"unchanged"}\n')
        (self.root / "package-lock.json").write_text(
            '{"version":"1.0.2","packages":{"":{"version":"1.0.2"},"dependency":{"version":"7.8.9"}}}\n'
        )

    def snapshot(self):
        return {name: (self.root / name).read_bytes() for name in project.VERSION_TARGETS}

    def test_update_changes_all_owned_versions_and_preserves_dependencies(self):
        with mock.patch.object(project, "run", return_value=""):
            self.assertEqual(project.update_version("minor", self.root), "1.1.0")
        self.assertEqual(project.check_versions(self.root), "1.1.0")
        lock = json.loads((self.root / "package-lock.json").read_text())
        self.assertEqual(lock["packages"]["dependency"]["version"], "7.8.9")
        self.assertEqual(json.loads((self.root / "package.json").read_text())["keep"], "unchanged")

    def test_rejects_same_version_downgrade_prerelease_and_noncanonical_version(self):
        before = self.snapshot()
        for version in ("1.0.2", "1.0.1", "1.0.3-rc1", "01.0.3"):
            with self.subTest(version=version), self.assertRaises(project.ProjectError):
                project.update_version(version, self.root)
        self.assertEqual(self.snapshot(), before)

    def test_rejects_manifest_drift_before_any_write(self):
        (self.root / "package.json").write_text('{"version":"2.0.0"}')
        before = self.snapshot()
        with self.assertRaisesRegex(project.ProjectError, "disagree"):
            project.update_version("patch", self.root)
        self.assertEqual(self.snapshot(), before)

    def test_rejects_dirty_tree_and_existing_tag(self):
        before = self.snapshot()
        with mock.patch.object(project, "run", return_value=" M file.py"):
            with self.assertRaisesRegex(project.ProjectError, "local changes"):
                project.update_version("patch", self.root)
        with mock.patch.object(project, "run", side_effect=["", "v1.0.3"]):
            with self.assertRaisesRegex(project.ProjectError, "local tag"):
                project.update_version("patch", self.root)
        self.assertEqual(self.snapshot(), before)

    def test_rolls_back_after_failure_in_middle_of_replacements(self):
        before = self.snapshot()
        real_replace = os.replace

        def replace(source, target):
            if Path(target).name == "package.json":
                raise OSError("simulated disk failure")
            real_replace(source, target)

        with mock.patch.object(project, "run", return_value=""):
            with mock.patch.object(project.os, "replace", side_effect=replace):
                with self.assertRaisesRegex(project.ProjectError, "rolled back"):
                    project.update_version("patch", self.root)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse(list(self.root.glob(".version-*")))


class ProbeHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"product":"foreign-service"}')

    def log_message(self, *args):
        pass


@contextlib.contextmanager
def foreign_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def local_json(url):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=0.5) as response:
        return json.load(response), response.headers


class StartupTests(unittest.TestCase):
    def test_ports_are_strictly_validated(self):
        for invalid in ("0", "65536", "1.5", "-1", "", "abc"):
            with self.subTest(port=invalid), self.assertRaises(Exception):
                project.port_number(invalid)
        self.assertEqual(project.port_number("8123"), 8123)

    def test_missing_dependency_fails_with_actual_interpreter_install_hint(self):
        with mock.patch.object(
            importlib.metadata, "version", side_effect=importlib.metadata.PackageNotFoundError
        ):
            with self.assertRaisesRegex(project.ProjectError, "pip install -r requirements.txt"):
                project.check_python_packages(development=False)

    def test_http_success_from_foreign_instance_does_not_pass_readiness(self):
        with foreign_server() as port:
            started = time.monotonic()
            with self.assertRaisesRegex(project.ProjectError, "another launch"):
                project.wait_for_identity(
                    f"http://127.0.0.1:{port}/",
                    {"product": "schedule1_calc", "instance": "ours"},
                    0.15,
                )
            self.assertLess(time.monotonic() - started, 1.0)

    def test_occupied_port_fails_and_foreign_listener_survives(self):
        with foreign_server() as port:
            result = subprocess.run(
                [
                    sys.executable,
                    str(project.ROOT / "tools/project.py"),
                    "start",
                    "--port",
                    str(port),
                ],
                cwd=tempfile.gettempdir(),
                capture_output=True,
                text=True,
                timeout=15,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("occupied", result.stderr)
            self.assertEqual(
                local_json(f"http://127.0.0.1:{port}/")[0]["product"], "foreign-service"
            )

    def test_alternate_port_serves_frontend_and_identity_then_shuts_down(self):
        with socket.socket() as available:
            available.bind(("127.0.0.1", 0))
            port = available.getsockname()[1]
        options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {}
        process = subprocess.Popen(
            [sys.executable, str(project.ROOT / "tools/project.py"), "dev", "--port", str(port)],
            cwd=tempfile.gettempdir(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            **options,
        )
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    self.fail("Application exited before readiness: " + process.communicate()[1])
                try:
                    identity, headers = local_json(f"http://127.0.0.1:{port}/__dev__/identity")
                    break
                except OSError:
                    time.sleep(0.05)
            else:
                self.fail("Application did not become ready.")
            self.assertEqual(identity["product"], "schedule1_calc")
            self.assertEqual(identity["version"], project.check_versions())
            self.assertNotIn("instance", identity)
            self.assertNotIn("path", identity)
            self.assertEqual(headers["X-Schedule1-Version"], identity["version"])
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(f"http://127.0.0.1:{port}/", timeout=2) as response:
                self.assertIn(b"Best Mix Calculator", response.read())
                self.assertEqual(response.headers["X-Schedule1-Source"], identity["source_digest"])
            process.send_signal(signal.CTRL_BREAK_EVENT if os.name == "nt" else signal.SIGTERM)
            output, errors = process.communicate(timeout=5)
            self.assertEqual(process.returncode, 0, errors)
            self.assertIn("Stopping", output)
            with socket.socket() as connection:
                self.assertNotEqual(connection.connect_ex(("127.0.0.1", port)), 0)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)


if __name__ == "__main__":
    unittest.main()
