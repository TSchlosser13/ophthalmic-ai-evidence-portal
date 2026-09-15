import { expect, test } from '@playwright/test';

const legacyRoutes = [
  { name: 'collection', suffix: '', state: '?year=2026&view=table#explorer' },
  { name: 'publication record', suffix: '5a7f975813f3/', state: '?ref=legacy%20link&mode=record#summary' }
];

for (const { name, suffix, state } of legacyRoutes) {
  test(`legacy ${name} is a static redirect that preserves its query and fragment`, async ({ page, request, baseURL }) => {
    const legacy = new URL(`articles/${suffix}`, baseURL);
    const destination = new URL(`publications/${suffix}`, baseURL);
    const response = await request.get(legacy.href);
    expect(response.status()).toBe(200);
    expect(response.url()).toBe(legacy.href);
    expect(response.headers()['content-type']).toContain('text/html');

    // Inspect the served HTML before scripts or the refresh fallback can navigate.
    const metadata = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html');
      return {
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content'),
        refresh: document.querySelector('meta[http-equiv="refresh" i]')?.getAttribute('content')
      };
    }, await response.text());
    expect(metadata.robots).toMatch(/\bnoindex\b/i);
    expect(metadata.canonical).toBeTruthy();
    expect(new URL(metadata.canonical!, legacy.href).pathname).toBe(destination.pathname);
    const refreshTarget = metadata.refresh?.match(/^\s*\d+(?:\.\d+)?\s*;\s*url\s*=\s*["']?([^"']+)["']?\s*$/i)?.[1]?.trim();
    expect(refreshTarget).toBeTruthy();
    expect(new URL(refreshTarget!, legacy.href).pathname).toBe(destination.pathname);

    // Replacement navigation must keep a browser's Back action useful.
    await page.goto(baseURL!);
    await page.goto(legacy.href + state);
    await expect(page).toHaveURL(destination.href + state);
    if (!suffix) {
      await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('[data-result-count]')).toHaveText('15');
      await expect(page.locator('.result-table')).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('#summary')).toBeAttached();
    }
    await page.goBack();
    await expect(page).toHaveURL(baseURL!);
  });
}
