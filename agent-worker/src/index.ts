/**
 * AVATOR Guide API — Cloudflare Worker.
 *
 * Endpoints:
 *   GET  /v1/health              — liveness + version (no secrets)
 *   POST /v1/guide               — one conversation turn → structured routing response
 *   POST /v1/guide/transcribe    — short microphone recording → transcript (Workers AI)
 *
 * Security posture: strict JSON validation (zod), origin allowlist, request
 * size limits, per-IP throttle, server-side system prompt, route allowlist on
 * every model output, capped output size, safe error messages.
 */

import { GuideRequestSchema } from './schema';
import { createAnthropicProvider, createMockProvider } from './provider';

export interface Env {
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  ALLOWED_ORIGINS: string;
  MODEL: string;
  MAX_TURNS: string;
  VERSION: string;
  MOCK_MODE: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_AUDIO_BYTES = 1_500_000; // ~25s of webm/opus voice
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav'];

/** Per-isolate sliding-window throttle. Real volumetric protection belongs in
 *  Cloudflare's own rate-limiting rules; this is a polite first line. */
const buckets = new Map<string, { count: number; windowStart: number }>();
function throttled(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.windowStart > windowMs) {
    buckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
  const h: Record<string, string> = {
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

function json(body: unknown, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // A browser origin that is not allowlisted gets nothing.
    if (origin && !('Access-Control-Allow-Origin' in (cors as Record<string, string>))) {
      return json({ error: 'origin not allowed' }, 403, { Vary: 'Origin' });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

    if (url.pathname === '/v1/health' && request.method === 'GET') {
      return json(
        { ok: true, version: env.VERSION, mode: useMock(env) ? 'mock' : 'live' },
        200,
        cors,
      );
    }

    if (url.pathname === '/v1/guide' && request.method === 'POST') {
      if (throttled(ip)) return json({ error: 'too many requests' }, 429, cors);
      return handleGuide(request, env, cors);
    }

    if (url.pathname === '/v1/guide/transcribe' && request.method === 'POST') {
      if (throttled(ip, 10)) return json({ error: 'too many requests' }, 429, cors);
      return handleTranscribe(request, env, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  },
} satisfies ExportedHandler<Env>;

function useMock(env: Env): boolean {
  return env.MOCK_MODE === 'true' || !env.ANTHROPIC_API_KEY;
}

async function handleGuide(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const len = Number(request.headers.get('Content-Length') ?? '0');
  if (len > MAX_BODY_BYTES) return json({ error: 'request too large' }, 413, cors);

  let parsed;
  try {
    parsed = GuideRequestSchema.safeParse(await request.json());
  } catch {
    return json({ error: 'invalid JSON' }, 400, cors);
  }
  if (!parsed.success) {
    return json({ error: 'invalid request shape' }, 400, cors);
  }

  const maxTurns = Number(env.MAX_TURNS) || 12;
  const messages = parsed.data.messages.slice(-maxTurns);
  // history must start on a user turn for the model API
  while (messages[0]?.role === 'assistant') messages.shift();
  if (messages.length === 0) return json({ error: 'invalid request shape' }, 400, cors);

  const provider = useMock(env)
    ? createMockProvider()
    : createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY!, model: env.MODEL });

  try {
    const result = await provider.respond({ messages, page: parsed.data.page });
    return json({ ...result, mode: useMock(env) ? 'mock' : 'live' }, 200, cors);
  } catch (err) {
    console.error('guide error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'guide unavailable' }, 502, cors);
  }
}

async function handleTranscribe(request: Request, env: Env, cors: HeadersInit): Promise<Response> {
  const type = (request.headers.get('Content-Type') ?? '').split(';')[0]!.trim();
  if (!AUDIO_TYPES.includes(type)) {
    return json({ error: 'unsupported audio type' }, 415, cors);
  }

  const buf = await request.arrayBuffer();
  if (buf.byteLength === 0) return json({ error: 'empty audio' }, 400, cors);
  if (buf.byteLength > MAX_AUDIO_BYTES) return json({ error: 'audio too large' }, 413, cors);

  if (useMock(env)) {
    return json({ text: 'amar business e inventory automation lagbe' , mode: 'mock' }, 200, cors);
  }

  if (!env.AI) return json({ error: 'voice unavailable' }, 503, cors);

  try {
    // base64 without blowing the stack on large buffers
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const result = (await env.AI.run('@cf/openai/whisper-large-v3-turbo', {
      audio: btoa(binary),
      task: 'transcribe',
      vad_filter: true,
    })) as { text?: string };

    const text = (result.text ?? '').trim().slice(0, 2000);
    if (!text) return json({ error: 'no speech detected' }, 422, cors);
    return json({ text, mode: 'live' }, 200, cors);
  } catch (err) {
    console.error('transcribe error:', err instanceof Error ? err.message : String(err));
    return json({ error: 'transcription failed' }, 502, cors);
  }
}
