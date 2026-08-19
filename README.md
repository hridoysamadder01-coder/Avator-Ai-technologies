# AVATOR AI TECHNOLOGIES — company website

The official website of AVATOR AI TECHNOLOGIES, an independent AI technology
company building applied intelligence systems.

**Live:** https://hridoysamadder01-coder.github.io/Avator-Ai-technologies/

## Stack

- [Astro 7](https://astro.build) — static output, content collections
- Self-hosted variable fonts (Archivo Variable, Fragment Mono)
- No client framework — a small vanilla interaction layer plus a canvas
  "signal field" hero (DPR-capped, delta-time driven, reduced-motion aware)
- Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`)

## Develop

```sh
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # preview the production build
```

## Adding content

Content lives in structured collections under `src/content/` — adding a
markdown file publishes it everywhere it belongs, no page markup changes:

| Collection          | Purpose                              | Route            |
| ------------------- | ------------------------------------ | ---------------- |
| `technologies/`     | Capability areas                     | `/technology/*`  |
| `products/`         | Commercial products (subscriptions)  | `/products/*`    |
| `work/`             | Selected systems / engineering work  | `/work/*`        |
| `research/`         | Field notes / research journal       | `/company/`      |

Schemas for each collection are defined in `src/content.config.ts`.
Site-wide facts (name, contact email, coordinates, nav) live in
`src/lib/site.ts`.

## AVATOR Guide

The site carries **AVATOR Guide** — a solution-routing assistant ("Ask
AVATOR", lower right). **It requires no backend and no API key**: routing
runs entirely in the visitor's browser through a small deterministic engine,
so operating it costs nothing and no conversation data leaves the page.

- Engine: `src/lib/avator-guide/` — tokenization and Bangla/Banglish
  normalization, weighted intent scoring, and content matching against a
  knowledge pack. The pack is built at build time inside
  `src/components/AvatorGuide.astro` from this repo's content collections,
  so the Guide can only recommend pages that actually exist.
- UI: `src/components/AvatorGuide.astro` + `src/scripts/avator-guide.ts` —
  persistent across navigations; the conversation is kept in
  `sessionStorage` on the visitor's device only.
- Languages: English, Bangla and Banglish — replies mirror the visitor's
  writing style.
- Voice: tap-to-speak uses the browser's built-in speech recognition
  (`SpeechRecognition`/`webkitSpeechRecognition`); the mic button only
  appears where the browser supports it, and availability varies by
  browser. Listen playback uses browser speech synthesis. Both are free,
  on-device browser features.
- The status line reads **"Local routing"** — the Guide is deterministic
  keyword routing, not a language model, and the site never claims
  otherwise.
- Unit tests: `npm run test:guide` (dependency-free, runs on Node's
  type-stripping).

## Deployment

Pushes to the deploy branches trigger the GitHub Actions workflow, which
builds the site and publishes it to GitHub Pages. The Pages source must be
set to **GitHub Actions** (repo Settings → Pages) once.

`site` and `base` in `astro.config.mjs` are configured for the GitHub Pages
project URL. If the site moves to a custom domain, set `site` to that origin
and remove `base`.
