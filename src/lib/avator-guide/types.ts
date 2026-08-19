/** Shared types for the browser-local AVATOR Guide routing engine. */

export type LangStyle = 'en' | 'bn' | 'banglish';

export interface KnowledgeEntry {
  slug: string;
  title: string;
  designation?: string;
  summary: string;
  capabilities?: string[];
  discipline?: string;
  category?: string;
  status?: string;
  href: string;
}

export interface GuideKnowledge {
  company: { name: string; description: string; origin?: string };
  technologies: KnowledgeEntry[];
  products: KnowledgeEntry[];
  work: KnowledgeEntry[];
  routes: Array<{ kind: string; title: string; summary: string; href: string }>;
}

export interface GuideConversationState {
  style?: LangStyle;
  goal?: string;
  wantsApi?: boolean;
  requiresPrivateDeployment?: boolean;
  wantsProof?: boolean;
  matchedSlug?: string;
  recommendedPath?: string;
  lastQuestion?: 'automation-direction' | null;
}

export interface GuideRecommendation {
  kind: string;
  title: string;
  reason: string;
  href: string;
  ctaLabel: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface GuideResult {
  message: string;
  state: 'discovering' | 'matched' | 'partial-match' | 'handoff' | 'out-of-scope';
  recommendation?: GuideRecommendation;
  quickReplies?: string[];
  briefReady?: boolean;
}

export interface GuideInput {
  message: string;
  state: GuideConversationState;
  knowledge: GuideKnowledge;
  pagePath?: string;
}

export interface GuideOutput {
  result: GuideResult;
  state: GuideConversationState;
}
