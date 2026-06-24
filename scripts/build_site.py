#!/usr/bin/env python3
"""
Copy the latest results into the microsite.

Writes the leaderboard both as JSON (for humans / reuse) and as a tiny JS file
that assigns to window.SPELLBENCH, so the static page works with no server and
no fetch() — it loads cleanly from file:// and from GitHub Pages alike.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "results" / "leaderboard.json"
DOCS_DATA = ROOT / "docs" / "data"


def main():
    if not SRC.exists():
        raise SystemExit(f"No results found at {SRC}. Run `python run.py` first.")
    DOCS_DATA.mkdir(parents=True, exist_ok=True)
    data = json.loads(SRC.read_text())

    shutil.copyfile(SRC, DOCS_DATA / "leaderboard.json")
    (DOCS_DATA / "leaderboard.js").write_text(
        "window.SPELLBENCH = " + json.dumps(data, indent=2) + ";\n"
    )
    n_models = len(data.get("models", []))
    print(f"Site data updated: {n_models} models, generated {data.get('generated_at')}")


if __name__ == "__main__":
    main()
