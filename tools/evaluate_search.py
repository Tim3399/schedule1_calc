"""Run reproducible, isolated search comparisons with time and process-memory limits."""

import argparse
import ctypes
import hashlib
import json
import os
import platform
import queue
import statistics
import subprocess
import sys
import threading
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "src")]


class ProcessMemory:
    """Windows process counters, including native allocations and interpreter overhead."""

    def __init__(self, pid=None):
        if os.name != "nt":
            raise RuntimeError("This measurement runner requires Windows process counters.")

        class Counters(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("faults", ctypes.c_ulong)] + [
                (name, ctypes.c_size_t)
                for name in (
                    "peak_working_set",
                    "working_set",
                    "peak_paged_pool",
                    "paged_pool",
                    "peak_nonpaged_pool",
                    "nonpaged_pool",
                    "pagefile",
                    "peak_pagefile",
                    "private",
                )
            ]

        self.counters = Counters()
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        self.kernel.OpenProcess.restype = ctypes.c_void_p
        self.kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        self.kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint]
        self.query = ctypes.WinDLL("psapi", use_last_error=True).GetProcessMemoryInfo
        self.query.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        self.handle = self.kernel.OpenProcess(0x0400 | 0x0010 | 0x0001, False, pid or os.getpid())
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())

    def read(self):
        if not self.query(self.handle, ctypes.byref(self.counters), ctypes.sizeof(self.counters)):
            raise ctypes.WinError(ctypes.get_last_error())
        return {
            "peak_working_set_bytes": self.counters.peak_working_set,
            "peak_commit_bytes": self.counters.peak_pagefile,
            "private_bytes": self.counters.private,
        }

    def close(self):
        self.kernel.CloseHandle(self.handle)

    def terminate(self):
        if not self.kernel.TerminateProcess(self.handle, 1):
            raise ctypes.WinError(ctypes.get_last_error())


def child_case(case):
    # This import patches legacy logger setup, avoiding filesystem logs entirely.
    from experiments import search_bounded, search_fast, search_reference, search_runtime
    from tools.benchmark_search import benchmark_logger, calc_modifier, summarize

    benchmark_logger.disabled = True
    product, level, size, method = (case[key] for key in ("product", "level", "size", "method"))
    memory = ProcessMemory()
    initial_memory = memory.read()
    try:
        if method == "baseline":
            # Local experiment only: the app's production limit is never modified on disk.
            calc_modifier.COMBINATION_SEARCH_LIMIT = 20_000_000

            def run():
                _, modifier, profit = calc_modifier.get_best_mix(size, product, level)
                return modifier, profit, {}

        elif method == "reference":

            def run():
                return search_reference.search(product, level, size)

        elif method in ("bounded1", "bounded2"):

            def run():
                return search_bounded.search(
                    product,
                    level,
                    size,
                    tail_depth=int(method[-1]),
                    frontier_limit=300_000 if method == "bounded1" else 100_000,
                )

        elif method.startswith("fast"):

            def run():
                return search_fast.search(product, level, size, beam_width=int(method[4:]))

        else:
            width = None if method == "exact" else int(method.removeprefix("beam"))

            def run():
                return search_runtime.search(product, level, size, beam_width=width)

        start = time.perf_counter()
        try:
            modifier, profit, stats = run()
        except (
            search_runtime.SearchRuntimeLimitExceeded,
            search_bounded.SearchLimitExceeded,
            search_fast.SearchLimitExceeded,
        ) as error:
            return {
                "status": "search_limit",
                "seconds": time.perf_counter() - start,
                "error": str(error),
                **memory.read(),
            }
        seconds = time.perf_counter() - start
        measured_memory = memory.read()
        available = {
            item.name: item.price
            for item in calc_modifier.substances
            if item.level <= calc_modifier.level_name_to_int[level]
        }
        for winner in (modifier, profit):
            assert 1 <= len(winner.substances) <= size
            assert all(name in available for name in winner.substances)
            score, active = calc_modifier._calculate_modificator(winner.substances, product)
            assert score == winner.modifier and list(active) == winner.effects
            assert calc_modifier._calculate_price(product, score) == winner.sell_price
            assert sum(available[name] for name in winner.substances) == winner.substance_cost
        return {
            "status": "ok",
            "seconds": seconds,
            "initial_memory": initial_memory,
            **measured_memory,
            "best_modifier": summarize(modifier),
            "best_profit": summarize(profit),
            "stats": stats,
        }
    finally:
        memory.close()


