/**
 * The AVATOR Guide conversation engine — deterministic, browser-local,
 * DOM-free. Understands focused AVATOR intents in English, Bangla and
 * Banglish, matches verified public content, and routes honestly.
 */

import { detectStyle, tokenize } from './normalize.ts';
import { scoreIntents, topIntent } from './intent.ts';
import { matchContent } from './matcher.ts';
import type {
  GuideConversationState,
  GuideInput,
  GuideOutput,
  GuideRecommendation,
  GuideResult,
  KnowledgeEntry,
  LangStyle,
} from './types.ts';

/** Style-mirrored copy. */
function t(style: LangStyle, en: string, bn: string, banglish: string): string {
  return style === 'bn' ? bn : style === 'banglish' ? banglish : en;
}

function mainRoute(input: GuideInput, kind: string) {
  return input.knowledge.routes.find((r) => r.kind === kind)!;
}

function rec(
  kind: string,
  title: string,
  reason: string,
  href: string,
  ctaLabel: string,
  confidence: GuideRecommendation['confidence'],
): GuideRecommendation {
  return { kind, title, reason, href, ctaLabel, confidence };
}

const CLARIFY_REPLIES = ['Technology', 'Developers / API', 'Enterprise', 'Work', 'Contact'];

export function respond(input: GuideInput): GuideOutput {
  const raw = input.message.trim();
  const tokens = tokenize(raw);
  const styleNow = detectStyle(raw);
  // style follows the visitor's latest substantive message
  const style: LangStyle = tokens.length >= 2 ? styleNow : (input.state.style ?? styleNow);
  const state: GuideConversationState = { ...input.state, style };

  const scores = scoreIntents(tokens);
  const { intent, score } = topIntent(scores);
  const match = matchContent(tokens, input.knowledge);
  const has = (tk: string) => tokens.includes(tk);

  // capture stated facts for the brief — never inferred ones
  if (!state.goal && tokens.length >= 3 && intent !== 'greeting' && intent !== 'outofscope') {
    state.goal = raw.slice(0, 200);
  }
  if (scores.developers >= 2.5) state.wantsApi = true;
  if (scores.enterprise >= 4) state.requiresPrivateDeployment = true;
  if (scores.work >= 2.5) state.wantsProof = true;

  const finish = (result: GuideResult): GuideOutput => {
    if (result.recommendation) {
      state.recommendedPath = result.recommendation.title;
      state.lastQuestion = null;
      result.briefReady = Boolean(state.goal);
    }
    return { result, state };
  };

  /* ---- out of scope ---- */
  if (intent === 'outofscope' && score >= 3) {
    return finish({
      message: t(
        style,
        "Ask AVATOR is for finding your way around AVATOR — technology, developer access, enterprise or a direct conversation. What are you trying to build or solve?",
        'Ask AVATOR শুধু AVATOR-এর পথ খুঁজে দিতে পারে — technology, developer access, enterprise বা সরাসরি কথা। আপনি কী বানাতে বা সমাধান করতে চাইছেন?',
        'Ask AVATOR sudhu AVATOR-er path dekhaite pare — technology, developer access, enterprise ba direct kotha. Apni ki banate ba solve korte chaicchen?',
      ),
      state: 'out-of-scope',
      quickReplies: CLARIFY_REPLIES,
    });
  }

  /* ---- greeting ---- */
  if (intent === 'greeting' && score >= 2 && tokens.length <= 4) {
    return finish({
      message: t(
        style,
        'Hello. Tell me what you’re trying to build, fix, automate or understand — I’ll point you to the right AVATOR path.',
        'হ্যালো। কী বানাতে, ঠিক করতে বা automate করতে চান বলুন — আমি সঠিক AVATOR পথটা দেখিয়ে দেব।',
        'Hello! Ki banate, thik korte ba automate korte chan bolen — ami thik AVATOR path dekhiye debo.',
      ),
      state: 'discovering',
    });
  }

  /* ---- answer to the one automation clarification ---- */
  if (input.state.lastQuestion === 'automation-direction') {
    state.lastQuestion = null;
    if (scores.enterprise > 0 || has('internal') || has('workflow') || state.requiresPrivateDeployment) {
      return finish(enterpriseResult(input, style, state));
    }
    if (scores.developers > 0) {
      return finish(developersResult(input, style));
    }
    if (match) {
      return finish(matchedResult(style, match.entry, match.kind, match.score));
    }
    return finish(enterpriseResult(input, style, state, /* soft */ true));
  }

  /* ---- strong real-content match wins ---- */
  if (match && match.score >= 5 && scores.enterprise < 5) {
    return finish(matchedResult(style, match.entry, match.kind, match.score));
  }

  /* ---- enterprise (privacy/private deployment dominates api) ---- */
  if (intent === 'enterprise' || (scores.enterprise >= 4 && scores.enterprise >= scores.developers)) {
    return finish(enterpriseResult(input, style, state));
  }

  /* ---- developers ---- */
  if (intent === 'developers' && score >= 2.5) {
    return finish(developersResult(input, style));
  }

  /* ---- work / proof ---- */
  if (intent === 'work' && score >= 2.5) {
    const r = mainRoute(input, 'work');
    return finish({
      message: t(
        style,
        'Real systems say it best — PharmacyOS, DSE AI Trader, EDU-VERSE and more, each with an honest status.',
        'আসল সিস্টেমই সবচেয়ে ভালো প্রমাণ — PharmacyOS, DSE AI Trader, EDU-VERSE — প্রতিটার সৎ status সহ।',
        'Real system-i best proof — PharmacyOS, DSE AI Trader, EDU-VERSE — protitar honest status soho.',
      ),
      state: 'matched',
      recommendation: rec(
        'work',
        r.title,
        t(style, 'You asked for proof — this is the selected-systems index from our engineering practice.',
          'আপনি প্রমাণ চেয়েছেন — এটাই আমাদের engineering practice-এর সিস্টেম তালিকা।',
          'Apni proof cheyechen — eta amader engineering practice-er system list.'),
        r.href,
        'Open Work',
        'high',
      ),
    });
  }

  /* ---- products — only ever the honest state ---- */
  if (intent === 'product' && score >= 2.5) {
    const r = mainRoute(input, 'products');
    const hasProducts = input.knowledge.products.length > 0;
    return finish({
      message: hasProducts
        ? t(style, 'Here is the current public product line.', 'এই মুহূর্তের public product line এখানে।', 'Ekhon-er public product line ekhane.')
        : t(
            style,
            'Honest answer: no AVATOR product is publicly released yet — so there’s no public price. The first line is in private development, and releases will be announced on the Products page first.',
            'সৎ উত্তর: এখনো কোনো AVATOR product publicly release হয়নি — তাই public দামও নেই। প্রথম product line private development-এ আছে; release হলে Products পেজেই আগে জানানো হবে।',
            'Honest answer: ekhono kono AVATOR product publicly release hoyni — tai public price-o nai. First line private development-e ache; release hole Products page-ei age janano hobe.',
          ),
      state: hasProducts ? 'matched' : 'partial-match',
      recommendation: rec(
        'products',
        r.title,
        t(style, 'The honest state of the product line and how AVATOR will sell.',
          'Product line-এর সৎ অবস্থা আর AVATOR কীভাবে বিক্রি করবে — সব এখানে।',
          'Product line-er honest obostha ar AVATOR kivabe sell korbe — sob ekhane.'),
        r.href,
        'Open Products',
        'high',
      ),
    });
  }

  /* ---- contact ---- */
  if (intent === 'contact' && score >= 2.5) {
    const r = mainRoute(input, 'contact');
    return finish({
      message: t(
        style,
        'The direct line it is — one inbox, read by the founder.',
        'সরাসরি কথাই ভালো — একটাই inbox, founder নিজে পড়েন।',
        'Direct kotha-i bhalo — ekta inbox, founder nije poren.',
      ),
      state: 'handoff',
      recommendation: rec('contact', r.title,
        t(style, 'A human conversation is the right next step here.',
          'এখানে মানুষের সাথে কথা বলাই সঠিক পরের ধাপ।',
          'Ekhane manusher sathe kotha bola-i thik next step.'),
        r.href, 'Open Contact', 'high'),
    });
  }

  /* ---- vague automation → one useful question ---- */
  if (intent === 'automation' && score >= 2.5) {
    state.lastQuestion = 'automation-direction';
    return {
      result: {
        message: t(
          style,
          'Which side do you want to automate: an internal workflow (data stays yours), an API/developer integration, or a specific operational process?',
          'কোন দিকটা automate করতে চান: internal workflow (data আপনাদের কাছেই থাকবে), API/developer integration, নাকি কোনো specific operational process?',
          'Kon dikta automate korte chan: internal workflow (data apnader kachei thakbe), API/developer integration, naki kono specific operational process?',
        ),
        state: 'discovering',
        quickReplies: ['Internal workflow', 'API integration', 'A specific process'],
      },
      state,
    };
  }

  /* ---- moderate content match ---- */
  if (match) {
    return finish(matchedResult(style, match.entry, match.kind, match.score));
  }

  /* ---- company / technology orientation ---- */
  if ((intent === 'company' || intent === 'technology') && score >= 2) {
    const r = mainRoute(input, 'technology');
    const co = mainRoute(input, 'company');
    const wantsWho = intent === 'company' && (has('who') || has('founder') || has('story') || has('about'));
    const target = wantsWho ? co : r;
    return finish({
      message: t(
        style,
        'AVATOR builds applied intelligence: language systems, autonomous agents and complete software platforms — engineered for the real world.',
        'AVATOR applied intelligence বানায়: language systems, autonomous agents আর complete software platform — বাস্তব দুনিয়ার জন্য engineered।',
        'AVATOR applied intelligence banay: language systems, autonomous agents ar complete software platform — real world-er jonno engineered.',
      ),
      state: 'matched',
      recommendation: rec(
        wantsWho ? 'company' : 'technology',
        target.title,
        wantsWho
          ? t(style, 'Who is building AVATOR, the principles and the direction.',
              'AVATOR কে বানাচ্ছে, নীতিগুলো আর দিকনির্দেশনা।', 'AVATOR ke banacche, principle ar direction.')
          : t(style, 'The capability map — six disciplines, one engineering standard.',
              'Capability map — ছয়টা discipline, একটাই engineering standard।',
              'Capability map — 6-ta discipline, ekta engineering standard.'),
        target.href,
        `Open ${target.title}`,
        'high',
      ),
    });
  }

  /* ---- cannot confidently understand — say so, never fake ---- */
  return {
    result: {
      message: t(
        style,
        'I’m not fully sure which AVATOR path you mean. Is this closest to Technology, API/Developers, Enterprise, Work, or Contact?',
        'আমি ঠিক কোন দিকটা ধরব বুঝতে পারিনি। Technology, API/Developers, Enterprise, Work, নাকি Contact — কোনটার কাছাকাছি?',
        'Kon dike help lagbe ektu bolen: Technology, API/Developers, Enterprise, Work, naki Contact?',
      ),
      state: 'discovering',
      quickReplies: CLARIFY_REPLIES,
    },
    state,
  };
}

