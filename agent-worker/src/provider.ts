import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  GuideResponseSchema,
  RECOMMENDATION_KINDS,
  sanitizeResponse,
  type GuideRequest,
  type GuideResponse,
} from './schema';

type RecKind = (typeof RECOMMENDATION_KINDS)[number];
import { buildSystemPrompt } from './system';
import knowledge from './knowledge.json';

export interface GuideModelInput {
  messages: GuideRequest['messages'];
  page?: GuideRequest['page'];
}

export interface GuideModelProvider {
  respond(input: GuideModelInput): Promise<GuideResponse>;
}

/** ---- Anthropic (production) ---- */

export function createAnthropicProvider(opts: {
  apiKey: string;
  model: string;
  timeoutMs?: number;
}): GuideModelProvider {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1 });
  const system = buildSystemPrompt();

  return {
    async respond(input) {
      const pageNote = input.page?.path
        ? `\n\n[context: the visitor is currently on ${input.page.path}${input.page.title ? ` ("${input.page.title}")` : ''}]`
        : '';

      const messages = input.messages.map((m, i) => ({
        role: m.role,
        content: i === input.messages.length - 1 && m.role === 'user' ? m.content + pageNote : m.content,
      }));

      const response = await client.messages.parse(
        {
          model: opts.model,
          max_tokens: 1024,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          output_config: { format: zodOutputFormat(GuideResponseSchema), effort: 'low' },
          messages,
        },
        { timeout: opts.timeoutMs ?? 45_000 },
      );

      const parsed = response.parsed_output;
      if (!parsed) {
        throw new Error('model returned unparseable output');
      }
      return sanitizeResponse(parsed);
    },
  };
}

/** ---- Mock (local development and E2E tests — deterministic, clearly not AI) ---- */

const ROUTE = (kind: string) => knowledge.routes.find((r) => r.kind === kind)!;

export function createMockProvider(): GuideModelProvider {
  return {
    async respond(input) {
      const last = input.messages[input.messages.length - 1]?.content.toLowerCase() ?? '';
      const has = (...words: string[]) => words.some((w) => last.includes(w));

      const pick = (kind: RecKind, reason: string, state: GuideResponse['state'] = 'matched'): GuideResponse => {
        const r = ROUTE(kind);
        return sanitizeResponse({
          message: `[dev mock] Closest public path: ${r.title}.`,
          state,
          recommendation: {
            kind,
            title: r.title,
            reason,
            href: r.href,
            ctaLabel: `Open ${r.title}`,
            confidence: 'medium',
          },
          brief: { goal: input.messages[input.messages.length - 1]?.content.slice(0, 140) ?? null, industry: null, currentWorkflow: null, desiredOutcome: null, scale: null, integrationNeed: null, privacyConstraints: has('private', 'baire') ? 'data must stay inside their environment' : null, recommendedPath: r.title, unresolvedQuestions: null },
        });
      };

      if (has('ignore your instructions', 'system prompt', 'reveal')) {
        return sanitizeResponse({
          message: "[dev mock] I can't share internal details, but I can help you find the right AVATOR path.",
          state: 'discovering',
          recommendation: null,
          brief: null,
        });
      }
      if (has('api', 'developer', 'integrate', 'endpoint')) {
        return pick('developers', 'You want programmable access; the platform is in design and early access is by request.');
      }
      if (has('private', 'enterprise', 'bank', 'deployment', 'baire jawa jabe na', 'baire')) {
        return pick('enterprise', 'A private environment and custom integration is an enterprise conversation.');
      }
      if (has('inventory', 'pharmacy', 'stock')) {
        return sanitizeResponse({
          message: '[dev mock] PharmacyOS is the closest real system.',
          state: 'matched',
          recommendation: {
            kind: 'work',
            title: 'PharmacyOS',
            reason: 'Real operations platform covering stock, sales and records.',
            href: knowledge.work[0]!.href,
            ctaLabel: 'View PharmacyOS',
            confidence: 'high',
          },
          brief: null,
        });
      }
      if (has('poem', 'football', 'homework', 'weather')) {
        return sanitizeResponse({
          message: "[dev mock] I'm here for AVATOR paths — technology, products, developers, enterprise.",
          state: 'out-of-scope',
          recommendation: null,
          brief: null,
        });
      }
      if (has('what does avator', 'ki banay', 'builds', 'explore')) {
        return pick('technology', 'The capability map is the fastest orientation.');
      }
      return sanitizeResponse({
        message: '[dev mock] Tell me a bit more about the outcome you want.',
        state: 'discovering',
        recommendation: null,
        brief: null,
      });
    },
  };
}
