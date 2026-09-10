"""Project commands; run with the interpreter from the project's virtual environment."""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import secrets
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
VERSION_TARGETS = ("VERSION", "package.json", "package-lock.json")
STABLE_VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")


class ProjectError(Exception):
    """An actionable project command failure."""


def run(command: list[str], root: Path = ROOT) -> str:
    try:
        result = subprocess.run(command, cwd=root, text=True, capture_output=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProjectError(f"Cannot run {command[0]}: {error}") from error
    if result.returncode:
        raise ProjectError(result.stderr.strip() or result.stdout.strip() or str(command))
    return result.stdout.strip()


def parse_version(value: str) -> tuple[int, int, int]:
    if not STABLE_VERSION.fullmatch(value):
        raise ProjectError(f"Expected a stable MAJOR.MINOR.PATCH version, got {value!r}.")
    return tuple(int(part) for part in value.split("."))


def check_versions(root: Path = ROOT) -> str:
    version = (root / "VERSION").read_text(encoding="utf-8").strip()
    parse_version(version)
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    lock = json.loads((root / "package-lock.json").read_text(encoding="utf-8"))
    copies = (package["version"], lock["version"], lock["packages"][""]["version"])
    if any(copy != version for copy in copies):
        raise ProjectError(f"Version copies disagree: VERSION={version}, manifests={copies}.")
    return version


def update_version(request: str, root: Path = ROOT) -> str:
    """Validate every target, then replace it; restore all originals on write failure."""
    current = check_versions(root)
    parts = list(parse_version(current))
    if request in ("major", "minor", "patch"):
        index = ("major", "minor", "patch").index(request)
        parts[index] += 1
        parts[index + 1 :] = [0] * (2 - index)
        target = ".".join(map(str, parts))
    else:
        target = request
    if parse_version(target) <= parse_version(current):
        raise ProjectError("Versions must increase; existing public versions are immutable.")
    if run(["git", "status", "--porcelain", "--untracked-files=all"], root):
        raise ProjectError("Commit or stash local changes before preparing a version update.")
    if run(["git", "tag", "--list", target, f"v{target}"], root):
        raise ProjectError(f"A local tag already uses version {target}.")

    originals = {name: (root / name).read_bytes() for name in VERSION_TARGETS}
    package = json.loads(originals["package.json"])
    lock = json.loads(originals["package-lock.json"])
    package["version"] = target
    lock["version"] = target
    lock["packages"][""]["version"] = target
    rendered = {
        "VERSION": f"{target}\n".encode(),
        "package.json": (json.dumps(package, indent=2, ensure_ascii=False) + "\n").encode(),
        "package-lock.json": (json.dumps(lock, indent=2, ensure_ascii=False) + "\n").encode(),
    }
    staged: dict[str, Path] = {}
    replaced: list[str] = []
    try:
        for name, content in rendered.items():
            with tempfile.NamedTemporaryFile(dir=root, prefix=".version-", delete=False) as output:
                staged[name] = Path(output.name)
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
        for name, temporary in staged.items():
            os.replace(temporary, root / name)
            replaced.append(name)
    except OSError as error:
        rollback_errors = []
        for name in reversed(replaced):
            try:
                (root / name).write_bytes(originals[name])
            except OSError as rollback_error:
                rollback_errors.append(f"{name}: {rollback_error}")
        if rollback_errors:
            raise ProjectError(
                "Version rollback needs recovery: " + "; ".join(rollback_errors)
            ) from error
        raise ProjectError(f"Version unchanged; update rolled back: {error}") from error
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)
    return target


def required_packages(root: Path = ROOT, development: bool = True) -> dict[str, str]:
    files = ["requirements.txt"] + (["requirements-dev.txt"] if development else [])
    requirements = {}
    for name in files:
        for line in (root / name).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith(("#", "-r ")):
                package, version = line.split("==", 1)
                requirements[package] = version
    return requirements


def check_python_packages(root: Path = ROOT, development: bool = True) -> None:
    problems = []
    for package, expected in required_packages(root, development).items():
        try:
            actual = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            actual = "missing"
        if actual != expected:
            problems.append(f"{package}: expected {expected}, found {actual}")
    if problems:
        requirement = "requirements-dev.txt" if development else "requirements.txt"
        raise ProjectError(
            "; ".join(problems)
            + f". Install with this interpreter: {sys.executable} -m pip install -r {requirement}"
        )


