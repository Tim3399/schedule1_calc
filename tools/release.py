"""Build and verify immutable release artifacts for schedule1_calc."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

try:
    from project import ProjectError, check_versions, parse_version
except ModuleNotFoundError:  # Imported as tools.release by the test suite.
    from tools.project import ProjectError, check_versions, parse_version


ROOT = Path(__file__).resolve().parents[1]
PRODUCT = "schedule1_calc"
PLATFORM = "linux/amd64"
MANIFEST_NAME = "release-manifest.json"
IMAGE_NAME = "schedule1_calc-image.tar"
REVISION = re.compile(r"[0-9a-f]{40}")
RUN_ID = re.compile(r"[1-9][0-9]*\.[1-9][0-9]*")
IMAGE_ID = re.compile(r"sha256:[0-9a-f]{64}")
WINDOWS_RESERVED_NAMES = {
    "aux",
    "con",
    "conin$",
    "conout$",
    "nul",
    "prn",
    *(f"com{suffix}" for suffix in "123456789¹²³"),
    *(f"lpt{suffix}" for suffix in "123456789¹²³"),
}


class ReleaseError(Exception):
    """An actionable release-contract failure."""


def git(arguments: list[str], root: Path, *, output: Path | None = None) -> str:
    command = ["git", *arguments]
    try:
        if output is None:
            result = subprocess.run(
                command, cwd=root, text=True, capture_output=True, timeout=120, check=False
            )
        else:
            with output.open("wb") as stream:
                result = subprocess.run(
                    command,
                    cwd=root,
                    stdout=stream,
                    stderr=subprocess.PIPE,
                    timeout=120,
                    check=False,
                )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError(f"Cannot run Git: {error}") from error
    if result.returncode:
        stderr = result.stderr
        if isinstance(stderr, bytes):
            stderr = stderr.decode("utf-8", errors="replace")
        raise ReleaseError((stderr or "Git command failed.").strip())
    return result.stdout.strip() if isinstance(result.stdout, str) else ""


def validate_revision(value: str) -> str:
    if not REVISION.fullmatch(value):
        raise ReleaseError("Revision must be a full lowercase 40-character Git SHA.")
    return value


def validate_run_id(value: str) -> str:
    if not RUN_ID.fullmatch(value):
        raise ReleaseError("Run ID must have the form RUN.ATTEMPT using positive integers.")
    return value


def validate_image_id(value: str) -> str:
    if not IMAGE_ID.fullmatch(value):
        raise ReleaseError("Image ID must be sha256: followed by 64 lowercase hex characters.")
    return value


def validate_version(value: str) -> str:
    try:
        parse_version(value)
    except ProjectError as error:
        raise ReleaseError(str(error)) from error
    return value


def validate_source(revision: str, root: Path = ROOT) -> str:
    revision = validate_revision(revision)
    try:
        version = check_versions(root)
    except (ProjectError, OSError, ValueError, KeyError) as error:
        raise ReleaseError(str(error)) from error
    head = git(["rev-parse", "HEAD"], root)
    if head != revision:
        raise ReleaseError(f"Revision {revision} is not the checked-out HEAD {head}.")
    if git(["status", "--porcelain", "--untracked-files=no"], root):
        raise ReleaseError("Tracked files are dirty; commit or restore them before packaging.")
    return version


def validate_tag(tag: str, revision: str, root: Path = ROOT) -> dict[str, object]:
    version = validate_source(revision, root)
    expected = f"v{version}"
    if tag != expected:
        raise ReleaseError(f"Expected canonical release tag {expected!r}, got {tag!r}.")
    try:
        tagged_revision = git(["rev-parse", "--verify", f"refs/tags/{tag}^{{commit}}"], root)
    except ReleaseError as error:
        raise ReleaseError(f"Release tag {tag!r} is missing or does not name a commit.") from error
    if tagged_revision != revision:
        raise ReleaseError(f"Release tag {tag!r} resolves to {tagged_revision}, not {revision}.")
    return {"status": "ok", "tag": tag, "version": version, "revision": revision}


def hash_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
    return "sha256:" + digest.hexdigest(), size


def artifact(name: str, path: Path) -> dict[str, object]:
    digest, size = hash_file(path)
    return {"name": name, "path": path.name, "sha256": digest, "size": size}


def require_regular_file(path: Path, label: str) -> None:
    if path.is_symlink() or not path.is_file():
        raise ReleaseError(f"{label} must be an existing regular file: {path}")


def require_writable_target(path: Path, label: str) -> None:
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ReleaseError(f"{label} output path must be a regular file: {path}")


def windows_unsafe_segment(segment: str) -> bool:
    basename = segment.split(".", 1)[0].rstrip(" ").casefold()
    return (
        ":" in segment
        or any(ord(character) < 32 or ord(character) == 127 for character in segment)
        or segment.endswith((".", " "))
        or basename in WINDOWS_RESERVED_NAMES
    )


def build(
    output: Path,
    revision: str,
    run_id: str,
    image: Path,
    image_id: str,
    root: Path = ROOT,
) -> dict[str, object]:
    version = validate_source(revision, root)
    validate_run_id(run_id)
    validate_image_id(image_id)
    output.mkdir(parents=True, exist_ok=True)
    output = output.resolve()
    require_regular_file(image, "Image artifact")
    image = image.resolve()
    if image.name != IMAGE_NAME or image.parent != output:
        raise ReleaseError(f"Image must be {output / IMAGE_NAME}.")

    source_name = f"{PRODUCT}-{version}-source.zip"
    source = output / source_name
    require_writable_target(source, "Source artifact")
    manifest_path = output / MANIFEST_NAME
    require_writable_target(manifest_path, "Release manifest")
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=output, prefix=".source-", suffix=".zip", delete=False
        ) as temporary:
            temporary_path = Path(temporary.name)
        git(
            [
                "archive",
                "--format=zip",
                f"--prefix={PRODUCT}-{version}/",
                revision,
            ],
            root,
            output=temporary_path,
        )
        os.replace(temporary_path, source)
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    manifest: dict[str, object] = {
        "schema_version": 1,
        "product": PRODUCT,
        "version": version,
        "revision": revision,
        "run_id": run_id,
        "image_id": image_id,
        "platform": PLATFORM,
        "artifacts": [artifact("source", source), artifact("image", image)],
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return manifest


def strict_keys(value: object, keys: set[str], label: str) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise ReleaseError(f"{label} must contain exactly: {', '.join(sorted(keys))}.")
    return value


def validate_zip(path: Path, version: str) -> None:
    prefix = f"{PRODUCT}-{version}/"
    names: set[str] = set()
    folded: set[str] = set()
    required: dict[str, bytes] = {}
    try:
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                name = member.filename
                pure = PurePosixPath(name)
                canonical = pure.as_posix() + ("/" if member.is_dir() else "")
                if (
                    not name.startswith(prefix)
                    or "\\" in name
                    or name.startswith("/")
                    or any(part in ("", ".", "..") for part in pure.parts)
                    or any(windows_unsafe_segment(part) for part in pure.parts)
                    or (member.is_dir() and not name.endswith("/"))
                    or name != canonical
                ):
                    raise ReleaseError(f"Unsafe source ZIP member: {name!r}.")
                key = name.casefold()
                if name in names or key in folded:
                    raise ReleaseError(f"Duplicate source ZIP member: {name!r}.")
                names.add(name)
                folded.add(key)
                mode = (member.external_attr >> 16) & 0xFFFF
                file_type = stat.S_IFMT(mode)
                if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise ReleaseError(f"Non-regular source ZIP member: {name!r}.")
                if member.flag_bits & 0x1:
                    raise ReleaseError(f"Encrypted source ZIP member: {name!r}.")
                relative = name.removeprefix(prefix)
                if relative in {"VERSION", "package.json", "package-lock.json"}:
                    required[relative] = archive.read(member)
    except (OSError, zipfile.BadZipFile, RuntimeError) as error:
        raise ReleaseError(f"Cannot inspect source ZIP: {error}") from error
    if set(required) != {"VERSION", "package.json", "package-lock.json"}:
        raise ReleaseError("Source ZIP is missing version records.")
    try:
        archived_version = required["VERSION"].decode("utf-8").strip()
        package = json.loads(required["package.json"])
        lock = json.loads(required["package-lock.json"])
        copies = (package["version"], lock["version"], lock["packages"][""]["version"])
    except (UnicodeDecodeError, ValueError, KeyError, TypeError) as error:
        raise ReleaseError(f"Source ZIP has invalid version records: {error}") from error
    if archived_version != version or any(copy != version for copy in copies):
        raise ReleaseError("Source ZIP version records disagree with the release manifest.")


def verify(directory: Path, revision: str, run_id: str, version: str) -> dict[str, object]:
    validate_revision(revision)
    validate_run_id(run_id)
    validate_version(version)
    directory = directory.resolve()
    manifest_path = directory / MANIFEST_NAME
    require_regular_file(manifest_path, "Release manifest")
    try:
        manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValueError) as error:
        raise ReleaseError(f"Cannot read release manifest: {error}") from error
    manifest = strict_keys(
        manifest_data,
        {
            "schema_version",
            "product",
            "version",
            "revision",
            "run_id",
            "image_id",
            "platform",
            "artifacts",
        },
        "Release manifest",
    )
    expected_metadata = {
        "schema_version": 1,
        "product": PRODUCT,
        "version": version,
        "revision": revision,
        "run_id": run_id,
        "platform": PLATFORM,
    }
    for key, expected in expected_metadata.items():
        if manifest[key] != expected:
            raise ReleaseError(f"Manifest {key} must be {expected!r}.")
    if not isinstance(manifest["image_id"], str):
        raise ReleaseError("Manifest image_id must be a string.")
    validate_image_id(manifest["image_id"])

    source_name = f"{PRODUCT}-{version}-source.zip"
    expected_artifacts = (("source", source_name), ("image", IMAGE_NAME))
    entries = manifest["artifacts"]
    if not isinstance(entries, list) or len(entries) != 2:
        raise ReleaseError("Manifest must contain exactly the source and image artifacts.")
    allowed_files = {MANIFEST_NAME, source_name, IMAGE_NAME}
    try:
        actual_files = {entry.name for entry in directory.iterdir()}
    except OSError as error:
        raise ReleaseError(f"Cannot inspect release directory: {error}") from error
    if actual_files != allowed_files:
        raise ReleaseError(
            "Release directory must contain only the manifest, source ZIP and image tar."
        )

    for entry, (expected_name, expected_path) in zip(entries, expected_artifacts, strict=True):
        record = strict_keys(entry, {"name", "path", "sha256", "size"}, "Artifact record")
        if record["name"] != expected_name or record["path"] != expected_path:
            raise ReleaseError(f"Unexpected {expected_name} artifact name or path.")
        if not isinstance(record["sha256"], str) or not IMAGE_ID.fullmatch(record["sha256"]):
            raise ReleaseError(f"Invalid {expected_name} artifact SHA-256.")
        if type(record["size"]) is not int or record["size"] < 0:
            raise ReleaseError(f"Invalid {expected_name} artifact size.")
        path = directory / expected_path
        require_regular_file(path, f"{expected_name.title()} artifact")
        digest, size = hash_file(path)
        if digest != record["sha256"] or size != record["size"]:
            raise ReleaseError(f"{expected_name.title()} artifact digest or size does not match.")
    validate_zip(directory / source_name, version)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    tag = commands.add_parser("validate-tag")
    tag.add_argument("--tag", required=True)
    tag.add_argument("--revision", required=True)
    package = commands.add_parser("build")
    package.add_argument("--output", type=Path, required=True)
    package.add_argument("--revision", required=True)
    package.add_argument("--run-id", required=True)
    package.add_argument("--image", type=Path, required=True)
    package.add_argument("--image-id", required=True)
    check = commands.add_parser("verify")
    check.add_argument("--directory", type=Path, required=True)
    check.add_argument("--revision", required=True)
    check.add_argument("--run-id", required=True)
    check.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        if args.command == "validate-tag":
            result = validate_tag(args.tag, args.revision)
        elif args.command == "build":
            result = build(args.output, args.revision, args.run_id, args.image, args.image_id)
        else:
            result = verify(args.directory, args.revision, args.run_id, args.version)
        print(json.dumps({"status": "ok", **result}, separators=(",", ":")))
        return 0
    except (ReleaseError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
