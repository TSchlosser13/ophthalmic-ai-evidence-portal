export interface MapCountry {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  count: number;
  publicationKeys: string[];
}

export interface Collaboration {
  id: string;
  countryA: string;
  countryB: string;
  count: number;
  publicationKeys: string[];
}

export interface MapPublication {
  citationKey: string;
  slug: string;
  title: string;
  year: number;
  authors: string[];
  countries: string[];
}

export interface CollaborationData {
  countries: MapCountry[];
  collaborations: Collaboration[];
  publications: MapPublication[];
  totals: {
    included: number;
    mapped: number;
    countries: number;
    internationalPublications: number;
    collaborations: number;
  };
}

export type MapSelection = { kind: 'country'; id: string } | { kind: 'collaboration'; id: string } | null;

export function selectedPublications(data: CollaborationData, selection: MapSelection, query = ''): MapPublication[] {
  if (!selection) return [];
  const record = selection.kind === 'country'
    ? data.countries.find((item) => item.id === selection.id)
    : data.collaborations.find((item) => item.id === selection.id);
  const keys = new Set(record?.publicationKeys ?? []);
  const needle = query.trim().toLocaleLowerCase('en');
  return data.publications.filter((item) => keys.has(item.citationKey) && (!needle ||
    [item.title, item.year, ...item.authors].join(' ').toLocaleLowerCase('en').includes(needle)))
    .sort((a, b) => b.year - a.year || a.title.localeCompare(b.title, 'en'));
}

export function countryPartners(data: CollaborationData, countryId: string): Collaboration[] {
  return data.collaborations.filter((item) => item.countryA === countryId || item.countryB === countryId)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function selectionFromParams(data: CollaborationData, params: URLSearchParams): MapSelection {
  const pair = params.get('collaboration');
  if (pair && data.collaborations.some((item) => item.id === pair)) return { kind: 'collaboration', id: pair };
  const country = params.get('country');
  if (country && data.countries.some((item) => item.id === country)) return { kind: 'country', id: country };
  return null;
}

export function linkIsVisible(link: Collaboration, selection: MapSelection, minimum: number, enabled: boolean): boolean {
  if (!enabled) return false;
  // Keep the selected collaboration visible when its count is below the overview filter.
  if (selection?.kind === 'collaboration') return link.id === selection.id;
  return link.count >= minimum && (!selection || link.countryA === selection.id || link.countryB === selection.id);
}
