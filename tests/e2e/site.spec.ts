import { expect, test } from '@playwright/test';

const route = (path = '') => path.replace(/^\//, '');

const articleIndexFields = [
  'citationKey', 'slug', 'title', 'authors', 'year', 'venue', 'doi', 'articleType', 'overallReasoning',
  'contributionSummary', 'ophthalmicConditions', 'modalities', 'aiMethods', 'clinicalTasks', 'datasets',
  'countries', 'validationTypes', 'generalEvidenceAssignments', 'ethicsEvidenceAssignments'
].sort();

const articleExportFields = [
  'id', 'slug', 'citationKey', 'title', 'authors', 'year', 'venue', 'doi', 'pmid', 'openAlexId', 'url',
  'articleType', 'ophthalmicConditions', 'modalities', 'aiMethods', 'aiRoles', 'clinicalTasks', 'datasets',
  'countries', 'validationTypes', 'externalOrMulticenterValidation', 'dataChallenges', 'implementationBarriers',
  'generalEvidenceAssignments', 'ethicsEvidenceAssignments', 'contributionSummary', 'overallReasoning', 'citationText'
].sort();

const visualizationFields = [
  'publicationTimeline', 'publicationTimelineByClinicalTarget', 'publicationTimelineByMethod',
  'publicationTimelineByTask', 'taskClinicalTargetHeatmap', 'methodTaskHeatmap', 'generalEvidence',
  'ethicsEvidence', 'conditions', 'tasks', 'modalities', 'methods', 'validation', 'implementationContext', 'datasets'
].sort();

const forbiddenKeyFragments = [
  'fulltext', 'abstractonly', 'publicationmode', 'sourcepath', 'sourcetype', 'sourceprovider',
  'sourceavailability', 'sourcealternatives', 'metadatamatchmethod', 'sourcehash', 'sha256',
  'matchingprecedence', 'sourceselectionprecedence', 'sourceformatcounts', 'sourcescopecounts',
  'publicationmodecounts', 'recordswithoutabstracts', 'recordswithfulltext', 'unmatchedmanuscriptfiles',
  'uncertainmatches', 'sourcediscrepancies', 'evidencelocator', 'finalconfidence', 'confidencecounts', 'sourcescope'
];

const normalizedKey = (value: string) => value.toLocaleLowerCase('en').replace(/[^a-z0-9]/g, '');

const findForbiddenKeys = (value: unknown, path = '$'): string[] => {
  if (Array.isArray(value)) return value.flatMap((item, index) => findForbiddenKeys(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const normalized = normalizedKey(key);
    const own = forbiddenKeyFragments.some((fragment) => normalized.includes(fragment)) ? [childPath] : [];
    return [...own, ...findForbiddenKeys(child, childPath)];
  });
};

const expectRecordSchema = (records: Array<Record<string, unknown>>, fields: string[]) => {
  expect(records.length).toBeGreaterThan(0);
  for (const record of records) expect(Object.keys(record).sort()).toEqual(fields);
};

test('home page fills the first viewport with the review overview and aligned metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(route());
  await expect(page.getByRole('heading', { level: 1, name: 'Bringing the evidence landscape into focus.' })).toBeVisible();
  await expect(page.getByText('427', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Explore 427 publications/ })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ophthalmic AI/i);
  await expect(page.getByRole('heading', { level: 2, name: 'Transparency and interpretive safeguards' })).toBeVisible();
  await expect(page.locator('.integrity-grid article')).toHaveCount(3);
  await expect(page.getByRole('heading', { level: 3, name: 'Evidence you can inspect' })).toBeVisible();
  await expect(page.locator('meta[name="generator"]')).toHaveCount(0);
  await expect(page.getByText('6,482', { exact: true })).toBeVisible();
  await expect(page.getByText(/four bibliographic databases/i)).toBeVisible();
  await expect(page.getByText(/^2010[-–]2026$/)).toBeVisible();
  await expect(page.getByText(/search cut-off: 30 april 2026/i)).toBeVisible();
  const metrics = page.locator('.hero .stat-strip > div');
  await expect(metrics).toHaveCount(5);
  const geometry = await metrics.evaluateAll((cards) => {
    const tops = (selector: string) => cards.map((card) => card.querySelector(selector)?.getBoundingClientRect().top ?? -1);
    return {
      labels: tops('dt'),
      values: tops('.stat-value'),
      details: tops('.stat-detail'),
      bottom: Math.max(...cards.map((card) => card.getBoundingClientRect().bottom))
    };
  });
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  expect(spread(geometry.labels)).toBeLessThan(1.1);
  expect(spread(geometry.values)).toBeLessThan(1.1);
  expect(spread(geometry.details)).toBeLessThan(1.1);
  expect(geometry.bottom).toBeLessThanOrEqual(768);
  const heroBottom = await page.locator('.hero').evaluate((hero) => hero.getBoundingClientRect().bottom);
  expect(heroBottom).toBeCloseTo(768, 0);
});

