import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemapPath = `${import.meta.env.BASE_URL}sitemap-index.xml`.replace(/\/+/g, '/');
  const sitemap = site ? new URL(sitemapPath, site).toString() : sitemapPath;
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${sitemap}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
};
