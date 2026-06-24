"""
Model client + benchmark runner.

Both OpenRouter and LM Studio speak the OpenAI chat-completions API, so one tiny
client (stdlib only — no pip install needed) talks to both. We send a clean,
constant system prompt and vary ONLY the user question (clean vs messy), so the
single thing being measured is robustness to messy spelling.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from .corruptor import corrupt
from .scoring import score

SYSTEM_PROMPT = (
    "You are a careful assistant taking a short quiz. Read each question and "
    "answer as briefly as possible. For multiple choice, reply with ONLY the "
    "letter (A, B, C or D) and nothing else. For every other question, give the "
    "shortest possible answer with no explanation."
)


@dataclass
class CallResult:
    text: str | None
    error: str | None


def _post(url: str, headers: dict, body: dict, timeout: int) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode("utf-8"))
        except Exception:
            payload = {"error": {"message": str(e)}}
        return e.code, payload
    except Exception as e:
        # Network timeouts, connection resets, DNS failures, malformed JSON, etc.
        # Status 0 signals "retryable transport error" so the run never crashes
        # just because one slow local model timed out on one call.
        return 0, {"error": {"message": f"{type(e).__name__}: {e}"}}


def call_model(backend_cfg: dict, model: str, user_msg: str,
               timeout: int = 90, max_tokens: int = 800, retries: int = 3) -> CallResult:
    url = backend_cfg["base_url"].rstrip("/") + "/chat/completions"
    api_key = os.environ.get(backend_cfg.get("api_key_env", ""), "") or backend_cfg.get("api_key_default", "")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        # Polite identification for OpenRouter (harmless for LM Studio).
        "HTTP-Referer": "https://github.com/jhammant/llmspellbench",
        "X-Title": "LLM Spell Bench",
    }
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_msg},
    ]
    full = {"model": model, "messages": messages, "temperature": 0, "max_tokens": max_tokens}
    minimal = {"model": model, "messages": messages}  # fallback for picky reasoning models

    last_err = None
    for attempt in range(retries):
        body = full if attempt == 0 else (minimal if attempt == 1 else full)
        status, payload = _post(url, headers, body, timeout)
        if status == 200:
            try:
                text = payload["choices"][0]["message"]["content"]
                if text is None:
                    # Some reasoning models stash output elsewhere; treat empty as retryable.
                    text = (payload["choices"][0]["message"].get("reasoning") or "").strip()
                return CallResult(text=text, error=None)
            except (KeyError, IndexError, TypeError):
                last_err = f"unexpected response shape: {json.dumps(payload)[:200]}"
        else:
            last_err = f"HTTP {status}: {json.dumps(payload)[:200]}"
            if status == 400:
                continue  # try the minimal body next
            if status in (401, 403, 404):
                break  # not worth retrying
        time.sleep(1.5 * (attempt + 1))
    return CallResult(text=None, error=last_err or "unknown error")


def build_user_message(task: dict, prompt_text: str) -> str:
    """Compose the question the model actually sees for a given prompt variant."""
    if task["type"] == "multiple_choice":
        lines = [prompt_text, ""]
        for i, choice in enumerate(task["choices"]):
            lines.append(f"{chr(65 + i)}) {choice}")
        return "\n".join(lines)
    return prompt_text


def run_model(model_cfg: dict, backend_cfg: dict, tasks: list[dict], *,
              seed: int, intensities: list[float], trials: int, concurrency: int,
              timeout: int = 90, progress=None) -> dict:
    """
    Run every task for one model across a sweep of corruption intensities.

    Intensity 0.0 is the clean baseline (asked once). Every intensity above 0 is
    asked ``trials`` times with independently-corrupted variants, so the accuracy
    at each level is averaged over several mangling — that's what makes the
    degradation curve smooth and the resilience estimate trustworthy rather than
    a coin-flip on a single corruption.
    """
    jobs = []  # (task, intensity, trial, user_msg)
    for task in tasks:
        clean_text = task["prompt"]
        jobs.append((task, 0.0, 0, build_user_message(task, clean_text)))
        for inten in intensities:
            if inten <= 0:
                continue
            for t in range(trials):
                messy_text = corrupt(clean_text, seed=seed + t, intensity=inten)
                jobs.append((task, inten, t, build_user_message(task, messy_text)))

    results = [None] * len(jobs)

    def work(idx):
        task, inten, t, msg = jobs[idx]
        res = call_model(backend_cfg, model_cfg["model"], msg, timeout=timeout)
        correct = score(task, res.text) if res.text is not None else False
        return idx, {
            "task_id": task["id"],
            "category": task["category"],
            "intensity": round(inten, 4),
            "trial": t,
            "correct": correct,
            "response": (res.text or "")[:300],
            "error": res.error,
        }

    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        for idx, record in ex.map(work, range(len(jobs))):
            results[idx] = record
            if progress:
                progress()

    return {"model": model_cfg, "records": results}
