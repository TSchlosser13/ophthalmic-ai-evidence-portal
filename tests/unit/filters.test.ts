import { describe, expect, it } from 'vitest';
import { emptyFilters, filterArticles, getDisjunctiveFacetCounts, parseFilterState, serializeFilterState } from '../../src/lib/filters';
import { withBase } from '../../src/lib/base';
import type { ArticleIndexRecord } from '../../src/lib/types';

const articles: ArticleIndexRecord[] = [
  {
    citationKey: 'retina2024', slug: 'retina2024', title: 'Retinal OCT prediction', authors: ['A Author'], year: 2024,
    venue: 'Journal', doi: null, articleType: 'Journal article', overallReasoning: 'Uses longitudinal OCT data.', contributionSummary: 'Predicts treatment response.',
    ophthalmicConditions: ['Age-related macular degeneration'], modalities: ['Optical coherence tomography'],
    aiMethods: ['Transformer / attention / ViT'], clinicalTasks: ['Prediction / prognosis'], datasets: ['RETOUCH challenge'],
    countries: ['Germany'], validationTypes: ['External validation'],
    generalEvidenceAssignments: [{ dimension: 'Model performance', stance: 'positive' }], ethicsEvidenceAssignments: [],
  },
  {
    citationKey: 'glaucoma2021', slug: 'glaucoma2021', title: 'Glaucoma classification', authors: ['B Author'], year: 2021,
    venue: 'Proceedings', doi: null, articleType: 'Conference / proceedings', overallReasoning: 'Tests a glaucoma classifier.', contributionSummary: 'Classifies glaucoma.',
    ophthalmicConditions: ['Glaucoma / optic nerve'], modalities: ['Optical coherence tomography'],
    aiMethods: ['CNN / convolutional network'], clinicalTasks: ['Classification / diagnosis'], datasets: [], countries: [],
    validationTypes: [], generalEvidenceAssignments: [{ dimension: 'Technological limitations', stance: 'negative' }],
    ethicsEvidenceAssignments: []
  }
];

describe('article filtering', () => {
  it('combines filters across facets', () => {
    const filters = emptyFilters();
    filters.year = ['2024'];
    filters.task = ['Prediction / prognosis'];
    filters.validation = ['External validation'];
    expect(filterArticles(articles, filters).map((item) => item.citationKey)).toEqual(['retina2024']);
  });

  it('supports URL round trips', () => {
    const parsed = parseFilterState(new URLSearchParams('q=retina&year=2024&task=Prediction+%2F+prognosis'));
    expect(parsed.query).toBe('retina');
    expect(parsed.year).toEqual(['2024']);
    expect(serializeFilterState(parsed).get('task')).toBe('Prediction / prognosis');
  });

  it('filters evidence dimension and stance together', () => {
    const filters = emptyFilters();
    filters.generalEvidence = ['Technological limitations::negative'];
    expect(filterArticles(articles, filters).map((item) => item.citationKey)).toEqual(['glaucoma2021']);
  });

  it('calculates live counts with all active filters except the counted facet', () => {
    const filters = emptyFilters();
    filters.year = ['2021'];
    filters.task = ['Prediction / prognosis'];

    const yearCounts = getDisjunctiveFacetCounts(articles, filters, 'year', (article) => [String(article.year)]);
    expect(yearCounts.get('2024')).toBe(1);
    expect(yearCounts.get('2021')).toBeUndefined();

    const taskCounts = getDisjunctiveFacetCounts(articles, filters, 'task', (article) => article.clinicalTasks);
    expect(taskCounts.get('Classification / diagnosis')).toBe(1);
    expect(taskCounts.get('Prediction / prognosis')).toBeUndefined();
  });
});

describe('base paths', () => {
  it('prefixes project-page routes', () => {
    expect(withBase('/publications/', '/repository/')).toBe('/repository/publications/');
    expect(withBase('/publications/', '/')).toBe('/publications/');
  });
});
