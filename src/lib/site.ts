/**
 * Central site configuration. Edit here — everything else follows.
 */

export const SITE = {
  name: 'AVATOR AI TECHNOLOGIES',
  shortName: 'AVATOR',
  tagline: 'Intelligence, engineered into systems that hold.',
  description:
    'AVATOR AI TECHNOLOGIES is an independent AI technology company building applied intelligence systems — language systems, autonomous agents, and complete software platforms engineered for the real world.',
  contactEmail: 'hridoysamadder01@gmail.com',
  origin: 'Barguna, Bangladesh',
  coordinates: '22.0953° N · 90.1121° E',
  founder: 'Hridoy Samadder',
} as const;

/** Prefix a root-relative path with the deployment base path. */
export function href(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (path === '/') return `${base}/`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export const NAV = [
  { label: 'Technology', path: '/technology/' },
  { label: 'Products', path: '/products/' },
  { label: 'Work', path: '/work/' },
  { label: 'Developers', path: '/developers/' },
  { label: 'Enterprise', path: '/enterprise/' },
  { label: 'Company', path: '/company/' },
] as const;
