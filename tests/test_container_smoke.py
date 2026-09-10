"""Failure and cleanup coverage for the Docker container smoke helper."""

import json
from pathlib import Path
import sys
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import container_smoke


def image_inspection(*, revision="abc123", user="10001:10001"):
    return json.dumps(
        [
            {
                "Architecture": "amd64",
                "Os": "linux",
                "Config": {
                    "User": user,
                    "Labels": {
                        "org.opencontainers.image.version": "1.2.3",
                        "org.opencontainers.image.revision": revision,
                    },
                },
            }
        ]
    )


class ContainerSmokeTests(unittest.TestCase):
    @mock.patch.object(container_smoke, "_request")
    def test_application_probe_accepts_current_legacy_invalid_input_status(self, request):
        request.side_effect = [
            (200, {"Content-Type": "text/html"}, b"<h1>Best Mix Calculator</h1>"),
            (
                200,
                {"Content-Type": "application/json"},
                b'{"best_modifier": {}, "best_profit": {}}',
            ),
            (500, {"Content-Type": "application/json"}, b'{"error": "invalid product"}'),
        ]

        container_smoke.probe_application("http://127.0.0.1:8080")

    @mock.patch.object(container_smoke, "_request")
    def test_application_probe_rejects_invalid_input_that_appears_successful(self, request):
        request.side_effect = [
            (200, {"Content-Type": "text/html"}, b"<h1>Best Mix Calculator</h1>"),
            (
                200,
                {"Content-Type": "application/json"},
                b'{"best_modifier": {}, "best_profit": {}}',
            ),
            (200, {"Content-Type": "application/json"}, b'{"error": "invalid product"}'),
        ]

        with self.assertRaisesRegex(container_smoke.SmokeError, "invalid product"):
            container_smoke.probe_application("http://127.0.0.1:8080")

    @mock.patch.object(container_smoke.uuid, "uuid4")
    @mock.patch.object(container_smoke, "wait_for_application")
    @mock.patch.object(container_smoke, "docker")
    def test_success_uses_random_loopback_port_nonroot_and_cleans_up(self, docker, wait, uuid4):
        uuid4.return_value.hex = "owned"
        docker.side_effect = [image_inspection(), "container-id", "10001", "127.0.0.1:49152", ""]

        container_smoke.smoke_image("example:1.2.3", "1.2.3", "abc123")

        docker.assert_any_call(
            "run",
            "--detach",
            "--rm",
            "--name",
            "schedule1-smoke-owned",
            "--publish",
            "127.0.0.1::8080",
            "example:1.2.3",
        )
        wait.assert_called_once_with("http://127.0.0.1:49152")
        docker.assert_called_with("rm", "--force", "schedule1-smoke-owned", timeout=10, check=False)

    @mock.patch.object(container_smoke.uuid, "uuid4")
    @mock.patch.object(container_smoke, "wait_for_application")
    @mock.patch.object(container_smoke, "docker")
    def test_probe_failure_reports_logs_and_still_cleans_up(self, docker, wait, uuid4):
        uuid4.return_value.hex = "owned"
        docker.side_effect = [
            image_inspection(),
            "container-id",
            "10001",
            "127.0.0.1:49152",
            "startup traceback",
            "",
        ]
        wait.side_effect = container_smoke.SmokeError("probe failed")

        with self.assertRaisesRegex(container_smoke.SmokeError, "startup traceback"):
            container_smoke.smoke_image("example:1.2.3", "1.2.3", "abc123")

        docker.assert_called_with("rm", "--force", "schedule1-smoke-owned", timeout=10, check=False)

    @mock.patch.object(container_smoke.uuid, "uuid4")
    @mock.patch.object(container_smoke, "docker")
    def test_run_failure_still_attempts_owned_container_cleanup(self, docker, uuid4):
        uuid4.return_value.hex = "owned"
        docker.side_effect = [image_inspection(), container_smoke.SmokeError("run failed"), ""]

        with self.assertRaisesRegex(container_smoke.SmokeError, "run failed"):
            container_smoke.smoke_image("example:1.2.3", "1.2.3", "abc123")

        docker.assert_called_with("rm", "--force", "schedule1-smoke-owned", timeout=10, check=False)

    @mock.patch.object(container_smoke, "docker")
    def test_label_mismatch_fails_before_starting_container(self, docker):
        docker.return_value = image_inspection(revision="wrong")

        with self.assertRaisesRegex(container_smoke.SmokeError, "image label"):
            container_smoke.smoke_image("example:1.2.3", "1.2.3", "abc123")

        self.assertEqual(docker.call_count, 1)


if __name__ == "__main__":
    unittest.main()
