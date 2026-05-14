/*
 * main.js — landing-page glue.
 *
 *   1. Fetch the latest GitHub release on load. If the API call succeeds we
 *      rewrite the two "Download for Windows" buttons to point straight at
 *      the `.exe` asset, and stamp the version + size into the page.
 *   2. Reveal-on-scroll for elements tagged `data-reveal`. One short, smooth
 *      translate+fade per section as it enters the viewport.
 *
 * The page is fully functional without JS — the download buttons fall back
 * to `https://github.com/syfpsy/mnml/releases/latest`, which redirects to
 * the most recent release page on GitHub.
 */

const REPO = "syfpsy/mnml";

/* ── 1. Latest-release fetch ────────────────────────────────────────────── */
(async () => {
  const apiUrl = `https://api.github.com/repos/${REPO}/releases/latest`;
  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return;
    const json = await res.json();

    const version = (json.tag_name || "").replace(/^v/, "");
    // The installer is named `mnml-setup.exe` by electron-builder.
    const exe = (json.assets || []).find((a) => /\.exe$/i.test(a.name));
    if (!exe) return;

    const sizeMb = (exe.size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "");
    const date   = new Date(json.published_at).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });

    // Update both download buttons.
    for (const id of ["download-link", "download-link-2"]) {
      const el = document.getElementById(id);
      if (el) el.href = exe.browser_download_url;
    }
    const metaText = `v${version} · ${sizeMb} MB · ${date}`;
    for (const id of ["download-meta", "download-meta-2"]) {
      const el = document.getElementById(id);
      if (el) el.textContent = metaText;
    }
    const stamp = document.getElementById("version-stamp");
    if (stamp) stamp.textContent = `v${version}`;
  } catch {
    /* Offline / rate-limited / 404 — leave the static fallback links. */
  }
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
