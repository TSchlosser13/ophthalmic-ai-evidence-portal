import { expect, test } from '@playwright/test';

const revisedEvidence = [
  { family: 'general', count: 1314, label: 'General evidence assignments' },
  { family: 'ethics', count: 345, label: 'Ethics assignments' }
];

test('revised evidence totals agree across the overview and downloadable assignments', async ({ page, request, baseURL }) => {
  await page.goto(baseURL!);
  const statistics = page.locator('.stat-strip > div');
  for (const { count, label } of revisedEvidence) {
    const metric = statistics.filter({ has: page.getByText(label, { exact: true }) });
    await expect(metric.locator('.stat-value')).toHaveText(count.toLocaleString('en-GB'));
  }

  await page.goto(new URL('downloads/', baseURL).href);
  for (const { family, count } of revisedEvidence) {
    const filename = `${family}-evidence-assignments.csv`;
    const link = page.locator('a[download]').filter({ has: page.getByText(filename, { exact: true }) });
    await expect(link).toContainText(`All ${count.toLocaleString('en-GB')} ${family} evidence-map assignments`);
    const href = await link.getAttribute('href');
    expect(new URL(href!, baseURL).pathname).toBe(new URL(`downloads/${filename}`, baseURL).pathname);
    expect((await request.get(new URL(href!, baseURL).href)).ok()).toBeTruthy();

    const response = await request.get(new URL(`downloads/${family}-evidence-assignments.json`, baseURL).href);
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toHaveLength(count);
  }
});
