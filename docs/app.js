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

  /* ---------- interactive predictor ---------- */
  const inputEl = document.getElementById("pred-input");
  const slider = document.getElementById("pred-slider");
  const sliderVal = document.getElementById("pred-slider-val");
  const messyEl = document.getElementById("pred-messy");
  const gaugeNum = document.getElementById("pred-gauge-num");
  const gaugeFill = document.getElementById("pred-gauge-fill");
  const verdictEl = document.getElementById("pred-verdict");
  const modelListEl = document.getElementById("pred-model-list");

  function verdictFor(r) {
    if (r >= 0.95) return ["Basically no problem.", "They'd understand you almost perfectly."];
    if (r >= 0.85) return ["Still understood well.", "Only a small dip — spelling barely matters here."];
    if (r >= 0.7) return ["Mostly fine.", "Understanding slips a little, but most gets through."];
    if (r >= 0.5) return ["Getting hard.", "Even for AI this is rough — but half still lands."];
    return ["Extreme.", "This is near-unreadable; even AI struggles."];
  }

  function updatePredictor() {
    const intensity = (slider ? +slider.value : 55) / 100;
    if (sliderVal) sliderVal.textContent = Math.round(intensity * 100) + "%";
    const text = (inputEl && inputEl.value.trim()) || "How many minutes are there in three quarters of an hour?";

    if (window.SpellCorruptor && messyEl) {
      messyEl.textContent = intensity === 0 ? text : window.SpellCorruptor.corrupt(text, 42, intensity);
    }

    const r = retentionAt(avgCurve, intensity);
    const rv = r == null ? 1 : Math.min(1, r);
    if (gaugeNum) gaugeNum.textContent = Math.round(rv * 100) + "%";
    if (gaugeFill) gaugeFill.style.width = Math.round(rv * 100) + "%";
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

  if (slider) slider.addEventListener("input", updatePredictor);
  if (inputEl) inputEl.addEventListener("input", updatePredictor);
  updatePredictor();

  document.getElementById("generated-at").textContent = "Last run: " + (data.generated_at || "—");
})();
