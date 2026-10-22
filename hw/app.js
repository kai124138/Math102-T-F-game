(() => {
  "use strict";

  const { sets: SETS, problems: RAW } = window.HW_DATA;
  const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]));
  const SET_IDS = SETS.map((s) => s.id);
  const DEFAULT_SETS = SETS.filter((s) => s.default).map((s) => s.id);
  const TYPE_LABEL = { compute: "Computation", prove: "Proof", explain: "Explain", verify: "Verify", "true-false": "True/false", construct: "Construct" };
  const TYPE_GROUP = { compute: "compute", prove: "prove", explain: "explain", verify: "explain", construct: "explain", "true-false": "true-false" };
  const LENGTHS = ["10", "20", "all"];
  const REPO = "https://github.com/kai124138/Math102-T-F-game";

  const PROBLEMS = RAW.map((p, i) => ({
    ...p,
    n: i + 1,
    search: [p.id, p.problemTitle, p.part, p.setup, p.context, p.text, p.answer, p.solution, SET_BY_ID[p.set].label, TYPE_LABEL[p.type]]
      .join(" ").toLowerCase().replace(/\\[a-z]+/g, (m) => " " + m.slice(1) + " ").replace(/\.(\d)/g, "$1"),
  }));
  const BY_SET = Object.fromEntries(SET_IDS.map((s) => [s, PROBLEMS.filter((p) => p.set === s)]));

  // ── Storage (every access guarded; the app works without it) ──────────────
  const KEY = "math102-hw:";
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(KEY + k); return v == null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(KEY + k); } catch { /* storage unavailable */ } },
  };

  // history[id] = [times seen, times flagged for review, last result (1 got it, 0 review)]
  let history = store.get("history", {});
  if (!history || typeof history !== "object" || Array.isArray(history)) history = {};
  const saveHistory = () => store.set("history", history);

  const prefs = { sets: DEFAULT_SETS.slice(), type: "all", order: "ordered", length: "all", ...store.get("prefs", {}) };
  prefs.sets = (Array.isArray(prefs.sets) ? prefs.sets : DEFAULT_SETS).filter((s) => SET_BY_ID[s]);
  if (!["all", "compute", "prove", "explain", "true-false"].includes(prefs.type)) prefs.type = "all";
  if (!["ordered", "shuffle", "weak"].includes(prefs.order)) prefs.order = "ordered";
  if (!LENGTHS.includes(String(prefs.length))) prefs.length = "all";
  prefs.length = String(prefs.length);
  const savePrefs = () => store.set("prefs", prefs);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);

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
      else if (k === "md") setMd(el, v);
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  // Markdown + math. The content is this site's own data, so innerHTML is safe here.
  const canRender = () => Boolean(window.marked && window.katex && window.renderMarkdown);
  function setMd(el, src) {
    if (!src) { el.textContent = ""; return el; }
    if (canRender()) el.innerHTML = window.renderMarkdown(src, { marked: window.marked, katex: window.katex });
    else { el.textContent = src; el.classList.add("md-raw"); }
    return el;
  }

  // Render heavy content only when it scrolls near the viewport.
  const lazyQueue = new WeakMap();
  const lazyObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const fn = lazyQueue.get(e.target);
        lazyObserver.unobserve(e.target);
        lazyQueue.delete(e.target);
        fn?.();
      }
    }, { rootMargin: "800px 0px" })
    : null;
  function lazy(el, fn) {
    if (!lazyObserver) { fn(); return; }
    lazyQueue.set(el, fn);
    lazyObserver.observe(el);
  }

  const setLabel = (p) => SET_BY_ID[p.set].label;
  const fullTitle = (p) => `${p.problemTitle}${p.part ? ` · ${p.part}` : ""}`;
  const mastered = (p) => (history[p.id] || [])[2] === 1;

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
    // Shared with the True/False page, so the theme carries across both.
    try { localStorage.setItem("math102:theme", JSON.stringify(next)); } catch { /* storage unavailable */ }
    syncThemeButton();
  });
  darkQuery.addEventListener?.("change", syncThemeButton);
  syncThemeButton();

  // ── Home ──────────────────────────────────────────────────────────────────
  const tiles = {};
  function checkIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M3.5 8.5l3 3 6-6.5");
    svg.append(path);
    return h("span", { class: "sec-check", "aria-hidden": "true" }, svg);
  }

  function buildHome() {
    $("hw-count").textContent = DEFAULT_SETS.reduce((n, s) => n + BY_SET[s].length, 0);
    const grid = $("set-grid");
    for (const s of SETS) {
      const meta = h("span", { class: "sec-meta" });
      const bar = h("i");
      const tile = h("button", { class: `sec-tile${s.default ? "" : " optional"}`, type: "button", onclick: () => toggleSet(s.id) },
        h("span", { class: "sec-top" }, h("span", { class: "sec-num", text: s.label }), checkIcon()),
        h("span", { class: "sec-name", text: s.topic }),
        meta,
        h("span", { class: "sec-bar", "aria-hidden": "true" }, bar),
      );
      tiles[s.id] = { tile, meta, bar };
      grid.append(tile);
    }
    const seg = (id, key) => $(id).addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b) return;
      prefs[key] = b.dataset.value;
      savePrefs();
      updateHome();
    });
    seg("seg-type", "type");
    seg("seg-order", "order");
    seg("seg-length", "length");
    $("set-all").addEventListener("click", () => { prefs.sets = SET_IDS.slice(); savePrefs(); updateHome(); });
    $("set-none").addEventListener("click", () => { prefs.sets = []; savePrefs(); updateHome(); });
    $("btn-start").addEventListener("click", () => startSession(buildSession()));
    $("btn-browse").addEventListener("click", openBrowse);
  }

  function toggleSet(id) {
    const set = new Set(prefs.sets);
    set.has(id) ? set.delete(id) : set.add(id);
    prefs.sets = SET_IDS.filter((x) => set.has(x));
    savePrefs();
    updateHome();
  }

  function pool() {
    const sets = new Set(prefs.sets);
    return PROBLEMS.filter((p) => sets.has(p.set) && (prefs.type === "all" || TYPE_GROUP[p.type] === prefs.type));
  }

  function updateHome() {
    for (const s of SETS) {
      const { tile, meta, bar } = tiles[s.id];
      const qs = BY_SET[s.id];
      const m = qs.filter(mastered).length;
      tile.setAttribute("aria-pressed", String(prefs.sets.includes(s.id)));
      meta.textContent = `${qs.length} problems` + (m ? ` · ${m} got it` : "");
      bar.style.width = `${(100 * m) / qs.length}%`;
    }
    for (const [id, key] of [["seg-type", "type"], ["seg-order", "order"], ["seg-length", "length"]]) {
      for (const b of $(id).children) b.setAttribute("aria-pressed", String(String(prefs[key]) === b.dataset.value));
    }
    const size = pool().length;
    const n = prefs.length === "all" ? size : Math.min(Number(prefs.length), size);
    const start = $("btn-start");
    start.disabled = size === 0;
    start.textContent = size === 0
      ? (prefs.sets.length ? "No problems of that type here" : "Pick a homework set to start")
      : `Start · ${n} problem${n === 1 ? "" : "s"}`;
    renderProgressLine();
  }

  let resetArmed = null;
  function renderProgressLine() {
    const line = $("progress-line");
    line.textContent = "";
    const rows = PROBLEMS.map((p) => history[p.id]).filter(Boolean);
    if (!rows.length) {
      line.append("Your progress is saved in this browser as you go.");
      return;
    }
    const got = PROBLEMS.filter(mastered).length;
    line.append(
      `${rows.length} problem${rows.length === 1 ? "" : "s"} attempted · ${got} got it · ${rows.length - got} to review · `,
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
    session = null;
    updateHome();
    show("home");
  }
  $("brand").addEventListener("click", () => {
    if (screen === "play" && session && session.results.length) finish();
    else goHome();
  });

  // ── Building a session ────────────────────────────────────────────────────
  // Parts of one problem stay together and in order, whatever the order setting.
  function groupsOf(list) {
    const map = new Map();
    for (const p of list) {
      if (!map.has(p.problem)) map.set(p.problem, []);
      map.get(p.problem).push(p);
    }
    return [...map.values()];
  }

  // "Weak spots first": last marked review > reviewed before > never seen > got it.
  function tier(p) {
    const r = history[p.id];
    if (!r) return 1;
    if (r[2] === 0) return 3;
    if (r[1] > 0) return 2;
    return 0;
  }

  function buildSession() {
    const list = pool();
    const n = prefs.length === "all" ? list.length : Math.min(Number(prefs.length), list.length);
    let groups = groupsOf(list);
    if (prefs.order === "shuffle") groups = shuffle(groups);
    else if (prefs.order === "weak") {
      const groupTier = (g) => Math.max(...g.map(tier));
      groups = shuffle(groups).sort((a, b) => groupTier(b) - groupTier(a)); // stable sort keeps the shuffle within a tier
    }
    return groups.flat().slice(0, n);
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  let session = null;
  let lastFlagged = [];
  const card = $("card");

  function startSession(qs) {
    if (!qs.length) return;
    session = { qs, i: 0, results: [], revealed: false };
    show("play");
    renderProblem();
  }

  function reportLink(p) {
    const title = `Homework ${p.id}: `;
    const body = `**${p.id}** (${setLabel(p)} · ${fullTitle(p)})\n\nWhat looks wrong:\n`;
    return h("a", {
      class: "report", target: "_blank", rel: "noopener", text: "Report a problem",
      href: `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`,
    });
  }

  function typeChip(p) {
    return h("span", { class: `chip type-chip t-${p.type}`, text: TYPE_LABEL[p.type] || p.type });
  }
  function proofChips(p) {
    return (p.midtermProof || []).map((t) => h("span", { class: "chip proof-chip", text: `Midterm proof: ${t}` }));
  }

  function renderProblem() {
    const p = session.qs[session.i];
    session.revealed = false;
    $("q-index").textContent = session.i + 1;
    $("q-total").textContent = session.qs.length;
    $("progress-fill").style.width = `${(100 * session.i) / session.qs.length}%`;
    $("q-tag").textContent = `${setLabel(p)} · ${fullTitle(p)}`;
    $("q-chips").replaceChildren(typeChip(p), ...proofChips(p));

    const setup = $("q-setup");
    setup.hidden = !p.setup;
    setMd(setup, p.setup);
    const ctx = $("q-context");
    ctx.hidden = !p.context;
    if (p.context) {
      $("q-context-label").textContent = `The statement of ${p.contextLabel}`;
      setMd($("q-context-body"), p.context);
      ctx.open = true;
    }
    setMd($("q-text"), p.text);

    card.classList.remove("revealed", "enter");
    void card.offsetWidth; // restart the entrance animation
    card.classList.add("enter");
    $("btn-reveal").hidden = false;
    $("worked").hidden = true;
    $("grade").hidden = true;
    updateTally();
    window.scrollTo({ top: 0, behavior: "auto" });
    $("btn-reveal").focus({ preventScroll: true });
  }

  function updateTally() {
    const ok = session.results.filter((r) => r.ok).length;
    $("t-ok").textContent = ok;
    $("t-bad").textContent = session.results.length - ok;
  }

  function reveal() {
    if (!session || session.revealed) return;
    session.revealed = true;
    const p = session.qs[session.i];
    $("answer-box").hidden = !p.answer;
    setMd($("q-answer"), p.answer);
    const solBox = $("q-solution").parentElement;
    solBox.hidden = !p.solution;
    $("solution-label").textContent = p.type === "prove" ? "Proof" : "Solution";
    setMd($("q-solution"), p.solution);
    $("refs").replaceChildren(h("span", { class: "chip", text: p.id }), reportLink(p));

    card.classList.add("revealed");
    $("btn-reveal").hidden = true;
    $("worked").hidden = false;
    $("grade").hidden = false;
    $("progress-fill").style.width = `${(100 * (session.i + 0.5)) / session.qs.length}%`;
    // Focus the solution, not a grade button, so Space scrolls a long solution instead of grading it.
    $("worked").focus({ preventScroll: true });
  }

  function grade(ok) {
    if (!session || !session.revealed) return;
    const p = session.qs[session.i];
    session.results.push({ p, ok });
    const r = history[p.id] || [0, 0, 0];
    r[0] += 1;
    if (!ok) r[1] += 1;
    r[2] = ok ? 1 : 0;
    history[p.id] = r;
    saveHistory();
    session.revealed = false;
    session.i += 1;
    if (session.i >= session.qs.length) finish();
    else renderProblem();
  }

  function endSession() {
    if (!session) return;
    if (session.results.length === 0) goHome();
    else finish();
  }

  $("btn-reveal").addEventListener("click", reveal);
  $("btn-got").addEventListener("click", () => grade(true));
  $("btn-review").addEventListener("click", () => grade(false));
  $("btn-end").addEventListener("click", endSession);

  // ── Results ───────────────────────────────────────────────────────────────
  function message(pct) {
    if (pct === 100) return "Clean sweep. You had every one.";
    if (pct >= 85) return "Strong. Just a few to look at again.";
    if (pct >= 60) return "Good progress. Review the flagged ones below.";
    return "Lots to review, and that's what this is for. Start with the flagged list.";
  }

  function finish() {
    const res = session.results;
    const n = res.length;
    const score = res.filter((r) => r.ok).length;
    const pct = Math.round((100 * score) / n);
    const early = n < session.qs.length;

    const circumference = 2 * Math.PI * 52;
    const ring = $("ring-fill");
    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference}`;
    ring.classList.toggle("perfect", pct === 100);
    $("r-pct").textContent = `${pct}%`;
    $("r-score").textContent = `${score} / ${n}`;
    $("r-msg").textContent = message(pct);
    lastFlagged = res.filter((r) => !r.ok).map((r) => r.p);
    $("r-meta").textContent = `${score} got it · ${lastFlagged.length} flagged for review`
      + (early ? ` · ended early after ${n} of ${session.qs.length}` : "");

    const bySet = new Map();
    for (const { p, ok } of res) {
      const row = bySet.get(p.set) || [0, 0];
      row[0] += ok ? 1 : 0;
      row[1] += 1;
      bySet.set(p.set, row);
    }
    const breakdown = $("r-sections");
    breakdown.textContent = "";
    for (const s of SET_IDS.filter((id) => bySet.has(id))) {
      const [ok, total] = bySet.get(s);
      const level = ok === total ? "full" : ok * 2 >= total ? "mid" : "low";
      breakdown.append(h("div", { class: `bd-row ${level}` },
        h("span", { class: "bd-name" }, h("b", { text: SET_BY_ID[s].label }), ` ${SET_BY_ID[s].topic}`),
        h("span", { class: "bd-bar", "aria-hidden": "true" }, h("i", { style: `width:${(100 * ok) / total}%` })),
        h("span", { class: "bd-score", text: `${ok}/${total}` }),
      ));
    }
    $("r-sections-panel").hidden = bySet.size < 2;

    const list = $("r-missed");
    list.textContent = "";
    for (const p of lastFlagged) list.append(problemItem(p, { showSetup: true }));
    $("r-missed-wrap").hidden = lastFlagged.length === 0;

    const replay = $("btn-replay");
    replay.hidden = lastFlagged.length === 0;
    replay.textContent = `Review ${lastFlagged.length} flagged`;
    $("btn-again").classList.toggle("primary", lastFlagged.length === 0);

    session = null;
    updateHome();
    show("results");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ring.style.strokeDashoffset = `${circumference * (1 - score / n)}`;
    }));
    (lastFlagged.length ? replay : $("btn-again")).focus({ preventScroll: true });
  }

  $("btn-replay").addEventListener("click", () => startSession(lastFlagged.slice()));
  $("btn-again").addEventListener("click", () => startSession(buildSession()));
  $("btn-menu").addEventListener("click", goHome);

  // ── Problem items (browse + flagged list) ─────────────────────────────────
  // A <details> whose summary is the problem and whose body is the worked solution.
  function problemItem(p, { showSetup = false } = {}) {
    const summaryText = h("div", { class: "b-statement md" });
    const head = h("div", { class: "b-head" },
      h("span", { class: "b-title", text: showSetup ? `${setLabel(p)} · ${fullTitle(p)}` : (p.part || p.problemTitle) }),
      typeChip(p), ...proofChips(p),
    );
    const setupEl = showSetup && p.setup ? h("div", { class: "setup md small" }) : null;
    const body = h("div", { class: "b-body" });
    const details = h("details", { class: "b-item" },
      h("summary", {},
        h("div", { class: "b-main" }, head, setupEl, summaryText),
        h("span", { class: "b-chevron", "aria-hidden": "true" }),
      ),
      body,
    );
    lazy(details, () => {
      setMd(summaryText, p.text);
      if (setupEl) setMd(setupEl, p.setup);
    });
    const fillBody = () => {
      if (body.childElementCount) return;
      body.append(
        p.context ? h("div", { class: "setup md small" }, h("span", { class: "box-label", text: `The statement of ${p.contextLabel}` }), h("div", { md: p.context })) : null,
        p.answer ? h("div", { class: "answer-box" }, h("span", { class: "box-label", text: "Answer" }), h("div", { class: "md", md: p.answer })) : null,
        p.solution ? h("div", { class: "solution-box" }, h("span", { class: "box-label", text: p.type === "prove" ? "Proof" : "Solution" }), h("div", { class: "md", md: p.solution })) : null,
        h("div", { class: "refs" }, h("span", { class: "chip", text: p.id })),
      );
    };
    details.addEventListener("toggle", () => { if (details.open) lazy(body, fillBody); });
    return details;
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  const browse = { built: false, set: "", items: [], groups: [], headings: [] };

  function openBrowse() {
    if (!browse.built) buildBrowse();
    show("browse");
  }

  function buildBrowse() {
    const chips = $("browse-chips");
    const mkChip = (value, label) => h("button", {
      type: "button", class: "filter-chip", "data-set": value, "aria-pressed": String(browse.set === value), text: label,
      onclick: () => {
        browse.set = value;
        for (const c of chips.children) c.setAttribute("aria-pressed", String(c.dataset.set === value));
        filterBrowse();
      },
    });
    chips.append(mkChip("", "All"), ...SETS.map((s) => mkChip(s.id, s.label)));

    const list = $("browse-list");
    for (const s of SETS) {
      const heading = h("h3", { class: "browse-sec" }, h("span", { text: s.label }), ` ${s.topic}`);
      list.append(heading);
      browse.headings.push({ el: heading, set: s.id });
      for (const parts of groupsOf(BY_SET[s.id])) {
        const first = parts[0];
        const setupEl = first.setup ? h("div", { class: "setup md" }) : null;
        const group = h("div", { class: "b-group" },
          h("h4", { class: "b-group-title", text: first.problemTitle }),
          setupEl,
        );
        if (setupEl) lazy(group, () => setMd(setupEl, first.setup));
        const items = parts.map((p) => {
          const el = problemItem(p);
          group.append(el);
          const item = { el, p };
          browse.items.push(item);
          return item;
        });
        list.append(group);
        browse.groups.push({ el: group, set: s.id, items });
      }
    }
    $("search").addEventListener("input", filterBrowse);
    $("show-answers").addEventListener("change", (e) => {
      for (const it of browse.items) if (!it.el.hidden) it.el.open = e.target.checked;
    });
    $("btn-browse-back").addEventListener("click", goHome);
    browse.built = true;
    filterBrowse();
  }

  function filterBrowse() {
    const terms = $("search").value.toLowerCase().replace(/\.(\d)/g, "$1").split(/\s+/).filter(Boolean);
    const open = $("show-answers").checked;
    let shown = 0;
    const setsShown = new Set();
    for (const g of browse.groups) {
      let any = false;
      for (const it of g.items) {
        const vis = (!browse.set || it.p.set === browse.set) && terms.every((t) => it.p.search.includes(t));
        it.el.hidden = !vis;
        if (vis) {
          any = true;
          shown += 1;
          if (open) it.el.open = true;
        }
      }
      g.el.hidden = !any;
      if (any) setsShown.add(g.set);
    }
    for (const hd of browse.headings) hd.el.hidden = !setsShown.has(hd.set);
    $("browse-count").textContent = shown === PROBLEMS.length ? `${PROBLEMS.length} problems` : `Showing ${shown} of ${PROBLEMS.length}`;
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest?.("input, textarea, select")) return;
    const k = e.key.toLowerCase();
    if (screen === "play" && session) {
      if (!session.revealed && (k === " " || k === "enter")) {
        // Let Enter/Space activate a focused control other than the reveal button (e.g. the context toggle).
        if (e.target.closest?.("summary, a, button:not(#btn-reveal)")) return;
        e.preventDefault();
        reveal();
      } else if (session.revealed && (k === "g" || k === "1" || k === "arrowleft")) { e.preventDefault(); grade(true); }
      else if (session.revealed && (k === "r" || k === "2" || k === "arrowright")) { e.preventDefault(); grade(false); }
      else if (k === "escape") { e.preventDefault(); endSession(); }
    } else if (screen === "results") {
      if (k === "r" && lastFlagged.length) { e.preventDefault(); startSession(lastFlagged.slice()); }
      else if (k === "n") { e.preventDefault(); startSession(buildSession()); }
      else if (k === "escape") { e.preventDefault(); goHome(); }
    } else if (screen === "browse" && k === "escape") {
      e.preventDefault();
      goHome();
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  buildHome();
  updateHome();
})();
