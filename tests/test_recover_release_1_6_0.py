"""Behavioral guards for the bounded v1.6.0 recovery command."""

import hashlib
import io
import json
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import publish_release
import recover_release_1_6_0 as recovery


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


class ArtifactFixture:
    def __init__(self, root):
        self.root = root
        self.source = root / f"schedule1_calc-{recovery.VERSION}-source.zip"
        self.image = root / "schedule1_calc-image.tar"
        self.manifest_path = root / "release-manifest.json"
        self.layer = b"layer tar bytes"
        self.layer_digest = digest(self.layer)
        self.config = {
            "architecture": "amd64",
            "os": "linux",
            "config": {"Labels": dict(recovery.EXPECTED_LABELS)},
            "rootfs": {"type": "layers", "diff_ids": [self.layer_digest]},
        }
        self.write()

    def write_source(self):
        prefix = f"schedule1_calc-{recovery.VERSION}/"
        with zipfile.ZipFile(self.source, "w") as archive:
            archive.writestr(prefix + "VERSION", recovery.VERSION + "\n")
            archive.writestr(prefix + "package.json", json.dumps({"version": recovery.VERSION}))
            archive.writestr(
                prefix + "package-lock.json",
                json.dumps(
                    {"version": recovery.VERSION, "packages": {"": {"version": recovery.VERSION}}}
                ),
            )

    def tar_entries(self):
        config_bytes = json.dumps(self.config, separators=(",", ":")).encode()
        config_digest = digest(config_bytes)
        manifest = {
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "config": {
                "mediaType": "application/vnd.oci.image.config.v1+json",
                "digest": config_digest,
                "size": len(config_bytes),
            },
            "layers": [
                {
                    "mediaType": "application/vnd.oci.image.layer.v1.tar",
                    "digest": self.layer_digest,
                    "size": len(self.layer),
                }
            ],
        }
        manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()
        manifest_digest = digest(manifest_bytes)
        index = {
            "schemaVersion": 2,
            "mediaType": "application/vnd.oci.image.index.v1+json",
            "manifests": [
                {
                    "mediaType": "application/vnd.oci.image.manifest.v1+json",
                    "digest": manifest_digest,
                    "size": len(manifest_bytes),
                }
            ],
        }
        config_path = "blobs/sha256/" + config_digest.removeprefix("sha256:")
        layer_path = "blobs/sha256/" + self.layer_digest.removeprefix("sha256:")
        manifest_path = "blobs/sha256/" + manifest_digest.removeprefix("sha256:")
        compatibility = [
            {
                "Config": config_path,
                "RepoTags": [f"schedule1-ci:{recovery.REVISION}"],
                "Layers": [layer_path],
                "LayerSources": {
                    self.layer_digest: {
                        "mediaType": "application/vnd.oci.image.layer.v1.tar",
                        "size": len(self.layer),
                        "digest": self.layer_digest,
                    }
                },
            }
        ]
        return (
            {
                "oci-layout": b'{"imageLayoutVersion":"1.0.0"}',
                "index.json": json.dumps(index, separators=(",", ":")).encode(),
                "manifest.json": json.dumps(compatibility, separators=(",", ":")).encode(),
                config_path: config_bytes,
                manifest_path: manifest_bytes,
                layer_path: self.layer,
            },
            config_digest,
            manifest_digest,
            manifest_bytes,
        )

    def write_tar(self, mutate=None):
        entries, config_digest, manifest_digest, manifest_bytes = self.tar_entries()
        if mutate:
            mutate(entries)
        with tarfile.open(self.image, "w") as archive:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        self.config_digest = config_digest
        self.oci_manifest_digest = manifest_digest
        self.oci_manifest_bytes = manifest_bytes

    def write_release_manifest(self):
        manifest = {
            "schema_version": 1,
            "product": "schedule1_calc",
            "version": recovery.VERSION,
            "revision": recovery.REVISION,
            "run_id": recovery.RUN_ID,
            "image_id": self.config_digest,
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
        self.manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

    def write(self, mutate=None):
        self.write_source()
        self.write_tar(mutate)
        self.write_release_manifest()

    def patches(self):
        expected = {
            path.name: (path.stat().st_size, digest(path.read_bytes()))
            for path in (self.source, self.image, self.manifest_path)
        }
        return mock.patch.multiple(
            recovery,
            CONFIG_DIGEST=self.config_digest,
            MANIFEST_DIGEST=self.oci_manifest_digest,
            EXPECTED_FILES=expected,
            EXPECTED_LAYER_COUNT=1,
        )


class RegistryAndGitHubFake:
    def __init__(self, fixture, events, *, bad_asset=False, existing_tag=False, tag_statuses=None):
        self.fixture = fixture
        self.events = events
        self.bad_asset = bad_asset
        self.existing_tag = existing_tag
        self.tag_statuses = list(tag_statuses or [])
        self.blobs = {}
        self.manifests = {}
        self.assets = []
        self.published = False

    def release(self):
        return {
            "id": recovery.DRAFT_ID,
            "tag_name": recovery.TAG,
            "name": recovery.TAG,
            "target_commitish": "main",
            "body": recovery.DRAFT_BODY,
            "created_at": recovery.DRAFT_CREATED_AT,
            "draft": not self.published,
            "prerelease": False,
            "published_at": "2026-09-28T20:00:00Z" if self.published else None,
            "assets": [
                {key: value for key, value in item.items() if key != "data"} for item in self.assets
            ],
        }

    def __call__(self, method, url, headers, body):
        self.events.append(f"http:{method}:{url}")
        if url.endswith(f"/releases/{recovery.DRAFT_ID}"):
            return publish_release.HttpResponse(200, {}, json.dumps(self.release()).encode())
        if "/releases/assets/" in url:
            asset_id = int(url.rsplit("/", 1)[1])
            data = next(item["data"] for item in self.assets if item["id"] == asset_id)
            if self.bad_asset:
                data += b"bad"
            return publish_release.HttpResponse(200, {}, data)
        if "/token?" in url:
            return publish_release.HttpResponse(200, {}, b'{"token":"bearer"}')
        if "/blobs/uploads/" in url and method == "POST":
            return publish_release.HttpResponse(
                202, {"location": "/v2/tim3399/schedule1_calc/blobs/uploads/u?state=x"}, b""
            )
        if "/blobs/uploads/u" in url and method == "PUT":
            requested = dict(
                __import__("urllib").parse.parse_qsl(__import__("urllib").parse.urlsplit(url).query)
            )["digest"]
            self.blobs[requested] = body
            return publish_release.HttpResponse(201, {"docker-content-digest": requested}, b"")
        if "/blobs/" in url and method == "HEAD":
            requested = url.rsplit("/", 1)[1]
            data = self.blobs.get(requested)
            if data is None:
                return publish_release.HttpResponse(404, {}, b"")
            return publish_release.HttpResponse(
                200, {"docker-content-digest": requested, "content-length": str(len(data))}, b""
            )
        if "/manifests/" in url:
            reference = url.rsplit("/", 1)[1]
            if method == "HEAD":
                if reference == recovery.TAG:
                    if self.tag_statuses:
                        return publish_release.HttpResponse(self.tag_statuses.pop(0), {}, b"")
                    if self.existing_tag:
                        return publish_release.HttpResponse(200, {}, b"")
                data = self.manifests.get(reference)
                return publish_release.HttpResponse(200 if data else 404, {}, b"")
            if method == "PUT":
                self.manifests[reference] = body
                return publish_release.HttpResponse(
                    201, {"docker-content-digest": digest(body)}, b""
                )
            data = self.manifests.get(reference)
            return publish_release.HttpResponse(
                200 if data else 404,
                {
                    "docker-content-digest": digest(data),
                    "content-type": "application/vnd.oci.image.manifest.v1+json",
                }
                if data
                else {},
                data or b"",
            )
        raise AssertionError((method, url))

    def command(self, command, input_text):
        self.events.append("command:" + " ".join(str(item) for item in command))
        if command[:3] == ["gh", "release", "upload"]:
            paths = [Path(value) for value in command[4:-2]]
            self.assets = [
                {
                    "id": number,
                    "name": path.name,
                    "state": "uploaded",
                    "size": path.stat().st_size,
                    "data": path.read_bytes(),
                }
                for number, path in enumerate(paths, 1)
            ]
        elif command[:3] == ["gh", "release", "edit"]:
            self.published = True
        return ""


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.fixture = ArtifactFixture(self.root)
        self.environment = {
            "GITHUB_ACTIONS": "true",
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "GITHUB_REF": "refs/heads/main",
            "GITHUB_REPOSITORY": recovery.REPOSITORY,
            "GITHUB_ACTOR": "owner",
            "GH_TOKEN": "token",
        }

    def test_local_verification_accepts_complete_byte_exact_graph(self):
        with self.fixture.patches():
            result = recovery.verify_artifacts(self.root)
        self.assertEqual(result["oci"]["config"]["rootfs"]["diff_ids"], [self.fixture.layer_digest])

    def test_external_file_hash_is_enforced_before_oci_use(self):
        with self.fixture.patches():
            self.fixture.image.write_bytes(b"tampered")
            with self.assertRaisesRegex(recovery.RecoveryError, "artifact contract|byte-exact"):
                recovery.verify_artifacts(self.root)

    def test_oci_rejects_unsafe_duplicate_or_corrupt_members(self):
        entries, _, _, _ = self.fixture.tar_entries()
        entries["../escape"] = b"bad"
        with tarfile.open(self.fixture.image, "w") as archive:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        with self.fixture.patches(), self.assertRaisesRegex(recovery.RecoveryError, "Unsafe"):
            recovery.verify_oci(self.fixture.image)

    def test_oci_rejects_descriptor_digest_size_config_rootfs_and_platform_drift(self):
        cases = [
            (
                "architecture",
                lambda: self.fixture.config.__setitem__("architecture", "arm64"),
                "platform",
            ),
            (
                "rootfs",
                lambda: self.fixture.config["rootfs"].__setitem__(
                    "diff_ids", ["sha256:" + "0" * 64]
                ),
                "diff_ids",
            ),
        ]
        for label, mutation, message in cases:
            with self.subTest(label=label):
                self.fixture.config["architecture"] = "amd64"
                self.fixture.config["rootfs"]["diff_ids"] = [self.fixture.layer_digest]
                mutation()
                self.fixture.write()
                with (
                    self.fixture.patches(),
                    self.assertRaisesRegex(recovery.RecoveryError, message),
                ):
                    recovery.verify_oci(self.fixture.image)
        self.fixture.config["architecture"] = "amd64"
        self.fixture.config["rootfs"]["diff_ids"] = [self.fixture.layer_digest]
        self.fixture.write()
        entries, _, _, _ = self.fixture.tar_entries()
        layer_path = "blobs/sha256/" + self.fixture.layer_digest.removeprefix("sha256:")
        entries[layer_path] += b"corrupt"
        with tarfile.open(self.fixture.image, "w") as archive:
            for name, data in entries.items():
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        with (
            self.fixture.patches(),
            self.assertRaisesRegex(recovery.RecoveryError, "digest or size"),
        ):
            recovery.verify_oci(self.fixture.image)

    def test_wrong_environment_or_confirmation_causes_no_external_activity(self):
        for changed, confirmation in [
            ({"GITHUB_REF": "refs/heads/other"}, recovery.TAG),
            ({}, "yes"),
        ]:
            events = []
            env = self.environment | changed

            def command(*_args, events=events):
                events.append("command")

            def http(*_args, events=events):
                events.append("http")

            with (
                self.subTest(changed=changed, confirmation=confirmation),
                self.assertRaises(recovery.RecoveryError),
            ):
                recovery.execute(
                    self.root,
                    confirmation,
                    environment=env,
                    command=command,
                    http=http,
                )
            self.assertEqual(events, [])

    def test_provenance_mismatch_stops_before_draft_or_registry(self):
        events = []

        def bad_provenance(_token, _http):
            events.append("provenance")
            raise recovery.RecoveryError("Original artifact provenance mismatch")

        with (
            self.fixture.patches(),
            mock.patch.object(recovery, "verify_original_provenance", bad_provenance),
            self.assertRaisesRegex(recovery.RecoveryError, "provenance"),
        ):
            recovery.execute(
                self.root,
                recovery.TAG,
                environment=self.environment,
                command=lambda *_: events.append("command"),
                http=lambda *_: events.append("http"),
            )
        self.assertEqual(events, ["provenance"])

    def test_original_provenance_rejects_run_artifact_gate_and_tag_drift(self):
        run = {
            "id": recovery.RUN_NUMBER,
            "run_attempt": recovery.RUN_ATTEMPT,
            "head_sha": recovery.REVISION,
            "event": "push",
            "head_branch": recovery.TAG,
            "path": ".github/workflows/release.yml",
            "workflow_id": 354927752,
            "conclusion": "failure",
            "status": "completed",
            "repository": {"id": recovery.REPOSITORY_ID},
        }
        artifact = {
            "id": recovery.ARTIFACT_ID,
            "name": recovery.ARTIFACT_NAME,
            "digest": recovery.ARTIFACT_DIGEST,
            "expired": False,
            "workflow_run": {
                "id": recovery.RUN_NUMBER,
                "head_sha": recovery.REVISION,
                "head_branch": recovery.TAG,
                "repository_id": recovery.REPOSITORY_ID,
                "head_repository_id": recovery.REPOSITORY_ID,
            },
        }
        jobs = [{"name": name, "conclusion": "success"} for name in recovery.QUALITY_JOBS]
        documents = {
            "attempts/1": run,
            "artifacts?": {"artifacts": [artifact]},
            "jobs?": {"jobs": jobs},
            "git/ref/": {"object": {"type": "tag", "sha": recovery.TAG_OBJECT}},
            "git/tags/": {
                "tag": recovery.TAG,
                "object": {"type": "commit", "sha": recovery.REVISION},
            },
            "compare/": {
                "status": "ahead",
                "base_commit": {"sha": recovery.REVISION},
            },
        }

        def client(method, url, headers, body):
            del method, headers, body
            if "jobs?" in url:
                document = documents["jobs?"]
            elif "artifacts?" in url:
                document = documents["artifacts?"]
            else:
                document = next(value for fragment, value in documents.items() if fragment in url)
            return publish_release.HttpResponse(200, {}, json.dumps(document).encode())

        cases = [
            (run, "run_attempt", 2),
            (artifact, "id", recovery.ARTIFACT_ID + 1),
            (artifact["workflow_run"], "head_sha", "0" * 40),
            (jobs[0], "conclusion", "failure"),
            (documents["git/ref/"]["object"], "sha", "0" * 40),
        ]
        for target, field, changed in cases:
            original = target[field]
            target[field] = changed
            try:
                with self.subTest(field=field), self.assertRaises(recovery.RecoveryError):
                    recovery.verify_original_provenance("token", client)
            finally:
                target[field] = original

    def run_execution(self, *, bad_asset=False, existing_tag=False, tag_statuses=None):
        events = []
        fake = RegistryAndGitHubFake(
            self.fixture,
            events,
            bad_asset=bad_asset,
            existing_tag=existing_tag,
            tag_statuses=tag_statuses,
        )
        with self.fixture.patches(), mock.patch.object(recovery, "verify_original_provenance"):
            result = recovery.execute(
                self.root,
                recovery.TAG,
                environment=self.environment,
                command=fake.command,
                http=fake,
            )
        return result, fake, events

    def test_existing_registry_tag_stops_before_any_mutation(self):
        with self.assertRaisesRegex(recovery.RecoveryError, "already exists"):
            self.run_execution(existing_tag=True)

    def test_registry_absence_errors_stop_before_any_mutation(self):
        for status in (401, 403, 500):
            with (
                self.subTest(status=status),
                self.assertRaisesRegex(recovery.RecoveryError, f"HTTP {status}"),
            ):
                self.run_execution(tag_statuses=[status])

    def test_registry_tag_race_before_final_tag_put_stops_assets_and_publication(self):
        for status in (200, 401, 403, 500):
            with self.subTest(status=status):
                events = []
                fake = RegistryAndGitHubFake(self.fixture, events, tag_statuses=[404, 404, status])
                with (
                    self.fixture.patches(),
                    mock.patch.object(recovery, "verify_original_provenance"),
                    self.assertRaises(recovery.RecoveryError),
                ):
                    recovery.execute(
                        self.root,
                        recovery.TAG,
                        environment=self.environment,
                        command=fake.command,
                        http=fake,
                    )
                self.assertFalse(any("gh release upload" in event for event in events))
                self.assertFalse(any("gh release edit" in event for event in events))

    def test_happy_path_uploads_exact_oci_then_assets_and_publishes(self):
        result, fake, events = self.run_execution()
        self.assertEqual(result, self.fixture.oci_manifest_digest)
        self.assertEqual(fake.manifests[recovery.TAG], self.fixture.oci_manifest_bytes)
        edit = next(i for i, event in enumerate(events) if "command:gh release edit" in event)
        asset_reads = [i for i, event in enumerate(events) if "/releases/assets/" in event]
        self.assertTrue(asset_reads)
        self.assertLess(max(asset_reads[:3]), edit)
        receipt = json.loads((self.root / "publication-receipt.json").read_text())
        self.assertEqual(receipt["image_id"], self.fixture.config_digest)
        self.assertNotEqual(receipt["image_id"], receipt["registry_digest"])
        self.assertFalse(any("docker" in event for event in events))

    def test_asset_readback_mismatch_prevents_publication(self):
        with self.assertRaisesRegex(recovery.RecoveryError, "Downloaded draft asset bytes differ"):
            self.run_execution(bad_asset=True)

    def test_changed_nonempty_or_published_draft_is_rejected(self):
        baseline = RegistryAndGitHubFake(self.fixture, []).release()
        variants = [
            baseline | {"body": "changed"},
            baseline | {"assets": [{"name": "partial"}]},
            baseline | {"draft": False, "published_at": "2026-09-28T20:00:00Z"},
        ]
        for value in variants:
            with self.subTest(value=value), self.assertRaises(recovery.RecoveryError):
                recovery._validate_release(value, require_empty=True, published=False)

    def test_cross_origin_blob_upload_location_is_rejected_without_put(self):
        events = []

        def http(method, url, headers, body):
            events.append((method, url))
            if method == "HEAD":
                return publish_release.HttpResponse(404, {}, b"")
            return publish_release.HttpResponse(
                202, {"location": "https://evil.example/upload?opaque=a%2Bb"}, b""
            )

        with self.assertRaisesRegex(recovery.RecoveryError, "cross-host"):
            recovery._upload_blob(digest(b"x"), 1, b"x", "bearer", http)
        self.assertFalse(any(method == "PUT" for method, _url in events))


if __name__ == "__main__":
    unittest.main()
