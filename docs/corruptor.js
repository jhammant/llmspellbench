/* Browser port of benchmark/corruptor.py — used by the interactive predictor so
   the "mess it up" demo produces the same flavour of dyslexia-style corruption
   the models were actually tested on. Deterministic given (text, seed, intensity). */
(function () {
  "use strict";

  const MISSPELLINGS = {
    because: "becuase", definitely: "definately", separate: "seperate",
    received: "recieved", believe: "beleive", friend: "freind",
    tomorrow: "tommorow", beautiful: "beutiful", necessary: "neccessary",
    weird: "wierd", until: "untill", really: "realy", probably: "probly",
    different: "diffrent", remember: "remeber", address: "adress",
    business: "buisness", which: "wich", what: "waht", would: "wuold",
    should: "shuold", people: "poeple", quickly: "quikly", enough: "enuogh",
    thought: "thaught", through: "throuhg", answer: "anser", average: "avrage",
    minutes: "minuts", favourite: "favorite", colour: "color",
  };
  const HOMOPHONES = {
    their: "there", there: "their", your: "youre", "you're": "your",
    its: "it's", "it's": "its", to: "too", too: "to", two: "too",
    then: "than", than: "then", lose: "loose", where: "were", were: "where",
    right: "rite", buy: "by", by: "buy", know: "no", of: "off", off: "of",
  };
  const NEIGHBOURS = {
    a: "sq", b: "vn", c: "xv", d: "sf", e: "wr", f: "dg", g: "fh", h: "gj",
    i: "uo", j: "hk", k: "jl", l: "k", m: "n", n: "bm", o: "ip", p: "o",
    q: "wa", r: "et", s: "ad", t: "ry", u: "yi", v: "cb", w: "qe", x: "zc",
    y: "tu", z: "x",
  };

  // Deterministic string hash -> 32-bit seed, then mulberry32 PRNG.
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function matchCase(orig, repl) {
    return orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase()
      ? repl[0].toUpperCase() + repl.slice(1) : repl;
  }
  function transpose(w, r) {
    if (w.length < 4) return w;
    const i = 1 + Math.floor(r() * (w.length - 3));
    return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
  }
  function dropLetter(w, r) {
    if (w.length < 4) return w;
    const i = 1 + Math.floor(r() * (w.length - 2));
    return w.slice(0, i) + w.slice(i + 1);
  }
  function doubleLetter(w, r) {
    if (w.length < 3) return w;
    const i = 1 + Math.floor(r() * (w.length - 1));
    return w.slice(0, i) + w[i] + w.slice(i);
  }
  function keyboardSlip(w, r) {
    if (w.length < 3) return w;
    const i = 1 + Math.floor(r() * (w.length - 2));
    const ch = w[i].toLowerCase();
    if (NEIGHBOURS[ch]) {
      const n = NEIGHBOURS[ch];
      return w.slice(0, i) + n[Math.floor(r() * n.length)] + w.slice(i + 1);
    }
    return w;
  }

  function corruptWord(word, r) {
    const low = word.toLowerCase();
    if (MISSPELLINGS[low] && r() < 0.95) return matchCase(word, MISSPELLINGS[low]);
    if (HOMOPHONES[low] && r() < 0.8) return matchCase(word, HOMOPHONES[low]);
    const transforms = [transpose, dropLetter, doubleLetter, keyboardSlip];
    return transforms[Math.floor(r() * transforms.length)](word, r);
  }

  const WORD = /^[A-Za-z']+$/;

  function corrupt(text, seed, intensity) {
    seed = seed || 0;
    intensity = intensity == null ? 0.5 : intensity;
    const r = mulberry32(hashStr(seed + "|" + intensity + "|" + text));
    const tokens = text.split(/(\s+)/);
    const out = [];
    let changed = false;

    for (const tok of tokens) {
      const bare = tok.replace(/^[.,!?:;"']+|[.,!?:;"']+$/g, "");
      if (!WORD.test(bare) || tok.length < 2) { out.push(tok); continue; }
      const isHomophone = !!HOMOPHONES[bare.toLowerCase()];
      if (bare.length < 3 && !isHomophone) { out.push(tok); continue; }

      if (r() < intensity || (isHomophone && r() < 0.7)) {
        const start = tok.indexOf(bare);
        const prefix = tok.slice(0, start);
        let suffix = tok.slice(start + bare.length);
        const newBare = corruptWord(bare, r);
        if (r() < 0.6) suffix = "";
        out.push(prefix + newBare + suffix);
        changed = true;
      } else {
        out.push(tok);
      }
    }
    let result = out.join("");
    if (r() < 0.85) result = result.toLowerCase();
    if (!changed) result = result.replace("the ", "teh ");
    return result;
  }

  window.SpellCorruptor = { corrupt };
})();
