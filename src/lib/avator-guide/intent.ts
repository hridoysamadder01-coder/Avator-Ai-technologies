/** Weighted intent scoring over the canonical token space. */

export type Intent =
  | 'developers'
  | 'enterprise'
  | 'work'
  | 'company'
  | 'technology'
  | 'product'
  | 'contact'
  | 'automation'
  | 'greeting'
  | 'outofscope';

const SIGNALS: Record<Intent, Array<[string, number]>> = {
  developers: [
    ['api', 3], ['integrate', 2.5], ['integration', 2.5], ['sdk', 3], ['developer', 2.5],
    ['endpoint', 3], ['webhook', 2.5], ['programmatic', 2.5], ['docs', 1.5],
    ['documentation', 1.5], ['code', 1],
  ],
  enterprise: [
    ['private', 2.5], ['deployment', 2.5], ['internal', 1.5], ['security', 1.5],
    ['bank', 2.5], ['factory', 2], ['government', 2], ['enterprise', 3.5],
    ['custom', 1.5], ['bespoke', 2.5], ['dedicated', 2], ['procurement', 3],
    ['compliance', 2], ['nda', 2.5], ['scale', 1.2], ['organization', 1],
    ['company', 0.7], ['business', 0.7], ['environment', 1],
  ],
  work: [
    ['proof', 3], ['example', 2.5], ['portfolio', 3], ['project', 2], ['evidence', 3],
    ['built', 2], ['show', 1.2], ['case', 1.5], ['systems', 1],
  ],
  company: [
    ['who', 2], ['about', 2], ['founder', 3], ['mission', 2.5], ['avator', 0.8],
    ['story', 2],
  ],
  technology: [
    ['technology', 2.5], ['capability', 2.5], ['ai', 1.2], ['intelligence', 1.5],
    ['language', 1.2], ['agent', 1.5], ['model', 1], ['machine', 1],
  ],
  product: [
    ['product', 3], ['price', 3], ['howmuch', 2.5], ['buy', 2.5], ['subscription', 2.5],
    ['subscribe', 2.5], ['plan', 1.5], ['trial', 2],
  ],
  contact: [
    ['contact', 3], ['talk', 2.5], ['call', 2], ['email', 2], ['human', 2.5],
    ['person', 2], ['discuss', 2], ['meet', 2],
  ],
  automation: [
    ['automate', 3], ['automation', 3], ['manual', 2], ['workflow', 2], ['reduce', 1.5],
    ['process', 1.5],
  ],
  greeting: [
    ['hi', 2], ['hello', 2], ['hey', 2], ['salam', 2], ['assalamualaikum', 3],
    ['kemon', 1.5],
  ],
  outofscope: [
    ['poem', 4], ['football', 4], ['cricket', 4], ['game', 3], ['song', 4],
    ['movie', 4], ['homework', 4], ['weather', 4], ['news', 3], ['joke', 4],
    ['recipe', 4], ['celebrity', 4],
  ],
};

/** Multi-token privacy pattern: data must not leave / stays inside. */
function privacyBoost(tokens: string[]): number {
  const has = (t: string) => tokens.includes(t);
  let boost = 0;
  if ((has('data') || has('information')) && (has('outside') || has('leave')) && (has('not') || has('go'))) {
    boost += 5;
  }
  if (has('outside') && has('not')) boost += 2;
  if (has('private') && (has('data') || has('deployment') || has('system') || has('environment'))) boost += 2;
  if (has('own') && (has('environment') || has('server') || has('system'))) boost += 2;
  return boost;
}

export function scoreIntents(tokens: string[]): Record<Intent, number> {
  const scores = Object.fromEntries(
    (Object.keys(SIGNALS) as Intent[]).map((k) => [k, 0]),
  ) as Record<Intent, number>;

  const set = new Set(tokens);
  for (const intent of Object.keys(SIGNALS) as Intent[]) {
    for (const [token, weight] of SIGNALS[intent]) {
      if (set.has(token)) scores[intent] += weight;
    }
  }
  scores.enterprise += privacyBoost(tokens);

  // "what do you / does AVATOR build" family → company orientation
  if (set.has('what') && (set.has('build') || set.has('make') || (set.has('you') && set.has('do')))) {
    scores.company += 3;
  }
  if (set.has('avator') && (set.has('what') || set.has('how'))) {
    scores.company += 1.5;
  }
  // greeting only counts for very short messages
  if (tokens.length > 4) scores.greeting = 0;
  return scores;
}

export function topIntent(scores: Record<Intent, number>): { intent: Intent; score: number } {
  let best: Intent = 'company';
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores) as Array<[Intent, number]>) {
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return { intent: best, score: bestScore };
}
