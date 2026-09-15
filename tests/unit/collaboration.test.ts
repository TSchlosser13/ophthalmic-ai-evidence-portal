import { describe, expect, it } from 'vitest';
import data from '../../src/data/generated/collaboration.json';
import articles from '../../src/data/generated/articles.json';
import { countryPartners, linkIsVisible, selectedPublications, selectionFromParams } from '../../src/lib/collaboration';

describe('publication-linked geographical exploration', () => {
  it('opens the exact shared publications for China–United States, rather than either country', () => {
    const publications = selectedPublications(data, { kind: 'collaboration', id: 'CHN--USA' });
    expect(publications).toHaveLength(11);
    expect(publications.every((publication) => publication.countries.includes('CHN') && publication.countries.includes('USA'))).toBe(true);
    expect(new Set(publications.map((publication) => publication.citationKey)).size).toBe(11);
  });

  it('connects each map country and pair to the same publication memberships as the profile data', () => {
    const profiles = new Map(articles.map((article) => [article.citationKey, article]));
    const names = new Map(data.countries.map((country) => [country.id, country.name]));
    expect(data.publications.map((publication) => publication.citationKey).sort()).toEqual(articles.map((article) => article.citationKey).sort());
    for (const publication of data.publications) {
      const countries = [...profiles.get(publication.citationKey)!.countries].sort();
      expect(publication.countries.map((id) => names.get(id)).sort()).toEqual(countries);
    }
    for (const country of data.countries) {
      expect(selectedPublications(data, { kind: 'country', id: country.id }).map((publication) => publication.citationKey).sort()).toEqual(country.publicationKeys);
    }
    for (const pair of data.collaborations) {
      const expected = data.publications.filter((publication) => publication.countries.includes(pair.countryA) && publication.countries.includes(pair.countryB)).map((publication) => publication.citationKey).sort();
      expect(selectedPublications(data, { kind: 'collaboration', id: pair.id }).map((publication) => publication.citationKey).sort()).toEqual(expected);
      expect(pair.count).toBe(expected.length);
    }
  });

  it('excludes institution-name matches in mainland China from Hong Kong results', () => {
    const keys = selectedPublications(data, { kind: 'country', id: 'HKG' }).map((publication) => publication.citationKey);
    expect(keys).toHaveLength(5);
    expect(keys).not.toContain('642c3c0cd617');
    expect(keys).not.toContain('9e08b543a80f');
    expect(keys).toContain('0a91bafc9ed3');
  });

  it('does not turn author initials into United States affiliations', () => {
    const keys = selectedPublications(data, { kind: 'country', id: 'USA' }).map((publication) => publication.citationKey);
    expect(keys).toHaveLength(112);
    expect(keys).not.toContain('8a3e4d6925f4');
    expect(keys).not.toContain('a55c19870c66');
    expect(keys).toContain('62966ef9fdb8');
  });

  it('keeps publication search inside the active selection and handles empty results', () => {
    const selection = { kind: 'country' as const, id: 'USA' };
    const publication = selectedPublications(data, selection)[0]!;
    const results = selectedPublications(data, selection, publication.title.toUpperCase());
    expect(results.map((item) => item.citationKey)).toContain(publication.citationKey);
    expect(results.every((item) => item.countries.includes('USA'))).toBe(true);
    expect(selectedPublications(data, selection, 'not-a-real-publication-zzzz')).toEqual([]);
  });

  it('loads country and collaboration selections from shareable page URLs', () => {
    expect(selectionFromParams(data, new URLSearchParams('country=USA'))).toEqual({ kind: 'country', id: 'USA' });
    expect(selectionFromParams(data, new URLSearchParams('collaboration=CHN--USA'))).toEqual({ kind: 'collaboration', id: 'CHN--USA' });
    expect(selectionFromParams(data, new URLSearchParams('country=invalid'))).toBeNull();
    expect(selectedPublications(data, null)).toEqual([]);
  });

  it('filters the network without hiding a collaboration deliberately selected from the list', () => {
    const small = data.collaborations.find((pair) => pair.count === 1)!;
    expect(linkIsVisible(small, null, 2, true)).toBe(false);
    expect(linkIsVisible(small, { kind: 'collaboration', id: small.id }, 11, true)).toBe(true);
    expect(linkIsVisible(small, { kind: 'collaboration', id: small.id }, 1, false)).toBe(false);
    expect(linkIsVisible(small, { kind: 'country', id: 'not-an-endpoint' }, 1, true)).toBe(false);
  });

  it('shows only actual partners, ranked by shared publications', () => {
    const partners = countryPartners(data, 'USA');
    expect(partners.every((pair) => pair.countryA === 'USA' || pair.countryB === 'USA')).toBe(true);
    expect(partners[0]?.id).toBe('CHN--USA');
    expect(partners.every((pair, index) => index === 0 || pair.count <= partners[index - 1]!.count)).toBe(true);
  });
});
