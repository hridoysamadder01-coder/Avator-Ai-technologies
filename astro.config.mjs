// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Deployed as a GitHub Pages project site.
// site + base are required so all URLs resolve under the repository path.
export default defineConfig({
  site: 'https://hridoysamadder01-coder.github.io',
  base: '/Avator-Ai-technologies',
  trailingSlash: 'always',
  output: 'static',
  integrations: [sitemap()],
  build: {
    inlineStylesheets: 'auto',
  },
});
