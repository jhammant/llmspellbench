#!/usr/bin/env python3
"""
Compare two benchmark runs — one with the plain system prompt, one that tells the
model "the user is dyslexic, expect typos" — and write the difference for the site.

Answers: does telling the AI you're dyslexic actually help it understand messy
spelling? Reads two leaderboard.json files and writes docs/data/prompt_effect.js.

Usage:
    python scripts/build_prompt_effect.py results/cmp_base results/cmp_aware
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def acc_at(curve, intensity):
    for p in curve or []:
        if abs(p["intensity"] - intensity) < 1e-6:
            return p["acc"]
    return None


def main():
    base_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "results" / "cmp_base"
    aware_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "results" / "cmp_aware"

    base = json.loads((base_dir / "leaderboard.json").read_text())
    aware = json.loads((aware_dir / "leaderboard.json").read_text())
    aware_by_key = {m["key"]: m for m in aware["models"]}

    # Messy intensities both runs share (exclude the clean 0.0 baseline).
    intensities = sorted(i for i in base["config"]["intensities"] if i > 0)

    models = []
    for bm in base["models"]:
        am = aware_by_key.get(bm["key"])
        if not am:
            continue
        points = []
        for it in intensities:
            b = acc_at(bm["curve"], it)
            a = acc_at(am["curve"], it)
            if b is None or a is None:
                continue
            points.append({"intensity": it, "baseline": round(b, 4),
                           "aware": round(a, 4), "delta": round(a - b, 4)})
        if points:
            models.append({"label": bm["label"], "vendor": bm["vendor"],
                           "local": bm["backend"] == "lmstudio", "points": points})

    summary = []
    for it in intensities:
        deltas, bases, awares = [], [], []
        for m in models:
            for p in m["points"]:
                if abs(p["intensity"] - it) < 1e-6:
                    deltas.append(p["delta"]); bases.append(p["baseline"]); awares.append(p["aware"])
        if deltas:
            n = len(deltas)
            summary.append({
                "intensity": it,
                "avg_baseline": round(sum(bases) / n, 4),
                "avg_aware": round(sum(awares) / n, 4),
                "avg_delta": round(sum(deltas) / n, 4),
                "helped": sum(1 for d in deltas if d > 0.001),
                "hurt": sum(1 for d in deltas if d < -0.001),
                "n_models": n,
            })

    out = {
        "generated_at": base.get("generated_at"),
        "intensities": intensities,
        "models": models,
        "summary": summary,
        "note": "Same questions, same corruptions; the only difference is whether the "
                "system prompt tells the model the user is dyslexic and may misspell things.",
    }
    dest = ROOT / "docs" / "data"
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "prompt_effect.json").write_text(json.dumps(out, indent=2))
    (dest / "prompt_effect.js").write_text("window.PROMPT_EFFECT = " + json.dumps(out, indent=2) + ";\n")
    print(f"Wrote prompt_effect for {len(models)} models at intensities {intensities}")
    for s in summary:
        print(f"  @{s['intensity']:.1f}: baseline {s['avg_baseline']*100:.0f}% -> aware "
              f"{s['avg_aware']*100:.0f}%  (avg delta {s['avg_delta']*100:+.1f} pts; "
              f"helped {s['helped']}/{s['n_models']})")


if __name__ == "__main__":
    main()