/* ---------- shared result builders ---------- */

function developersResult(input: GuideInput, style: LangStyle): GuideResult {
  const r = mainRoute(input, 'developers');
  return {
    message: t(
      style,
      'Straight answer: no AVATOR API is publicly released yet — the platform is in design, and early access is by request with direct engineering contact.',
      'সোজা কথা: এখনো কোনো AVATOR API publicly release হয়নি — platform design-এ আছে; early access request করলে সরাসরি engineering-এর সাথে কথা হয়।',
      'Soja kotha: ekhono kono AVATOR API publicly release hoyni — platform design-e ache; early access request korle directly engineering-er sathe kotha hoy.',
    ),
    state: 'matched',
    recommendation: rec(
      'developers',
      r.title,
      t(style, 'You want programmable access — this page is the platform’s front door and the early-access path.',
        'আপনি programmable access চান — এই পেজটাই platform-এর দরজা আর early-access পথ।',
        'Apni programmable access chan — ei page-tai platform-er dorja ar early-access path.'),
      r.href,
      'Open Developers',
      'high',
    ),
  };
}

function enterpriseResult(
  input: GuideInput,
  style: LangStyle,
  state: GuideConversationState,
  soft = false,
): GuideResult {
  const r = mainRoute(input, 'enterprise');
  const apiToo = Boolean(state.wantsApi);
  return {
    message: apiToo
      ? t(
          style,
          'API integration inside a private environment is an enterprise conversation — private deployment first, programmable access designed around your constraints.',
          'Private environment-এ API integration মানেই enterprise আলোচনা — আগে private deployment, তারপর আপনার শর্ত মেনে programmable access।',
          'Private environment-e API integration mane-i enterprise conversation — age private deployment, tarpor apnar constraint mene programmable access.',
        )
      : t(
          style,
          'That points to Enterprise: private or dedicated deployment, your data boundaries in writing, and you talk to the engineers from the first meeting.',
          'এটা Enterprise-এর দিকেই যায়: private/dedicated deployment, data-র সীমানা লিখিতভাবে ঠিক হয়, আর প্রথম মিটিং থেকেই engineer-দের সাথে কথা।',
          'Eta Enterprise-er dikei jay: private/dedicated deployment, data-r boundary likhito thake, ar first meeting thekei engineer-der sathe kotha.',
        ),
    state: soft ? 'partial-match' : 'matched',
    recommendation: rec(
      'enterprise',
      r.title,
      t(style, 'Private deployments, custom systems and direct engineering engagement.',
        'Private deployment, custom system আর সরাসরি engineering engagement।',
        'Private deployment, custom system ar direct engineering engagement.'),
      r.href,
      'Open Enterprise',
      soft ? 'medium' : 'high',
    ),
  };
}

