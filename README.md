# LLM Spell Bench 🐝

**Does messy spelling stop AI from understanding you? We measured it.**

A small, open, reproducible benchmark that asks each language model the same
questions **twice** — once with clean text, once with realistic *dyslexia-style*
messy spelling — and reports how much accuracy it keeps.

> **Why this exists.** Roughly 1 in 10 people is dyslexic. For a lot of us the
> keyboard has always been a gatekeeper — spell it wrong and the search returns
> nothing, the form rejects you. Large language models quietly removed that
> gate: they read *intent*, not orthography. This project puts a number on that,
> as a neurodiversity-positive demonstration anyone can re-run.

🔗 **Live leaderboard:** https://jhammant.github.io/llmspellbench/

---

## The headline metric: *spelling resilience*

```
spelling resilience = accuracy on messy questions ÷ accuracy on clean questions
```

**100% means the typos cost the model nothing.** A model that drops a lot is one
that punishes you for how you type.

<!-- RESULTS:START -->
_Run `python run.py` to generate the leaderboard. Latest published results live
on the [microsite](https://jhammant.github.io/llmspellbench/)._
<!-- RESULTS:END -->

## What "messy" means

The corruptor models real patterns, not random noise:

| Pattern | Clean | Messy |
|---|---|---|
| Phonetic misspelling | because | becuase |
| Homophone swap | their / there | there / their |
| Transposed letters | average | avrage |
| Dropped letters | friend | frend |
| Neighbouring-key slip | answer | anser |
| Lost capitals & punctuation | What is...? | waht is |

It is **deterministic** — the same question + seed always produces the same
messy text — so every model is graded on identical input and the website can
show the exact prompts.

## How scoring works

Every task has an objectively checkable answer (multiple choice, short factual,
or instruction-following). **No LLM judge, no opinion** — just right or wrong,
extracted with simple auditable rules in [`benchmark/scoring.py`](benchmark/scoring.py).
Only the question's natural-language wording is corrupted; answer choices and the
constant system prompt stay clean, so the single variable being measured is
robustness to messy spelling.

## Run it yourself

No dependencies — Python 3.10+ standard library only.

```bash
git clone https://github.com/jhammant/llmspellbench.git
cd llmspellbench

cp .env.example .env          # then paste your OpenRouter key into .env
./scripts/run_live.sh         # runs the benchmark + refreshes the website data
```

Or drive it directly:

```bash
export OPENROUTER_API_KEY=sk-or-...
python run.py --smoke                       # cheap sanity check (1 model, 3 tasks)
python run.py                               # all enabled models, full task set
python run.py --models gpt-4o-mini,llama-3.1-8b
python run.py --backends lmstudio           # only local models
python scripts/build_site.py                # copy results into docs/ for Pages
```

A full run costs only a few cents on OpenRouter (small prompts, short answers).

### Local models via LM Studio

Any model you've loaded in [LM Studio](https://lmstudio.ai/) is testable for
free. Start its local server (it serves the OpenAI-compatible API at
`http://localhost:1234`), then the models flagged `"backend": "lmstudio"` in
[`config/models.json`](config/models.json) just work. Edit that file to point at
whatever you have loaded.

## Add or change models

Everything is data-driven in [`config/models.json`](config/models.json):

```json
{"key": "my-model", "label": "My Model", "vendor": "Acme",
 "backend": "openrouter", "model": "acme/my-model-v1",
 "size_hint": "mid", "enabled": true}
```

## Project layout

```
benchmark/
  corruptor.py     # deterministic dyslexia-style text corruption
  scoring.py       # objective answer extraction + grading
  runner.py        # OpenAI-compatible client (OpenRouter + LM Studio)
config/models.json # the models under test
data/tasks.json    # original, public-domain task set
run.py             # CLI entry point -> results/leaderboard.json
scripts/build_site.py  # copy results into the microsite
docs/              # the GitHub Pages microsite (static, no build step)
results/           # leaderboard.json + raw_results.json (committed snapshot)
```

## Honest limitations

- It's a **small** task set — a demonstration, not a definitive ranking. Treat
  the numbers as indicative and re-run with your own tasks.
- Corruption intensity (`--intensity`, default 0.5) is a knob; harder settings
  separate models more.
- Model behaviour drifts over time, so results are stamped with a run date.
- This measures *understanding despite messy spelling* — not whether a model can
  spell, and not reading ease for humans.

## License

Code: [MIT](LICENSE). Tasks in `data/tasks.json`: original and CC0 (public domain).

---

*Built as an open demonstration that spelling shouldn't be a barrier. If it helps
one person feel less judged by a text box, it did its job.* 🧠💚
