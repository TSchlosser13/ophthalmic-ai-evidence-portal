import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const normalizedBase = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const site = process.env.SITE_URL || 'https://example.org';

export default defineConfig({
  site,
  base: normalizedBase,
  output: 'static',
  trailingSlash: 'always',
  devToolbar: {
    enabled: false
  },
  integrations: [sitemap({
    filter: (page) => !new URL(page).pathname.startsWith(`${normalizedBase}articles/`)
  })],
  build: {
    format: 'directory',
    inlineStylesheets: 'auto'
  },
  vite: {
    build: {
      sourcemap: false,
      modulePreload: false,
      chunkSizeWarningLimit: 850
    }
  }
});
