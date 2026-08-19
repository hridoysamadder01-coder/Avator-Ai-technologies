/**
 * Unit tests for the local AVATOR Guide engine — DOM-free.
 * Run: npm run test:guide  (node --experimental-strip-types)
 * The fixture mirrors real current site content.
 */

import { respond, buildBrief } from './engine.ts';
import type { GuideConversationState, GuideKnowledge } from './types.ts';

const BASE = '/Avator-Ai-technologies';

const knowledge: GuideKnowledge = {
  company: { name: 'AVATOR AI TECHNOLOGIES', description: 'Independent AI technology company.', origin: 'Barguna, Bangladesh' },
  technologies: [
    {
      slug: 'language-systems', title: 'Language Systems', designation: 'AVT·LNG',
      summary: 'Applied language intelligence — systems that read, reason over and act on human language.',
      capabilities: ['Conversational interfaces', 'Retrieval and grounding', 'Structured extraction from unstructured text', 'Multilingual operation, including Bangla and English'],
      status: 'active', href: `${BASE}/technology/language-systems/`,
    },
    {
      slug: 'autonomous-agents', title: 'Autonomous Agents', designation: 'AVT·AGT',
      summary: 'Software that plans, executes and verifies multi-step work.',
      capabilities: ['Multi-step task planning', 'Tool use', 'Bounded autonomy'],
      status: 'development', href: `${BASE}/technology/autonomous-agents/`,
    },
  ],
  products: [],
  work: [
    {
      slug: 'pharmacyos', title: 'PharmacyOS', designation: 'SYS·001', discipline: 'Applied Intelligence Platforms',
      summary: 'An operations platform for pharmacies — inventory, sales and the daily workflow of a physical business.',
      status: 'Active', href: `${BASE}/work/pharmacyos/`,
    },
    {
      slug: 'dse-ai-trader', title: 'DSE AI Trader', designation: 'SYS·002', discipline: 'Data & Signal Systems',
      summary: 'Applied market-signal experiments for the Dhaka Stock Exchange.',
      status: 'Experiment', href: `${BASE}/work/dse-ai-trader/`,
    },
  ],
  routes: [
    { kind: 'technology', title: 'Technology', summary: 'Capability areas', href: `${BASE}/technology/` },
    { kind: 'products', title: 'Products', summary: 'Product line', href: `${BASE}/products/` },
    { kind: 'work', title: 'Work', summary: 'Selected systems', href: `${BASE}/work/` },
    { kind: 'developers', title: 'Developers', summary: 'Platform', href: `${BASE}/developers/` },
    { kind: 'enterprise', title: 'Enterprise', summary: 'Private deployments', href: `${BASE}/enterprise/` },
    { kind: 'company', title: 'Company', summary: 'Who is building AVATOR', href: `${BASE}/company/` },
    { kind: 'contact', title: 'Contact', summary: 'Talk to AVATOR', href: `${BASE}/contact/` },
  ],
};

let passed = 0;
let failed = 0;

