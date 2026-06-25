## Version A — Main post

Spelling has always been a barrier for me.

I'm dyslexic, and for most of my life "getting it wrong on the page" sat between what I meant and what people read.

Then LLMs quietly removed that barrier. I can type messily, swap their/there, drop letters — and the thing on the other end just gets what I mean. It's freeing.

I wanted to put real numbers behind that feeling, so I built an open benchmark: LLM Spell Bench.

The method: 54 objectively-scorable tasks, asked clean, then run through a deterministic dyslexia-style corruptor (phonetic slips, homophone swaps, transposed and dropped letters) across corruption levels from 0% up to 100% of words mangled. 16 models. No LLM judge.

A few things that surprised me:

🔹 Model SIZE isn't the predictor. Tiny Gemini 2.5 Flash-Lite keeps pace with much larger models. GLM-5.2 tops the board. The clear outlier is the smallest, Llama 3.1 8B — and it's the one that struggles most when everything is mangled.

🔹 Telling the model "I'm dyslexic, focus on what I mean" barely moved anything — within noise. They already understand. You don't have to explain or apologise.

🔹 Across the board, models hold the large majority of their accuracy on messy text. There's a real breaking point, but it's far past normal typos.

It's a small task set — a demonstration, not a definitive ranking.

Try the in-browser predictor (type your own messy question), see the leaderboard, and re-run it yourself 👇

🔗 https://jhammant.github.io/llmspellbench/

#Neurodiversity #Dyslexia #AI #LLMs #Accessibility #OpenSource

---

## Version B — Short variant

I'm dyslexic. Spelling was always a barrier — LLMs quietly removed it. ✨

So I measured it: an open benchmark of 16 models on dyslexia-style messy text.

Turns out size isn't the predictor, and telling the model "I'm dyslexic" barely changes a thing — they already get what you mean.

Try the predictor and re-run it 👉 https://jhammant.github.io/llmspellbench/

#Neurodiversity #Dyslexia #AI #LLMs #OpenSource
