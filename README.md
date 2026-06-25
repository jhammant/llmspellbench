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
We asked the models 54 objectively-scorable questions, first with clean spelling
and then with a deterministic "dyslexia-style" corruptor, sweeping corruption from
0% to 100% of words mangled. The headline finding is reassuring: **messy spelling
costs surprisingly little.** Spelling resilience averages around **88%** and ranges
from 75% to 97% — almost every model, whether frontier, small or local, keeps the
large majority of its accuracy on messy text. **Model size is not a clean
predictor:** tiny Gemini 2.5 Flash-Lite matches far larger models, and the clear
outlier is the *smallest* model, Llama 3.1 8B. Even at the hardest setting (100% of
words mangled) models retain about 83% of their accuracy on average.

### Leaderboard

| # | Model | Vendor | Clean | Resilience |
|---|---|---|---|---|
| 1 | GLM-5.2 | Z.ai | 98% | **97%** |
| 2 | GPT-5.5 | OpenAI | 100% | 93% |
| 3 | GLM-4.7 Flash | Z.ai | 98% | 93% |
| 4 | Claude Sonnet 4.6 | Anthropic | 100% | 93% |
| 5 | Claude Haiku 4.5 | Anthropic | 94% | 92% |
| 6 | GPT-OSS 20B (local) | Local | 94% | 91% |
| 7 | Nova Lite | Amazon | 93% | 89% |
| 8 | Llama 3.3 70B | Meta | 96% | 88% |
| 9 | DeepSeek V3.1 | DeepSeek | 98% | 88% |
| 10 | GPT-4o mini | OpenAI | 96% | 88% |
| 11 | Gemini 2.5 Flash-Lite | Google | 100% | 88% |
| 12 | Mistral Small | Mistral | 93% | 87% |
| 13 | GPT-4.1 mini | OpenAI | 98% | 84% |
| 14 | Qwen 2.5 7B | Alibaba | 81% | 82% |
| 15 | Llama 3.1 8B | Meta | 83% | **75%** |

*Resilience = messy accuracy ÷ clean accuracy (100% = messy spelling cost nothing).
Claude Opus 4.8 and the local Qwen3.6 27B are still being added; the
[live leaderboard](https://jhammant.github.io/llmspellbench/) is always current.*

### Does telling it you're dyslexic help?

We re-ran the messy questions with one change: a system-prompt line saying *"the
person is dyslexic and may misspell things, focus on what they mean."* It made
**almost no difference** — +0.8 points at 60% mangling, −0.8 at 100%, both within
noise. The models already understand without being told, so there's no need to
explain or apologise.
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
