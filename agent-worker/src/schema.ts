import { z } from 'zod';
import knowledge from './knowledge.json';

/** ---- request ---- */

export const GuideRequestSchema = z
  .object({
    sessionId: z.string().min(1).max(64),
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().min(1).max(2000),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    page: z
      .object({
        path: z.string().max(200).optional(),
        title: z.string().max(200).optional(),
        kind: z.string().max(40).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type GuideRequest = z.infer<typeof GuideRequestSchema>;

/** ---- response (also used as the model's structured output format) ---- */

export const RECOMMENDATION_KINDS = [
  'technology',
  'product',
  'work',
  'developers',
  'enterprise',
  'company',
  'contact',
] as const;

export const GuideResponseSchema = z.object({
  message: z
    .string()
    .describe(
      "The reply shown to the visitor. Concise, calm, no giant paragraphs. Mirror the visitor's language (English, Bangla script, or Banglish).",
    ),
  state: z.enum(['discovering', 'matched', 'partial-match', 'handoff', 'out-of-scope']),
  recommendation: z
    .object({
      kind: z.enum(RECOMMENDATION_KINDS),
      title: z.string().describe('Short name of the recommended destination.'),
      reason: z.string().describe('One or two sentences: why this fits what the visitor described.'),
      href: z
        .string()
        .describe('EXACTLY one href copied verbatim from the route catalog. Never invent a URL.'),
      ctaLabel: z.string().describe("Short action label, e.g. 'Open Enterprise'."),
      confidence: z.enum(['high', 'medium', 'low']),
    })
    .nullable()
    .describe('Only when there is something genuinely useful to recommend; otherwise null.'),
  brief: z
    .object({
      goal: z.string().nullable(),
      industry: z.string().nullable(),
      currentWorkflow: z.string().nullable(),
      desiredOutcome: z.string().nullable(),
      scale: z.string().nullable(),
      integrationNeed: z.string().nullable(),
      privacyConstraints: z.string().nullable(),
      recommendedPath: z.string().nullable(),
      unresolvedQuestions: z.array(z.string()).nullable(),
    })
    .nullable()
    .describe(
      'A running structured summary of what the visitor wants. Fill only fields the visitor actually stated. Null until at least a goal is known.',
    ),
});

export type GuideResponse = z.infer<typeof GuideResponseSchema>;

/** ---- route allowlist (server-side hard boundary) ---- */

const allowedHrefs = new Set<string>([
  '/Avator-Ai-technologies/',
  ...knowledge.routes.map((r) => r.href),
]);

/** Discard any model-produced route that is not in the public catalog. */
export function sanitizeResponse(res: GuideResponse): GuideResponse {
  let recommendation = res.recommendation ?? null;
  if (recommendation && !allowedHrefs.has(recommendation.href)) {
    recommendation = null;
  }
  const message = res.message.slice(0, 1600);
  return {
    message,
    state: recommendation ? res.state : res.state === 'matched' ? 'partial-match' : res.state,
    recommendation,
    brief: res.brief ?? null,
  };
}
