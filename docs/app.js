/* LLM Spell Bench — front-end. Reads window.SPELLBENCH (written by
   scripts/build_site.py) and renders the page. No framework, no fetch. */

(function () {
  "use strict";

  const REPO = "https://github.com/jhammant/llmspellbench";
  const data = window.SPELLBENCH;

  const pct = (x) => (x == null ? "n/a" : Math.round(x * 100) + "%");

  /* ---------- reading preferences ---------- */
  const body = document.body;
  const fontSelect = document.getElementById("font-select");
  const themeToggle = document.getElementById("theme-toggle");

  const savedFont = localStorage.getItem("sb-font");
  if (savedFont) { setFont(savedFont); fontSelect.value = savedFont; }
  if (localStorage.getItem("sb-theme") === "dark") setDark(true);

  function setFont(v) {
    body.classList.remove("font-dyslexic", "font-system");
    if (v === "dyslexic") body.classList.add("font-dyslexic");
    if (v === "system") body.classList.add("font-system");
  }
  function setDark(on) {
    body.classList.toggle("dark", on);
    themeToggle.textContent = on ? "Light mode" : "Dark mode";
    themeToggle.setAttribute("aria-pressed", String(on));
  }
  fontSelect.addEventListener("change", () => {
    setFont(fontSelect.value);
    localStorage.setItem("sb-font", fontSelect.value);
  });
  themeToggle.addEventListener("click", () => {
    const on = !body.classList.contains("dark");
    setDark(on);
    localStorage.setItem("sb-theme", on ? "dark" : "light");
  });

  /* ---------- repo links ---------- */
  ["repo-link", "footer-repo"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.href = REPO;
  });

  if (!data || !data.models || !data.models.length) {
    document.getElementById("lb-body").innerHTML =
      '<tr><td colspan="5">No results yet — run <code>python run.py</code> then <code>python scripts/build_site.py</code>.</td></tr>';
    return;
  }

  const models = data.models.slice();

  /* ---------- headline stats ---------- */
  const withRet = models.filter((m) => m.retention != null);
  const top = withRet[0];
  const avg = withRet.reduce((s, m) => s + m.retention, 0) / (withRet.length || 1);
  const kept90 = withRet.filter((m) => m.retention >= 0.9).length;

  const cards = [
    {
      feature: true,
      num: pct(top.retention),
      label: `<strong>${top.label}</strong> kept the most — messy spelling barely dented its score.`,
    },
    { num: pct(avg), label: `Average spelling resilience across all ${withRet.length} models tested.` },
    { num: `${kept90}/${withRet.length}`, label: "models kept 90%+ of their accuracy on messy questions." },
    { num: `${data.config.n_tasks}×2`, label: "questions per model — each asked clean, then messy." },
  ];
  document.getElementById("bigstat-grid").innerHTML = cards
    .map(
      (c) => `<div class="stat-card${c.feature ? " feature" : ""}">
        <div class="num">${c.num}</div>
        <div class="label">${c.label}</div>
      </div>`
    )
    .join("");

  /* ---------- example card ---------- */
  const examples = data.examples || [];
  let exIdx = 0;
  let exMode = "clean";
  const elPrompt = document.getElementById("example-prompt");
  const elMeta = document.getElementById("example-meta");
  const btnClean = document.getElementById("show-clean");
  const btnMessy = document.getElementById("show-messy");

  function renderExample() {
    if (!examples.length) return;
    const ex = examples[exIdx % examples.length];
    elPrompt.textContent = exMode === "clean" ? ex.clean : ex.messy;
    elPrompt.classList.toggle("messy", exMode === "messy");
    const ans = ex.choices ? `${ex.answer}) ${ex.choices["ABCDE".indexOf(ex.answer)]}` : ex.answer;
    elMeta.textContent = `Category: ${ex.category} · correct answer: ${ans}`;
  }
  function setMode(mode) {
    exMode = mode;
    btnClean.classList.toggle("active", mode === "clean");
    btnMessy.classList.toggle("active", mode === "messy");
    btnClean.setAttribute("aria-pressed", String(mode === "clean"));
    btnMessy.setAttribute("aria-pressed", String(mode === "messy"));
    renderExample();
  }
  btnClean.addEventListener("click", () => setMode("clean"));
  btnMessy.addEventListener("click", () => setMode("messy"));
  document.getElementById("example-next").addEventListener("click", () => {
    exIdx = (exIdx + 1) % examples.length;
    renderExample();
  });
  setMode("clean");

  /* ---------- leaderboard ---------- */
  const tbody = document.getElementById("lb-body");
  tbody.innerHTML = models
    .map((m, i) => {
      const ret = m.retention == null ? 0 : m.retention;
      const width = Math.max(0, Math.min(100, ret * 100));
      const local = m.backend === "lmstudio";
      return `<tr class="${i === 0 ? "top" : ""}">
        <td class="rank">${i + 1}</td>
        <td>
          <span class="model-name">${m.label}</span>${local ? '<span class="badge local">local</span>' : ""}
          <span class="model-vendor">${m.vendor}</span>
        </td>
        <td class="num">${pct(m.clean_acc)}</td>
        <td class="num">${pct(m.messy_acc)}</td>
        <td>
          <div class="res-cell">
            <div class="res-bar"><div class="res-fill" style="width:${width}%"></div></div>
            <span class="res-val">${pct(m.retention)}</span>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const headlinePct = Math.round((data.config.headline_intensity || 0.6) * 100);
  const modelWord = models.length === 1 ? "model" : "models";
  document.getElementById("lb-caption").textContent =
    `${models.length} ${modelWord} · ${data.config.n_tasks} tasks each · ${data.config.trials} corruptions per level, averaged · ` +
    `headline messiness ${headlinePct}%. Clean = accuracy on the original question; Messy = accuracy at the headline messiness.`;

  /* ---------- shared: interpolate a retention curve ---------- */
  function retentionAt(curve, x) {
    const pts = (curve || []).filter((p) => p.retention != null);
    if (!pts.length) return null;
    if (x <= pts[0].intensity) return pts[0].retention;
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i].intensity) {
        const a = pts[i - 1], b = pts[i];
        const t = (x - a.intensity) / ((b.intensity - a.intensity) || 1);
        return a.retention + t * (b.retention - a.retention);
      }
    }
    return pts[pts.length - 1].retention;
  }

  const INTENS = (data.config.intensities && data.config.intensities.length)
    ? data.config.intensities
    : [0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const curveModels = models.filter((m) => m.retention != null && m.curve && m.curve.length > 1);

  // Average retention curve across models, used by both the chart and the predictor.
  const avgCurve = INTENS.map((it) => {
    const vals = curveModels.map((m) => retentionAt(m.curve, it)).filter((v) => v != null);
    return { intensity: it, retention: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null };
  });

  /* ---------- breaking-point chart (inline SVG, no library) ---------- */
  const chartEl = document.getElementById("chart");
  let guideLine = null, guideDot = null;
  const W = 760, H = 360, L = 48, R = 18, T = 16, B = 44;
  const X = (v) => L + v * (W - L - R);
  const Y = (v) => T + (1 - Math.min(1.02, Math.max(0, v))) * (H - T - B);

  function pathFor(curve) {
    const pts = (curve || []).filter((p) => p.retention != null);
    return pts.map((p, i) => `${i ? "L" : "M"}${X(p.intensity).toFixed(1)},${Y(p.retention).toFixed(1)}`).join(" ");
  }

  if (chartEl && curveModels.length) {
    const yTicks = [0, 0.25, 0.5, 0.75, 1.0];
    const grid = yTicks.map((t) =>
      `<line x1="${L}" y1="${Y(t)}" x2="${W - R}" y2="${Y(t)}" class="grid" />` +
      `<text x="${L - 8}" y="${Y(t) + 4}" class="axis-label" text-anchor="end">${Math.round(t * 100)}%</text>`
    ).join("");
    const xTicks = INTENS.map((it) =>
      `<text x="${X(it)}" y="${H - B + 20}" class="axis-label" text-anchor="middle">${Math.round(it * 100)}%</text>`
    ).join("");
    const modelLines = curveModels.map((m) =>
      `<path d="${pathFor(m.curve)}" class="cv-model" />`).join("");
    const avgLine = `<path d="${pathFor(avgCurve)}" class="cv-avg" />`;
    const avgDots = avgCurve.filter((p) => p.retention != null)
      .map((p) => `<circle cx="${X(p.intensity)}" cy="${Y(p.retention)}" r="3.5" class="cv-avg-dot" />`).join("");

    chartEl.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" width="100%">
        ${grid}${xTicks}
        <text x="${(L + W - R) / 2}" y="${H - 6}" class="axis-title" text-anchor="middle">how messy the spelling is →</text>
        <text transform="translate(13,${(T + H - B) / 2}) rotate(-90)" class="axis-title" text-anchor="middle">accuracy kept</text>
        <line id="guide-line" x1="${X(0.55)}" y1="${T}" x2="${X(0.55)}" y2="${H - B}" class="cv-guide" />
        ${modelLines}${avgLine}${avgDots}
        <circle id="guide-dot" cx="${X(0.55)}" cy="${Y(retentionAt(avgCurve, 0.55) || 1)}" r="5" class="cv-guide-dot" />
      </svg>`;
    guideLine = document.getElementById("guide-line");
    guideDot = document.getElementById("guide-dot");

    document.getElementById("chart-legend").innerHTML =
      `<span class="lg-item"><span class="lg-swatch avg"></span>Average of all ${curveModels.length} models</span>` +
      `<span class="lg-item"><span class="lg-swatch model"></span>Individual models</span>`;

    const worst = avgCurve[avgCurve.length - 1];
    document.getElementById("breaking-caption").textContent =
      `Even at the hardest setting (${Math.round(INTENS[INTENS.length - 1] * 100)}% of words mangled), models still keep about ` +
      `${Math.round((worst.retention || 0) * 100)}% of their accuracy on average. Each faint line is one model; the bold line is the average.`;
  }

  /* ---------- interactive predictor (driven by what YOU type) ---------- */
  const inputEl = document.getElementById("pred-input");
  const meterFill = document.getElementById("meter-fill");
  const meterVal = document.getElementById("meter-val");
  const meterNote = document.getElementById("meter-note");
  const gaugeNum = document.getElementById("pred-gauge-num");
  const gaugeFill = document.getElementById("pred-gauge-fill");
  const verdictEl = document.getElementById("pred-verdict");
  const modelListEl = document.getElementById("pred-model-list");

  const DICT = new Set((window.SPELL_WORDS || "").split(" "));
  const BASE = "How many minutes are there in three quarters of an hour?";

  // Messiness = share of real words our dictionary doesn't recognise. Mirrors
  // the corruptor, which mangles roughly this fraction of words.
  function estimateMessiness(text) {
    const tokens = (text.toLowerCase().match(/[a-z']{1,}/g) || []).filter((w) => w.length >= 2);
    if (!tokens.length) return { intensity: 0, messy: 0, total: 0 };
    let messy = 0;
    for (const w of tokens) {
      const bare = w.replace(/'/g, "");
      if (!DICT.has(w) && !DICT.has(bare)) messy++;
    }
    return { intensity: messy / tokens.length, messy, total: tokens.length };
  }

  function verdictFor(r) {
    if (r >= 0.97) return ["Perfectly clear.", "Spelling like this costs the models nothing."];
    if (r >= 0.9) return ["No real problem.", "They'd understand you almost perfectly."];
    if (r >= 0.8) return ["Understood well.", "A small dip — your spelling barely matters."];
    if (r >= 0.65) return ["Mostly fine.", "It slips a little, but most of your meaning gets through."];
    if (r >= 0.45) return ["Getting hard.", "This is rough even for AI — but a lot still lands."];
    return ["Extreme.", "Almost unreadable — even AI struggles here."];
  }

  function updatePredictor() {
    const text = (inputEl && inputEl.value) || "";
    const { intensity, messy, total } = estimateMessiness(text || BASE);

    // messiness meter
    const mpct = Math.round(intensity * 100);
    if (meterFill) meterFill.style.width = mpct + "%";
    if (meterVal) meterVal.textContent = mpct + "%";
    if (meterNote) {
      meterNote.textContent = total
        ? `${messy} of ${total} words look misspelled.`
        : "Type something to see.";
    }

    // predicted understanding from the measured average curve
    const r = retentionAt(avgCurve, intensity);
    const rv = r == null ? 1 : Math.min(1, r);
    const rpct = Math.round(rv * 100);
    if (gaugeNum) gaugeNum.textContent = rpct + "%";
    if (gaugeFill) gaugeFill.style.width = rpct + "%";
    if (verdictEl) {
      const [head, sub] = verdictFor(rv);
      verdictEl.innerHTML = `<strong>${head}</strong> ${sub}`;
    }

    if (modelListEl) {
      const ranked = curveModels
        .map((m) => ({ label: m.label, local: m.backend === "lmstudio", r: Math.min(1, retentionAt(m.curve, intensity) || 0) }))
        .sort((a, b) => b.r - a.r);
      modelListEl.innerHTML = ranked.map((m) =>
        `<li><span class="pm-name">${m.label}${m.local ? '<span class="badge local">local</span>' : ""}</span>` +
        `<span class="pm-bar"><span class="pm-fill" style="width:${Math.round(m.r * 100)}%"></span></span>` +
        `<span class="pm-val">${Math.round(m.r * 100)}%</span></li>`).join("");
    }

    if (guideLine && guideDot) {
      guideLine.setAttribute("x1", X(intensity));
      guideLine.setAttribute("x2", X(intensity));
      guideDot.setAttribute("cx", X(intensity));
      guideDot.setAttribute("cy", Y(rv));
    }
  }

  // Example chips fill the box (typing stays the primary interaction).
  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = btn.getAttribute("data-level");
      const c = window.SpellCorruptor;
      inputEl.value = lvl === "clean" ? BASE
        : lvl === "light" ? (c ? c.corrupt(BASE, 7, 0.3) : BASE)
        : (c ? c.corrupt(BASE, 3, 0.85) : BASE);
      updatePredictor();
      inputEl.focus();
    });
  });

  if (inputEl) inputEl.addEventListener("input", updatePredictor);
  updatePredictor();

  /* ---------- "does telling it you're dyslexic help?" experiment ---------- */
  (function renderPromptEffect() {
    const fx = window.PROMPT_EFFECT;
    if (!fx || !fx.models || !fx.models.length) return;
    const section = document.getElementById("promptfx");
    const display = fx.intensities[fx.intensities.length - 1]; // hardest level
    const summary = (fx.summary || []).find((s) => Math.abs(s.intensity - display) < 1e-6);
    if (!summary) return;

    const deltaPts = summary.avg_delta * 100;
    const verdict = Math.abs(deltaPts) < 1.5 ? "almost nothing"
      : deltaPts > 0 ? "a small help" : "slightly worse";
    const headlineNum = (deltaPts >= 0 ? "+" : "") + deltaPts.toFixed(1) + " pts";
    document.getElementById("pfx-headline").innerHTML =
      `<div class="stat-card feature">
         <div class="num">${headlineNum}</div>
         <div class="label">average change in messy-question accuracy at the hardest level (${Math.round(display * 100)}% mangled)
         when you add <strong>"I'm dyslexic"</strong> to the prompt — <strong>${verdict}</strong>.
         Of ${summary.n_models} models, ${summary.helped} did a bit better and ${summary.hurt} a bit worse.
         The models already understood the messy questions without being told.</div>
       </div>`;

    const rows = fx.models.map((m) => {
      const p = m.points.find((q) => Math.abs(q.intensity - display) < 1e-6);
      if (!p) return "";
      const d = p.delta * 100;
      const cls = d > 0.5 ? "delta-pos" : d < -0.5 ? "delta-neg" : "delta-flat";
      const sign = d > 0 ? "+" : "";
      return `<tr>
        <td><span class="model-name">${m.label}</span>${m.local ? '<span class="badge local">local</span>' : ""}<span class="model-vendor">${m.vendor}</span></td>
        <td class="num">${Math.round(p.baseline * 100)}%</td>
        <td class="num">${Math.round(p.aware * 100)}%</td>
        <td class="num ${cls}">${sign}${d.toFixed(0)} pts</td>
      </tr>`;
    }).join("");
    document.getElementById("pfx-body").innerHTML = rows;

    const at06 = (fx.summary || []).find((s) => Math.abs(s.intensity - 0.6) < 1e-6);
    document.getElementById("pfx-caption").textContent =
      `Messy-question accuracy at ${Math.round(display * 100)}% of words mangled, with the plain prompt vs the "I'm dyslexic" prompt. ` +
      (at06 ? `At a milder 60% level the average change was ${(at06.avg_delta * 100 >= 0 ? "+" : "")}${(at06.avg_delta * 100).toFixed(1)} pts. ` : "") +
      `Same questions and same corruptions in both runs.`;

    section.hidden = false;
  })();

  document.getElementById("generated-at").textContent = "Last run: " + (data.generated_at || "—");
})();