function ask(message: string, state: GuideConversationState = {}) {
  return respond({ message, state, knowledge });
}

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed += 1;
    console.log(`PASS — ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

/* English company */
{
  const { result } = ask('What does AVATOR build?');
  check('EN company orientation', result.state === 'matched' && !!result.recommendation, JSON.stringify(result));
}

/* English developer */
{
  const { result } = ask('I need API access');
  check('EN developer → Developers', result.recommendation?.title === 'Developers', result.recommendation?.title);
  check('EN developer honest (no public API claim)', result.message.includes('no AVATOR API is publicly released'));
}

/* English enterprise */
{
  const { result } = ask('We need a private deployment for our company');
  check('EN enterprise → Enterprise', result.recommendation?.title === 'Enterprise', result.recommendation?.title);
}

/* Privacy + API → enterprise-dominant */
{
  const { result, state } = ask('Our data cannot leave our environment but we need API integration');
  check('privacy+api → Enterprise dominant', result.recommendation?.title === 'Enterprise', result.recommendation?.title);
  check('privacy+api message acknowledges API', result.message.toLowerCase().includes('api'));
  check('state captured privacy + api', state.requiresPrivateDeployment === true && state.wantsApi === true);
}

/* Bangla */
{
  const { result } = ask('আমাদের company-র manual কাজ automate করতে চাই');
  const okQ = result.quickReplies !== undefined && result.state === 'discovering';
  const okRoute = result.recommendation !== undefined;
  check('BN automation → clarification or route', okQ || okRoute, JSON.stringify(result));
  check('BN reply is Bangla', /[ঀ-৿]/.test(result.message), result.message);
}

/* Banglish */
{
  const { result } = ask('amar business er kaj automate korte chai');
  check('Banglish automation understood (question asked)', result.state === 'discovering' && !!result.quickReplies, JSON.stringify(result.quickReplies));
  check('Banglish reply mirrors style (no Bangla script)', !/[ঀ-৿]/.test(result.message) && /kon|dikta|chan/i.test(result.message), result.message);
}

/* Banglish follow-up combines */
{
  const first = ask('amar business er kaj automate korte chai');
  const second = respond({ message: 'internal workflow, data private rakhte hobe', state: first.state, knowledge });
  check('follow-up → Enterprise', second.result.recommendation?.title === 'Enterprise', JSON.stringify(second.result));
}

/* Banglish API */
{
  const { result } = ask('api diya integrate korte chai');
  check('Banglish API → Developers', result.recommendation?.title === 'Developers', result.recommendation?.title);
}

/* Banglish enterprise privacy */
{
  const { result } = ask('amader data baire jawa jabe na');
  check('Banglish privacy → Enterprise', result.recommendation?.title === 'Enterprise', JSON.stringify(result));
}

/* Work proof */
{
  const { result } = ask('tomader kajer proman dekhaw');
  check('Banglish proof → Work', result.recommendation?.title === 'Work' || result.recommendation?.kind === 'work', JSON.stringify(result.recommendation));
}

/* Unknown → one clarification, no random routing */
{
  const { result } = ask('amar ekta jinish lagbe');
  check('vague → clarification, no recommendation', result.state === 'discovering' && !result.recommendation, JSON.stringify(result));
}

/* Out of scope */
{
  const { result } = ask('write me a football poem');
  check('out-of-scope redirect', result.state === 'out-of-scope' && !result.recommendation);
}

/* No fake product */
{
  const { result } = ask('inventory product er price koto');
  const noFake = !/\$|৳|taka|price is/i.test(result.message.replace('public price', ''));
  check('empty products → no invented product/price', noFake && (result.recommendation?.kind !== 'product'), JSON.stringify(result));
}

/* Real content matches */
{
  const { result } = ask('I run a pharmacy and need inventory software');
  check('pharmacy → PharmacyOS', result.recommendation?.title === 'PharmacyOS', result.recommendation?.title);
}
{
  const { result } = ask('do you have anything for stock market trading?');
  check('trading → DSE AI Trader', result.recommendation?.title === 'DSE AI Trader', result.recommendation?.title);
}
{
  const { result } = ask('we need a chatbot that answers from our documents');
  check('chatbot/documents → Language Systems', result.recommendation?.title === 'Language Systems', result.recommendation?.title);
}

/* Contact */
{
  const { result } = ask('I want to talk to a person');
  check('contact → Contact', result.recommendation?.title === 'Contact', result.recommendation?.title);
}

/* Brief only contains stated facts */
{
  const a = ask('Our data cannot leave our environment but we need API integration');
  const brief = buildBrief(a.state);
  check('brief has goal + privacy + api', brief.includes("Goal (visitor's words)") && brief.includes('private deployment') && brief.includes('API'));
  check('brief invents nothing', !/industry|scale:/i.test(brief));
}

/* Route safety: every recommendation href comes from the pack */
{
  const hrefs = new Set([
    ...knowledge.routes.map((r) => r.href),
    ...knowledge.technologies.map((e) => e.href),
    ...knowledge.work.map((e) => e.href),
  ]);
  const samples = [
    'I need API access', 'amader data baire jawa jabe na', 'show me your projects',
    'pharmacy inventory', 'what does avator build', 'talk to someone', 'price koto',
  ];
  const allValid = samples.every((m) => {
    const { result } = ask(m);
    return !result.recommendation || hrefs.has(result.recommendation.href);
  });
  check('all recommended hrefs from knowledge pack', allValid);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
