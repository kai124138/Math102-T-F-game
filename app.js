(() => {
  "use strict";

  const SECTIONS = window.TF_SECTIONS;
  const MACROS = window.TF_MACROS;
  const SEC_IDS = Object.keys(SECTIONS).map(Number);
  const REPO = "https://github.com/kai124138/Math102-T-F-game";
  const LENGTHS = [10, 20, 40, "all"];

  // ── Data ──────────────────────────────────────────────────────────────────
  // A question's id is a hash of its statement, so saved progress survives reordering.
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const BANK = window.TF_QUESTIONS.map(([sec, answer, statement, why, ref], i) => ({
    n: i + 1, id: hash(statement), sec, answer, statement, why, ref: ref || "",
    search: (statement + " " + why + " " + SECTIONS[sec]).toLowerCase().replace(/\\[a-z]+/g, (m) => " " + m.slice(1) + " "),
  }));
  const BY_SEC = Object.fromEntries(SEC_IDS.map((s) => [s, BANK.filter((q) => q.sec === s)]));

  // ── Storage (every access guarded; the game works without it) ─────────────
  const KEY = "math102-tf:";
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(KEY + k); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(KEY + k); } catch { /* storage unavailable */ } },
  };

  // history[id] = [times seen, times missed, last result (1 right, 0 wrong)]
  let history = store.get("history", {});
  if (!history || typeof history !== "object" || Array.isArray(history)) history = {};
  const saveHistory = () => store.set("history", history);

  const prefs = { sections: SEC_IDS.slice(), length: 20, order: "shuffle", ...store.get("prefs", {}) };
  prefs.sections = (Array.isArray(prefs.sections) ? prefs.sections : SEC_IDS).filter((s) => SECTIONS[s]);
  if (!LENGTHS.includes(prefs.length)) prefs.length = 20;
  if (!["shuffle", "weak"].includes(prefs.order)) prefs.order = "shuffle";
  const savePrefs = () => store.set("prefs", prefs);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "rich") rich(el, v);
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  // ── Math rendering ────────────────────────────────────────────────────────
  // Text is split into $math$, **bold** and plain runs and built with DOM nodes, never innerHTML.
  function tex(src) {
    const span = document.createElement("span");
    if (window.katex) {
      try {
        window.katex.render(src, span, { throwOnError: false, macros: { ...MACROS } });
        return span;
      } catch { /* fall through to the raw source */ }
    }
    span.className = "tex-fallback";
    span.textContent = src;
    return span;
  }

  function rich(el, src) {
    el.textContent = "";
    const re = /\$([^$]+)\$|\*\*([^*]+)\*\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      if (m.index > last) el.append(src.slice(last, m.index));
      if (m[1] != null) {
        const math = tex(m[1]);
        // Keep short formulas on one line, glued to the punctuation that follows them.
        const punct = /^[.,;:)]+/.exec(src.slice(re.lastIndex));
        if (m[1].length <= 40 && (punct || m[1].length <= 24)) {
          el.append(h("span", { class: "nobr" }, math, punct ? punct[0] : ""));
          if (punct) re.lastIndex += punct[0].length;
        } else el.append(math);
      } else {
        el.append(h("strong", { rich: m[2] }));
      }
      last = re.lastIndex;
    }
    if (last < src.length) el.append(src.slice(last));
    return el;
  }

  // ── Screens ───────────────────────────────────────────────────────────────
  let screen = "home";
  function show(name) {
    for (const s of ["home", "play", "results", "browse"]) $(s).hidden = s !== name;
    screen = name;
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // ── Theme ─────────────────────────────────────────────────────────────────
  const root = document.documentElement;
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : darkQuery.matches;
  function syncThemeButton() {
    $("btn-theme").setAttribute("aria-label", isDark() ? "Switch to light mode" : "Switch to dark mode");
  }
  $("btn-theme").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    root.dataset.theme = next;
    store.set("theme", next);
    syncThemeButton();
  });
  darkQuery.addEventListener?.("change", syncThemeButton);
  syncThemeButton();

  // ── Notation sheet ────────────────────────────────────────────────────────
  const NOTATION = [
    [String.raw`$M_{m\times n}$, $M_n$`, String.raw`$m\times n$ matrices over $\F$ (that is, $\R$ or $\C$); $M_n=M_{n\times n}$.`],
    [String.raw`$\iff$ and $\implies$`, String.raw`$\iff$: both directions hold. $\implies$: one direction only, and the converse may be a trap.`],
    [String.raw`$e_j$, $E_{ij}$`, String.raw`The $j$-th standard basis vector; the matrix with a $1$ in entry $(i,j)$ and $0$ elsewhere.`],
    [String.raw`$\sm{a&b\\c&d}$, $\sm{A&B\\C&D}$`, String.raw`Matrices written inline. Capital letters inside are blocks.`],
    [String.raw`$A\oplus B$`, String.raw`The block-diagonal matrix $\sm{A&0\\0&B}$.`],
    [String.raw`$A\sim B$`, String.raw`Similar: $A=SBS^{-1}$ for some invertible $S$. $A\nsim B$ means not similar.`],
    [String.raw`$A^\T$, $\conj A$`, String.raw`Transpose; entrywise complex conjugate.`],
    [String.raw`$\col A$, $\row A$, $\nul A$`, String.raw`Column space, row space, null space.`],
    [String.raw`Full column / row rank`, String.raw`For $A\in M_{m\times n}$: $\rank A=n$ / $\rank A=m$.`],
    [String.raw`$M/A$`, String.raw`The Schur complement $D-CA^{-1}B$ of $A$ in $M=\sm{A&B\\C&D}$.`],
    [String.raw`Tags`, String.raw`Chips such as H1006-07, P.3.26 or Thm 9.6.3 name the homework problem, textbook exercise or theorem the fact comes from.`],
  ];
  let notationRendered = false;
  let notationReturn = null;
  function openNotation() {
    if (!notationRendered) {
      const dl = $("notation-list");
      for (const [term, desc] of NOTATION) dl.append(h("dt", { rich: term }), h("dd", { rich: desc }));
      notationRendered = true;
    }
    notationReturn = document.activeElement;
    $("notation").hidden = false;
    document.body.classList.add("no-scroll");
    $("notation-close").focus();
  }
  function closeNotation() {
    $("notation").hidden = true;
    document.body.classList.remove("no-scroll");
    notationReturn?.focus?.();
  }
  $("btn-notation").addEventListener("click", openNotation);
  $("notation").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeNotation(); });

  // ── Home ──────────────────────────────────────────────────────────────────
  const tiles = {};
  function buildHome() {
    $("bank-size").textContent = BANK.length;
    const grid = $("sec-grid");
    for (const s of SEC_IDS) {
      const meta = h("span", { class: "sec-meta" });
      const bar = h("i");
      const check = h("span", { class: "sec-check", "aria-hidden": "true" });
      // SVG elements need their own namespace, so this one is built by hand.
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M3.5 8.5l3 3 6-6.5");
      svg.append(path);
      check.append(svg);
      const tile = h("button", { class: "sec-tile", type: "button", onclick: () => toggleSection(s) },
        h("span", { class: "sec-top" }, h("span", { class: "sec-num", text: `§${s}` }), check),
        h("span", { class: "sec-name", text: SECTIONS[s] }),
        meta,
        h("span", { class: "sec-bar", "aria-hidden": "true" }, bar),
      );
      tiles[s] = { tile, meta, bar };
      grid.append(tile);
    }
    $("seg-length").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      prefs.length = b.dataset.value === "all" ? "all" : Number(b.dataset.value);
      savePrefs();
      updateHome();
    });
    $("seg-order").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      prefs.order = b.dataset.value;
      savePrefs();
      updateHome();
    });
    $("sec-all").addEventListener("click", () => { prefs.sections = SEC_IDS.slice(); savePrefs(); updateHome(); });
    $("sec-none").addEventListener("click", () => { prefs.sections = []; savePrefs(); updateHome(); });
    $("btn-start").addEventListener("click", () => startRound(buildRound()));
    $("btn-browse").addEventListener("click", openBrowse);
  }

  function toggleSection(s) {
    const set = new Set(prefs.sections);
    set.has(s) ? set.delete(s) : set.add(s);
    prefs.sections = SEC_IDS.filter((x) => set.has(x));
    savePrefs();
    updateHome();
  }

  const mastered = (q) => (history[q.id] || [])[2] === 1;

  function poolSize() {
    return prefs.sections.reduce((n, s) => n + BY_SEC[s].length, 0);
  }

  function updateHome() {
    for (const s of SEC_IDS) {
      const { tile, meta, bar } = tiles[s];
      const qs = BY_SEC[s];
      const m = qs.filter(mastered).length;
      tile.setAttribute("aria-pressed", String(prefs.sections.includes(s)));
      meta.textContent = `${qs.length} statements` + (m ? ` · ${m} mastered` : "");
      bar.style.width = `${(100 * m) / qs.length}%`;
    }
    for (const b of $("seg-length").children) b.setAttribute("aria-pressed", String(String(prefs.length) === b.dataset.value));
    for (const b of $("seg-order").children) b.setAttribute("aria-pressed", String(prefs.order === b.dataset.value));

    const pool = poolSize();
    const n = prefs.length === "all" ? pool : Math.min(prefs.length, pool);
    const start = $("btn-start");
    start.disabled = pool === 0;
    start.textContent = pool === 0 ? "Pick a section to start" : `Start · ${n} question${n === 1 ? "" : "s"}`;
    renderProgressLine();
  }

  let resetArmed = null;
  function renderProgressLine() {
    const line = $("progress-line");
    line.textContent = "";
    const rows = Object.entries(history).filter(([id]) => BANK.some((q) => q.id === id));
    const seen = rows.reduce((n, [, r]) => n + r[0], 0);
    if (!seen) {
      line.append("Your progress is saved in this browser as you play.");
      return;
    }
    const wrong = rows.reduce((n, [, r]) => n + r[1], 0);
    const m = BANK.filter(mastered).length;
    line.append(
      `${seen} answer${seen === 1 ? "" : "s"} · ${Math.round((100 * (seen - wrong)) / seen)}% correct · ${m}/${BANK.length} mastered · `,
      h("button", {
        type: "button", class: "link-btn", id: "btn-reset",
        text: resetArmed ? "Click again to erase progress" : "Reset progress",
        onclick: () => {
          if (resetArmed) {
            clearTimeout(resetArmed);
            resetArmed = null;
            history = {};
            store.remove("history");
            updateHome();
            $("btn-start").focus();
          } else {
            resetArmed = setTimeout(() => { resetArmed = null; renderProgressLine(); }, 3500);
            renderProgressLine();
            $("btn-reset").focus();
          }
        },
      }),
    );
  }

  function goHome() {
    round = null;
    updateHome();
    show("home");
  }
  $("brand").addEventListener("click", () => {
    if (screen === "play" && round && round.results.length) finish();
    else goHome();
  });

  // ── Building a round ──────────────────────────────────────────────────────
  // "Weak spots first" tiers: last answer wrong > missed before > never seen > always right.
  function tier(q) {
    const r = history[q.id];
    if (!r) return 1;
    if (r[2] === 0) return 3;
    if (r[1] > 0) return 2;
    return 0;
  }

  function buildRound() {
    const secs = new Set(prefs.sections);
    const pool = BANK.filter((q) => secs.has(q.sec));
    const n = prefs.length === "all" ? pool.length : Math.min(prefs.length, pool.length);
    if (prefs.order === "weak") {
      // Array.sort is stable, so shuffling first randomizes within each tier.
      const picked = shuffle(pool).sort((a, b) => tier(b) - tier(a)).slice(0, n);
      return shuffle(picked);
    }
    return shuffle(pool).slice(0, n);
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  let round = null;
  let lastMissed = [];
  const card = $("card");
  const btnTrue = $("btn-true");
  const btnFalse = $("btn-false");
  const btnNext = $("btn-next");

  function startRound(qs) {
    if (!qs.length) return;
    round = { qs, i: 0, results: [], streak: 0, best: 0, locked: false };
    show("play");
    renderQuestion();
  }

  function renderQuestion() {
    const q = round.qs[round.i];
    round.locked = false;
    $("q-index").textContent = round.i + 1;
    $("q-total").textContent = round.qs.length;
    $("progress-fill").style.width = `${(100 * round.i) / round.qs.length}%`;
    $("q-tag").textContent = `§${q.sec} · ${SECTIONS[q.sec]}`;
    rich($("q-text"), q.statement);

    card.classList.remove("answered", "is-right", "is-wrong", "enter");
    void card.offsetWidth; // restart the entrance animation
    card.classList.add("enter");
    for (const b of [btnTrue, btnFalse]) {
      b.disabled = false;
      b.classList.remove("is-answer", "is-miss");
    }
    $("feedback").hidden = true;
    btnNext.hidden = true;
    updateTally();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  function updateTally() {
    const ok = round.results.filter((r) => r.ok).length;
    $("t-ok").textContent = ok;
    $("t-bad").textContent = round.results.length - ok;
    const streak = $("streak");
    streak.hidden = round.streak < 3;
    streak.textContent = `${round.streak} in a row`;
  }

  function answer(guess) {
    if (!round || round.locked) return;
    round.locked = true;
    const q = round.qs[round.i];
    const ok = guess === q.answer;
    round.results.push({ q, ok });
    round.streak = ok ? round.streak + 1 : 0;
    round.best = Math.max(round.best, round.streak);

    const r = history[q.id] || [0, 0, 0];
    r[0] += 1;
    if (!ok) r[1] += 1;
    r[2] = ok ? 1 : 0;
    history[q.id] = r;
    saveHistory();

    card.classList.add("answered", ok ? "is-right" : "is-wrong");
    (q.answer ? btnTrue : btnFalse).classList.add("is-answer");
    if (!ok) (guess ? btnTrue : btnFalse).classList.add("is-miss");
    btnTrue.disabled = btnFalse.disabled = true;

    const verdict = $("verdict");
    verdict.className = `verdict ${ok ? "ok" : "bad"}`;
    verdict.replaceChildren(
      h("strong", { text: ok ? "Correct." : "Not quite." }),
      h("span", { text: ` It's ${q.answer ? "true" : "false"}.` }),
    );
    const why = $("why");
    why.className = `why ${q.answer ? "why-true" : "why-false"}`;
    why.replaceChildren(
      h("span", { class: "why-label", text: q.answer ? "Why it's true" : "Why it's false" }),
      h("p", { rich: q.why }),
    );
    $("refs").replaceChildren(...refChips(q), reportLink(q));

    $("feedback").hidden = false;
    $("progress-fill").style.width = `${(100 * (round.i + 1)) / round.qs.length}%`;
    $("next-label").textContent = round.i + 1 === round.qs.length ? "See results" : "Next";
    btnNext.hidden = false;
    btnNext.focus({ preventScroll: true });
    updateTally();

    // On small screens, bring the explanation and the Next button into view.
    requestAnimationFrame(() => {
      const rect = btnNext.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 8) {
        btnNext.scrollIntoView({ block: "end", behavior: reducedMotion() ? "auto" : "smooth" });
      }
    });
  }

  function refChips(q) {
    const chips = [h("span", { class: "chip", text: `§${q.sec}` })];
    if (q.ref) chips.push(h("span", { class: "chip", text: q.ref }));
    return chips;
  }

  function reportLink(q) {
    const title = `Statement #${q.n}: `;
    const body = `**Statement #${q.n}** (§${q.sec}, answer: ${q.answer ? "true" : "false"})\n\n\`${q.statement}\`\n\nWhat looks wrong:\n`;
    return h("a", {
      class: "report", target: "_blank", rel: "noopener",
      href: `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
      text: "Report a problem",
    });
  }

  function next() {
    if (!round || !round.locked) return;
    round.i += 1;
    if (round.i >= round.qs.length) finish();
    else renderQuestion();
  }

  function endRound() {
    if (!round) return;
    if (round.results.length === 0) goHome();
    else finish();
  }

  btnTrue.addEventListener("click", () => answer(true));
  btnFalse.addEventListener("click", () => answer(false));
  btnNext.addEventListener("click", next);
  $("btn-end").addEventListener("click", endRound);

  // ── Results ───────────────────────────────────────────────────────────────
  function message(pct) {
    if (pct === 100) return "Flawless. Every trap spotted.";
    if (pct >= 90) return "Exam-ready.";
    if (pct >= 75) return "Solid. Look over the misses below.";
    if (pct >= 50) return "Getting there. The explanations are where the learning is.";
    return "Rough round. Read the misses, then replay them.";
  }

  function finish() {
    const res = round.results;
    const n = res.length;
    const score = res.filter((r) => r.ok).length;
    const pct = Math.round((100 * score) / n);
    const early = n < round.qs.length;

    const circumference = 2 * Math.PI * 52;
    const ring = $("ring-fill");
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference}`;
    ring.classList.toggle("perfect", pct === 100);
    $("r-pct").textContent = `${pct}%`;
    $("r-score").textContent = `${score} / ${n}`;
    $("r-msg").textContent = message(pct);
    $("r-meta").textContent = `Best streak ${round.best}` + (early ? ` · ended early after ${n} of ${round.qs.length}` : "");

    // Per-section breakdown (only when the round mixed sections).
    const bySec = new Map();
    for (const { q, ok } of res) {
      const row = bySec.get(q.sec) || [0, 0];
      row[0] += ok ? 1 : 0;
      row[1] += 1;
      bySec.set(q.sec, row);
    }
    const breakdown = $("r-sections");
    breakdown.textContent = "";
    for (const s of [...bySec.keys()].sort((a, b) => a - b)) {
      const [ok, total] = bySec.get(s);
      const level = ok === total ? "full" : ok * 2 >= total ? "mid" : "low";
      breakdown.append(h("div", { class: `bd-row ${level}` },
        h("span", { class: "bd-name" }, h("b", { text: `§${s}` }), ` ${SECTIONS[s]}`),
        h("span", { class: "bd-bar", "aria-hidden": "true" }, h("i", { style: `width:${(100 * ok) / total}%` })),
        h("span", { class: "bd-score", text: `${ok}/${total}` }),
      ));
    }
    $("r-sections-panel").hidden = bySec.size < 2;

    lastMissed = res.filter((r) => !r.ok).map((r) => r.q);
    const missedList = $("r-missed");
    missedList.textContent = "";
    for (const q of lastMissed) missedList.append(reviewCard(q));
    $("r-missed-wrap").hidden = lastMissed.length === 0;

    const replay = $("btn-replay");
    replay.hidden = lastMissed.length === 0;
    replay.textContent = `Replay ${lastMissed.length} missed`;
    $("btn-again").classList.toggle("primary", lastMissed.length === 0);

    round = null;
    updateHome();
    show("results");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${circumference * (1 - score / n)}`;
    }));
    (lastMissed.length ? replay : $("btn-again")).focus({ preventScroll: true });
  }

  function answerPill(q) {
    return h("span", { class: `pill ${q.answer ? "pill-true" : "pill-false"}`, text: q.answer ? "True" : "False" });
  }

  function reviewCard(q) {
    return h("div", { class: `review ${q.answer ? "r-true" : "r-false"}` },
      h("div", { class: "review-top" }, answerPill(q), ...refChips(q)),
      h("div", { class: "review-statement", rich: q.statement }),
      h("p", { class: "review-why", rich: q.why }),
    );
  }

  $("btn-replay").addEventListener("click", () => startRound(shuffle(lastMissed)));
  $("btn-again").addEventListener("click", () => startRound(buildRound()));
  $("btn-menu").addEventListener("click", goHome);

  // ── Browse ────────────────────────────────────────────────────────────────
  const browse = { built: false, sec: 0, items: [] };

  function openBrowse() {
    if (!browse.built) buildBrowse();
    show("browse");
  }

  function buildBrowse() {
    const chips = $("browse-chips");
    const mkChip = (value, label) => h("button", {
      type: "button", class: "filter-chip", "data-sec": value, "aria-pressed": String(browse.sec === value), text: label,
      onclick: () => {
        browse.sec = value;
        for (const c of chips.children) c.setAttribute("aria-pressed", String(Number(c.dataset.sec) === value));
        filterBrowse();
      },
    });
    chips.append(mkChip(0, "All"), ...SEC_IDS.map((s) => mkChip(s, `§${s} ${SECTIONS[s]}`)));

    const list = $("browse-list");
    let currentSec = null;
    for (const q of BANK) {
      if (q.sec !== currentSec) {
        currentSec = q.sec;
        const heading = h("h3", { class: "browse-sec", "data-sec": q.sec },
          h("span", { text: `§${q.sec}` }), ` ${SECTIONS[q.sec]}`);
        list.append(heading);
        browse.items.push({ heading, sec: q.sec });
      }
      const body = h("div", { class: "b-body" });
      const details = h("details", { class: `b-item ${q.answer ? "r-true" : "r-false"}` },
        h("summary", {},
          h("span", { class: "b-num", text: `#${q.n}` }),
          h("span", { class: "b-statement", rich: q.statement }),
          h("span", { class: "b-chevron", "aria-hidden": "true" }),
        ),
        body,
      );
      details.addEventListener("toggle", () => {
        if (details.open && !body.childElementCount) {
          body.append(
            h("div", { class: "review-top" }, answerPill(q), ...refChips(q)),
            h("p", { class: "review-why", rich: q.why }),
          );
        }
      });
      list.append(details);
      browse.items.push({ el: details, q });
    }
    $("search").addEventListener("input", filterBrowse);
    $("show-answers").addEventListener("change", (e) => {
      for (const it of browse.items) if (it.el && !it.el.hidden) it.el.open = e.target.checked;
    });
    $("btn-browse-back").addEventListener("click", goHome);
    browse.built = true;
    filterBrowse();
  }

  function filterBrowse() {
    const terms = $("search").value.toLowerCase().split(/\s+/).filter(Boolean);
    const visibleBySec = {};
    let shown = 0;
    for (const it of browse.items) {
      if (!it.q) continue;
      const vis = (!browse.sec || it.q.sec === browse.sec) && terms.every((t) => it.q.search.includes(t));
      it.el.hidden = !vis;
      if (vis) {
        shown += 1;
        visibleBySec[it.q.sec] = true;
        if ($("show-answers").checked) it.el.open = true;
      }
    }
    for (const it of browse.items) if (it.heading) it.heading.hidden = !visibleBySec[it.sec];
    $("browse-count").textContent = shown === BANK.length
      ? `${BANK.length} statements`
      : `Showing ${shown} of ${BANK.length}`;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$("notation").hidden) {
      if (e.key === "Escape") { e.preventDefault(); closeNotation(); }
      return;
    }
    const typing = e.target.closest?.("input, textarea, select");
    if (typing) return;
    const k = e.key.toLowerCase();
    if (screen === "play" && round) {
      if (!round.locked && (k === "t" || k === "1" || k === "arrowleft")) { e.preventDefault(); answer(true); }
      else if (!round.locked && (k === "f" || k === "2" || k === "arrowright")) { e.preventDefault(); answer(false); }
      else if (round.locked && (k === "enter" || k === " ")) { e.preventDefault(); next(); }
      else if (k === "escape") { e.preventDefault(); endRound(); }
    } else if (screen === "results") {
      if (k === "r" && lastMissed.length) { e.preventDefault(); startRound(shuffle(lastMissed)); }
      else if (k === "n") { e.preventDefault(); startRound(buildRound()); }
      else if (k === "escape") { e.preventDefault(); goHome(); }
    } else if (screen === "browse" && k === "escape") {
      e.preventDefault();
      goHome();
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  buildHome();
  updateHome();
  if (!window.katex) document.body.classList.add("no-katex");
})();
