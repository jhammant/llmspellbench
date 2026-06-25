#!/usr/bin/env python3
"""
Merge extra single-model runs (e.g. results/opus) into the main leaderboard.

Lets a model run separately (own --out dir) be folded into results/leaderboard.json
without re-running everything. Re-sorts by spelling resilience.

Usage:
    python scripts/merge_extra.py results/opus [more_dirs...]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / "results" / "leaderboard.json"


def main():
    main = json.loads(MAIN.read_text())
    by_key = {m["key"]: m for m in main["models"]}
    for d in sys.argv[1:]:
        extra = json.loads((Path(d) / "leaderboard.json").read_text())
        for m in extra["models"]:
            by_key[m["key"]] = m  # add or replace
    models = list(by_key.values())
    models.sort(key=lambda x: (x["retention"] if x["retention"] is not None else -1, x["messy_acc"]),
                reverse=True)
    main["models"] = models
    MAIN.write_text(json.dumps(main, indent=2))
    print(f"Merged -> {len(models)} models:")
    for i, m in enumerate(models, 1):
        r = f"{m['retention']*100:.0f}%" if m["retention"] is not None else "n/a"
        print(f"  {i:>2}. {m['label']:<24} resil={r}")


if __name__ == "__main__":
    main()
