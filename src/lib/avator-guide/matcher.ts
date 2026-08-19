/** Scores visitor messages against real public content entries. */

import { tokenize } from './normalize.ts';
import type { GuideKnowledge, KnowledgeEntry } from './types.ts';

/** Extra routing vocabulary per known slug — applied only if the slug exists. */
const ALIASES: Record<string, string[]> = {
  pharmacyos: ['pharmacy', 'inventory', 'stock', 'shop', 'store', 'pos', 'medicine', 'sales'],
  'dse-ai-trader': ['trading', 'trader', 'market', 'share', 'dse', 'exchange', 'invest'],
  'edu-verse': ['education', 'school', 'student', 'learning', 'course', 'classroom'],
  'language-systems': ['chatbot', 'conversation', 'text', 'document', 'extract', 'chat', 'nlp', 'language'],
  'autonomous-agents': ['agent', 'autonomous', 'task'],
  'data-signal': ['dashboard', 'data', 'signal', 'analytics', 'pipeline'],
  'interface-engineering': ['website', 'interface', 'design', 'frontend', 'ux'],
  'applied-platforms': ['platform', 'operations', 'vertical', 'erp'],
  'commissioned-interfaces': ['client', 'commissioned', 'portfolio'],
  'research-experiments': ['research', 'experiment', 'evaluation'],
};

interface IndexedEntry {
  entry: KnowledgeEntry;
  kind: 'technology' | 'work' | 'product';
  strong: Set<string>; // title + designation + aliases
  weak: Set<string>; // summary + capabilities + discipline
}

let cache: { source: GuideKnowledge; index: IndexedEntry[] } | null = null;

function buildIndex(knowledge: GuideKnowledge): IndexedEntry[] {
  if (cache && cache.source === knowledge) return cache.index;
  const index: IndexedEntry[] = [];
  const add = (entry: KnowledgeEntry, kind: IndexedEntry['kind']) => {
    const strong = new Set<string>([
      ...tokenize(entry.title),
      ...tokenize(entry.designation ?? ''),
      ...(ALIASES[entry.slug] ?? []),
    ]);
    const weak = new Set<string>([
      ...tokenize(entry.summary),
      ...(entry.capabilities ?? []).flatMap((c) => tokenize(c)),
      ...tokenize(entry.discipline ?? ''),
      ...tokenize(entry.category ?? ''),
    ]);
    index.push({ entry, kind, strong, weak });
  };
  knowledge.technologies.forEach((t) => add(t, 'technology'));
  knowledge.work.forEach((w) => add(w, 'work'));
  knowledge.products.forEach((p) => add(p, 'product'));
  cache = { source: knowledge, index };
  return index;
}

export interface ContentMatch {
  entry: KnowledgeEntry;
  kind: 'technology' | 'work' | 'product';
  score: number;
}

const STOP = new Set([
  'the', 'a', 'an', 'i', 'we', 'my', 'our', 'you', 'your', 'is', 'are', 'for', 'to', 'of',
  'and', 'or', 'in', 'on', 'with', 'want', 'need', 'do', 'what', 'which', 'how', 'not',
]);

export function matchContent(tokens: string[], knowledge: GuideKnowledge): ContentMatch | null {
  const index = buildIndex(knowledge);
  const meaningful = tokens.filter((t) => !STOP.has(t) && t.length > 2);
  let best: ContentMatch | null = null;
  for (const item of index) {
    let score = 0;
    for (const t of meaningful) {
      if (item.strong.has(t)) score += 3;
      else if (item.weak.has(t)) score += 1;
    }
    if (!best || score > best.score) {
      best = { entry: item.entry, kind: item.kind, score };
    }
  }
  return best && best.score >= 3 ? best : null;
}
