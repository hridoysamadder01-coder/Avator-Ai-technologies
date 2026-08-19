/**
 * Central site configuration. Edit here — everything else follows.
 */

export const SITE = {
  name: 'AVATOR AI TECHNOLOGIES',
  shortName: 'AVATOR',
  tagline: 'Intelligence, engineered into systems that hold.',
  description:
    'AVATOR AI TECHNOLOGIES is an independent AI technology company building applied intelligence systems — language systems, autonomous agents and complete software platforms engineered for the real world.',
  contactEmail: 'hridoysamadder01@gmail.com',
  origin: 'Barguna, Bangladesh',
  coordinates: '22.0953° N · 90.1121° E',
  founder: 'Hridoy Samadder',
} as const;

/**
 * AVATOR Guide backend (public URL, not a secret — the provider API key lives
 * only inside the Worker). Leave empty until the Worker is deployed; the Guide
 * then runs in fallback mode with static quick links. See agent-worker/README.md.
 * Local dev can override with PUBLIC_AVATOR_GUIDE_API.
 */
const PROD_GUIDE_API = '';
export const GUIDE_API =
  (import.meta.env.PUBLIC_AVATOR_GUIDE_API as string | undefined) || PROD_GUIDE_API;

/** Prefix a root-relative path with the deployment base path. */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Shared status vocabulary — every chip on the site pulls from these. */
export const TECH_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  development: 'In development',
  research: 'Research',
};

export const PRODUCT_STATUS_LABEL: Record<string, string> = {
  'in-development': 'In development',
  'private-preview': 'Private preview',
  available: 'Available',
};

/** Normalize a free-text status to a data-state key for chip styling. */
export function statusKey(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '-');
}

export const NAV = [
  { label: 'Technology', path: '/technology/' },
  { label: 'Products', path: '/products/' },
  { label: 'Work', path: '/work/' },
  { label: 'Developers', path: '/developers/' },
  { label: 'Enterprise', path: '/enterprise/' },
  { label: 'Company', path: '/company/' },
] as const;