function matchedResult(
  style: LangStyle,
  entry: KnowledgeEntry,
  kind: 'technology' | 'work' | 'product',
  score: number,
): GuideResult {
  const confidence: GuideRecommendation['confidence'] = score >= 6 ? 'high' : 'medium';
  const isWork = kind === 'work';
  return {
    message: t(
      style,
      `${entry.title} is the closest real ${isWork ? 'system' : 'capability'} — ${entry.summary}`,
      `${entry.title} — এটাই সবচেয়ে কাছের ${isWork ? 'বাস্তব সিস্টেম' : 'capability'}। ${entry.summary}`,
      `${entry.title} — eta-i sobcheye kacher ${isWork ? 'real system' : 'capability'}. ${entry.summary}`,
    ),
    state: 'matched',
    recommendation: rec(
      kind,
      entry.title,
      t(style,
        isWork ? 'A real system from the engineering practice, with an honest status.' : 'A documented capability area of the AVATOR base.',
        isWork ? 'Engineering practice-এর আসল সিস্টেম, সৎ status সহ।' : 'AVATOR base-এর নথিভুক্ত capability area।',
        isWork ? 'Engineering practice-er real system, honest status soho.' : 'AVATOR base-er documented capability area.'),
      entry.href,
      `Open ${entry.title}`,
      confidence,
    ),
  };
}

/* ---------- brief (deterministic, stated facts only) ---------- */

export function buildBrief(state: GuideConversationState): string {
  const lines: string[] = ['AVATOR GUIDE — CONVERSATION BRIEF', ''];
  if (state.goal) lines.push(`Goal (visitor's words): ${state.goal}`);
  if (state.wantsApi) lines.push('Integration need: wants API / programmable access');
  if (state.requiresPrivateDeployment) lines.push('Constraint: data must stay in their environment / private deployment');
  if (state.wantsProof) lines.push('Asked for: proof / existing systems');
  if (state.recommendedPath) lines.push(`Matched AVATOR path: ${state.recommendedPath}`);
  lines.push('', 'Prepared locally by Ask AVATOR from this conversation.');
  return lines.join('\n');
}