test('home page remains aligned and free of horizontal overflow at target viewports', async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900, expectedRowPattern: [5] },
    { width: 1024, height: 768, expectedRowPattern: [3, 2] },
    { width: 768, height: 900, expectedRowPattern: [3, 2] },
    { width: 390, height: 844, expectedRowPattern: [1, 1, 1, 1, 1] }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(route());
    const layout = await page.locator('.stat-strip > div').evaluateAll((cards) => {
      const rounded = (value: number) => Math.round(value);
      const rectangles = cards.map((card) => card.getBoundingClientRect());
      const rowPattern = Array.from(
        rectangles.reduce((rows, rectangle) => {
          const top = rounded(rectangle.top);
          rows.set(top, (rows.get(top) ?? 0) + 1);
          return rows;
        }, new Map<number, number>())
      ).sort(([topA], [topB]) => topA - topB).map(([, count]) => count);
      return {
        rowPattern,
        cardsFit: cards.every((card) => card.scrollWidth <= card.clientWidth && card.scrollHeight <= card.clientHeight),
        documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    });
    expect(layout.rowPattern, `${viewport.width}px row pattern`).toEqual(viewport.expectedRowPattern);
    expect(layout.cardsFit, `${viewport.width}px stat content must not clip`).toBeTruthy();
    expect(layout.documentFits, `${viewport.width}px page must not overflow horizontally`).toBeTruthy();
  }
});

test('primary public routes and generated records return successfully', async ({ request }) => {
  const routes = [
    '', 'publications/', 'publications/5a7f975813f3/', 'datasets/', 'datasets/a2asdoct/',
    'manuscript/', 'supplementary/', 'supplementary/evidence-map/', 'methods/',
    'downloads/', 'search/', 'visualizations/', 'visualizations/publication-timeline/',
    'visualizations/general-evidence/', 'visualizations/ethics-evidence/',
    'visualizations/distributions/', 'visualizations/dataset-reuse/', 'visualizations/heatmaps/',
    'visualizations/keyword-network/', 'visualizations/collaboration/'
  ];
  for (const path of routes) {
    const response = await request.get(route(path));
    expect(response.ok(), `${path || '/'} returned ${response.status()}`).toBeTruthy();
  }
});

