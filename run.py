#!/usr/bin/env python3
"""
LLM Spell Bench — run the benchmark.

Measures how well each model still understands a question as the spelling gets
messier. For every task we ask the model the clean question, then the same
question corrupted at a sweep of intensities from light typos up to near-total
mangling. Each messy level is averaged over several independent corruptions.

Outputs (written incrementally after every model, so a slow model never wipes
out finished results):
  results/leaderboard.json  -> per-model summary + degradation curve (feeds the site)
  results/raw_results.json  -> every individual call

Headline metric — *spelling resilience* = messy_accuracy / clean_accuracy at the
headline intensity (100% = messy spelling cost the model nothing).

Examples:
    export OPENROUTER_API_KEY=sk-or-...
    python run.py                       # all enabled models, full sweep
    python run.py --smoke               # tiny cheap sanity check
    python run.py --sweep 0,0.5,1.0 --trials 3
    python run.py --backends lmstudio   # only local models
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from benchmark.runner import run_model
from benchmark.corruptor import corrupt

ROOT = Path(__file__).resolve().parent


def load_json(p: Path):
    with open(p) as f:
        return json.load(f)


def aggregate(model_cfg: dict, records: list[dict], headline_intensity: float) -> dict:
    """Collapse one model's raw records into a summary + degradation curve."""
    by_int: dict[float, dict[str, int]] = {}
    errors = 0
    for r in records:
        inten = r["intensity"]
        d = by_int.setdefault(inten, {"c": 0, "n": 0})
        d["n"] += 1
        d["c"] += 1 if r["correct"] else 0
        if r.get("error"):
            errors += 1

    clean = by_int.get(0.0, {"c": 0, "n": 0})
    clean_acc = clean["c"] / clean["n"] if clean["n"] else 0.0

    curve = []
    for inten in sorted(by_int):
        d = by_int[inten]
        acc = d["c"] / d["n"] if d["n"] else 0.0
        curve.append({
            "intensity": inten,
            "acc": round(acc, 4),
            "retention": round(acc / clean_acc, 4) if clean_acc > 0 else None,
            "n": d["n"],
        })

    # Headline messy point = the swept intensity closest to the requested one.
    messy_levels = [i for i in by_int if i > 0]
    if messy_levels:
        head = min(messy_levels, key=lambda x: abs(x - headline_intensity))
        d = by_int[head]
        messy_acc = d["c"] / d["n"] if d["n"] else 0.0
    else:
        head, messy_acc = 0.0, clean_acc
    retention = (messy_acc / clean_acc) if clean_acc > 0 else None

    return {
        "key": model_cfg["key"],
        "label": model_cfg["label"],
        "vendor": model_cfg["vendor"],
        "size_hint": model_cfg["size_hint"],
        "backend": model_cfg["backend"],
        "model_id": model_cfg["model"],
        "clean_acc": round(clean_acc, 4),
        "messy_acc": round(messy_acc, 4),
        "headline_intensity": round(head, 4),
        "retention": round(retention, 4) if retention is not None else None,
        "drop": round(clean_acc - messy_acc, 4),
        "curve": curve,
        "n_clean": clean["n"],
        "n_messy": sum(d["n"] for i, d in by_int.items() if i > 0),
        "errors": errors,
    }


def build_examples(tasks: list[dict], seed: int, intensities: list[float], k: int = 8) -> list[dict]:
    """A few clean/messy pairs for the site, showing a mid and an extreme level."""
    mid = min((i for i in intensities if i > 0), key=lambda x: abs(x - 0.5), default=0.5)
    hard = max(intensities) if intensities else 1.0
    out = []
    for t in tasks[:k]:
        out.append({
            "task_id": t["id"],
            "category": t["category"],
            "type": t["type"],
            "clean": t["prompt"],
            "messy": corrupt(t["prompt"], seed=seed, intensity=mid),
            "messy_extreme": corrupt(t["prompt"], seed=seed, intensity=hard),
            "choices": t.get("choices"),
            "answer": t["answer"],
        })
    return out


def write_outputs(out_dir: Path, generated_at: str, config: dict,
                  examples: list[dict], models: list[dict], all_records: list[dict]):
    ranked = sorted(
        models,
        key=lambda x: (x["retention"] if x["retention"] is not None else -1, x["messy_acc"]),
        reverse=True,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "leaderboard.json").write_text(json.dumps({
        "generated_at": generated_at,
        "config": config,
        "examples": examples,
        "models": ranked,
    }, indent=2))
    (out_dir / "raw_results.json").write_text(json.dumps({
        "generated_at": generated_at, "records": all_records,
    }, indent=2))


