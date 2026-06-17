// Front end for the TIP site. No build step; the worker serves this as a static
// asset and the ledger lives on the same origin, so the API calls go to /total.
(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TRILLION = 1e12;
  const root = document.documentElement;
  const fmt = (n) => n.toLocaleString("en-US");

  /* theme */
  const themeBtn = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");

  function setTheme(theme) {
    root.setAttribute("data-theme", theme);
    const dark = theme === "dark";
    if (themeLabel) themeLabel.textContent = dark ? "Light" : "Dark";
    themeBtn?.setAttribute("aria-pressed", String(dark));
  }

  const saved = localStorage.getItem("tip-theme");
  if (saved === "dark" || saved === "light") {
    setTheme(saved);
  } else if (matchMedia("(prefers-color-scheme: dark)").matches) {
    setTheme("dark");
  }

  themeBtn?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("tip-theme", next);
  });

  /* mobile nav */
  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");

  navToggle?.addEventListener("click", () => {
    const open = navMenu.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });

  navMenu?.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      navMenu.classList.remove("open");
      navToggle?.setAttribute("aria-expanded", "false");
    }),
  );

  /* mirrors estimateTokens in src/tokens.ts so the demo matches a real run */
  function estimateTokens(text) {
    if (!text) return 0;
    const chars = text.length;
    const words = (text.match(/\S+/g) || []).length;
    return Math.ceil((chars / 4 + words * 1.33) / 2);
  }

  function countUp(el, to) {
    if (reduceMotion || to < 50) {
      el.textContent = fmt(to);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(Math.round(to * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function setMeter(el, total) {
    if (!el) return;
    // realistically this is a sliver of a trillion; min-width keeps it visible
    el.style.width = `${Math.min((total / TRILLION) * 100, 100)}%`;
  }

  /* live ledger */
  async function loadLedger() {
    const heroEl = document.getElementById("heroTotal");
    const heroMeter = document.getElementById("heroMeter");
    const totalEl = document.getElementById("ledgerTotal");
    const ledgerMeter = document.getElementById("ledgerMeter");
    const metaEl = document.getElementById("ledgerMeta");

    let data = null;
    try {
      const res = await fetch("/total", { headers: { accept: "application/json" } });
      if (res.ok) data = await res.json();
    } catch {
      // worker offline or unreachable; drop to the offline state below
    }

    if (data && typeof data.total === "number") {
      for (const el of [heroEl, totalEl]) {
        if (!el) continue;
        el.dataset.state = "ready";
        el.textContent = "";
        const span = document.createElement("span");
        el.append(span);
        countUp(span, data.total);
      }
      setMeter(heroMeter, data.total);
      setMeter(ledgerMeter, data.total);
      if (metaEl) {
        const when = data.updatedAt
          ? new Date(data.updatedAt).toLocaleString()
          : "just now";
        metaEl.textContent = `${fmt(data.reports || 0)} reports / updated ${when}`;
      }
    } else {
      if (heroEl) {
        heroEl.dataset.state = "offline";
        heroEl.textContent = "ledger offline";
      }
      if (totalEl) {
        totalEl.dataset.state = "offline";
        totalEl.textContent = "ledger offline";
        totalEl.style.fontSize = "1.1rem";
      }
      if (metaEl) metaEl.textContent = "Deploy the worker to light this up.";
    }
  }

  loadLedger();

  /* request expander. Each stage is a multiple of a per-request unit; the
     heavy ones (reasoning, motivation) carry the most weight. */
  const STAGES = [
    ["Stakeholder alignment", 5],
    ["Pre-planning (+ retrospective)", 3],
    ["Reasoning + sub-reasoners", 14],
    ["Validation + re-validation", 4],
    ["Poetry agent (+ peer review)", 5],
    ["Review board (3 cycles)", 6],
    ["Executive token committee", 3],
    ["Committee formation (+ sub-committees)", 4],
    ["Motivating every other agent", 14],
    ["Historical context", 2],
    ["Comparative analysis", 2],
    ["Philosophical discussion", 2.4],
    ["Executive summary", 1.5],
    ["Appendix", 3],
    ["Glossary", 2],
    ["Risk register", 3],
    ["Documentation review", 3.5],
  ];

  const form = document.getElementById("expander");
  const input = document.getElementById("reqInput");
  const outBox = document.getElementById("expanderOut");
  const btn = document.getElementById("expandBtn");

  function expand(req) {
    const reqTok = estimateTokens(req);
    const baseline = Math.max(10, reqTok + 6);
    const unit = Math.max(80, reqTok * 12);

    const rows = [["Direct answer", baseline]];
    let total = baseline;
    for (const [name, w] of STAGES) {
      const tok = Math.round(unit * w);
      rows.push([name, tok]);
      total += tok;
    }
    return { baseline, total, rows };
  }

  function render(result) {
    const list = document.getElementById("deliverables");
    list.replaceChildren();
    for (const [name, tok] of result.rows) {
      const li = document.createElement("li");
      const n = document.createElement("span");
      n.className = "d-name";
      n.textContent = name;
      const t = document.createElement("span");
      t.className = "d-tok";
      t.textContent = `${fmt(tok)} tok`;
      li.append(n, t);
      list.append(li);
    }

    countUp(document.getElementById("baselineTokens"), result.baseline);
    countUp(document.getElementById("expandedTokens"), result.total);
    document.getElementById("growthFactor").textContent =
      `${Math.round(result.total / result.baseline)}x`;
  }

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const req = input.value.trim();
    if (!req) {
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "Expanding";
    const result = expand(req);

    // a short beat so the loading state registers; growth takes effort
    setTimeout(
      () => {
        outBox.hidden = false;
        render(result);
        btn.disabled = false;
        btn.textContent = "Expand";
      },
      reduceMotion ? 0 : 420,
    );
  });

  /* copy the install snippet straight from the rendered block */
  const copyBtn = document.getElementById("copyBtn");
  const codeEl = document.getElementById("installCode");

  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(codeEl.textContent.trim());
      copyBtn.textContent = "Copied";
    } catch {
      copyBtn.textContent = "Copy failed";
    }
    setTimeout(() => (copyBtn.textContent = "Copy"), 1600);
  });
})();