test('article explorer combines filters, updates counts, and preserves URL state', async ({ page }) => {
  await page.goto(route('publications/'));
  const results = page.locator('[data-results]');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  const resultCount = page.locator('[data-result-count]');
  await expect(resultCount).toHaveText('427');
  await expect(page.locator('input[data-filter-key="source"]')).toHaveCount(0);
  await expect(page.getByText('Source availability', { exact: true })).toHaveCount(0);

  const yearFilter = page.locator('input[data-filter-key="year"][value="2026"]');
  if (!(await yearFilter.isVisible())) {
    await page.locator('[data-filter-toggle]').click();
    await expect(yearFilter).toBeVisible();
  }
  await yearFilter.check();
  await expect(resultCount).toHaveText('15');
  await expect(page).toHaveURL(/year=2026/);

  await page.locator('input[data-filter-key="task"][value="Classification / diagnosis"]').check();
  const combinedCount = Number(await resultCount.textContent());
  expect(combinedCount).toBeGreaterThan(0);
  expect(combinedCount).toBeLessThanOrEqual(15);
  await expect(page.locator('input[data-filter-key="year"][value="2026"]').locator('xpath=..').locator('[data-facet-count]')).toHaveText(String(combinedCount));
  await expect(page).toHaveURL(/task=Classification/);

  await page.locator('[data-clear]').click();
  await expect(resultCount).toHaveText('427');
  await expect(page).not.toHaveURL(/year=/);
});

test('article explorer uses one natural page scroll for filters', async ({ page }) => {
  await page.goto(route('publications/'));
  await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
  const filterOverflow = await page.locator('.filter-column > details').evaluate((node) => getComputedStyle(node).overflowY);
  const optionOverflow = await page.locator('.filter-options').first().evaluate((node) => getComputedStyle(node).overflowY);
  expect(['auto', 'scroll']).not.toContain(filterOverflow);
  expect(['auto', 'scroll']).not.toContain(optionOverflow);
});

test('article explorer supports search and a source-free table view', async ({ page }) => {
  await page.goto(route('publications/'));
  await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
  await page.locator('[data-query]').fill('Schlosser2024_SciRep');
  await expect(page.locator('[data-result-count]')).toHaveText('1');
  await expect(page.getByRole('link', { name: /Visual Acuity Prediction on Real-Life Patient Data/ })).toBeVisible();
  await page.getByRole('button', { name: 'Table view' }).click();
  await expect(page.locator('.result-table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Source', exact: true })).toHaveCount(0);
});

