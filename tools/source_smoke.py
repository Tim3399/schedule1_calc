"""Start and exercise the source ZIP in a disposable extracted directory."""

import argparse
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.container_smoke import SmokeError, probe_application
from tools.release import ReleaseError, validate_zip


def exercise(root: Path, log_path: Path, *, deadline_seconds: float = 20) -> None:
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [sys.executable, "-B", str(root / "tools/project.py"), "start", "--port", str(port)],
            cwd=root,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + deadline_seconds
            while time.monotonic() < deadline:
                if process.poll() is not None:
                    raise SmokeError("packaged source exited before readiness")
                output = log_path.read_text(encoding="utf-8", errors="replace")
                if f"[web] Ready: http://127.0.0.1:{port}/" in output:
                    probe_application(f"http://127.0.0.1:{port}")
                    return
                time.sleep(0.1)
            raise SmokeError("packaged source did not report its own readiness before the deadline")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


def smoke_archive(archive: Path, version: str) -> None:
    validate_zip(archive, version)
    with tempfile.TemporaryDirectory(prefix="schedule1-source-smoke-") as directory:
        destination = Path(directory)
        with zipfile.ZipFile(archive) as source:
            source.extractall(destination)
        try:
            exercise(destination / f"schedule1_calc-{version}", destination / "startup.log")
        except (OSError, SmokeError) as error:
            log = destination / "startup.log"
            detail = log.read_text("utf-8", errors="replace")[-8000:] if log.exists() else ""
            raise SmokeError(f"{error}\n{detail}") from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    try:
        smoke_archive(args.archive, args.version)
    except (OSError, SmokeError, ReleaseError, zipfile.BadZipFile) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    print("[source-smoke] Browser assets/model are available; server calculations remain private.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
