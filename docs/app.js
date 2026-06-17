// One script for every page. The worker serves it as a static asset; each
// block checks for its own elements first, so pages only run what they have.
(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TRILLION = 1e12;
  const fmt = (n) => n.toLocaleString("en-US");

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
    // a real fraction of a trillion is barely visible; min-width keeps a sliver
    el.style.width = `${Math.min((total / TRILLION) * 100, 100)}%`;
  }

  /* live ledger, shown on the home and ledger pages */
  async function loadLedger() {
    const hero = document.getElementById("heroTotal");
    const heroMeter = document.getElementById("heroMeter");
    const total = document.getElementById("ledgerTotal");
    const ledgerMeter = document.getElementById("ledgerMeter");
    const meta = document.getElementById("ledgerMeta");
    if (!hero && !total) return;

    let data = null;
    try {
      const res = await fetch("/total", { headers: { accept: "application/json" } });
      if (res.ok) data = await res.json();
    } catch {
      // worker offline or unreachable; the offline branch below handles it
    }

    if (data && typeof data.total === "number") {
      for (const el of [hero, total]) {
        if (!el) continue;
        el.dataset.state = "ready";
        el.textContent = "";
        const span = document.createElement("span");
        el.append(span);
        countUp(span, data.total);
      }
      setMeter(heroMeter, data.total);
      setMeter(ledgerMeter, data.total);
      if (meta) {
        const when = data.updatedAt
          ? new Date(data.updatedAt).toLocaleString()
          : "just now";
        meta.textContent = `${fmt(data.reports || 0)} reports / updated ${when}`;
      }
    } else {
      for (const el of [hero, total]) {
        if (!el) continue;
        el.dataset.state = "offline";
        el.textContent = "ledger offline";
      }
      if (meta) meta.textContent = "Deploy the worker to light this up.";
    }
  }

  loadLedger();

  /* request expander, only on the demo page */
  const form = document.getElementById("expander");
  if (form) {
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

    const input = document.getElementById("reqInput");
    const out = document.getElementById("expanderOut");
    const btn = document.getElementById("expandBtn");

    // mirrors estimateTokens in src/tokens.ts so the demo matches a real run
    const estimate = (text) => {
      if (!text) return 0;
      const chars = text.length;
      const words = (text.match(/\S+/g) || []).length;
      return Math.ceil((chars / 4 + words * 1.33) / 2);
    };

    function expand(req) {
      const unit = Math.max(80, estimate(req) * 12);
      const baseline = Math.max(10, estimate(req) + 6);
      const rows = [["Direct answer", baseline]];
      let total = baseline;
      for (const [name, w] of STAGES) {
        const tok = Math.round(unit * w);
        rows.push([name, tok]);
        total += tok;
      }
      return { baseline, total, rows };
    }

    function render(r) {
      const list = document.getElementById("deliverables");
      list.replaceChildren();
      for (const [name, tok] of r.rows) {
        const li = document.createElement("li");
        const n = document.createElement("span");
        n.textContent = name;
        const t = document.createElement("span");
        t.className = "d-tok";
        t.textContent = `${fmt(tok)} tok`;
        li.append(n, t);
        list.append(li);
      }
      countUp(document.getElementById("baselineTokens"), r.baseline);
      countUp(document.getElementById("expandedTokens"), r.total);
      document.getElementById("growthFactor").textContent =
        `${Math.round(r.total / r.baseline)}x`;
    }

    form.addEventListener("submit", (e) => {
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
          out.hidden = false;
          render(result);
          btn.disabled = false;
          btn.textContent = "Expand";
        },
        reduceMotion ? 0 : 420,
      );
    });
  }

  /* copy the install snippet, only on the deploy page */
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