def isolated_case(case, timeout, memory_mib):
    command = [sys.executable, str(Path(__file__).resolve()), "--child", json.dumps(case)]
    process = subprocess.Popen(
        command,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    memory = None
    measured = {}
    start = time.perf_counter()
    try:
        # Windows venv python.exe can be a small launcher for another interpreter PID.
        # Monitor and terminate the actual interpreter, identified by our child handshake.
        greetings = queue.Queue()
        reader = threading.Thread(
            target=lambda: greetings.put(process.stdout.readline()), daemon=True
        )
        reader.start()
        try:
            greeting = greetings.get(timeout=timeout)
        except queue.Empty:
            # Before the handshake the launcher PID is the only known identity. Stop only
            # that owned process tree, including the real venv interpreter beneath it.
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
                timeout=10,
                check=False,
            )
            reader.join(timeout=5)
            process.communicate(timeout=5)
            return {
                "status": "time_limit",
                "phase": "startup",
                "process_seconds": time.perf_counter() - start,
            }
        if not greeting:
            output, errors = process.communicate()
            return {"status": "error", "error": errors[-4000:], "output": output[-1000:]}
        worker_pid = json.loads(greeting)["worker_pid"]
        memory = ProcessMemory(worker_pid)
        while True:
            try:
                output, errors = process.communicate(timeout=0.05)
                break
            except subprocess.TimeoutExpired:
                try:
                    measured = memory.read()
                except OSError:
                    if process.poll() is not None:
                        continue
                    raise
                status = None
                if measured["private_bytes"] > memory_mib * 1024**2:
                    status = "memory_limit"
                elif time.perf_counter() - start > timeout:
                    status = "time_limit"
                if status:
                    memory.terminate()
                    process.communicate()
                    return {
                        "status": status,
                        "process_seconds": time.perf_counter() - start,
                        **measured,
                    }
        if process.returncode:
            return {"status": "error", "error": errors[-4000:], "output": output[-1000:]}
        return json.loads(output)
    finally:
        if process.poll() is None:
            if memory:
                memory.terminate()
            else:
                process.kill()
            process.communicate()
        if memory:
            memory.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--child")
    parser.add_argument("--products", nargs="+")
    parser.add_argument("--sizes", type=int, nargs="+", default=[5, 6])
    parser.add_argument("--methods", nargs="+", default=["exact", "beam64", "beam256", "beam1024"])
    parser.add_argument("--level", default="max")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--timeout", type=float, default=120)
    parser.add_argument("--memory-mib", type=int, default=512)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.child:
        print(json.dumps({"worker_pid": os.getpid()}), flush=True)
        print(json.dumps(child_case(json.loads(args.child))))
        return
    if not args.output or min(args.repeats, args.timeout, args.memory_mib, *args.sizes) <= 0:
        parser.error("Supply --output and positive sizes, repeats, timeout and memory limit.")
    if any(
        method not in ("baseline", "reference", "exact", "bounded1", "bounded2")
        and (
            not method.startswith(("beam", "fast"))
            or not method[4:].isdigit()
            or int(method[4:]) < 1
        )
        for method in args.methods
    ):
        parser.error(
            "Methods: baseline, reference, exact, bounded1, bounded2, beamN or fastN (N > 0)."
        )

    from src.lookup.lookup import products

    product_names = args.products or [item.name for item in products]
    if not set(product_names).issubset({item.name for item in products}):
        parser.error("Unknown product name.")
    source_paths = [
        "src/lookup/lookup.py",
        "src/functionality/calc_modifier.py",
        "src/util/models.py",
        "experiments/search_runtime.py",
        "experiments/search_reference.py",
        "experiments/legacy_pricing.py",
        "experiments/search_bounded.py",
        "experiments/search_fast.py",
        "tools/benchmark_search.py",
        "tools/evaluate_search.py",
    ]
    hashes = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in source_paths}
    if args.output.exists():
        report = json.loads(args.output.read_text(encoding="utf-8"))
        if report["source_sha256"] != hashes:
            parser.error("Sources changed since this report; choose a new output path.")
    else:
        report = {
            "created_utc": datetime.now(UTC).isoformat(),
            "python": platform.python_version(),
            "platform": platform.platform(),
            "source_sha256": hashes,
            "memory_note": "Whole-process Windows peak working set/commit, including imports. "
            "private_bytes is current usage at measurement, not a peak. "
            "Supervisor samples private bytes every 50ms; reported peaks can exceed the stop threshold.",
            "baseline_note": "Legacy exhaustive search, logging disabled and candidate budget "
            "raised to 20 million only inside the bounded child process.",
            "cases": [],
        }
    for product in product_names:
        for size in args.sizes:
            for method in args.methods:
                case = {"product": product, "level": args.level, "size": size, "method": method}
                previous = next((item for item in report["cases"] if item["case"] == case), None)
                if previous:
                    if (
                        previous["requested_repeats"] != args.repeats
                        or previous["timeout_seconds"] != args.timeout
                        or previous["memory_limit_mib"] != args.memory_mib
                    ):
                        parser.error(
                            "Existing case used different controls; choose a new output path."
                        )
                    continue
                samples = []
                for _ in range(args.repeats):
                    sample = isolated_case(case, args.timeout, args.memory_mib)
                    samples.append(sample)
                    if sample["status"] != "ok":
                        break
                    if len(samples) > 1 and any(
                        sample[key] != samples[0][key] for key in ("best_modifier", "best_profit")
                    ):
                        raise AssertionError(f"Nondeterministic result: {case}")
                entry = {
                    "case": case,
                    "timeout_seconds": args.timeout,
                    "memory_limit_mib": args.memory_mib,
                    "requested_repeats": args.repeats,
                    "samples": samples,
                }
                if all(item["status"] == "ok" for item in samples):
                    entry["median_seconds"] = statistics.median(item["seconds"] for item in samples)
                report["cases"].append(entry)
                if any(
                    hashlib.sha256((ROOT / path).read_bytes()).hexdigest() != digest
                    for path, digest in hashes.items()
                ):
                    raise RuntimeError("Sources changed during evaluation; result was not saved.")
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(
                    json.dumps(report, indent=2) + "\n", encoding="utf-8", newline="\n"
                )
                print(
                    json.dumps(
                        {
                            **case,
                            "status": samples[-1]["status"],
                            "seconds": entry.get("median_seconds"),
                        }
                    ),
                    flush=True,
                )

    if any(sample["status"] == "error" for item in report["cases"] for sample in item["samples"]):
        raise RuntimeError("One or more cases failed; inspect the saved error records.")


if __name__ == "__main__":
    main()
