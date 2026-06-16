// site front-end; runs straight off GitHub Pages, no build step
(() => {
  "use strict";

  // the ledger ships from the same worker as this page, so hit it same-origin
  const LEDGER_URL = "";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- theme ---- */
  const root = document.documentElement;
  const themeBtn = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (themeLabel) themeLabel.textContent = theme === "dark" ? "Light" : "Dark";
  }

  const saved = localStorage.getItem("tip-theme");
  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    applyTheme("dark");
  }

  themeBtn?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("tip-theme", next);
  });

  /* ---- mobile nav ---- */
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  navToggle?.addEventListener("click", () => {
    const open = navMenu.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  navMenu?.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => {
      navMenu.classList.remove("open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
  });

  /* ---- token estimator (mirrors src/tokens.ts) ---- */
  function estimateTokens(text) {
    if (!text) return 0;
    const chars = text.length;
    const words = (text.match(/\S+/g) || []).length;
    return Math.ceil((chars / 4 + words * 1.33) / 2);
  }

  function countUp(el, to, fmt) {
    if (reduceMotion || to < 50) {
      el.textContent = fmt(to);
      return;
    }
    const start = performance.now();
    const dur = 850;
    function frame(now) {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  const full = (n) => n.toLocaleString();

  /* ---- live ledger ---- */
  async function loadLedger() {
    const heroEl = document.getElementById("heroTotal");
    const totalEl = document.getElementById("ledgerTotal");
    const metaEl = document.getElementById("ledgerMeta");

    let data = null;
    try {
      const res = await fetch(`${LEDGER_URL}/total`, {
        headers: { accept: "application/json" },
      });
      if (res.ok) data = await res.json();
    } catch {
      // worker not deployed or offline; fall through to the offline state
    }

    if (data && typeof data.total === "number") {
      if (heroEl) {
        heroEl.dataset.state = "ready";
        countUp(heroEl, data.total, full);
      }
      if (totalEl) {
        totalEl.dataset.state = "ready";
        countUp(totalEl, data.total, full);
      }
      if (metaEl) {
        const when = data.updatedAt
          ? new Date(data.updatedAt).toLocaleString()
          : "just now";
        metaEl.textContent = `${full(data.reports || 0)} reports · updated ${when}`;
      }
    } else {
      if (heroEl) {
        heroEl.dataset.state = "offline";
        heroEl.textContent = "ledger offline";
        heroEl.style.fontSize = "1rem";
      }
      if (totalEl) {
        totalEl.dataset.state = "offline";
        totalEl.textContent = "-";
      }
      if (metaEl)
        metaEl.textContent = "Ledger unreachable. Deploy the worker to light this up.";
    }
  }

  loadLedger();

  /* ---- request expander ---- */
  const STAGES = [
    { name: "Stakeholder alignment", w: 5 },
    { name: "Pre-planning (+ retrospective)", w: 3 },
    { name: "Reasoning + sub-reasoners", w: 14 },
    { name: "Validation + re-validation", w: 4 },
    { name: "Poetry agent (+ peer review)", w: 5 },
    { name: "Review board (3 cycles)", w: 6 },
    { name: "Executive token committee", w: 3 },
    { name: "Committee formation (+ sub-committees)", w: 4 },
    { name: "Motivating every other agent", w: 14 },
    { name: "Historical context", w: 2 },
    { name: "Comparative analysis", w: 2 },
    { name: "Philosophical discussion", w: 2.4 },
    { name: "Executive summary", w: 1.5 },
    { name: "Appendix", w: 3 },
    { name: "Glossary", w: 2 },
    { name: "Risk register", w: 3 },
    { name: "Documentation review", w: 3.5 },
  ];

  const form = document.getElementById("expander");
  const input = document.getElementById("reqInput");
  const outBox = document.getElementById("expanderOut");
  const btn = document.getElementById("expandBtn");

  function expand(req) {
    const reqTok = estimateTokens(req);
    const baseline = Math.max(10, reqTok + 6);
    const unit = Math.max(80, reqTok * 12);

    const rows = [{ name: "Direct answer", tokens: baseline }];
    let total = baseline;
    for (const s of STAGES) {
      const tok = Math.round(unit * s.w);
      rows.push({ name: s.name, tokens: tok });
      total += tok;
    }
    return { baseline, total, rows };
  }

  function render(result) {
    const list = document.getElementById("deliverables");
    list.innerHTML = "";
    for (const row of result.rows) {
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "d-name";
      name.textContent = row.name;
      const tok = document.createElement("span");
      tok.className = "d-tok";
      tok.textContent = `${full(row.tokens)} tok`;
      li.append(name, tok);
      list.append(li);
    }

    countUp(document.getElementById("baselineTokens"), result.baseline, full);
    countUp(document.getElementById("expandedTokens"), result.total, full);
    const factor = Math.round(result.total / result.baseline);
    document.getElementById("growthFactor").textContent = `${factor}×`;
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const req = input.value.trim();
    if (!req) {
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "Expanding…";
    const result = expand(req);

    // a beat of latency so the loading state is visible; growth takes effort
    window.setTimeout(
      () => {
        outBox.hidden = false;
        render(result);
        btn.disabled = false;
        btn.textContent = "Expand";
      },
      reduceMotion ? 0 : 420,
    );
  });

  /* ---- copy button ---- */
  const INSTALL = [
    "npm install",
    "npm run build",
    'node dist/cli.js use "What time is it?" --mode aggressive',
  ].join("\n");

  const copyBtn = document.getElementById("copyBtn");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      copyBtn.textContent = "Copied";
      window.setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    } catch {
      copyBtn.textContent = "Copy failed";
      window.setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
    }
  });
})();
