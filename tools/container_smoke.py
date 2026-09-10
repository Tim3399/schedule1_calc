"""Exercise the packaged application through an ephemeral Docker container."""

import argparse
import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid


class SmokeError(RuntimeError):
    """A container or application smoke assertion failed."""


def docker(*arguments, timeout=30, check=True):
    """Run Docker without a shell and return its stripped standard output."""
    try:
        result = subprocess.run(
            ["docker", *arguments],
            capture_output=True,
            check=False,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise SmokeError(f"docker {' '.join(arguments)} failed: {error}") from error
    if check and result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or "no diagnostic output"
        raise SmokeError(f"docker {' '.join(arguments)} failed: {detail}")
    return result.stdout.strip()


def _request(url, *, payload=None, timeout=2):
    headers = {}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            return response.status, response.headers, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()


def probe_application(base_url, *, timeout=2):
    """Validate the rendered UI and representative API success and failure behavior.

    The current application returns 500 for an invalid product. A future input-validation
    improvement may return the more appropriate 400 or 422 without weakening this smoke.
    """
    root_status, _, root_body = _request(f"{base_url}/", timeout=timeout)
    if root_status != 200 or b"Best Mix Calculator" not in root_body:
        raise SmokeError("GET / did not render the calculator")

    valid = {
        "level": "street_rat_i",
        "combination_size": 1,
        "product_name": "og_kush",
    }
    status, headers, body = _request(f"{base_url}/get_best_mix", payload=valid, timeout=timeout)
    if status != 200 or "application/json" not in headers.get("Content-Type", ""):
        raise SmokeError("representative calculation did not return JSON HTTP 200")
    try:
        result = json.loads(body)
    except (TypeError, ValueError) as error:
        raise SmokeError("representative calculation returned invalid JSON") from error
    if not {"best_modifier", "best_profit"}.issubset(result):
        raise SmokeError("representative calculation omitted expected results")

    invalid = dict(valid, product_name="not_a_product")
    status, headers, body = _request(f"{base_url}/get_best_mix", payload=invalid, timeout=timeout)
    try:
        error_result = json.loads(body)
    except (TypeError, ValueError) as error:
        raise SmokeError("invalid-input response was not JSON") from error
    if (
        status not in {400, 422, 500}
        or "application/json" not in headers.get("Content-Type", "")
        or not error_result.get("error")
    ):
        raise SmokeError("invalid product did not return a supported JSON error response")


def wait_for_application(base_url, *, deadline_seconds=20):
    deadline = time.monotonic() + deadline_seconds
    last_error = None
    while time.monotonic() < deadline:
        try:
            probe_application(base_url)
            return
        except (OSError, SmokeError) as error:
            last_error = error
            time.sleep(0.1)
    raise SmokeError(f"application did not become ready within {deadline_seconds}s: {last_error}")


def _host_port(container_name):
    output = docker("port", container_name, "8080/tcp")
    for line in output.splitlines():
        host, separator, port = line.rpartition(":")
        if separator and host in {"127.0.0.1", "0.0.0.0"} and port.isdecimal():
            return int(port)
    raise SmokeError(f"Docker did not publish container port 8080 on loopback: {output!r}")


def smoke_image(image, version, revision):
    """Inspect and run one image, always removing only the container created here."""
    raw_inspect = docker("image", "inspect", image)
    try:
        inspection = json.loads(raw_inspect)[0]
    except (IndexError, KeyError, TypeError, ValueError) as error:
        raise SmokeError("docker image inspect returned an unexpected document") from error

    config = inspection.get("Config") or {}
    labels = config.get("Labels") or {}
    expected = {
        "org.opencontainers.image.version": version,
        "org.opencontainers.image.revision": revision,
    }
    for label, value in expected.items():
        if labels.get(label) != value:
            raise SmokeError(f"image label {label} is {labels.get(label)!r}, expected {value!r}")
    if inspection.get("Os") != "linux" or inspection.get("Architecture") != "amd64":
        raise SmokeError("image platform is not linux/amd64")
    configured_user = str(config.get("User", "")).split(":", 1)[0]
    if not configured_user or configured_user in {"0", "root"}:
        raise SmokeError("image does not configure a non-root runtime user")

    container_name = f"schedule1-smoke-{uuid.uuid4().hex}"
    try:
        docker(
            "run",
            "--detach",
            "--rm",
            "--name",
            container_name,
            "--publish",
            "127.0.0.1::8080",
            image,
        )
        effective_user = docker("exec", container_name, "id", "-u")
        if effective_user == "0" or not effective_user.isdecimal():
            raise SmokeError(f"container process has unexpected effective uid {effective_user!r}")
        port = _host_port(container_name)
        try:
            wait_for_application(f"http://127.0.0.1:{port}")
        except SmokeError as error:
            logs = docker("logs", container_name, check=False)
            raise SmokeError(f"{error}\ncontainer logs:\n{logs}") from error
    finally:
        docker("rm", "--force", container_name, timeout=10, check=False)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--revision", required=True)
    return parser.parse_args(argv)


def main(argv=None):
    arguments = parse_args(argv)
    try:
        smoke_image(arguments.image, arguments.version, arguments.revision)
    except SmokeError as error:
        print(f"container smoke failed: {error}")
        return 1
    print(f"container smoke passed: {arguments.image}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
