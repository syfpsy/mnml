/*
 * main.js — landing-page glue.
 *
 *   1. Theme toggle. `<html class="light">` is set before first paint by the
 *      inline script in index.html. This file handles the click handler and
 *      keeps the aria-label / aria-pressed in sync.
 *   2. Reveal-on-scroll for elements tagged `data-reveal`. One short, smooth
 *      translate+fade per section as it enters the viewport.
 *
 * No release fetching. The download buttons are static `<a href="mnml-setup.exe">`
 * links to a local binary served alongside the page.
 */

/* ── 1. Theme toggle ────────────────────────────────────────────────────── */
(() => {
  const root   = document.documentElement;
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  // Keep aria attributes accurate from page load — the inline boot script
  // applied the class, so we read it back here.
  const syncAria = () => {
    const isLight = root.classList.contains("light");
    toggle.setAttribute("aria-pressed", String(isLight));
    toggle.setAttribute(
      "aria-label",
      isLight ? "Switch to dark theme" : "Switch to light theme",
    );
  };
  syncAria();

  toggle.addEventListener("click", () => {
    const goingLight = !root.classList.contains("light");
    root.classList.toggle("light", goingLight);
    try {
      localStorage.setItem("mnml-theme", goingLight ? "light" : "dark");
    } catch (_) { /* ignore */ }
    syncAria();
  });

  // Track system-preference changes only when the user hasn't explicitly
  // chosen — gives sensible defaults without overriding intentional choice.
  const mql = window.matchMedia?.("(prefers-color-scheme: light)");
  mql?.addEventListener?.("change", (e) => {
    let hasChoice = false;
    try { hasChoice = localStorage.getItem("mnml-theme") !== null; } catch (_) {}
    if (hasChoice) return;
    root.classList.toggle("light", e.matches);
    syncAria();
  });
})();

/* ── 2. Reveal-on-scroll ────────────────────────────────────────────────── */
(() => {
  const els = document.querySelectorAll("[data-reveal]");
  if (els.length === 0) return;

  // Respect user motion preference — show everything immediately.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("in"));
    return;
  }

  const obs = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
  );
  els.forEach((el) => obs.observe(el));
})();