test('article explorer preserves density in the URL', async ({ page }) => {
  await page.goto(route('publications/'));
  const explorer = page.locator('[data-article-explorer]');
  await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
  await expect(explorer).toHaveAttribute('data-density', 'comfortable');
  await expect(page.getByRole('button', { name: 'Comfortable density' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Compact density' }).click();
  await expect(explorer).toHaveAttribute('data-density', 'compact');
  await expect(page.getByRole('button', { name: 'Compact density' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL(/density=compact/);

  await page.reload();
  await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
  await expect(explorer).toHaveAttribute('data-density', 'compact');
  await expect(page.getByRole('button', { name: 'Compact density' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Comfortable density' }).click();
  await expect(explorer).toHaveAttribute('data-density', 'comfortable');
  await expect(page).not.toHaveURL(/density=/);
});

test('article explorer compares two publications and restores focus when closed or cleared', async ({ page }) => {
  await page.goto(route('publications/'));
  await expect(page.locator('[data-results]')).toHaveAttribute('aria-busy', 'false');
  const compareButtons = page.locator('[data-results] [data-compare-slug]');
  await expect(compareButtons).toHaveCount(24);

  await compareButtons.nth(0).click();
  await compareButtons.nth(1).click();
  const drawer = page.locator('[data-compare-drawer]');
  const panel = page.locator('[data-compare-panel]');
  const openComparison = page.locator('[data-compare-open]');
  await expect(drawer).toBeVisible();
  await expect(page.locator('[data-compare-count]')).toHaveText('2');
  await expect(compareButtons.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(compareButtons.nth(1)).toHaveAttribute('aria-pressed', 'true');

  await openComparison.click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Publication comparison' })).toBeFocused();
  await expect(page.locator('[data-compare-content]').getByRole('columnheader')).toHaveCount(3);

  await page.locator('[data-compare-close]').click();
  await expect(panel).toBeHidden();
  await expect(openComparison).toBeFocused();
  await openComparison.click();
  await page.locator('[data-compare-clear]').click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('[data-query]')).toBeFocused();
});

test('article and dataset pages retain stable public identifiers', async ({ page }) => {
  await page.goto(route('publications/schlosser2024-scirep/'));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Visual Acuity Prediction');
  await expect(page.locator('.article-key')).toContainText('Schlosser2024_SciRep');
  await expect(page.getByRole('heading', { name: 'Contribution summary' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Abstract', exact: true })).toHaveCount(0);

  await page.goto(route('datasets/a2asdoct/'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A2ASDOCT');
  await expect(page.getByRole('heading', { name: 'Registry record' })).toBeVisible();
});

test('article pages expose publication links without source-material status', async ({ page }) => {
  await page.goto(route('publications/1a2acf19df20/'));
  const links = page.locator('#publication-links');
  await expect(links.getByRole('heading', { name: 'Publication links' })).toBeVisible();
  await expect(links.getByRole('link', { name: /^DOI/ })).toBeVisible();
  await expect(links.getByRole('link', { name: /^PubMed/ })).toBeVisible();
  await expect(page.locator('#abstract, #source, #full-text, [id^="full-text-"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Readable full text|Source and access|Abstract/i })).toHaveCount(0);
  await expect(page.locator('.badge').filter({ hasText: /abstract[- ]only|full[- ]?text|source availability/i })).toHaveCount(0);
  const html = await page.locator('html').innerText();
  expect(html).not.toMatch(/abstract[- ]only|full[- ]?text|source availability|local source/i);
});

test('manuscript route presents the main and supplementary PDFs', async ({ page, request }) => {
  await page.goto(route('manuscript/'));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Manuscript and supplementary material');
  await expect(page.locator('iframe.pdf-reader')).toHaveCount(2);

  await expect(page.locator('.document-index small')).toHaveText(['PDF document', 'PDF document']);
  await expect(page.locator('.document-meta')).toHaveText(['PDF document', 'PDF document']);
  expect(await page.locator('.document-page').innerText()).not.toMatch(/\b\d+\s+pages?\b|\b\d+(?:\.\d+)?\s*(?:KB|MB|GB)\b/i);

  for (const [document, title] of [
    ['main.pdf', 'Main manuscript'],
    ['main_supplementary.pdf', 'Supplementary material']
  ]) {
    const reader = page.locator('iframe[src*="' + document + '"]');
    await expect(reader).toHaveCount(1);
    await expect(reader).toHaveAttribute('src', /#zoom=100&toolbar=1&navpanes=0$/);
    await expect(reader).toHaveAttribute('title', title + ' PDF reader');
    await expect(page.locator('a[href*="' + document + '"]')).toHaveCount(2);
    const response = await request.get(route('documents/' + document));
    expect(response.ok(), document + ' must be public').toBeTruthy();
    expect(response.headers()['content-type']).toContain('application/pdf');
    expect((await response.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('page reading progress reaches the end of the manuscript route', async ({ page }) => {
  await page.goto(route('manuscript/'));
  const progress = page.locator('[data-scroll-progress] span');
  await expect(progress).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect.poll(() => progress.evaluate((element) => (element as HTMLElement).style.transform)).toBe('scaleX(1)');
  await expect(progress).toBeVisible();
});

test('methods, downloads, and supplement expose only sanitized public content', async ({ page }) => {
  await page.goto(route('methods/'));
  for (const id of ['scope', 'coding-definitions', 'interpretation', 'limitations']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  await expect(page.locator('#provenance, #source-selection')).toHaveCount(0);
  await expect(page.locator('a[href*="data-provenance"], a[href*="validation-report"], a[href*="egm-audit"]')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/source selection|canonical audit matrix|download manifest|full[- ]?text|abstract[- ]only/i);

  await page.goto(route('downloads/'));
  await expect(page.getByRole('heading', { level: 1, name: 'Downloads' })).toBeVisible();
  for (const heading of ['Included-publication metadata', 'Datasets and evidence maps', 'Documentation']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.locator('a[href*="validation-report"], a[href*="data-provenance"], a[href*="egm-audit"], a[href$=".pdf"]')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/abstract[- ]only|full[- ]?text|source availability|canonical audit|source hash/i);

  await page.goto(route('supplementary/'));
  await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toMatch(/audit trail|search and screening statistics|abstract[- ]only|full[- ]?text/i);
});

test('keyword overlay and evidence map expose the current visual and coding criteria', async ({ page }) => {
  await page.goto(route('visualizations/keyword-network/'));
  await expect(page.getByText('Figure-source boundary')).toHaveCount(0);
  await expect(page.locator('.zoom-figure img')).toHaveCount(2);
  await expect(page.locator('.zoom-figure img').first()).toHaveJSProperty('naturalWidth', 1700);
  await expect(page.locator('.zoom-figure img').first()).toHaveJSProperty('naturalHeight', 1400);
  await expect(page.locator('.zoom-figure img').last()).toHaveJSProperty('naturalWidth', 1700);
  await expect(page.locator('.zoom-figure img').last()).toHaveJSProperty('naturalHeight', 1400);
  await expect(page.locator('.zoom-viewport')).toHaveCount(2);
  await expect(page.locator('.segmented')).toHaveCount(0);
  const viewportOverflow = await page.locator('.zoom-viewport').evaluateAll((viewports) => viewports.map((viewport) => ({
    horizontal: viewport.scrollWidth > viewport.clientWidth,
    vertical: viewport.scrollHeight > viewport.clientHeight,
    overflow: getComputedStyle(viewport).overflow
  })));
  expect(viewportOverflow).toEqual([
    { horizontal: false, vertical: false, overflow: 'hidden' },
    { horizontal: false, vertical: false, overflow: 'hidden' }
  ]);
  await expect(page.locator('.year-ticks li')).toHaveCount(7);
  await expect(page.locator('.year-ticks li').first()).toHaveText('2020');
  await expect(page.locator('.year-ticks li').last()).toHaveText('2026');

  await page.goto(route('supplementary/evidence-map/'));
  await expect(page.getByRole('heading', { name: 'What each evidence-map category filters' })).toBeVisible();
  await expect(page.getByText('Positive means that the publication frames AI as enabling or improving the named dimension.')).toBeVisible();
  await expect(page.getByText('Caused means that the publication frames AI as introducing or amplifying the issue.')).toBeVisible();
  await expect(page.locator('.criteria-list details')).toHaveCount(18);
  const modelPerformanceRule = page.locator('.criteria-list details').first();
  await modelPerformanceRule.locator('summary').click();
  await expect(modelPerformanceRule.getByText('Architecture or method description without an evaluated outcome.')).toBeVisible();
});

test('charts switch between the interactive figure and accessible data table', async ({ page }) => {
  await page.goto(route('visualizations/publication-timeline/'));
  const chart = page.locator('[data-scientific-chart]');
  const chartPanel = chart.locator('[data-chart-panel]');
  const tablePanel = chart.locator('[data-table-panel]');
  const chartButton = chart.locator('[data-chart-view]');
  const tableButton = chart.locator('[data-table-view]');
  await expect(chart).toHaveAttribute('data-enhanced', 'true');
  await expect(chartPanel).toBeVisible();
  await expect(tablePanel).toBeHidden();

  await tableButton.click();
  await expect(tableButton).toHaveAttribute('aria-pressed', 'true');
  await expect(chartButton).toHaveAttribute('aria-pressed', 'false');
  await expect(tablePanel).toBeVisible();
  await expect(tablePanel.getByRole('table')).toContainText('Journal article');
  await expect(tablePanel.locator('tbody tr')).toHaveCount(34);

  await chartButton.click();
  await expect(chartButton).toHaveAttribute('aria-pressed', 'true');
  await expect(chartPanel).toBeVisible();
  await expect(tablePanel).toBeHidden();
});

test('production Pagefind search initializes and returns typed results', async ({ page }) => {
  await page.goto(route('search/?q=glaucoma'));
  await expect(page.locator('[data-search-status]')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.search-result').first()).toBeVisible();
  await expect(page.locator('.search-result').first()).toContainText(/glaucoma/i);
});

test('browser and download article payloads use exact public schemas', async ({ request }) => {
  const indexResponse = await request.get(route('data/articles-index.json'));
  expect(indexResponse.ok()).toBeTruthy();
  const indexRecords = await indexResponse.json() as Array<Record<string, unknown>>;
  expect(indexRecords).toHaveLength(427);
  expectRecordSchema(indexRecords, articleIndexFields);
  expect(findForbiddenKeys(indexRecords)).toEqual([]);

  const downloadResponse = await request.get(route('downloads/articles.json'));
  expect(downloadResponse.ok()).toBeTruthy();
  const downloadRecords = await downloadResponse.json() as Array<Record<string, unknown>>;
  expect(downloadRecords).toHaveLength(427);
  expectRecordSchema(downloadRecords, articleExportFields);
  expect(findForbiddenKeys(downloadRecords)).toEqual([]);
});

test('downloadable visualization payload uses the exact safe schema', async ({ request }) => {
  const visualizationsResponse = await request.get(route('downloads/visualizations.json'));
  expect(visualizationsResponse.ok()).toBeTruthy();
  const visualizations = await visualizationsResponse.json() as Record<string, unknown>;
  expect(Object.keys(visualizations).sort()).toEqual(visualizationFields);
  expect(visualizations).not.toHaveProperty('prisma');
  expect(findForbiddenKeys(visualizations)).toEqual([]);
});

test('removed and redundant artifacts return 404', async ({ request, page }) => {
  const forbiddenPaths = [
    'visualizations/prisma/',
    'data/review-metadata.json',
    'data/visualizations.json',
    'downloads/data-provenance.json',
    'downloads/egm-audit-validation.json',
    'downloads/validation-report.json',
    'downloads/validation-report.md',
    'downloads/build-metadata.json',
    'downloads/main-manuscript.pdf',
    'downloads/supplementary-material.pdf',
    'downloads/visualization-prisma.csv',
    'downloads/visualization-publicationtimelinebyclinicaltarget.csv',
    'downloads/visualization-publicationtimelinebymethod.csv',
    'downloads/visualization-publicationtimelinebytask.csv'
  ];
  for (const path of forbiddenPaths) {
    const response = await request.get(route(path));
    expect(response.status(), `${path} must not be public`).toBe(404);
  }

  await page.goto(route('visualizations/'));
  await expect(page.getByRole('link', { name: /Study flow|PRISMA/i })).toHaveCount(0);
});

test('all internal navigation honors the configured base path', async ({ page }) => {
  await page.goto(route());
  const expectedBase = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
  const href = await page.locator('a[href$="/publications/"]').first().getAttribute('href');
  expect(href).toBe(`${expectedBase}publications/`.replace(/\/+/g, '/'));
  await page.getByRole('link', { name: /Explore 427 publications/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Included publications' })).toBeVisible();
});

test('Ctrl or Command K opens and closes the command palette', async ({ page }) => {
  await page.goto(route());
  const dialog = page.locator('[data-command-dialog]');
  const query = page.locator('[data-command-query]');
  const shortcut = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';
  await expect(dialog).toHaveJSProperty('open', false);

  await page.keyboard.press(shortcut);
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(query).toBeFocused();

  await page.keyboard.press(shortcut);
  await expect(dialog).toHaveJSProperty('open', false);
});

test('theme toggle switches and persists the selected theme', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
  await page.goto(route());
  const root = page.locator('html');
  const toggle = page.locator('[data-theme-toggle]');
  await expect(root).toHaveAttribute('data-theme', 'light');

  await toggle.click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('dark');

  await toggle.click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('theme'))).toBe('light');
});

test('keyboard navigation exposes the skip link and search shortcut', async ({ page }) => {
  await page.goto(route());
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('/');
  await expect(page).toHaveURL(/\/search\/$/);
});
