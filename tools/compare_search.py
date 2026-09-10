"""Validate benchmark winners against exhaustive oracles and summarize measured gaps."""

import argparse
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    args = parser.parse_args()
    reference = json.loads(args.reference.read_text(encoding="utf-8"))
    oracles = {}
    for entry in reference["cases"]:
        case = entry["case"]
        if case["method"] == "reference" and entry["samples"][0]["status"] == "ok":
            oracles[case["product"], case["level"], case["size"]] = entry["samples"][0]

    groups = defaultdict(list)
    checked = 0
    for path in args.reports:
        report = json.loads(path.read_text(encoding="utf-8"))
        for source in ("src/lookup/lookup.py", "src/util/models.py"):
            if report["source_sha256"][source] != reference["source_sha256"][source]:
                raise ValueError(f"Incompatible model: {path}, {source}")
        for entry in report["cases"]:
            case = entry["case"]
            if not all(sample["status"] == "ok" for sample in entry["samples"]):
                print(f"Incomplete: {case}: {entry['samples'][-1]['status']}")
                continue
            oracle = oracles[case["product"], case["level"], case["size"]]
            for sample in entry["samples"]:
                profit_gap = Decimal(oracle["best_profit"]["profit"]) - Decimal(
                    sample["best_profit"]["profit"]
                )
                modifier_gap = (
                    oracle["best_modifier"]["modifier"] - sample["best_modifier"]["modifier"]
                )
                if profit_gap < 0 or modifier_gap < 0:
                    raise AssertionError(f"Winner exceeds exhaustive oracle: {case}")
                identical = all(
                    sample[key] == oracle[key] for key in ("best_modifier", "best_profit")
                )
                if (
                    case["method"] in ("exact", "bounded1", "bounded2", "reference")
                    and not identical
                ):
                    raise AssertionError(f"Exact winner differs from exhaustive oracle: {case}")
                if any(
                    sample[key] != entry["samples"][0][key]
                    for key in ("best_modifier", "best_profit")
                ):
                    raise AssertionError(f"Nondeterministic winners: {case}")
                checked += 1
            groups[case["size"], case["method"]].append(
                {
                    "seconds": entry["median_seconds"],
                    "memory": max(s["peak_commit_bytes"] for s in entry["samples"]) / 2**20,
                    "profit_gap": profit_gap,
                    "modifier_gap": modifier_gap,
                    "identical": identical,
                }
            )

    print(f"Validated {checked} completed samples against matching model oracles.")
    print(
        "| Depth | Method | Cases | Seconds | MiB commit | Profit exact | Modifier exact | "
        "Both winners identical | Maximum profit gap |"
    )
    print("| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    for (size, method), rows in sorted(groups.items()):

        def span(key, rows=rows):
            return f"{min(row[key] for row in rows):.3f}-{max(row[key] for row in rows):.3f}"

        print(
            f"| {size} | {method} | {len(rows)} | {span('seconds')} | {span('memory')} | "
            f"{sum(row['profit_gap'] == 0 for row in rows)} | "
            f"{sum(row['modifier_gap'] == 0 for row in rows)} | "
            f"{sum(row['identical'] for row in rows)} | "
            f"{max(row['profit_gap'] for row in rows):.2f} |"
        )


if __name__ == "__main__":
    main()
