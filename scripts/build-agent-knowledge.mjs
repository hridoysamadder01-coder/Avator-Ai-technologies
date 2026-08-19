#!/usr/bin/env node
/**
 * Builds the AVATOR public truth pack for the Guide agent from the same
 * content collections that power the website. Only public site material is
 * read — never env files, secrets, or private notes.
 *
 * Output: agent-worker/src/knowledge.json (committed; the Worker bundles it).
 * Run:    node scripts/build-agent-knowledge.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '/Avator-Ai-technologies';

/** Minimal frontmatter parser for this repo's simple YAML (strings, numbers, string lists). */
function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  let currentKey = null;
  for (const rawLine of m[1].split('\n')) {
    const listItem = rawLine.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      out[currentKey].push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = rawLine.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    if (rawVal === '') {
      out[key] = [];
      currentKey = key;
    } else {
      const val = stripQuotes(rawVal.trim());
      out[key] = /^\d+(\.\d+)?$/.test(val) ? Number(val) : val;
      currentKey = null;
    }
  }
  return out;
}

function stripQuotes(s) {
  return s.replace(/^["'](.*)["']$/, '$1');
}

function readCollection(dir) {
  const full = path.join(root, 'src/content', dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      slug: f.replace(/\.md$/, ''),
      ...parseFrontmatter(fs.readFileSync(path.join(full, f), 'utf8')),
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Pull public company facts out of src/lib/site.ts without executing it. */
function readSiteFacts() {
  const src = fs.readFileSync(path.join(root, 'src/lib/site.ts'), 'utf8');
  const grab = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*'([^']*)'`));
    return m ? m[1] : undefined;
  };
  return {
    name: grab('name') ?? 'AVATOR AI TECHNOLOGIES',
    description: grab('description') ?? '',
    tagline: grab('tagline') ?? '',
    origin: grab('origin'),
    contactEmail: grab('contactEmail'),
  };
}

const technologies = readCollection('technologies').map((t) => ({
  slug: t.slug,
  title: t.title,
  designation: t.designation,
  summary: t.summary,
  status: t.status,
  capabilities: t.capabilities ?? [],
  href: `${BASE}/technology/${t.slug}/`,
}));

const products = readCollection('products').map((p) => ({
  slug: p.slug,
  name: p.name,
  designation: p.designation,
  tagline: p.tagline,
  summary: p.summary,
  status: p.status,
  category: p.category,
  href: `${BASE}/products/${p.slug}/`,
}));

const work = readCollection('work').map((w) => ({
  slug: w.slug,
  title: w.title,
  designation: w.designation,
  discipline: w.discipline,
  summary: w.summary,
  status: w.status,
  href: `${BASE}/work/${w.slug}/`,
}));

const routes = [
  { kind: 'technology', title: 'Technology', href: `${BASE}/technology/`, description: 'The six capability areas every AVATOR product is built from.' },
  { kind: 'products', title: 'Products', href: `${BASE}/products/`, description: 'The honest state of the commercial product line and how AVATOR sells.' },
  { kind: 'work', title: 'Work', href: `${BASE}/work/`, description: 'Selected real systems from the engineering practice.' },
  { kind: 'developers', title: 'Developers', href: `${BASE}/developers/`, description: 'The AVATOR platform for developers — APIs in design, early access by request.' },
  { kind: 'enterprise', title: 'Enterprise', href: `${BASE}/enterprise/`, description: 'Private deployments, custom systems and direct engineering engagement.' },
  { kind: 'company', title: 'Company', href: `${BASE}/company/`, description: 'Who is building AVATOR, operating principles and direction.' },
  { kind: 'contact', title: 'Contact', href: `${BASE}/contact/`, description: 'Talk to AVATOR — one inbox, read by the founder.' },
  ...technologies.map((t) => ({ kind: 'technology', title: t.title, href: t.href, description: t.summary })),
  ...products.map((p) => ({ kind: 'product', title: p.name, href: p.href, description: p.tagline })),
  ...work.map((w) => ({ kind: 'work', title: w.title, href: w.href, description: w.summary })),
];

const knowledge = {
  generatedFrom: 'site content collections + src/lib/site.ts',
  company: readSiteFacts(),
  facts: [
    'AVATOR AI TECHNOLOGIES is an early, independent AI technology company founded by Hridoy Samadder, operating from Barguna, Bangladesh, building for a global market.',
    'There are currently no publicly released products or public APIs. The first product line and the developer platform are in private development; releases will be announced on the website first.',
    'AVATOR does not publish certifications (no SOC 2, ISO, HIPAA or SLA claims), customer names, or usage metrics. Enterprise engagement is a direct conversation with the engineers.',
    'Enterprise conversations cover: data boundaries, private/dedicated deployment models, security review with the people who built the system, and custom agreements — design-partner terms for organizations willing to build early.',
    'Developers can request early platform access by email; early developers get direct engineering contact and a say in the interface.',
  ],
  technologies,
  products,
  work,
  routes,
};

const outPath = path.join(root, 'agent-worker/src/knowledge.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(knowledge, null, 2) + '\n');
console.log(
  `knowledge pack written: ${path.relative(root, outPath)} — ${technologies.length} technologies, ${products.length} products, ${work.length} work items, ${routes.length} routes`,
);
