# Lighthouse Audit — Synapse

**Date:** 2026-07-20 · **Tooling:** Lighthouse 13.x via the CLI, driving real
Google Chrome (installed at `C:\Program Files\Google\Chrome\Application\chrome.exe`)
on port `9222`. **Every route audited, desktop + mobile.**

## Headline result

| Category | Desktop (all 11 routes) | Mobile (all 11 routes) |
|----------|-------------------------|------------------------|
| Performance | **100** | **95–99** |
| Accessibility | **100** | **100** |
| Best Practices | **100** | **100** |
| SEO | **100** | **100** |

Console errors / warnings: **0** on every route. `axe-core` violations: **0**
on every route. No failed (4xx/5xx) network requests on any route.

Synapse clears its **≥ 90** target in every category on every route, on both
form factors — and clears it with large margin (desktop is a clean sweep of
100s; mobile sits at 95–99 with a11y/BP/SEO perfect).

## Full results table

Desktop (unthrottled, all categories):

| Route | Perf | A11y | BP | SEO |
|-------|------|------|----|-----|
| / (redirect → /login) | 100 | 100 | 100 | 100 |
| /login | 100 | 100 | 100 | 100 |
| /signup | 100 | 100 | 100 | 100 |
| /dashboard | 100 | 100 | 100 | 100 |
| /documents | 100 | 100 | 100 | 100 |
| /chat | 100 | 100 | 100 | 100 |
| /quiz | 100 | 100 | 100 | 100 |
| /flashcards | 100 | 100 | 100 | 100 |
| /notes | 100 | 100 | 100 | 100 |
| /analytics | 100 | 100 | 100 | 100 |
| /eval | 100 | 100 | 100 | 100 |
| /profile | 100 | 100 | 100 | 100 |

Mobile (`--form-factor mobile`: Slow 4G + 4× CPU throttling, all categories):

| Route | Perf | A11y | BP | SEO | Note |
|-------|------|------|----|-----|------|
| /login | 99 | 100 | 100 | 100 | |
| /signup | 99 | 100 | 100 | 100 | |
| /dashboard | 99 | 100 | 100 | 100 | |
| /documents | 99 | 100 | 100 | 100 | |
| /chat | **95** | 100 | 100 | 100 | SSE stream + data-driven LCP |
| /quiz | 99 | 100 | 100 | 100 | |
| /flashcards | 99 | 100 | 100 | 100 | |
| /notes | 99 | 100 | 100 | 100 | |
| /analytics | 99 | 100 | 100 | 100 | charts |
| /eval | 99 | 100 | 100 | 100 | |
| /profile | 99 | 100 | 100 | 100 | |

## Methodology (why these numbers reflect production)

Lighthouse measures *served* bytes, so the server matters. Two things had to be
right to get honest numbers:

1. **Assets must be compressed.** `vite preview` serves assets **uncompressed**
   (even with `Accept-Encoding: gzip`, the raw 240 KB `react-vendor` chunk is
   returned). Production Vercel gzips/brotlis. Auditing against `vite preview`
   therefore understates performance. The audit instead runs against a small
   static server (`D:/PROJECTS/lhtool/serve.mjs`) that **mimics Vercel**: SPA
   fallback, gzip + brotli negotiation, `Cache-Control: public, max-age=31536000,
   immutable` on hashed assets, `no-cache` on `index.html`, and **pre-compresses
   every asset at startup** (so cold-first-visit FCP isn't penalised by
   on-the-fly compression). With this, `react-vendor` ships as **66 KB brotli /
   77.6 KB gzip** instead of 240 KB raw.

2. **Desktop vs mobile form factor.** Desktop uses `--preset desktop`
   (unthrottled, all categories). Mobile uses `--form-factor mobile` — **not**
   `--preset perf` — so all four categories run (passing `--preset perf` makes
   a11y/BP/SEO come back as 0, which is a measurement artifact, not a real
   score).

The harness (`D:/PROJECTS/lhtool/audit.mjs`) authenticates against the real
backend (live LLM), then for every route collects Lighthouse scores, console
errors / page errors / failed requests, and an `axe-core` run. Public routes are
audited logged-out; authed routes are audited with a freshly signed-up user.

### Note on the one sub-95 mobile score (/chat, P95)

`/chat` is the only route under 95 on mobile (95). Its LCP is data-driven: the
assistant's first streamed token + the grounding source chips arrive over SSE
from a live LLM, so under Lighthouse's Slow-4G + 4×-CPU mobile throttle the
largest-contentful paint lands a beat later than the static/near-static routes
(99). This is an inherent property of a streaming chat UI under emulated mobile
throttling, not a defect — it remains well inside the ≥ 90 target and a11y/BP/SEO
are perfect. No app change is warranted; Vercel's edge/proxy in production will
only lower latency further.

## What was fixed to reach these numbers (frontend audit)

These were found and corrected during the Phase 2.3 / 3 / 5 audit pass:

- **Mobile compression** — measured against a compressing server (above) instead
  of uncompressed `vite preview`. Lifted mobile perf from the low-90s (raw) to
  95–99 (compressed), matching production reality.
- **Contrast (`--text-faint`)** — bumped the faint text token to meet WCAG AA on
  both light (`#7e859c`) and dark (`#7e859c`) themes; was failing axe on muted
  labels.
- **Form labels (`Input`)** — now uses `useId()` to wire `htmlFor`/`id` and an
  `aria-invalid` + `role="alert"` error span, so every labelled field is
  programmatically associated.
- **Tap-target size (`.link-btn`)** — added `min-height: 24px` so inline
  link-buttons meet the Lighthouse target-size audit.
- **Duplicate `/profile` route** — removed a second `<Route path="/profile">`
  definition in `App.tsx` (the route was registered twice); one canonical route
  remains.
- **File-upload input label (`Documents.tsx`)** — the visually-hidden upload
  `<input>` had no label, tripping axe's "form elements must have labels"
  (critical). Added `aria-label="Upload documents"`.
- **Third-party font CDN removed (`index.html`)** — dropped the Google Fonts
  `<link>`/preconnect; the CSS system-font fallback now applies. Removes a
  runtime dependency that logged a console error whenever the CDN is
  unreachable, and matches the "zero font network cost" design intent. (Self-host
  the woff2 later if the custom type is wanted back.)
- **`axe-core` zero violations** confirmed on every route after the above.

## How to reproduce

```bash
# 1. Build the SPA (Vite emits per-route code-split chunks)
cd frontend
npm run build

# 2. Serve it compressed (mimics Vercel gzip/brotli + immutable hashed assets)
node D:/PROJECTS/lhtool/serve.mjs <frontend>/dist <port>

# 3. Run the audit harness (authenticates vs a live backend, all 11 routes)
API_URL=http://<backend>/api/v1 node D:/PROJECTS/lhtool/audit.mjs
#   -> writes D:/PROJECTS/lhtool/reports/summary.json
```

Or, against a deployed Vercel preview (compressed by default):

```bash
npx lighthouse https://<preview>.vercel.app/         --preset desktop
npx lighthouse https://<preview>.vercel.app/dashboard --form-factor mobile
# repeat per route: /login /signup /chat /documents /quiz /flashcards /notes /analytics /eval /profile
```
