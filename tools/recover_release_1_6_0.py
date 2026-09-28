"""Verify or explicitly complete the retained v1.6.0 release artifacts.

The default mode is local and read-only.  ``--execute`` is intentionally tied to the one
reviewed release identity below and only works in its trusted manual GitHub Actions workflow.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tarfile
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path, PurePosixPath
from typing import Any

try:
    import publish_release as publisher
    import release
except ModuleNotFoundError:  # Imported as tools.recover_release_1_6_0 by tests.
    from tools import publish_release as publisher
    from tools import release


VERSION = "1.6.0"
REVISION = "41e9608efedd68c27c4e63223af75458a3b5d0e7"
TAG = "v1.6.0"
TAG_OBJECT = "db62e2fa0c348bd5dce6fb6ca6f090af671d4b03"
RUN_NUMBER = 36464467830
RUN_ATTEMPT = 1
RUN_ID = "36464467830.1"
ARTIFACT_ID = 10989900296
ARTIFACT_NAME = "release-inputs-41e9608efedd68c27c4e63223af75458a3b5d0e7-36464467830.1"
ARTIFACT_DIGEST = "sha256:04eb5d0cca26482a6e998b461a8c553ef08bc68607b320d8214ec2ecc04e9a37"
REPOSITORY_ID = 965491106
DRAFT_ID = 398510418
DRAFT_CREATED_AT = "2026-09-28T18:20:18Z"
DRAFT_BODY = (
    "Verified release v1.6.0 from 41e9608efedd68c27c4e63223af75458a3b5d0e7 (run 36464467830.1)."
)
REPOSITORY = "Tim3399/schedule1_calc"
CONFIG_DIGEST = "sha256:8a677550971416a381088b4756accc2017e218ac404930c6a7c50a768152ed5f"
MANIFEST_DIGEST = "sha256:0e8809c45ab13bfa47c08ae8c91269eafd09d60072f961dad0b744df622913bb"
EXPECTED_LAYER_COUNT = 12
EXPECTED_FILES = {
    "schedule1_calc-1.6.0-source.zip": (
        475846,
        "sha256:0fd7111eada9efb1ff844fcf5c4b1d4c98f8d2be796c5fa13ffcd08166bd8421",
    ),
    "schedule1_calc-image.tar": (
        135051776,
        "sha256:ae8294ad0fe4a89d748c6dde0135ba00bc0a6ef25a089f2d4314772a05e93167",
    ),
    "release-manifest.json": (
        696,
        "sha256:6556e0a49fb73daecd10ee5ae2932a7b1a3f70e0934a860b5a5cf1278cd1e2c5",
    ),
}
EXPECTED_LABELS = {
    "org.opencontainers.image.title": "schedule1_calc",
    "org.opencontainers.image.source": "https://github.com/Tim3399/schedule1_calc",
    "org.opencontainers.image.version": VERSION,
    "org.opencontainers.image.revision": REVISION,
}
QUALITY_JOBS = {
    "Quality gates / Checks (ubuntu-24.04)",
    "Quality gates / Checks (windows-2025)",
    "Quality gates / Source and container",
    "Quality gates / Project checks",
}


class RecoveryError(Exception):
    """Recovery cannot continue without risking an immutable release."""


MutationHttp = Callable[[str, str, dict[str, str], bytes | None], publisher.HttpResponse]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def http_request(
    method: str, url: str, headers: dict[str, str], body: bytes | None = None
) -> publisher.HttpResponse:
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.build_opener(_NoRedirect).open(request, timeout=60) as response:
            return publisher.HttpResponse(
                response.status,
                {name.lower(): value for name, value in response.headers.items()},
                response.read(),
            )
    except urllib.error.HTTPError as error:
        return publisher.HttpResponse(
            error.code,
            {name.lower(): value for name, value in error.headers.items()},
            error.read(),
        )
    except urllib.error.URLError as error:
        raise RecoveryError(f"HTTP request failed for {url}: {error.reason}") from error


def _digest(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _json(data: bytes, label: str) -> Any:
    try:
        return json.loads(data)
    except (UnicodeDecodeError, ValueError) as error:
        raise RecoveryError(f"{label} is not valid JSON: {error}") from error


def _strict_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RecoveryError(f"{label} must be a JSON object.")
    return value


def _safe_tar_name(member: tarfile.TarInfo) -> None:
    name = member.name
    path = PurePosixPath(name)
    canonical = path.as_posix()
    if (
        not name
        or "\\" in name
        or name.startswith("/")
        or any(part in ("", ".", "..") for part in path.parts)
        or any(release.windows_unsafe_segment(part) for part in path.parts)
        or name != canonical
        or not (member.isfile() or member.isdir())
    ):
        raise RecoveryError(f"Unsafe OCI archive member: {name!r}.")


def _read_member(archive: tarfile.TarFile, members: dict[str, tarfile.TarInfo], name: str) -> bytes:
    member = members.get(name)
    if member is None or not member.isfile():
        raise RecoveryError(f"OCI archive is missing regular member {name!r}.")
    stream = archive.extractfile(member)
    if stream is None:
        raise RecoveryError(f"Cannot read OCI archive member {name!r}.")
    data = stream.read()
    if len(data) != member.size:
        raise RecoveryError(f"OCI archive member {name!r} has an inconsistent size.")
    return data


def _descriptor_blob(
    archive: tarfile.TarFile,
    members: dict[str, tarfile.TarInfo],
    descriptor: Any,
    label: str,
) -> tuple[dict[str, Any], bytes]:
    descriptor = _strict_object(descriptor, label)
    digest = descriptor.get("digest")
    size = descriptor.get("size")
    if not isinstance(digest, str) or not publisher.SHA256.fullmatch(digest):
        raise RecoveryError(f"{label} has an invalid digest.")
    if type(size) is not int or size < 0:
        raise RecoveryError(f"{label} has an invalid size.")
    data = _read_member(archive, members, f"blobs/sha256/{digest.removeprefix('sha256:')}")
    if len(data) != size or _digest(data) != digest:
        raise RecoveryError(f"{label} blob digest or size does not match its descriptor.")
    return descriptor, data


def verify_oci(path: Path) -> dict[str, Any]:
    """Validate the complete referenced OCI graph and Docker compatibility view in place."""
    try:
        with tarfile.open(path, "r:") as archive:
            members: dict[str, tarfile.TarInfo] = {}
            folded: set[str] = set()
            for member in archive.getmembers():
                _safe_tar_name(member)
                if member.name in members or member.name.casefold() in folded:
                    raise RecoveryError(f"Duplicate OCI archive member: {member.name!r}.")
                members[member.name] = member
                folded.add(member.name.casefold())

            layout = _strict_object(
                _json(_read_member(archive, members, "oci-layout"), "oci-layout"), "oci-layout"
            )
            if layout != {"imageLayoutVersion": "1.0.0"}:
                raise RecoveryError("OCI layout version is not exactly 1.0.0.")
            index = _strict_object(
                _json(_read_member(archive, members, "index.json"), "OCI index"), "OCI index"
            )
            descriptors = index.get("manifests")
            if (
                index.get("schemaVersion") != 2
                or not isinstance(descriptors, list)
                or len(descriptors) != 1
            ):
                raise RecoveryError("OCI index must contain exactly one image manifest.")
            manifest_descriptor, manifest_bytes = _descriptor_blob(
                archive, members, descriptors[0], "OCI manifest descriptor"
            )
            if manifest_descriptor.get("mediaType") != "application/vnd.oci.image.manifest.v1+json":
                raise RecoveryError("OCI index does not describe a single OCI image manifest.")
            if manifest_descriptor["digest"] != MANIFEST_DIGEST:
                raise RecoveryError("OCI manifest digest is not the retained original digest.")
            manifest = _strict_object(_json(manifest_bytes, "OCI manifest"), "OCI manifest")
            if (
                manifest.get("schemaVersion") != 2
                or manifest.get("mediaType") != "application/vnd.oci.image.manifest.v1+json"
            ):
                raise RecoveryError("OCI manifest has an invalid schema or media type.")
            config_descriptor, config_bytes = _descriptor_blob(
                archive, members, manifest.get("config"), "OCI config descriptor"
            )
            if config_descriptor.get("mediaType") != "application/vnd.oci.image.config.v1+json":
                raise RecoveryError("OCI config descriptor has an invalid media type.")
            if config_descriptor["digest"] != CONFIG_DIGEST:
                raise RecoveryError("OCI config digest is not the retained original config ID.")
            config = _strict_object(_json(config_bytes, "OCI config"), "OCI config")
            if config.get("os") != "linux" or config.get("architecture") != "amd64":
                raise RecoveryError("OCI config platform must be linux/amd64.")
            labels = (
                config.get("config", {}).get("Labels")
                if isinstance(config.get("config"), dict)
                else None
            )
            if not isinstance(labels, dict) or any(
                labels.get(key) != value for key, value in EXPECTED_LABELS.items()
            ):
                raise RecoveryError("OCI config labels do not match the retained release identity.")
            rootfs = config.get("rootfs")
            diff_ids = rootfs.get("diff_ids") if isinstance(rootfs, dict) else None
            layers = manifest.get("layers")
            if rootfs is None or rootfs.get("type") != "layers" or not isinstance(diff_ids, list):
                raise RecoveryError("OCI config contains an invalid rootfs description.")
            if (
                not isinstance(layers, list)
                or len(layers) != EXPECTED_LAYER_COUNT
                or len(diff_ids) != EXPECTED_LAYER_COUNT
            ):
                raise RecoveryError("OCI layer descriptors and rootfs diff IDs disagree.")
            layer_paths: list[str] = []
            layer_descriptors: dict[str, dict[str, Any]] = {}
            for position, (descriptor, diff_id) in enumerate(zip(layers, diff_ids, strict=True)):
                descriptor, layer_bytes = _descriptor_blob(
                    archive, members, descriptor, f"OCI layer descriptor {position}"
                )
                media_type = descriptor.get("mediaType")
                if media_type != "application/vnd.oci.image.layer.v1.tar":
                    raise RecoveryError(f"OCI layer {position} is not an uncompressed OCI layer.")
                if not isinstance(diff_id, str) or _digest(layer_bytes) != diff_id:
                    raise RecoveryError(f"OCI layer {position} does not match rootfs.diff_ids.")
                layer_paths.append(f"blobs/sha256/{diff_id.removeprefix('sha256:')}")
                layer_descriptors[descriptor["digest"]] = descriptor

            compatibility = _json(
                _read_member(archive, members, "manifest.json"), "Docker manifest"
            )
            if not isinstance(compatibility, list) or len(compatibility) != 1:
                raise RecoveryError("Docker compatibility manifest must contain exactly one image.")
            docker_view = _strict_object(compatibility[0], "Docker compatibility image")
            expected_config_path = f"blobs/sha256/{CONFIG_DIGEST.removeprefix('sha256:')}"
            if (
                docker_view.get("Config") != expected_config_path
                or docker_view.get("Layers") != layer_paths
            ):
                raise RecoveryError("Docker compatibility manifest does not match the OCI graph.")
            layer_sources = docker_view.get("LayerSources")
            if not isinstance(layer_sources, dict) or set(layer_sources) != set(layer_descriptors):
                raise RecoveryError(
                    "Docker compatibility layer sources do not match the OCI graph."
                )
            for digest, descriptor in layer_descriptors.items():
                if layer_sources[digest] != {
                    "mediaType": descriptor["mediaType"],
                    "size": descriptor["size"],
                    "digest": digest,
                }:
                    raise RecoveryError(
                        "Docker compatibility layer source metadata does not match the OCI graph."
                    )
            for position, (member_name, diff_id) in enumerate(
                zip(layer_paths, diff_ids, strict=True)
            ):
                if _digest(_read_member(archive, members, member_name)) != diff_id:
                    raise RecoveryError(
                        f"Docker compatibility layer {position} is not the declared diff ID."
                    )
            expected_tag = f"schedule1-ci:{REVISION}"
            if docker_view.get("RepoTags") != [expected_tag]:
                raise RecoveryError(
                    "Docker compatibility tag does not match the original build tag."
                )
            return {
                "manifest": manifest,
                "manifest_bytes": manifest_bytes,
                "config": config,
                "diff_ids": diff_ids,
                "source_tag": expected_tag,
                "blobs": {
                    config_descriptor["digest"]: (config_descriptor["size"], config_bytes),
                    **{
                        descriptor["digest"]: (descriptor["size"], data)
                        for descriptor, data in (
                            _descriptor_blob(
                                archive, members, descriptor, f"OCI retained layer {position}"
                            )
                            for position, descriptor in enumerate(layers)
                        )
                    },
                },
            }
    except (OSError, tarfile.TarError) as error:
        raise RecoveryError(f"Cannot inspect OCI archive: {error}") from error


def verify_artifacts(directory: Path) -> dict[str, Any]:
    directory = directory.resolve()
    try:
        manifest = release.verify(directory, REVISION, RUN_ID, VERSION)
    except (release.ReleaseError, OSError, ValueError, KeyError) as error:
        raise RecoveryError(f"Release artifact contract failed: {error}") from error
    for name, (expected_size, expected_digest) in EXPECTED_FILES.items():
        path = directory / name
        if path.stat().st_size != expected_size or publisher.file_sha256(path) != expected_digest:
            raise RecoveryError(f"{name} is not the byte-exact retained original artifact.")
    if manifest.get("image_id") != CONFIG_DIGEST:
        raise RecoveryError("Release manifest image_id is not the original config digest.")
    oci = verify_oci(directory / "schedule1_calc-image.tar")
    return {"directory": directory, "manifest": manifest, "oci": oci}


def _headers(token: str, *, accept: str = "application/vnd.github+json") -> dict[str, str]:
    return {
        "Accept": accept,
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _github_json(http: MutationHttp, token: str, path: str, label: str) -> dict[str, Any]:
    response = http(
        "GET", f"https://api.github.com/repos/{REPOSITORY}/{path}", _headers(token), None
    )
    if response.status != 200:
        raise RecoveryError(f"Cannot verify {label}: GitHub API returned HTTP {response.status}.")
    return _strict_object(_json(response.body, label), label)


def require_environment(environment: dict[str, str], confirmation: str | None) -> tuple[str, str]:
    expected = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_EVENT_NAME": "workflow_dispatch",
        "GITHUB_REF": "refs/heads/main",
        "GITHUB_REPOSITORY": REPOSITORY,
    }
    for name, value in expected.items():
        if environment.get(name) != value:
            raise RecoveryError(f"{name} must be {value!r} for recovery execution.")
    if confirmation != TAG:
        raise RecoveryError(f"--confirm must be exactly {TAG!r}.")
    actor, token = environment.get("GITHUB_ACTOR", ""), environment.get("GH_TOKEN", "")
    if not actor or not token:
        raise RecoveryError("GITHUB_ACTOR and GH_TOKEN are required for recovery execution.")
    return actor, token


def verify_original_provenance(token: str, http: MutationHttp) -> None:
    run = _github_json(
        http,
        token,
        f"actions/runs/{RUN_NUMBER}/attempts/{RUN_ATTEMPT}",
        "original workflow run attempt",
    )
    expected = {
        "id": RUN_NUMBER,
        "run_attempt": RUN_ATTEMPT,
        "head_sha": REVISION,
        "event": "push",
        "head_branch": TAG,
        "path": ".github/workflows/release.yml",
        "workflow_id": 354927752,
        "conclusion": "failure",
    }
    if any(run.get(key) != value for key, value in expected.items()):
        raise RecoveryError(
            "Original workflow run identity or tag provenance does not match policy."
        )
    repository = run.get("repository")
    if (
        run.get("status") != "completed"
        or not isinstance(repository, dict)
        or repository.get("id") != REPOSITORY_ID
    ):
        raise RecoveryError("Original workflow run is not complete.")

    artifacts = _github_json(
        http, token, f"actions/runs/{RUN_NUMBER}/artifacts?per_page=100", "original artifact"
    ).get("artifacts")
    if not isinstance(artifacts, list):
        raise RecoveryError("Original artifact response is incomplete.")
    matches = [
        item for item in artifacts if isinstance(item, dict) and item.get("id") == ARTIFACT_ID
    ]
    if len(matches) != 1:
        raise RecoveryError("Original artifact ID is missing or ambiguous.")
    artifact = matches[0]
    workflow_run = artifact.get("workflow_run")
    if (
        artifact.get("name") != ARTIFACT_NAME
        or artifact.get("digest") != ARTIFACT_DIGEST
        or artifact.get("expired") is not False
        or not isinstance(workflow_run, dict)
        or workflow_run.get("id") != RUN_NUMBER
        or workflow_run.get("head_sha") != REVISION
        or workflow_run.get("head_branch") != TAG
        or workflow_run.get("repository_id") != REPOSITORY_ID
        or workflow_run.get("head_repository_id") != REPOSITORY_ID
    ):
        raise RecoveryError("Original artifact provenance does not match the retained build.")

    jobs = _github_json(
        http,
        token,
        f"actions/runs/{RUN_NUMBER}/attempts/{RUN_ATTEMPT}/jobs?per_page=100",
        "original quality jobs",
    ).get("jobs")
    if not isinstance(jobs, list):
        raise RecoveryError("Original job response is incomplete.")
    succeeded = {
        item.get("name")
        for item in jobs
        if isinstance(item, dict) and item.get("conclusion") == "success"
    }
    if not QUALITY_JOBS.issubset(succeeded):
        raise RecoveryError("The original tagged build quality jobs did not all succeed.")

    encoded_tag = urllib.parse.quote(f"tags/{TAG}", safe="/")
    tag_ref = _github_json(http, token, f"git/ref/{encoded_tag}", "immutable tag reference")
    tag_object = tag_ref.get("object")
    if (
        not isinstance(tag_object, dict)
        or tag_object.get("type") != "tag"
        or tag_object.get("sha") != TAG_OBJECT
    ):
        raise RecoveryError(
            "Remote tag reference no longer names the reviewed annotated tag object."
        )
    annotated = _github_json(http, token, f"git/tags/{TAG_OBJECT}", "annotated tag object")
    tagged_commit = annotated.get("object")
    if (
        annotated.get("tag") != TAG
        or not isinstance(tagged_commit, dict)
        or tagged_commit.get("type") != "commit"
        or tagged_commit.get("sha") != REVISION
    ):
        raise RecoveryError("Annotated tag does not resolve to the original release commit.")
    comparison = _github_json(
        http, token, f"compare/{REVISION}...main", "original revision ancestry"
    )
    if (
        comparison.get("status") not in {"ahead", "identical"}
        or comparison.get("base_commit", {}).get("sha") != REVISION
    ):
        raise RecoveryError("Original release revision is not an ancestor of remote main.")


def _validate_release(
    release_data: dict[str, Any], *, require_empty: bool, published: bool
) -> None:
    if (
        release_data.get("id") != DRAFT_ID
        or release_data.get("tag_name") != TAG
        or release_data.get("name") != TAG
        or release_data.get("target_commitish") != "main"
        or release_data.get("body") != DRAFT_BODY
        or release_data.get("created_at") != DRAFT_CREATED_AT
        or release_data.get("prerelease") is not False
    ):
        raise RecoveryError("GitHub release identity does not match the reserved v1.6.0 draft.")
    if published:
        if release_data.get("draft") is not False or not release_data.get("published_at"):
            raise RecoveryError("GitHub release was not published after the edit.")
    elif release_data.get("draft") is not True or release_data.get("published_at") is not None:
        raise RecoveryError("Reserved GitHub release is no longer an unpublished draft.")
    assets = release_data.get("assets")
    if not isinstance(assets, list) or (require_empty and assets):
        raise RecoveryError("Reserved draft is not empty; inspect partial remote state manually.")


def get_release(token: str, http: MutationHttp) -> dict[str, Any]:
    return _github_json(http, token, f"releases/{DRAFT_ID}", "reserved release draft")


def _verify_registry_original(
    bearer: str, http: MutationHttp, oci: dict[str, Any], reference: str = TAG
) -> None:
    response = _registry_request(
        "GET", f"manifests/{urllib.parse.quote(reference, safe=':')}", bearer, http
    )
    if response.status != 200:
        raise RecoveryError(f"Cannot read back pushed GHCR tag: HTTP {response.status}.")
    content_type = response.headers.get("content-type", "").partition(";")[0].strip().lower()
    if content_type != "application/vnd.oci.image.manifest.v1+json":
        raise RecoveryError("Pushed GHCR document is not an OCI image manifest.")
    header_digest = response.headers.get("docker-content-digest", "")
    if header_digest != MANIFEST_DIGEST or _digest(response.body) != MANIFEST_DIGEST:
        raise RecoveryError(
            "Pushed GHCR tag does not preserve the exact original OCI manifest bytes."
        )
    if response.body != oci["manifest_bytes"]:
        raise RecoveryError("Pushed GHCR manifest bytes differ from the retained original.")
    manifest = _strict_object(
        _json(response.body, "pushed registry manifest"), "pushed registry manifest"
    )
    descriptors = [manifest.get("config"), *manifest.get("layers", [])]
    for descriptor in descriptors:
        descriptor = _strict_object(descriptor, "registry blob descriptor")
        digest, size = descriptor.get("digest"), descriptor.get("size")
        _blob_head(digest, size, bearer, http)
    if manifest.get("config", {}).get("digest") != CONFIG_DIGEST:
        raise RecoveryError("Pushed GHCR manifest does not retain the original config ID.")


def _verify_assets(
    release_data: dict[str, Any], directory: Path, token: str, http: MutationHttp
) -> None:
    expected_paths = [
        directory / f"schedule1_calc-{VERSION}-source.zip",
        directory / "release-manifest.json",
        directory / "publication-receipt.json",
    ]
    assets = release_data.get("assets")
    if (
        not isinstance(assets, list)
        or {item.get("name") for item in assets if isinstance(item, dict)}
        != {path.name for path in expected_paths}
        or len(assets) != 3
    ):
        raise RecoveryError("Draft asset readback does not contain the exact expected asset set.")
    by_name = {item["name"]: item for item in assets}
    for path in expected_paths:
        asset = by_name[path.name]
        if asset.get("state") != "uploaded" or asset.get("size") != path.stat().st_size:
            raise RecoveryError(f"Draft asset metadata differs for {path.name}.")
        response = http(
            "GET",
            f"https://api.github.com/repos/{REPOSITORY}/releases/assets/{asset.get('id')}",
            _headers(token, accept="application/octet-stream"),
            None,
        )
        if response.status in {301, 302, 303, 307, 308}:
            location = response.headers.get("location", "")
            target = urllib.parse.urljoin(
                f"https://api.github.com/repos/{REPOSITORY}/releases/assets/{asset.get('id')}",
                location,
            )
            if urllib.parse.urlsplit(target).scheme != "https":
                raise RecoveryError(f"Unsafe draft asset redirect for {path.name}.")
            # GitHub asset downloads redirect cross-host; deliberately drop Authorization.
            response = http("GET", target, {"Accept": "application/octet-stream"}, None)
        if response.status != 200 or response.body != path.read_bytes():
            raise RecoveryError(f"Downloaded draft asset bytes differ for {path.name}.")


def _registry_request(
    method: str,
    suffix: str,
    bearer: str,
    http: MutationHttp,
    *,
    body: bytes | None = None,
    content_type: str | None = None,
) -> publisher.HttpResponse:
    url = f"https://ghcr.io/v2/{REPOSITORY.lower()}/{suffix}"
    headers = {"Authorization": f"Bearer {bearer}"}
    if suffix.startswith("manifests/"):
        headers["Accept"] = "application/vnd.oci.image.manifest.v1+json"
    if content_type:
        headers["Content-Type"] = content_type
    if body is not None:
        headers["Content-Length"] = str(len(body))
    response = http(method, url, headers, body)
    if response.status in {301, 302, 303, 307, 308}:
        raise RecoveryError("GHCR mutation redirected; refusing to forward registry credentials.")
    return response


def _blob_head(digest: str, size: int, bearer: str, http: MutationHttp) -> int:
    response = _registry_request(
        "HEAD", f"blobs/{urllib.parse.quote(digest, safe=':')}", bearer, http
    )
    if response.status == 404:
        return 404
    if response.status != 200:
        raise RecoveryError(f"Cannot inspect GHCR blob {digest}: HTTP {response.status}.")
    if response.headers.get("docker-content-digest") != digest:
        raise RecoveryError(f"Existing GHCR blob {digest} lacks its exact digest header.")
    if response.headers.get("content-length") != str(size):
        raise RecoveryError(f"Existing GHCR blob {digest} lacks its exact size header.")
    return 200


def _upload_blob(digest: str, size: int, data: bytes, bearer: str, http: MutationHttp) -> None:
    if len(data) != size or _digest(data) != digest:
        raise RecoveryError(f"Internal retained blob mismatch for {digest}.")
    if _blob_head(digest, size, bearer, http) == 200:
        return
    response = _registry_request("POST", "blobs/uploads/", bearer, http, body=b"")
    if response.status != 202 or not response.headers.get("location"):
        raise RecoveryError(f"GHCR did not start the upload for blob {digest}.")
    location = urllib.parse.urljoin(
        f"https://ghcr.io/v2/{REPOSITORY.lower()}/blobs/uploads/",
        response.headers["location"],
    )
    parsed = urllib.parse.urlsplit(location)
    try:
        same_origin = (
            parsed.scheme == "https"
            and parsed.hostname == "ghcr.io"
            and parsed.port in (None, 443)
            and parsed.username is None
            and parsed.password is None
            and not parsed.fragment
        )
    except ValueError:
        same_origin = False
    if not same_origin:
        raise RecoveryError("GHCR returned a cross-host blob upload location.")
    query_names = [name for name, _ in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)]
    if "digest" in query_names:
        raise RecoveryError("GHCR upload location already contains an ambiguous digest parameter.")
    suffix = ("&" if parsed.query else "") + "digest=" + urllib.parse.quote(digest, safe="")
    upload_url = urllib.parse.urlunsplit(parsed._replace(query=parsed.query + suffix))
    response = http(
        "PUT",
        upload_url,
        {
            "Authorization": f"Bearer {bearer}",
            "Content-Type": "application/octet-stream",
            "Content-Length": str(size),
        },
        data,
    )
    if response.status in {301, 302, 303, 307, 308}:
        raise RecoveryError("GHCR blob upload redirected; credentials were not forwarded.")
    if response.status != 201 or response.headers.get("docker-content-digest") != digest:
        raise RecoveryError(f"GHCR did not commit the exact blob {digest}.")
    if _blob_head(digest, size, bearer, http) != 200:
        raise RecoveryError(f"GHCR blob {digest} did not read back after upload.")


def _put_manifest(reference: str, data: bytes, bearer: str, http: MutationHttp) -> None:
    response = _registry_request(
        "PUT",
        f"manifests/{urllib.parse.quote(reference, safe=':')}",
        bearer,
        http,
        body=data,
        content_type="application/vnd.oci.image.manifest.v1+json",
    )
    if response.status != 201 or response.headers.get("docker-content-digest") != MANIFEST_DIGEST:
        raise RecoveryError(f"GHCR did not accept the exact original manifest for {reference}.")


def _registry_absent(bearer: str, http: MutationHttp) -> None:
    response = _registry_request("HEAD", f"manifests/{TAG}", bearer, http)
    if response.status == 404:
        return
    if response.status == 200:
        raise RecoveryError(f"GHCR tag {TAG} already exists; inspect partial state manually.")
    raise RecoveryError(f"Cannot prove GHCR tag absence: HTTP {response.status}.")


def _upload_original_image(bearer: str, http: MutationHttp, oci: dict[str, Any]) -> None:
    for digest, (size, data) in oci["blobs"].items():
        _upload_blob(digest, size, data, bearer, http)
    _put_manifest(MANIFEST_DIGEST, oci["manifest_bytes"], bearer, http)
    _verify_registry_original(bearer, http, oci, reference=MANIFEST_DIGEST)
    # The version tag is the final registry mutation and receives a fresh absence guard.
    _registry_absent(bearer, http)
    _put_manifest(TAG, oci["manifest_bytes"], bearer, http)
    _verify_registry_original(bearer, http, oci)


def execute(
    directory: Path,
    confirmation: str | None,
    *,
    environment: dict[str, str] | None = None,
    command: publisher.CommandRunner = publisher.run_command,
    http: MutationHttp = http_request,
) -> str:
    environment = dict(os.environ if environment is None else environment)
    actor, token = require_environment(environment, confirmation)
    verified = verify_artifacts(directory)
    directory = verified["directory"]
    oci = verified["oci"]
    verify_original_provenance(token, http)
    _validate_release(get_release(token, http), require_empty=True, published=False)
    readonly_http = lambda method, url, headers: http(method, url, headers, None)
    bearer = publisher.registry_token(REPOSITORY, actor, token, readonly_http)
    _registry_absent(bearer, http)
    target = f"ghcr.io/{REPOSITORY.lower()}:{TAG}"

    # These two checks are deliberately adjacent to the first remote mutation.
    _validate_release(get_release(token, http), require_empty=True, published=False)
    _registry_absent(bearer, http)
    try:
        _upload_original_image(bearer, http, oci)
        receipt = publisher.write_receipt(
            directory, VERSION, REVISION, RUN_ID, target, MANIFEST_DIGEST, CONFIG_DIGEST
        )
        command(
            [
                "gh",
                "release",
                "upload",
                TAG,
                str(directory / f"schedule1_calc-{VERSION}-source.zip"),
                str(directory / "release-manifest.json"),
                str(receipt),
                "--repo",
                REPOSITORY,
            ],
            None,
        )
        uploaded = get_release(token, http)
        _validate_release(uploaded, require_empty=False, published=False)
        _verify_assets(uploaded, directory, token, http)
        verify_original_provenance(token, http)
        command(
            [
                "gh",
                "release",
                "edit",
                TAG,
                "--repo",
                REPOSITORY,
                "--draft=false",
                "--latest=false",
                "--verify-tag",
            ],
            None,
        )
        published = get_release(token, http)
        _validate_release(published, require_empty=False, published=True)
        _verify_assets(published, directory, token, http)
        verify_original_provenance(token, http)
        final_bearer = publisher.registry_token(REPOSITORY, actor, token, readonly_http)
        _verify_registry_original(final_bearer, http, oci)
    except (RecoveryError, publisher.PublishError, OSError, ValueError, KeyError) as error:
        raise RecoveryError(
            f"Recovery stopped after remote mutation began. Inspect draft {DRAFT_ID} and {target}; "
            f"do not delete, overwrite, or blindly retry. Cause: {error}"
        ) from error
    return MANIFEST_DIGEST


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--confirm")
    args = parser.parse_args()
    try:
        if args.confirm and not args.execute:
            raise RecoveryError("--confirm is only valid together with --execute.")
        if args.execute:
            digest = execute(args.directory, args.confirm)
            print(f"[recovery] Published {TAG} with original manifest {digest}.")
        else:
            verify_artifacts(args.directory)
            print(f"[recovery] Verified the retained {TAG} artifact triplet; no external mutation.")
        return 0
    except (RecoveryError, publisher.PublishError, OSError, ValueError, KeyError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
