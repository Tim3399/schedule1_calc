"""Publish verified release artifacts from a tag-triggered GitHub Actions run.

GHCR has no atomic create-only push. Repository owners must serialize publication jobs; the
immediate pre-push absence check is only a practical race guard.
"""

from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Callable
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
PRODUCT = "schedule1_calc"
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
FULL_REVISION = re.compile(r"[0-9a-f]{40}")
STABLE_VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
RUN_ID = re.compile(r"[1-9][0-9]*\.[1-9][0-9]*")
REPOSITORY = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+")
IMAGE_MANIFEST_TYPES = {
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
}


class PublishError(Exception):
    """A release cannot safely be published."""


@dataclass(frozen=True)
class HttpResponse:
    status: int
    headers: dict[str, str]
    body: bytes


CommandRunner = Callable[[list[str], str | None], str]
HttpClient = Callable[[str, str, dict[str, str]], HttpResponse]


def run_command(command: list[str], input_text: str | None = None) -> str:
    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            input=input_text,
            text=True,
            capture_output=True,
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise PublishError(f"Cannot run {command[0]}: {error}") from error
    if result.returncode:
        message = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise PublishError(f"{command[0]} failed: {message}")
    return result.stdout.strip()


def http_request(method: str, url: str, headers: dict[str, str]) -> HttpResponse:
    request = urllib.request.Request(url, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return HttpResponse(
                response.status,
                {name.lower(): value for name, value in response.headers.items()},
                response.read(),
            )
    except urllib.error.HTTPError as error:
        return HttpResponse(
            error.code,
            {name.lower(): value for name, value in error.headers.items()},
            error.read(),
        )
    except urllib.error.URLError as error:
        raise PublishError(f"HTTP request failed for {url}: {error.reason}") from error


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return "sha256:" + digest.hexdigest()


def require_environment(
    version: str, revision: str, repository: str, environment: dict[str, str]
) -> tuple[str, str]:
    tag = f"v{version}"
    expected = {
        "GITHUB_EVENT_NAME": "push",
        "GITHUB_REF": f"refs/tags/{tag}",
        "GITHUB_SHA": revision,
        "GITHUB_REPOSITORY": repository,
    }
    for name, value in expected.items():
        if environment.get(name) != value:
            raise PublishError(f"{name} must be {value!r} for this publication.")
    actor = environment.get("GITHUB_ACTOR", "")
    token = environment.get("GH_TOKEN", "")
    if not actor or not token:
        raise PublishError("GITHUB_ACTOR and GH_TOKEN are required for publication.")
    return actor, token


def checked_artifacts(directory: Path, version: str, revision: str, run_id: str) -> dict:
    manifest_path = directory / "release-manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise PublishError(f"Cannot read {manifest_path}: {error}") from error
    required = {
        "schema_version",
        "product",
        "version",
        "revision",
        "run_id",
        "image_id",
        "platform",
        "artifacts",
    }
    if set(manifest) != required:
        raise PublishError("Release manifest has unexpected or missing fields.")
    expected_identity = {
        "schema_version": 1,
        "product": PRODUCT,
        "version": version,
        "revision": revision,
        "run_id": run_id,
        "platform": "linux/amd64",
    }
    for name, expected in expected_identity.items():
        if manifest.get(name) != expected:
            raise PublishError(f"Release manifest {name} does not match {expected!r}.")
    if not isinstance(manifest["image_id"], str) or not SHA256.fullmatch(manifest["image_id"]):
        raise PublishError("Release manifest image_id must be a sha256 digest.")

    expected_artifacts = {
        "source": f"{PRODUCT}-{version}-source.zip",
        "image": f"{PRODUCT}-image.tar",
    }
    artifacts = manifest["artifacts"]
    if not isinstance(artifacts, list) or len(artifacts) != 2:
        raise PublishError("Release manifest must describe the source ZIP and image archive.")
    if [artifact.get("name") for artifact in artifacts if isinstance(artifact, dict)] != [
        "source",
        "image",
    ]:
        raise PublishError("Release manifest artifacts must be ordered source then image.")
    by_name = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict) or set(artifact) != {"name", "path", "sha256", "size"}:
            raise PublishError("Release manifest contains an invalid artifact entry.")
        name = artifact["name"]
        if (
            name in by_name
            or name not in expected_artifacts
            or artifact["path"] != expected_artifacts[name]
        ):
            raise PublishError("Release manifest artifact names and paths are not canonical.")
        path = directory / artifact["path"]
        if not path.is_file():
            raise PublishError(f"Release artifact is missing: {path}")
        if path.stat().st_size != artifact["size"] or file_sha256(path) != artifact["sha256"]:
            raise PublishError(
                f"Release artifact failed size or digest verification: {artifact['path']}"
            )
        by_name[name] = artifact
    if set(by_name) != set(expected_artifacts):
        raise PublishError("Release manifest does not contain the expected artifacts.")
    return manifest


