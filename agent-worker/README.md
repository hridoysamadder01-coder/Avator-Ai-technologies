# AVATOR Guide — agent worker

The secure backend for **AVATOR Guide**, the solution-routing assistant on the
AVATOR AI TECHNOLOGIES website. A Cloudflare Worker so the static GitHub Pages
site stays exactly as it is; the AI provider key lives here as an encrypted
Worker secret and never reaches the browser.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | Liveness + version + mode (`live` / `mock`) |
| `POST /v1/guide` | One conversation turn → validated structured routing response |
| `POST /v1/guide/transcribe` | Short microphone recording → transcript (Workers AI Whisper) |

## Truth source

`src/knowledge.json` is generated from the website's own content collections:

```sh
npm run knowledge     # runs ../scripts/build-agent-knowledge.mjs
```

Regenerate and redeploy after adding public products/technologies/work.
Every model-produced route is validated against this catalog server-side —
the model cannot emit a URL that is not in it.

## Local development

```sh
cd agent-worker
npm install
npm run dev:mock          # deterministic mock provider, no API key needed
# or, with a real key in .dev.vars (ANTHROPIC_API_KEY=sk-ant-…):
npm run dev
```

`.dev.vars` is gitignored. With no key configured the Worker automatically
answers in mock mode (responses are prefixed `[dev mock]` so this can never be
mistaken for AI output).

## Deploy (one-time setup)

```sh
cd agent-worker
npm install
npx wrangler login                # authenticate with Cloudflare (free plan is fine)
npx wrangler secret put ANTHROPIC_API_KEY   # paste the provider key when prompted
npm run deploy                    # prints the production URL, e.g. https://avator-guide.<account>.workers.dev
```

Then point the website at it — one line in `src/lib/site.ts`:

```ts
export const GUIDE_API = import.meta.env.PUBLIC_AVATOR_GUIDE_API || 'https://avator-guide.<account>.workers.dev';
```

…and push. Until that value is set, the site shows the Guide in fallback mode
(static quick links, no fake AI).

## Configuration

Non-secret vars in `wrangler.jsonc`: `ALLOWED_ORIGINS` (comma-separated; add a
custom domain here later), `MODEL` (default `claude-opus-5`; set
`claude-haiku-4-5` to trade quality for cost), `MAX_TURNS`, `VERSION`,
`MOCK_MODE`.

Secrets (never in config files, never committed): `ANTHROPIC_API_KEY`.

## Security posture

- Zod validation on every request; strict shapes, length caps, 64KB body cap
- Origin allowlist — non-allowlisted browser origins get 403
- Per-IP throttle (20 req/min guide, 10 req/min transcribe) as a first line;
  add Cloudflare rate-limiting rules for real volumetric protection
- System prompt server-side only; model output parsed against a schema;
  recommendation hrefs checked against the public route allowlist
- Output capped (1024 tokens; message trimmed server-side)
- Voice: mic recordings only, ≤1.5MB, MIME-checked, transcribed via the
  Worker's own Workers AI binding, never persisted
- Errors return generic messages; details stay in Worker logs