def doctor(root: Path = ROOT) -> None:
    pins = json.loads((root / "tools/toolchains.json").read_text(encoding="utf-8"))
    manifest = json.loads((root / "package.json").read_text(encoding="utf-8"))
    actual = {
        "python": ".".join(map(str, sys.version_info[:3])),
        "node": run(["node", "--version"], root).removeprefix("v"),
        "npm": run(["npm.cmd" if os.name == "nt" else "npm", "--version"], root),
    }
    for name, expected in pins.items():
        if actual[name] != expected:
            raise ProjectError(f"{name}: expected {expected}, found {actual[name]}.")
    for name in ("python", "node"):
        if (root / f".{name}-version").read_text().strip() != pins[name]:
            raise ProjectError(f".{name}-version disagrees with tools/toolchains.json.")
    if manifest["packageManager"] != f"npm@{pins['npm']}" or manifest["engines"] != {
        "node": pins["node"],
        "npm": pins["npm"],
    }:
        raise ProjectError("package.json runtime pins disagree with tools/toolchains.json.")
    check_python_packages(root)
    for package, expected in manifest["devDependencies"].items():
        path = root / "node_modules" / package / "package.json"
        if not path.is_file():
            raise ProjectError(f"{package} is missing. Run npm ci.")
        actual_package = json.loads(path.read_text(encoding="utf-8"))["version"]
        if actual_package != expected:
            raise ProjectError(
                f"{package}: expected {expected}, found {actual_package}. Run npm ci."
            )
    check_versions(root)
    print(f"[doctor] Interpreter: {sys.executable}")
    print("[doctor] Runtime pins, installed dependencies and version copies agree.")


def format_project(write: bool, root: Path = ROOT) -> None:
    doctor(root)
    commands = [
        [sys.executable, "-m", "ruff", "format", *([] if write else ["--check"]), "."],
        [
            "node",
            "node_modules/@biomejs/biome/bin/biome",
            "format",
            *(["--write"] if write else []),
            ".",
        ],
        [
            "node",
            "node_modules/prettier/bin/prettier.cjs",
            "--write" if write else "--check",
            "**/*.{md,yml,yaml,html}",
        ],
    ]
    failed = False
    for command in commands:
        print("[format] " + " ".join(command), flush=True)
        try:
            result = subprocess.run(command, cwd=root, check=False)
        except OSError as error:
            raise ProjectError(str(error)) from error
        failed |= result.returncode != 0
    if failed:
        raise ProjectError("Formatting failed; inspect the formatter output above.")


def run_tests(root: Path = ROOT) -> int:
    suite = unittest.TestLoader().discover(str(root / "tests"))
    if suite.countTestCases() == 0:
        raise ProjectError(f"No tests discovered in {root / 'tests'}.")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def source_identity(root: Path = ROOT) -> dict[str, str]:
    """Hash maintained runtime inputs; generated files and Git's own metadata are excluded."""
    inputs = [root / "VERSION", root / "requirements.txt", root / "tools/project.py"]
    inputs += sorted((root / "src").rglob("*.py"))
    inputs += sorted(
        path
        for path in (root / "webapp").rglob("*")
        if path.suffix in (".py", ".html", ".js", ".css")
    )
    digest = hashlib.sha256()
    for path in inputs:
        digest.update(path.relative_to(root).as_posix().encode() + b"\0")
        digest.update(path.read_bytes().replace(b"\r\n", b"\n") + b"\0")
    try:
        revision = run(["git", "rev-parse", "HEAD"], root)
        if run(["git", "status", "--porcelain", "--untracked-files=all"], root):
            revision += "-dirty"
    except ProjectError:
        revision = "unknown"
    return {
        "product": "schedule1_calc",
        "version": check_versions(root),
        "revision": revision,
        "source_digest": digest.hexdigest(),
        "mode": "development",
    }


def port_number(value: str) -> int:
    if not re.fullmatch(r"[0-9]+", value) or not 1 <= int(value) <= 65535:
        raise argparse.ArgumentTypeError("Port must be an integer between 1 and 65535.")
    return int(value)


