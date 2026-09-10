"""Guard and ordering tests for publishing verified release artifacts."""

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import publish_release


VERSION = "1.2.3"
REVISION = "a" * 40
RUN_ID = "123.2"
REPOSITORY = "Tim3399/schedule1_calc"
IMAGE_ID = "sha256:" + "b" * 64


def registry_body(config_digest=IMAGE_ID):
    return json.dumps(
        {
            "schemaVersion": 2,
            "config": {
                "mediaType": "application/vnd.oci.image.config.v1+json",
                "digest": config_digest,
                "size": 123,
            },
            "layers": [],
        },
        separators=(",", ":"),
    ).encode()


REGISTRY_BODY = registry_body()
REGISTRY_DIGEST = "sha256:" + hashlib.sha256(REGISTRY_BODY).hexdigest()


def digest(content):
    return "sha256:" + hashlib.sha256(content).hexdigest()


class FakeCommand:
    def __init__(self, events, fail_validate=False, wrong_image=False):
        self.events = events
        self.fail_validate = fail_validate
        self.wrong_image = wrong_image

    def __call__(self, command, input_text):
        label = " ".join(str(part) for part in command)
        self.events.append("command:" + label)
        if "validate-tag" in command and self.fail_validate:
            raise publish_release.PublishError("tag rejected")
        if command[:3] == ["docker", "image", "inspect"]:
            image_id = "sha256:" + "d" * 64 if self.wrong_image else IMAGE_ID
            return json.dumps(
                [
                    {
                        "Id": image_id,
                        "Os": "linux",
                        "Architecture": "amd64",
                        "Config": {
                            "Labels": {
                                "org.opencontainers.image.version": VERSION,
                                "org.opencontainers.image.revision": REVISION,
                                "org.opencontainers.image.source": (
                                    "https://github.com/Tim3399/schedule1_calc"
                                ),
                            }
                        },
                    }
                ]
            )
        return ""


class FakeHttp:
    def __init__(self, events, github_status=404, registry_statuses=None, config_digest=IMAGE_ID):
        self.events = events
        self.github_status = github_status
        self.registry_statuses = list(registry_statuses or [404, 404, 200])
        self.registry_body = registry_body(config_digest)
        self.registry_digest = "sha256:" + hashlib.sha256(self.registry_body).hexdigest()

    def __call__(self, method, url, headers):
        if "api.github.com" in url:
            self.events.append(f"http:github:{self.github_status}")
            return publish_release.HttpResponse(self.github_status, {}, b"")
        if "/token?" in url:
            self.events.append("http:registry-token")
            return publish_release.HttpResponse(200, {}, b'{"token":"bearer"}')
        if method == "GET":
            self.events.append("http:registry-manifest-get")
            return publish_release.HttpResponse(
                200,
                {"content-type": "application/vnd.oci.image.manifest.v1+json"},
                self.registry_body,
            )
        status = self.registry_statuses.pop(0)
        self.events.append(f"http:registry-manifest:{status}")
        headers = {"docker-content-digest": self.registry_digest} if status == 200 else {}
        return publish_release.HttpResponse(status, headers, b"")


class PublishReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.dist = Path(self.directory.name) / "dist"
        self.dist.mkdir()
        self.source = self.dist / f"schedule1_calc-{VERSION}-source.zip"
        self.image = self.dist / "schedule1_calc-image.tar"
        self.source.write_bytes(b"source archive")
        self.image.write_bytes(b"image archive")
        self.write_manifest()
        self.environment = {
            "GITHUB_EVENT_NAME": "push",
            "GITHUB_REF": f"refs/tags/v{VERSION}",
            "GITHUB_SHA": REVISION,
            "GITHUB_REPOSITORY": REPOSITORY,
            "GITHUB_ACTOR": "publisher",
            "GH_TOKEN": "secret-token",
        }

    def write_manifest(self, **changes):
        manifest = {
            "schema_version": 1,
            "product": "schedule1_calc",
            "version": VERSION,
            "revision": REVISION,
            "run_id": RUN_ID,
            "image_id": IMAGE_ID,
            "platform": "linux/amd64",
            "artifacts": [
                {
                    "name": "source",
                    "path": self.source.name,
                    "sha256": digest(self.source.read_bytes()),
                    "size": self.source.stat().st_size,
                },
                {
                    "name": "image",
                    "path": self.image.name,
                    "sha256": digest(self.image.read_bytes()),
                    "size": self.image.stat().st_size,
                },
            ],
        }
        manifest.update(changes)
        (self.dist / "release-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def publish(self, command, http):
        return publish_release.publish(
            self.dist,
            REVISION,
            RUN_ID,
            VERSION,
            REPOSITORY,
            environment=self.environment,
            command=command,
            http=http,
        )

    def test_ref_identity_rejection_runs_no_commands(self):
        self.environment["GITHUB_REF"] = "refs/heads/main"
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "GITHUB_REF"):
            self.publish(FakeCommand(events), FakeHttp(events))

        self.assertEqual(events, [])

    def test_validate_tag_failure_precedes_remote_or_docker_side_effects(self):
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "tag rejected"):
            self.publish(FakeCommand(events, fail_validate=True), FakeHttp(events))

        self.assertEqual(len(events), 1)
        self.assertIn("validate-tag", events[0])

    def test_tampered_artifact_stops_before_remote_mutation(self):
        self.source.write_bytes(b"tampered")
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "digest verification"):
            self.publish(FakeCommand(events), FakeHttp(events))

        self.assertFalse(any("gh release create" in event for event in events))
        self.assertFalse(any("docker push" in event for event in events))

    def test_loaded_image_identity_mismatch_stops_before_remote_mutation(self):
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "Loaded image Id"):
            self.publish(FakeCommand(events, wrong_image=True), FakeHttp(events))

        self.assertFalse(any("gh release create" in event for event in events))
        self.assertFalse(any("docker push" in event for event in events))

    def test_existing_github_release_stops_before_registry_or_mutation(self):
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "already exists"):
            self.publish(FakeCommand(events), FakeHttp(events, github_status=200))

        self.assertFalse(any("registry" in event for event in events))
        self.assertFalse(any("gh release create" in event for event in events))

    def test_existing_registry_tag_stops_before_load_or_mutation(self):
        events = []

        with self.assertRaisesRegex(publish_release.PublishError, "already exists"):
            self.publish(FakeCommand(events), FakeHttp(events, registry_statuses=[200]))

        self.assertFalse(any("docker login" in event for event in events))
        self.assertFalse(any("docker load" in event for event in events))
        self.assertFalse(any("gh release create" in event for event in events))

    def test_registry_race_after_draft_stops_before_push_and_identifies_recovery(self):
        events = []

        with self.assertRaisesRegex(
            publish_release.PublishError, "Inspect v1.2.3 and ghcr.io/tim3399/schedule1_calc"
        ):
            self.publish(FakeCommand(events), FakeHttp(events, registry_statuses=[404, 200]))

        self.assertTrue(any("gh release create" in event for event in events))
        self.assertFalse(any("docker push" in event for event in events))

    def test_pushed_manifest_config_mismatch_keeps_draft_for_recovery(self):
        events = []
        wrong_image_id = "sha256:" + "d" * 64

        with self.assertRaisesRegex(
            publish_release.PublishError, "config does not match the inspected image ID"
        ):
            self.publish(FakeCommand(events), FakeHttp(events, config_digest=wrong_image_id))

        self.assertTrue(any("docker push" in event for event in events))
        self.assertTrue(any("registry-manifest-get" in event for event in events))
        self.assertFalse(any("gh release upload" in event for event in events))
        self.assertFalse(any("gh release edit" in event for event in events))

    def test_success_reserves_then_pushes_uploads_small_assets_and_publishes(self):
        events = []

        result = self.publish(FakeCommand(events), FakeHttp(events))

        self.assertEqual(result, REGISTRY_DIGEST)
        validate = next(i for i, item in enumerate(events) if "validate-tag" in item)
        verify = next(i for i, item in enumerate(events) if " verify " in item)
        reserve = next(i for i, item in enumerate(events) if "gh release create" in item)
        race_guard = max(i for i, item in enumerate(events) if item == "http:registry-manifest:404")
        push = next(i for i, item in enumerate(events) if "docker push" in item)
        upload = next(i for i, item in enumerate(events) if "gh release upload" in item)
        publish = next(i for i, item in enumerate(events) if "gh release edit" in item)
        self.assertLess(validate, verify)
        self.assertLess(verify, reserve)
        self.assertLess(reserve, race_guard)
        self.assertLess(race_guard, push)
        self.assertLess(push, upload)
        self.assertLess(upload, publish)
        self.assertEqual(sum(" verify " in item for item in events), 1)
        self.assertFalse(any("docker build" in item for item in events))
        self.assertNotIn(self.environment["GH_TOKEN"], "\n".join(events))
        upload_command = events[upload]
        self.assertIn(self.source.name, upload_command)
        self.assertIn("release-manifest.json", upload_command)
        self.assertIn("publication-receipt.json", upload_command)
        self.assertNotIn(self.image.name, upload_command)
        receipt = json.loads((self.dist / "publication-receipt.json").read_text())
        self.assertEqual(receipt["registry_digest"], REGISTRY_DIGEST)
        self.assertEqual(receipt["image_id"], IMAGE_ID)
        self.assertEqual(receipt["artifacts"][self.image.name], digest(self.image.read_bytes()))
        self.assertEqual(
            receipt["image"],
            f"ghcr.io/tim3399/schedule1_calc:v{VERSION}@{REGISTRY_DIGEST}",
        )


if __name__ == "__main__":
    unittest.main()