def github_release_absent(repository: str, tag: str, token: str, http: HttpClient) -> None:
    repository_path = "/".join(urllib.parse.quote(part, safe="") for part in repository.split("/"))
    url = f"https://api.github.com/repos/{repository_path}/releases/tags/{urllib.parse.quote(tag)}"
    response = http(
        "GET",
        url,
        {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    if response.status == 404:
        return
    if response.status == 200:
        raise PublishError(
            f"GitHub release {tag} already exists; immutable versions cannot be reused."
        )
    raise PublishError(f"Cannot prove GitHub release absence: HTTP {response.status}.")


def registry_token(repository: str, actor: str, token: str, http: HttpClient) -> str:
    query = urllib.parse.urlencode(
        {"service": "ghcr.io", "scope": f"repository:{repository.lower()}:pull,push"}
    )
    credentials = base64.b64encode(f"{actor}:{token}".encode()).decode()
    response = http(
        "GET",
        f"https://ghcr.io/token?{query}",
        {"Authorization": f"Basic {credentials}", "Accept": "application/json"},
    )
    if response.status != 200:
        raise PublishError(f"Cannot authenticate to GHCR: HTTP {response.status}.")
    try:
        bearer = json.loads(response.body)["token"]
    except (ValueError, KeyError, TypeError) as error:
        raise PublishError("GHCR authentication response did not contain a token.") from error
    if not isinstance(bearer, str) or not bearer:
        raise PublishError("GHCR authentication response contained an invalid token.")
    return bearer


def registry_manifest(
    repository: str,
    reference: str,
    bearer: str,
    http: HttpClient,
    method: str = "HEAD",
) -> HttpResponse:
    return http(
        method,
        f"https://ghcr.io/v2/{repository.lower()}/manifests/{urllib.parse.quote(reference, safe=':')}",
        {
            "Authorization": f"Bearer {bearer}",
            "Accept": ", ".join(
                (
                    "application/vnd.oci.image.manifest.v1+json",
                    "application/vnd.docker.distribution.manifest.v2+json",
                )
            ),
        },
    )


def require_registry_absent(repository: str, tag: str, bearer: str, http: HttpClient) -> None:
    response = registry_manifest(repository, tag, bearer, http)
    if response.status == 404:
        return
    if response.status == 200:
        raise PublishError(f"GHCR tag {tag} already exists; immutable versions cannot be reused.")
    raise PublishError(f"Cannot prove GHCR tag absence: HTTP {response.status}.")


def verify_registry_image(
    repository: str,
    registry_digest: str,
    image_id: str,
    bearer: str,
    http: HttpClient,
) -> None:
    response = registry_manifest(repository, registry_digest, bearer, http, method="GET")
    if response.status != 200:
        raise PublishError(
            f"Cannot fetch the pushed GHCR manifest by immutable digest: HTTP {response.status}."
        )
    content_type = response.headers.get("content-type", "").partition(";")[0].strip().lower()
    if content_type not in IMAGE_MANIFEST_TYPES:
        raise PublishError("Pushed GHCR document is not a single-platform OCI or Docker manifest.")
    if "sha256:" + hashlib.sha256(response.body).hexdigest() != registry_digest:
        raise PublishError("Pushed GHCR manifest body does not match its registry digest.")
    try:
        document = json.loads(response.body)
        config_digest = document["config"]["digest"]
    except (ValueError, KeyError, TypeError) as error:
        raise PublishError(
            "Pushed GHCR manifest does not contain a valid config digest."
        ) from error
    if document.get("schemaVersion") != 2 or config_digest != image_id:
        raise PublishError("Pushed GHCR manifest config does not match the inspected image ID.")


def inspect_loaded_image(
    image_id: str, version: str, revision: str, repository: str, command: CommandRunner
) -> None:
    raw = command(["docker", "image", "inspect", image_id], None)
    try:
        images = json.loads(raw)
        image = images[0]
        labels = image["Config"]["Labels"]
    except (ValueError, IndexError, KeyError, TypeError) as error:
        raise PublishError("Loaded image inspection returned invalid data.") from error
    expected = {
        "Id": image_id,
        "Os": "linux",
        "Architecture": "amd64",
    }
    for name, value in expected.items():
        if image.get(name) != value:
            raise PublishError(f"Loaded image {name} does not match {value!r}.")
    if not isinstance(labels, dict):
        raise PublishError("Loaded image does not contain OCI labels.")
    expected_labels = {
        "org.opencontainers.image.version": version,
        "org.opencontainers.image.revision": revision,
        "org.opencontainers.image.source": f"https://github.com/{repository}",
    }
    for name, value in expected_labels.items():
        if labels.get(name) != value:
            raise PublishError(f"Loaded image label {name} does not match {value!r}.")


def write_receipt(
    directory: Path,
    version: str,
    revision: str,
    run_id: str,
    target: str,
    registry_digest: str,
    image_id: str,
) -> Path:
    source = directory / f"{PRODUCT}-{version}-source.zip"
    manifest = directory / "release-manifest.json"
    image_archive = directory / f"{PRODUCT}-image.tar"
    receipt = {
        "product": PRODUCT,
        "version": version,
        "revision": revision,
        "run_id": run_id,
        "image": f"{target}@{registry_digest}",
        "image_id": image_id,
        "registry_digest": registry_digest,
        "artifacts": {
            source.name: file_sha256(source),
            manifest.name: file_sha256(manifest),
            image_archive.name: file_sha256(image_archive),
        },
    }
    path = directory / "publication-receipt.json"
    path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def publish(
    directory: Path,
    revision: str,
    run_id: str,
    version: str,
    repository: str,
    *,
    environment: dict[str, str] | None = None,
    command: CommandRunner = run_command,
    http: HttpClient = http_request,
) -> str:
    if not FULL_REVISION.fullmatch(revision):
        raise PublishError("revision must be a full lowercase 40-character commit SHA.")
    if not STABLE_VERSION.fullmatch(version):
        raise PublishError("version must be a stable MAJOR.MINOR.PATCH version.")
    if not RUN_ID.fullmatch(run_id):
        raise PublishError("run-id must be RUN.ATTEMPT using positive integers.")
    if not REPOSITORY.fullmatch(repository):
        raise PublishError("repository must be OWNER/NAME.")
    environment = dict(os.environ if environment is None else environment)
    actor, token = require_environment(version, revision, repository, environment)
    directory = directory.resolve()
    tag = f"v{version}"
    target = f"ghcr.io/{repository.lower()}:{tag}"

    command(
        [
            sys.executable,
            str(ROOT / "tools/release.py"),
            "validate-tag",
            "--tag",
            tag,
            "--revision",
            revision,
        ],
        None,
    )
    command(
        [
            sys.executable,
            str(ROOT / "tools/release.py"),
            "verify",
            "--directory",
            str(directory),
            "--revision",
            revision,
            "--run-id",
            run_id,
            "--version",
            version,
        ],
        None,
    )
    manifest = checked_artifacts(directory, version, revision, run_id)
    github_release_absent(repository, tag, token, http)
    bearer = registry_token(repository, actor, token, http)
    require_registry_absent(repository, tag, bearer, http)
    command(["docker", "load", "--input", str(directory / f"{PRODUCT}-image.tar")], None)
    inspect_loaded_image(manifest["image_id"], version, revision, repository, command)
    command(["docker", "tag", manifest["image_id"], target], None)
    command(["docker", "login", "ghcr.io", "--username", actor, "--password-stdin"], token)

    mutation_attempted = False
    try:
        mutation_attempted = True
        command(
            [
                "gh",
                "release",
                "create",
                tag,
                "--repo",
                repository,
                "--draft",
                "--verify-tag",
                "--latest=false",
                "--title",
                tag,
                "--notes",
                f"Verified release {tag} from {revision} (run {run_id}).",
            ],
            None,
        )
        require_registry_absent(repository, tag, bearer, http)
        command(["docker", "push", target], None)
        response = registry_manifest(repository, tag, bearer, http)
        registry_digest = response.headers.get("docker-content-digest", "")
        if response.status != 200 or not SHA256.fullmatch(registry_digest):
            raise PublishError("Cannot verify the pushed GHCR manifest digest.")
        verify_registry_image(
            repository,
            registry_digest,
            manifest["image_id"],
            bearer,
            http,
        )
        receipt = write_receipt(
            directory,
            version,
            revision,
            run_id,
            target,
            registry_digest,
            manifest["image_id"],
        )
        command(
            [
                "gh",
                "release",
                "upload",
                tag,
                str(directory / f"{PRODUCT}-{version}-source.zip"),
                str(directory / "release-manifest.json"),
                str(receipt),
                "--repo",
                repository,
            ],
            None,
        )
        command(
            [
                "gh",
                "release",
                "edit",
                tag,
                "--repo",
                repository,
                "--draft=false",
                "--verify-tag",
            ],
            None,
        )
    except (PublishError, OSError) as error:
        if mutation_attempted:
            raise PublishError(
                f"Publication stopped after reserving draft {tag}. Inspect {tag} and {target}; "
                "recover explicitly without overwriting or deleting remote evidence. "
                f"Cause: {error}"
            ) from error
        raise
    return registry_digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--repository", required=True)
    args = parser.parse_args()
    try:
        digest = publish(args.directory, args.revision, args.run_id, args.version, args.repository)
        print(f"[publish] Published v{args.version} with image digest {digest}.")
        return 0
    except (PublishError, OSError, ValueError, KeyError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
