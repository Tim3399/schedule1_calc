"""Exercise the packaged application through an ephemeral Docker container."""

import argparse
import json
import socket
import subprocess
import time
import urllib.error
import urllib.parse
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
    """Check browser assets/model and prove anonymous requests cannot start server work."""
    root_status, _, root_body = _request(f"{base_url}/", timeout=timeout)
    if root_status != 200 or any(
        marker not in root_body
        for marker in (
            b"Best Mix Calculator",
            b"data-worker-url",
            b"data-search-data-url",
            b'id="recipe-tab"',
            b'id="recipe-form"',
            b"js/search-engine.js",
        )
    ):
        raise SmokeError("GET / did not render the calculator")

    status, headers, body = _request(f"{base_url}/search-data", timeout=timeout)
    try:
        catalog = json.loads(body)
    except (TypeError, ValueError) as error:
        raise SmokeError("browser search model was not JSON") from error
    if (
        status != 200
        or "application/json" not in headers.get("Content-Type", "")
        or not isinstance(catalog, dict)
        or catalog.get("schema_version") != 1
        or catalog.get("effect_scale") != 100
        or catalog.get("money_scale") != 100
        or not all(
            isinstance(catalog.get(key), list) and catalog[key]
            for key in ("effects", "products", "substances")
        )
        or not isinstance(catalog.get("levels"), dict)
        or not catalog["levels"]
    ):
        raise SmokeError("browser search model is missing or incompatible")

    for asset, marker in (
        ("js/search-engine.js", b"evaluateRecipe"),
        ("js/search-worker.js", b"search-engine.js"),
        ("js/script.js", b"Worker"),
        ("js/theme.js", b"schedule1-theme"),
        ("css/tokens.css", b"--action-primary"),
        ("css/styles.css", b".recipe-ingredient-tile"),
    ):
        status, _, body = _request(f"{base_url}/static/{asset}", timeout=timeout)
        if status != 200 or marker not in body:
            raise SmokeError(f"browser asset is missing: {asset}")

    request_data = {
        "level": "street_rat_i",
        "combination_size": 1,
        "product_name": "og_kush",
    }
    for route in ("/get_best_mix", "/"):
        status, headers, body = _request(
            f"{base_url}{route}", payload=request_data, timeout=timeout
        )
        try:
            result = json.loads(body)
        except (TypeError, ValueError) as error:
            raise SmokeError("private calculation denial was not JSON") from error
        if (
            status not in {401, 404}
            or "application/json" not in headers.get("Content-Type", "")
            or not isinstance(result, dict)
            or not result.get("error")
            or "best_modifier" in result
            or "best_profit" in result
        ):
            raise SmokeError(f"anonymous server calculation was not blocked at {route}")


def _raw_request(base_url, request, *, timeout=2):
    parsed = urllib.parse.urlsplit(base_url)
    if parsed.scheme != "http" or parsed.hostname is None or parsed.port is None:
        raise SmokeError(f"raw HTTP probe requires an explicit HTTP host and port: {base_url}")
    response = bytearray()
    try:
        with socket.create_connection(
            (parsed.hostname, parsed.port), timeout=timeout
        ) as connection:
            connection.settimeout(timeout)
            connection.sendall(request)
            while True:
                try:
                    block = connection.recv(65_536)
                except ConnectionResetError:
                    if response:
                        break
                    raise
                if not block:
                    break
                response.extend(block)
    except OSError as error:
        raise SmokeError(f"raw HTTP probe failed: {error}") from error
    try:
        return int(bytes(response).split(b"\r\n", 1)[0].split()[1])
    except (IndexError, ValueError) as error:
        raise SmokeError("raw HTTP probe returned an invalid response") from error


def probe_http_bounds(base_url, *, timeout=2):
    """Prove the production server enforces its header/body limits and supports HEAD."""
    requests = (
        (
            "HEAD",
            b"HEAD / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
            {200},
        ),
        (
            "declared oversized body",
            b"POST / HTTP/1.0\r\nHost: localhost\r\nContent-Length: 65537\r\n\r\n",
            {413},
        ),
        (
            "oversized header",
            b"GET / HTTP/1.0\r\nHost: localhost\r\nX-Large: " + (b"x" * 16_384) + b"\r\n\r\n",
            {431},
        ),
    )
    for description, request, expected in requests:
        status = _raw_request(base_url, request, timeout=timeout)
        if status not in expected:
            raise SmokeError(
                f"production HTTP {description} probe returned {status}, expected {sorted(expected)}"
            )


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
            probe_http_bounds(f"http://127.0.0.1:{port}")
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
