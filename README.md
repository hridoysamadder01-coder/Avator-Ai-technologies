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

The site carries **AVATOR Guide** — a solution-routing agent ("Ask AVATOR",
lower right). It understands English, Bangla and Banglish, matches visitor
needs to verified public AVATOR capabilities only (truth pack generated from
this repo's content), returns structured recommendations with safe internal
routes, supports tap-to-speak voice input and optional Listen playback, and
can hand a prepared brief to the Contact page.

- Frontend: `src/components/AvatorGuide.astro` + `src/scripts/avator-guide.ts`
  (persistent across navigations, sessionStorage-backed, honest fallback mode
  when no backend is configured)
- Backend: `agent-worker/` — a separate Cloudflare Worker holding the AI
  provider key as an encrypted secret. Setup and deploy: `agent-worker/README.md`
- Truth pack: `scripts/build-agent-knowledge.mjs` regenerates
  `agent-worker/src/knowledge.json` from the content collections

To activate the Guide after deploying the Worker, set its URL in
`src/lib/site.ts` (`PROD_GUIDE_API`).

## Deployment

Pushes to the deploy branches trigger the GitHub Actions workflow, which
builds the site and publishes it to GitHub Pages. The Pages source must be
set to **GitHub Actions** (repo Settings → Pages) once.

`site` and `base` in `astro.config.mjs` are configured for the GitHub Pages
project URL. If the site moves to a custom domain, set `site` to that origin
and remove `base`.
