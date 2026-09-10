"""Release artifact contract tests using isolated local Git repositories."""

import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import release

VERSION = "1.2.3"
RUN_ID = "12345.2"
IMAGE_ID = "sha256:" + "a" * 64


class RepositoryFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "repository"
        self.root.mkdir()
        self.write("VERSION", f"{VERSION}\n")
        self.write("package.json", json.dumps({"version": VERSION}) + "\n")
        self.write(
            "package-lock.json",
            json.dumps({"version": VERSION, "packages": {"": {"version": VERSION}}}) + "\n",
        )
        self.write("src/app.py", 'print("committed")\n')
        self.git("init", "--initial-branch=main")
        self.git("config", "user.name", "Release Test")
        self.git("config", "user.email", "release@example.invalid")
        self.git("add", ".")
        self.git("commit", "-m", "fixture")
        self.revision = self.git("rev-parse", "HEAD")

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8", newline="\n")
        return path

    def git(self, *arguments):
        result = subprocess.run(
            ["git", "-c", f"safe.directory={self.root.as_posix()}", *arguments],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def build(self, directory=None):
        directory = directory or (self.root / "dist")
        directory.mkdir(parents=True, exist_ok=True)
        image = directory / release.IMAGE_NAME
        image.write_bytes(b"docker image\0fixture")
        manifest = release.build(
            directory,
            self.revision,
            RUN_ID,
            image,
            IMAGE_ID,
            self.root,
        )
        return directory, manifest


class TagValidationTests(RepositoryFixture):
    def test_lightweight_and_annotated_tags_resolve_to_exact_head(self):
        self.git("tag", f"v{VERSION}")
        result = release.validate_tag(f"v{VERSION}", self.revision, self.root)
        self.assertEqual(result["revision"], self.revision)

        self.git("tag", "-d", f"v{VERSION}")
        self.git("tag", "-a", f"v{VERSION}", "-m", "release")
        result = release.validate_tag(f"v{VERSION}", self.revision, self.root)
        self.assertEqual(result["version"], VERSION)

    def test_rejects_noncanonical_mismatched_and_missing_tags(self):
        with (
            self.subTest("noncanonical"),
            self.assertRaisesRegex(release.ReleaseError, "canonical"),
        ):
            release.validate_tag(VERSION, self.revision, self.root)
        with self.subTest("missing"), self.assertRaisesRegex(release.ReleaseError, "missing"):
            release.validate_tag(f"v{VERSION}", self.revision, self.root)

        self.git("tag", f"v{VERSION}")
        self.write("next.txt", "next\n")
        self.git("add", "next.txt")
        self.git("commit", "-m", "next")
        new_revision = self.git("rev-parse", "HEAD")
        with (
            self.subTest("wrong commit"),
            self.assertRaisesRegex(release.ReleaseError, "resolves to"),
        ):
            release.validate_tag(f"v{VERSION}", new_revision, self.root)

    def test_rejects_wrong_revision_and_dirty_tracked_source(self):
        with self.assertRaisesRegex(release.ReleaseError, "full lowercase"):
            release.validate_source("main", self.root)
        self.write("src/app.py", 'print("changed")\n')
        with self.assertRaisesRegex(release.ReleaseError, "dirty"):
            release.validate_source(self.revision, self.root)


class BuildAndVerifyTests(RepositoryFixture):
    def test_branch_build_verify_round_trip_and_excludes_untracked_files(self):
        self.write("secret.env", "DO_NOT_ARCHIVE=1\n")
        directory, manifest = self.build()

        self.assertEqual(manifest["platform"], "linux/amd64")
        self.assertEqual([item["name"] for item in manifest["artifacts"]], ["source", "image"])
        verified = release.verify(directory, self.revision, RUN_ID, VERSION)
        self.assertEqual(verified, manifest)

        source = directory / f"schedule1_calc-{VERSION}-source.zip"
        with zipfile.ZipFile(source) as archive:
            names = archive.namelist()
        self.assertIn(f"schedule1_calc-{VERSION}/src/app.py", names)
        self.assertNotIn(f"schedule1_calc-{VERSION}/secret.env", names)

    def test_source_zip_is_deterministic_for_same_commit(self):
        first, first_manifest = self.build(self.root / "first")
        second, second_manifest = self.build(self.root / "second")
        name = f"schedule1_calc-{VERSION}-source.zip"
        self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
        self.assertEqual(first_manifest["artifacts"][0], second_manifest["artifacts"][0])

    def test_build_rejects_supplied_image_symlink_before_resolving_it(self):
        directory = self.root / "dist"
        directory.mkdir()
        image = directory / release.IMAGE_NAME
        image.write_bytes(b"image")
        original_is_symlink = Path.is_symlink

        def report_supplied_image_as_symlink(path):
            return path == image or original_is_symlink(path)

        with (
            mock.patch.object(Path, "is_symlink", report_supplied_image_as_symlink),
            self.assertRaisesRegex(release.ReleaseError, "regular file"),
        ):
            release.build(
                directory,
                self.revision,
                RUN_ID,
                image,
                IMAGE_ID,
                self.root,
            )

    def test_rejects_missing_and_tampered_artifacts(self):
        cases = ("missing_zip", "tampered_zip", "missing_image", "tampered_image")
        for case in cases:
            with self.subTest(case):
                directory, _ = self.build(self.root / case)
                source = directory / f"schedule1_calc-{VERSION}-source.zip"
                image = directory / release.IMAGE_NAME
                if case == "missing_zip":
                    source.unlink()
                elif case == "tampered_zip":
                    source.write_bytes(source.read_bytes() + b"tampered")
                elif case == "missing_image":
                    image.unlink()
                else:
                    image.write_bytes(b"tampered")
                with self.assertRaises(release.ReleaseError):
                    release.verify(directory, self.revision, RUN_ID, VERSION)

    def test_rejects_manifest_path_escape_and_metadata_changes(self):
        for case in ("escape", "revision", "run_id", "metadata_version", "extra_key"):
            with self.subTest(case):
                directory, manifest = self.build(self.root / case)
                if case == "escape":
                    manifest["artifacts"][0]["path"] = "../source.zip"
                elif case == "revision":
                    manifest["revision"] = "f" * 40
                elif case == "run_id":
                    manifest["run_id"] = "999.1"
                elif case == "metadata_version":
                    manifest["version"] = "9.9.9"
                else:
                    manifest["unexpected"] = True
                (directory / release.MANIFEST_NAME).write_text(
                    json.dumps(manifest), encoding="utf-8"
                )
                with self.assertRaises(release.ReleaseError):
                    release.verify(directory, self.revision, RUN_ID, VERSION)

    def test_rejects_zip_traversal_even_with_matching_manifest_hash(self):
        directory, manifest = self.build()
        source = directory / f"schedule1_calc-{VERSION}-source.zip"
        with zipfile.ZipFile(source, "a") as archive:
            archive.writestr(f"schedule1_calc-{VERSION}/../escape.txt", "escape")
        digest, size = release.hash_file(source)
        manifest["artifacts"][0]["sha256"] = digest
        manifest["artifacts"][0]["size"] = size
        (directory / release.MANIFEST_NAME).write_text(json.dumps(manifest), encoding="utf-8")
        with self.assertRaisesRegex(release.ReleaseError, "Unsafe"):
            release.verify(directory, self.revision, RUN_ID, VERSION)

    def test_rejects_windows_unsafe_zip_members(self):
        unsafe_names = ("VERSION.", "file:stream", "CON.txt", "control\x01.txt")
        for index, unsafe_name in enumerate(unsafe_names):
            with self.subTest(unsafe_name=unsafe_name):
                directory, manifest = self.build(self.root / f"windows-unsafe-{index}")
                source = directory / f"schedule1_calc-{VERSION}-source.zip"
                with zipfile.ZipFile(source, "a") as archive:
                    archive.writestr(f"schedule1_calc-{VERSION}/{unsafe_name}", "unsafe")
                digest, size = release.hash_file(source)
                manifest["artifacts"][0]["sha256"] = digest
                manifest["artifacts"][0]["size"] = size
                (directory / release.MANIFEST_NAME).write_text(
                    json.dumps(manifest), encoding="utf-8"
                )
                with self.assertRaisesRegex(release.ReleaseError, "Unsafe"):
                    release.verify(directory, self.revision, RUN_ID, VERSION)


if __name__ == "__main__":
    unittest.main()
