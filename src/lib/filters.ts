import type { ArticleIndexRecord, FilterState } from './types';

export type FacetFilterKey = Exclude<keyof FilterState, 'query'>;

export const emptyFilters = (): FilterState => ({
  query: '',
  year: [],
  articleType: [],
  condition: [],
  modality: [],
  method: [],
  task: [],
  dataset: [],
  validation: [],
  country: [],
  generalEvidence: [],
  ethicsEvidence: []
});

export const filterParamKeys = Object.keys(emptyFilters()) as Array<keyof FilterState>;

export function parseFilterState(params: URLSearchParams): FilterState {
  const state = emptyFilters();
  state.query = params.get('q')?.trim() ?? '';
  for (const key of filterParamKeys.filter((item) => item !== 'query')) {
    state[key] = params.getAll(key).filter(Boolean);
  }
  return state;
}

function hasIntersection(values: string[], filters: string[]): boolean {
  return filters.length === 0 || filters.some((filter) => values.includes(filter));
}

function evidenceValues(assignments: ArticleIndexRecord['generalEvidenceAssignments']): string[] {
  return assignments.map((item) => `${item.dimension}::${item.stance}`);
}

export function filterArticles(articles: ArticleIndexRecord[], filters: FilterState): ArticleIndexRecord[] {
  const query = filters.query.toLocaleLowerCase('en');
  return articles.filter((article) => {
    const searchText = [
      article.title,
      article.authors.join(' '),
      article.venue ?? '',
      article.overallReasoning,
      article.contributionSummary,
      article.citationKey,
      ...article.ophthalmicConditions,
      ...article.modalities,
      ...article.aiMethods,
      ...article.clinicalTasks,
      ...article.datasets
    ].join(' ').toLocaleLowerCase('en');
    return (
      (!query || searchText.includes(query)) &&
      hasIntersection([String(article.year)], filters.year) &&
      hasIntersection([article.articleType], filters.articleType) &&
      hasIntersection(article.ophthalmicConditions, filters.condition) &&
      hasIntersection(article.modalities, filters.modality) &&
      hasIntersection(article.aiMethods, filters.method) &&
      hasIntersection(article.clinicalTasks, filters.task) &&
      hasIntersection(article.datasets, filters.dataset) &&
      hasIntersection(article.validationTypes, filters.validation) &&
      hasIntersection(article.countries, filters.country) &&
      hasIntersection(evidenceValues(article.generalEvidenceAssignments), filters.generalEvidence) &&
      hasIntersection(evidenceValues(article.ethicsEvidenceAssignments), filters.ethicsEvidence)
    );
  });
}

export function getDisjunctiveFacetCounts(
  articles: ArticleIndexRecord[],
  filters: FilterState,
  facet: FacetFilterKey,
  getValues: (article: ArticleIndexRecord) => string[]
): Map<string, number> {
  const filtersWithoutFacet = { ...filters, [facet]: [] } as FilterState;
  const counts = new Map<string, number>();
  for (const article of filterArticles(articles, filtersWithoutFacet)) {
    for (const value of new Set(getValues(article).filter(Boolean))) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

export function serializeFilterState(filters: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set('q', filters.query);
  for (const key of filterParamKeys.filter((item) => item !== 'query')) {
    for (const value of filters[key]) params.append(key, value);
  }
  return params;
}
