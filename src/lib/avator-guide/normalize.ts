/**
 * Normalization for the AVATOR Guide domain: tokenizes English, Bangla script,
 * Banglish / Romanized Bangla and mixed input into one canonical token space.
 * Deliberately small — it covers the Guide's routing domain, not linguistics.
 */

import type { LangStyle } from './types.ts';

/** Banglish variants and Bangla-script words → canonical tokens. */
const CANON: Record<string, string> = {
  // want / need / do
  chai: 'want', chay: 'want', cay: 'want', chacchi: 'want', chaicchi: 'want',
  lagbe: 'need', lage: 'need', dorkar: 'need', proyojon: 'need',
  korte: 'do', korbo: 'do', kori: 'do', kora: 'do', koro: 'do', korish: 'do',
  banate: 'build', banao: 'build', banay: 'build', banaben: 'build', banabo: 'build',
  // understanding / showing
  bujhi: 'understand', bujhte: 'understand', bujhtasi: 'understand', bujhina: 'unsure',
  dekhaw: 'show', dekhao: 'show', dekhan: 'show', dekhabo: 'show', dekhte: 'show',
  // negation / possession / questions
  na: 'not', nai: 'not', nei: 'not', cannot: 'not', cant: 'not', dont: 'not',
  never: 'not', wont: 'not',
  amar: 'my', amader: 'our', amra: 'we', ami: 'i',
  tomra: 'you', tomader: 'your', apnara: 'you', apnader: 'your', tumi: 'you', apni: 'you',
  ki: 'what', kon: 'which', kivabe: 'how', kemne: 'how', keno: 'why', koto: 'howmuch',
  // domain words
  kaj: 'work', kajer: 'work', kajta: 'work',
  baire: 'outside', bahire: 'outside', jabe: 'go', jawa: 'go', jete: 'go',
  nijeder: 'own', nijer: 'own', gopon: 'private', gopone: 'private',
  dam: 'price', taka: 'price', dhoro: 'suppose',
  kotha: 'talk', jogajog: 'contact', manush: 'person', lok: 'person',
  proman: 'proof', promaan: 'proof', udahoron: 'example',
  khela: 'game', gaan: 'song', kobita: 'poem', cinema: 'movie', chobi: 'movie',
  somossa: 'problem', shomossha: 'problem', sombhob: 'possible',
  // bangla script → canonical
  'চাই': 'want', 'চান': 'want', 'লাগবে': 'need', 'দরকার': 'need', 'প্রয়োজন': 'need',
  'করতে': 'do', 'করবো': 'do', 'করব': 'do', 'করি': 'do', 'কমাতে': 'reduce',
  'বানাতে': 'build', 'বানায়': 'build', 'বানাও': 'build', 'তৈরি': 'build',
  'বুঝি': 'understand', 'বুঝতে': 'understand',
  'দেখাও': 'show', 'দেখান': 'show', 'দেখতে': 'show',
  'না': 'not', 'নেই': 'not', 'নাই': 'not',
  'আমার': 'my', 'আমাদের': 'our', 'আমরা': 'we', 'আমি': 'i',
  'তোমরা': 'you', 'তোমাদের': 'your', 'আপনারা': 'you', 'আপনাদের': 'your',
  'কি': 'what', 'কী': 'what', 'কোন': 'which', 'কীভাবে': 'how', 'কেন': 'why', 'কত': 'howmuch',
  'কাজ': 'work', 'কাজের': 'work',
  'বাইরে': 'outside', 'যাবে': 'go', 'যাওয়া': 'go',
  'নিজেদের': 'own', 'গোপন': 'private', 'গোপনীয়': 'private',
  'দাম': 'price', 'টাকা': 'price',
  'কথা': 'talk', 'যোগাযোগ': 'contact', 'মানুষ': 'person',
  'প্রমাণ': 'proof', 'উদাহরণ': 'example',
  'প্রাইভেট': 'private', 'ডেটা': 'data', 'ডাটা': 'data', 'তথ্য': 'data',
  'কোম্পানি': 'company', 'কোম্পানির': 'company', 'ব্যবসা': 'business', 'ব্যবসার': 'business',
  'প্রতিষ্ঠান': 'organization', 'সিস্টেম': 'system', 'সমস্যা': 'problem',
  'ম্যানুয়াল': 'manual', 'অটোমেট': 'automate', 'অটোমেশন': 'automation',
  'প্রযুক্তি': 'technology', 'ইন্টিগ্রেশন': 'integration', 'ইন্টিগ্রেট': 'integrate',
  'ডেভেলপার': 'developer', 'এপিআই': 'api',
  'কবিতা': 'poem', 'খেলা': 'game', 'গান': 'song', 'সিনেমা': 'movie',
  // english variants worth folding
  automations: 'automation', automated: 'automate', automating: 'automate',
  apis: 'api', integrations: 'integration', integrating: 'integrate', integrated: 'integrate',
  developers: 'developer', devs: 'developer', dev: 'developer',
  companies: 'company', businesses: 'business', orgs: 'organization', org: 'organization',
  organisations: 'organization', organisation: 'organization', organizations: 'organization',
  products: 'product', prices: 'price', pricing: 'price', cost: 'price', costs: 'price',
  projects: 'project', examples: 'example', capabilities: 'capability',
  agents: 'agent', deployments: 'deployment', deployed: 'deployment', deploy: 'deployment',
  secure: 'security', privacy: 'private', confidential: 'private', sensitive: 'private',
  internally: 'internal', inside: 'internal',
};

/** Tokenize keeping Bengali script words intact, then canonicalize. */
export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}ঀ-৿]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return raw.map((t) => CANON[t] ?? t);
}

const BANGLISH_MARKERS = new Set([
  'chai', 'chay', 'lagbe', 'lage', 'dorkar', 'korte', 'korbo', 'kori', 'koro', 'amar',
  'amader', 'amra', 'tomra', 'tomader', 'apnara', 'kaj', 'kajer', 'baire', 'jabe', 'jawa',
  'bujhi', 'bujhtasi', 'dekhaw', 'dekhao', 'ki', 'kon', 'keno', 'koto', 'na', 'ase', 'ache',
  'hobe', 'kotha', 'jogajog', 'banao', 'banay', 'ektu', 'bolo', 'diye', 'diya', 'naki',
  'kintu', 'ar', 'ta', 'er', 'e', 'te', 'jinish', 'valo', 'bhalo', 'kemon',
]);

/** Detect the visitor's writing style from raw (pre-canonical) text. */
export function detectStyle(text: string): LangStyle {
  const bengaliChars = (text.match(/[ঀ-৿]/g) ?? []).length;
  if (bengaliChars >= 4 || bengaliChars > text.length * 0.2) return 'bn';
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const hits = words.filter((w) => BANGLISH_MARKERS.has(w)).length;
  if (hits >= 2 || (words.length > 0 && hits / words.length >= 0.25)) return 'banglish';
  return 'en';
}