def wait_for_identity(url: str, expected: dict[str, str], timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    # Do not route the local readiness probe through a machine's HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.monotonic() < deadline:
        try:
            with opener.open(
                url, timeout=min(0.5, max(0.01, deadline - time.monotonic()))
            ) as response:
                actual = json.load(response)
            if actual == expected:
                return
        except (OSError, ValueError, urllib.error.URLError):
            pass
        time.sleep(0.05)
    raise ProjectError("Readiness deadline exceeded or the response belongs to another launch.")


def start(port: int, readiness_timeout: float = 10.0, root: Path = ROOT) -> None:
    if sys.version_info < (3, 12):
        raise ProjectError("Development requires Python 3.12 or newer.")
    check_python_packages(root, development=False)
    from werkzeug.serving import ThreadedWSGIServer

    class LocalServer(ThreadedWSGIServer):
        # Windows SO_REUSEADDR can admit a second listener on an occupied port.
        allow_reuse_address = os.name != "nt"

        def server_bind(self):
            if os.name == "nt":
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    # Both import conventions in the existing application resolve from any working directory.
    sys.path[:0] = [str(root), str(root / "src")]
    try:
        app = importlib.import_module("webapp.app").app
    except ImportError as error:
        raise ProjectError(
            f"Application import failed: {error}. Use the project environment."
        ) from error
    identity = source_identity(root)
    token = secrets.token_urlsafe(32)
    probe_path = f"/__dev__/ready/{token}"
    probe_identity = {**identity, "instance": token}
    app.add_url_rule(probe_path, "project_readiness", lambda: probe_identity)
    app.add_url_rule("/__dev__/identity", "project_identity", lambda: identity)

    @app.after_request
    def version_headers(response):
        response.headers["X-Schedule1-Version"] = identity["version"]
        response.headers["X-Schedule1-Source"] = identity["source_digest"]
        if request_path_is_diagnostic():
            response.headers["Cache-Control"] = "no-store"
        return response

    try:
        server = LocalServer("127.0.0.1", port, app)
    except (OSError, SystemExit) as error:
        raise ProjectError(f"Cannot bind 127.0.0.1:{port}; the port may be occupied.") from error
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="project-web")
    shutdown_signals = [signal.SIGTERM]
    if hasattr(signal, "SIGBREAK"):
        shutdown_signals.append(signal.SIGBREAK)
    previous_handlers = {item: signal.getsignal(item) for item in shutdown_signals}

    def interrupt(signum, frame):
        raise KeyboardInterrupt

    try:
        for item in shutdown_signals:
            signal.signal(item, interrupt)
        thread.start()
        wait_for_identity(f"http://127.0.0.1:{port}{probe_path}", probe_identity, readiness_timeout)
        # Confirm the actual frontend renders before reporting the complete application ready.
        with app.test_client() as client:
            if client.get("/").status_code != 200:
                raise ProjectError("Readiness failed: the application frontend did not render.")
        print(
            f"[web] Ready: http://127.0.0.1:{port}/ | mode={identity['mode']} | "
            f"version={identity['version']} | revision={identity['revision']} | "
            f"source={identity['source_digest']}",
            flush=True,
        )
        print(
            "[web] Stop with Ctrl+C. Restart after source changes; automatic reload is disabled.",
            flush=True,
        )
        while thread.is_alive():
            thread.join(timeout=0.5)
        raise ProjectError("The web server exited unexpectedly.")
    except KeyboardInterrupt:
        print("[web] Stopping.", flush=True)
    finally:
        if thread.is_alive():
            server.shutdown()
            thread.join(timeout=2)
        server.server_close()
        for item, handler in previous_handlers.items():
            signal.signal(item, handler)


def request_path_is_diagnostic() -> bool:
    from flask import request

    return request.path.startswith("/__dev__/")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for command in ("doctor", "format", "check-format", "check", "test", "check-version"):
        commands.add_parser(command)
    for command in ("start", "dev"):
        launch = commands.add_parser(
            command, help="Start the complete Flask application without reload."
        )
        launch.add_argument(
            "--port", type=port_number, default=os.environ.get("SCHEDULE1_PORT", "5000")
        )
    version = commands.add_parser(
        "set-version", help="Prepare a reviewed version update; never publish."
    )
    version.add_argument("version", help="patch, minor, major, or an increasing stable version")
    args = parser.parse_args()
    try:
        if args.command in ("start", "dev"):
            start(args.port)
        elif args.command == "doctor":
            doctor()
        elif args.command in ("format", "check-format", "check"):
            format_project(args.command == "format")
            if args.command == "check":
                for folder in ("src", "webapp", "tools", "tests"):
                    for path in (ROOT / folder).rglob("*.py"):
                        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
                print(
                    "[check] Formatting, toolchains, version consistency and Python syntax passed."
                )
        elif args.command == "test":
            return run_tests()
        elif args.command == "check-version":
            print(f"[version] {check_versions()}")
        elif args.command == "set-version":
            target = update_version(args.version)
            print(
                f"[version] Prepared {target}. Review the diff and run check/test before committing."
            )
            print("[version] No commit, tag, push or publication was performed.")
        return 0
    except (ProjectError, OSError, ValueError, KeyError, SyntaxError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