def main():
    ap = argparse.ArgumentParser(description="Run LLM Spell Bench")
    ap.add_argument("--config", default=str(ROOT / "config" / "models.json"))
    ap.add_argument("--tasks", default=str(ROOT / "data" / "tasks.json"))
    ap.add_argument("--out", default=str(ROOT / "results"))
    ap.add_argument("--models", default="", help="comma-separated model keys (default: all enabled)")
    ap.add_argument("--backends", default="", help="comma-separated backends to include")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--intensity", type=float, default=0.6, help="headline messy level for the leaderboard")
    ap.add_argument("--sweep", default="0,0.2,0.4,0.6,0.8,1.0",
                    help="comma-separated corruption intensities to test (0 = clean baseline)")
    ap.add_argument("--trials", type=int, default=4,
                    help="messy corruptions per task per intensity (averaged); higher = less noise")
    ap.add_argument("--limit", type=int, default=0, help="limit number of tasks (0 = all)")
    ap.add_argument("--merge", action="store_true",
                    help="keep prior results for models not in this run (combine OpenRouter + local passes)")
    ap.add_argument("--smoke", action="store_true", help="quick cheap sanity check")
    args = ap.parse_args()

    cfg = load_json(Path(args.config))
    tasks = load_json(Path(args.tasks))["tasks"]
    backends = cfg["backends"]

    intensities = sorted({round(float(x), 4) for x in args.sweep.split(",")} | {0.0})

    selected = [m for m in cfg["models"] if m.get("enabled", True)]
    if args.smoke:
        selected = [m for m in cfg["models"] if m["key"] == "gpt-4o-mini"]
        args.limit, args.trials = 3, 2
        intensities = [0.0, 0.5, 1.0]
    if args.models:
        keys = {k.strip() for k in args.models.split(",")}
        selected = [m for m in cfg["models"] if m["key"] in keys]
    if args.backends:
        wanted = {b.strip() for b in args.backends.split(",")}
        selected = [m for m in selected if m["backend"] in wanted]
    if args.limit:
        tasks = tasks[: args.limit]
    if not selected:
        print("No models selected.", file=sys.stderr)
        sys.exit(1)

    messy_levels = [i for i in intensities if i > 0]
    calls_per_model = len(tasks) * (1 + len(messy_levels) * args.trials)
    print(f"Tasks: {len(tasks)} | sweep: {intensities} | trials/level: {args.trials} | "
          f"models: {len(selected)} | ~{calls_per_model} calls/model")
    print("Models:", ", ".join(m["key"] for m in selected))
    print("-" * 64)

    out_dir = Path(args.out)
    config = {
        "n_tasks": len(tasks),
        "intensities": intensities,
        "headline_intensity": args.intensity,
        "trials": args.trials,
        "seed": args.seed,
        "metric": "spelling resilience = messy_accuracy / clean_accuracy",
    }
    examples = build_examples(tasks, args.seed, intensities)

    all_records: list[dict] = []
    leaderboard_models: list[dict] = []

    # --merge: keep results from a previous run for models we are NOT re-running,
    # so a separate fast (OpenRouter) pass and a slow (local) pass can be combined
    # into one leaderboard. Re-running a model replaces its old entry.
    if args.merge:
        prev_lb = out_dir / "leaderboard.json"
        prev_raw = out_dir / "raw_results.json"
        if prev_lb.exists():
            prev = load_json(prev_lb)
            sel_keys = {m["key"] for m in selected}
            leaderboard_models = [m for m in prev.get("models", []) if m["key"] not in sel_keys]
            config = prev.get("config", config)      # preserve the primary run's config
            examples = prev.get("examples", examples)
            if prev_raw.exists():
                kept = [r for r in load_json(prev_raw).get("records", []) if r.get("model_key") not in sel_keys]
                all_records = kept
            print(f"Merging with {len(leaderboard_models)} existing model(s) kept.")

    t_start = time.time()

    for m in selected:
        backend_cfg = backends[m["backend"]]
        done = {"n": 0}

        def progress():
            done["n"] += 1
            pct = int(100 * done["n"] / calls_per_model)
            print(f"\r  {m['key']:<22} {done['n']:>4}/{calls_per_model} ({pct:>3}%)", end="", flush=True)

        t0 = time.time()
        out = run_model(m, backend_cfg, tasks,
                        seed=args.seed, intensities=intensities, trials=args.trials,
                        concurrency=backend_cfg.get("concurrency", 4),
                        timeout=backend_cfg.get("timeout", 90),
                        progress=progress)
        agg = aggregate(m, out["records"], args.intensity)
        for r in out["records"]:
            r["model_key"] = m["key"]
            all_records.append(r)
        leaderboard_models.append(agg)

        # Crash-safe: persist after every model.
        generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        write_outputs(out_dir, generated_at, config, examples, leaderboard_models, all_records)

        ret = f"{agg['retention']*100:.0f}%" if agg["retention"] is not None else "n/a"
        print(f"\r  {m['key']:<22} clean={agg['clean_acc']*100:>3.0f}%  "
              f"messy@{agg['headline_intensity']:.1f}={agg['messy_acc']*100:>3.0f}%  "
              f"resilience={ret:<5} errors={agg['errors']}  ({time.time()-t0:.0f}s)")

    ranked = sorted(leaderboard_models,
                    key=lambda x: (x["retention"] if x["retention"] is not None else -1, x["messy_acc"]),
                    reverse=True)
    print("-" * 64)
    print(f"Done in {time.time()-t_start:.0f}s. Wrote {out_dir/'leaderboard.json'}")
    print("\nLeaderboard (most spelling-resilient first):")
    for i, m in enumerate(ranked, 1):
        ret = f"{m['retention']*100:.0f}%" if m["retention"] is not None else "n/a"
        worst = m["curve"][-1]
        worst_acc = f"{worst['acc']*100:.0f}%" if worst else "?"
        print(f"  {i:>2}. {m['label']:<24} resilience={ret:<5} "
              f"clean={m['clean_acc']*100:>3.0f}%  at-max-mangling={worst_acc}")


if __name__ == "__main__":
    main()
