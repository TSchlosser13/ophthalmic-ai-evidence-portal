"""Build the geographical map and exports from the portal's publication affiliations."""
from __future__ import annotations

import csv
import io
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write_changed(path: Path, content: str) -> None:
    if path.exists() and path.read_text(encoding='utf-8') == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8', newline='\n')


def csv_text(rows: list[dict], fields: list[str]) -> str:
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        writer.writerow({key: json.dumps(row[key], ensure_ascii=False) if isinstance(row[key], list) else row[key] for key in fields})
    return output.getvalue()


def build_data(articles: list[dict], locations: list[dict]) -> dict:
    by_name = {country['name']: country for country in locations}
    country_keys = {country['id']: set() for country in locations}
    pairs: dict[tuple[str, str], set[str]] = {}
    publications = []
    assert len({article['citationKey'] for article in articles}) == len(articles)
    for article in articles:
        unknown = set(article['countries']) - set(by_name)
        if unknown:
            raise ValueError(f"Missing geographical location for {sorted(unknown)}")
        ids = sorted({by_name[name]['id'] for name in article['countries']})
        key = article['citationKey']
        for country_id in ids:
            country_keys[country_id].add(key)
        for pair in itertools.combinations(ids, 2):
            pairs.setdefault(pair, set()).add(key)
        publications.append({field: article[field] for field in ['citationKey', 'slug', 'title', 'year', 'authors']} | {'countries': ids})
    countries = [{**country, 'count': len(country_keys[country['id']]), 'publicationKeys': sorted(country_keys[country['id']])}
                 for country in locations if country_keys[country['id']]]
    collaborations = [{'id': '--'.join(pair), 'countryA': pair[0], 'countryB': pair[1], 'count': len(keys), 'publicationKeys': sorted(keys)}
                      for pair, keys in sorted(pairs.items())]
    return {'countries': countries, 'collaborations': collaborations, 'publications': publications,
            'totals': {'included': len(articles), 'mapped': sum(bool(p['countries']) for p in publications),
                       'countries': len(countries), 'internationalPublications': sum(len(p['countries']) > 1 for p in publications),
                       'collaborations': len(collaborations)}}


def main() -> None:
    articles = json.loads((ROOT / 'src/data/generated/articles.json').read_text(encoding='utf-8'))
    locations = json.loads((ROOT / 'src/data/geography/country-locations.json').read_text(encoding='utf-8'))
    data = build_data(articles, locations)
    write_changed(ROOT / 'src/data/generated/collaboration.json', json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    countries = data['countries']
    names = {country['id']: country['name'] for country in countries}
    links = [{**pair, 'countryAName': names[pair['countryA']], 'countryBName': names[pair['countryB']]} for pair in data['collaborations']]
    write_changed(ROOT / 'public/downloads/collaboration-countries.csv', csv_text(countries, ['id', 'name', 'count', 'publicationKeys']))
    write_changed(ROOT / 'public/downloads/collaboration-links.csv', csv_text(links, ['countryA', 'countryAName', 'countryB', 'countryBName', 'count', 'publicationKeys']))
    print(f"Geography ready: {data['totals']['mapped']} publications, {len(countries)} countries and territories, {len(links)} collaborations.")


if __name__ == '__main__':
    main()
