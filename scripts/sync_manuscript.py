"""Refresh the standalone portal snapshot from a revised local manuscript.

This is an explicit maintenance command, not a build prerequisite. GitHub Pages
builds validate the checked-in public snapshot without access to the manuscript.
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import re
from pathlib import Path

from audit_public_output import ARTICLE_EXPORT_FIELDS, ARTICLE_INDEX_FIELDS
from manuscript_bibliography import build_records, latex_to_plain
from validate_data import GENERAL_DIMENSIONS, ETHICS_DIMENSIONS

ROOT = Path(__file__).resolve().parents[1]
KEY_ALIASES = {
    'perdomo2019classification': 'a610a9d426b3',
    'subramanian2022classification': '925beb945b38',
    'schlegl2018fluid': 'cfc9b29316ca',
    'Kumar2023_Bioengineering_Corpus': 'ad6ea1627565',
    'figshare2023retinal': 'fu2023retinal',
    'kaggle2015diabetic': 'dugas2015diabetic',
    'ma2024rose': 'imed2021rose',
    'sainaren2021retinal': 'naren2021retinal',
    'yang2023medmnistdataset': 'yang2024medmnistdataset',
    'zenodo2022faros': 'zhongshan2022faros',
}
RETRACTED_KEYS = {'aaf83180b688', '175fe9b54084', 'd1c34bb65deb', '391d2af4c04b'}
STANCE = {'Positive framing': 'positive', 'Negative framing': 'negative', 'Balanced': 'balanced',
          'Caused': 'caused', 'Resolved': 'resolved', 'Caused and resolved': 'both'}


def load(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write_changed(path, text):
    if not path.exists() or path.read_text(encoding='utf-8') != text:
        path.parent.mkdir(parents=True, exist_ok=True)
        newline = '\r\n' if path.exists() and b'\r\n' in path.read_bytes() else '\n'
        path.write_text(text, encoding='utf-8', newline=newline)


def write_json(path, value):
    write_changed(path, json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def write_csv(path, rows, fields=None):
    if fields is None:
        with path.open(encoding='utf-8-sig', newline='') as stream:
            fields = next(csv.reader(stream))
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        writer.writerow({field: json.dumps(row.get(field), ensure_ascii=False)
                        if isinstance(row.get(field), (dict, list)) else row.get(field) for field in fields})
    write_changed(path, output.getvalue())


def migrate_keys(value, field=''):
    # Publication IDs and slugs remain stable so existing links keep working.
    if isinstance(value, str):
        return value if field in {'id', 'slug'} else KEY_ALIASES.get(value, value)
    if isinstance(value, list):
        return [migrate_keys(item, field) for item in value]
    if isinstance(value, dict):
        return {key: migrate_keys(item, key) for key, item in value.items()}
    return value


def publication_rows(manuscript):
    rows = {}
    for line in (manuscript / 'supplementary/publications.tex').read_text('utf-8').splitlines():
        match = re.match(r'\s*\\cite\{([^}]+)\}:', line)
        if not match:
            continue
        columns = re.split(r'(?<!\\)&', line)
        if len(columns) != 4:
            raise ValueError(f'Unexpected publication table row: {match[1]}')
        key = match[1]
        if key in rows:
            raise ValueError(f'Duplicate publication table key: {key}')
        rows[key] = {'overallReasoning': latex_to_plain(columns[2].strip()),
                     'contributionSummary': latex_to_plain(columns[3].strip().removesuffix('\\\\').strip())}
    if len(rows) != 427:
        raise ValueError('The canonical publication table must contain 427 records')
    return rows


def evidence_assignments(manuscript, keys):
    results = {key: {'general': [], 'ethics': []} for key in keys}
    dimension = None
    seen_lists = set()
    for line in (manuscript / 'supplementary/EGM.tex').read_text('utf-8').splitlines():
        header = re.search(r'\\multicolumn\{2\}\{l\}\{\\textbf\{([^}]+)\}', line)
        if header:
            dimension = header[1].replace('standardisation', 'standardization')
        row = re.match(r'\s*(Positive framing|Negative framing|Balanced|Caused and resolved|Caused|Resolved) & (.*?)\\\\', line)
        if not row:
            continue
        if dimension not in (*GENERAL_DIMENSIONS, *ETHICS_DIMENSIONS):
            raise ValueError(f'Unknown EGM dimension: {dimension}')
        kind = 'general' if dimension in GENERAL_DIMENSIONS else 'ethics'
        stance = STANCE[row[1]]
        allowed = {'positive', 'negative', 'balanced'} if kind == 'general' else {'caused', 'resolved', 'both'}
        if stance not in allowed or (dimension, stance) in seen_lists:
            raise ValueError(f'Duplicate or invalid EGM list: {dimension} / {stance}')
        seen_lists.add((dimension, stance))
        citation = re.search(r'\\cite\{([^}]+)\}', row[2])
        for key in citation[1].split(',') if citation else []:
            key = key.strip()
            if key not in results:
                raise ValueError(f'Unknown EGM publication: {key}')
            if any(item['dimension'] == dimension for item in results[key][kind]):
                raise ValueError(f'Conflicting EGM stances for {key} / {dimension}')
            results[key][kind].append({'dimension': dimension, 'stance': STANCE[row[1]]})
    expected_lists = {(dimension, stance) for dimensions, stances in
                      [(GENERAL_DIMENSIONS, ('positive', 'negative', 'balanced')),
                       (ETHICS_DIMENSIONS, ('caused', 'resolved', 'both'))]
                      for dimension in dimensions for stance in stances}
    if seen_lists != expected_lists:
        raise ValueError(f'Expected all 54 dimension/stance lists, got {len(seen_lists)}')
    for key in RETRACTED_KEYS:
        if any(results[key].values()):
            raise ValueError(f'Retracted publication has EGM assignments: {key}')
    return results


def read_numeric_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        return [{field: int(value) if re.fullmatch(r'-?\d+', value) else value
                 for field, value in row.items()} for row in csv.DictReader(stream)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manuscript-root', type=Path, required=True)
    args = parser.parse_args()
    manuscript = args.manuscript_root.resolve()
    generated = ROOT / 'src/data/generated'
    downloads = ROOT / 'public/downloads'
    records, included = build_records(manuscript)
    summaries = publication_rows(manuscript)
    assignments = evidence_assignments(manuscript, summaries)
    articles = migrate_keys(load(generated / 'articles.json'))
    if {article['citationKey'] for article in articles} != set(summaries):
        raise ValueError('Website and manuscript corpora differ')
    for article in articles:
        key = article['citationKey']
        record = records[key]
        for field in ('authors', 'citationText', 'bibtex'):
            article[field] = record[field]
        article.update(summaries[key])
        for kind in ('general', 'ethics'):
            article[f'{kind}EvidenceAssignments'] = assignments[key][kind]
    write_json(generated / 'articles.json', articles)
    for relative, fields in [('public/data/articles-index.json', ARTICLE_INDEX_FIELDS),
                             ('public/downloads/articles.json', ARTICLE_EXPORT_FIELDS)]:
        old_fields = list(load(ROOT / relative)[0])
        assert set(old_fields) == fields
        write_json(ROOT / relative, [{field: article[field] for field in old_fields} for article in articles])
    write_csv(downloads / 'articles.csv', articles)

    for kind in ('general', 'ethics'):
        rows = sorted([{'citationKey': article['citationKey'], **row, 'kind': kind}
                       for article in articles for row in article[f'{kind}EvidenceAssignments']],
                      key=lambda row: ((GENERAL_DIMENSIONS if kind == 'general' else ETHICS_DIMENSIONS).index(row['dimension']),
                                       (('positive', 'negative', 'balanced') if kind == 'general' else ('caused', 'resolved', 'both')).index(row['stance']),
                                       row['citationKey']))
        write_json(downloads / f'{kind}-evidence-assignments.json', rows)
        write_csv(downloads / f'{kind}-evidence-assignments.csv', rows)

    datasets = migrate_keys(load(generated / 'datasets.json'))
    write_json(generated / 'datasets.json', datasets)
    write_json(downloads / 'datasets.json', datasets)
    write_csv(downloads / 'datasets.csv', datasets)

    metadata = load(generated / 'review-metadata.json')
    metadata['statistics'] = {'includedStudies': len(articles), **{
        f'{kind}EvidenceAssignments': sum(len(article[f'{kind}EvidenceAssignments']) for article in articles)
        for kind in ('general', 'ethics')}}
    write_json(generated / 'review-metadata.json', metadata)

    visualizations = migrate_keys(load(generated / 'visualizations.json'))
    source_csvs = {
        'publicationTimeline': 'annual_publication_counts_by_document_type.csv',
        'publicationTimelineByClinicalTarget': 'annual_publication_counts_by_clinical_target.csv',
        'publicationTimelineByMethod': 'annual_publication_counts_by_method_family.csv',
        'publicationTimelineByTask': 'annual_publication_counts_by_task_family.csv',
        'taskClinicalTargetHeatmap': 'task_family_clinical_target_heatmap_cells.csv',
        'methodTaskHeatmap': 'method_family_task_family_heatmap_cells.csv',
    }
    for name, filename in source_csvs.items():
        visualizations[name] = read_numeric_csv(manuscript / 'data' / filename)
    for kind in ('general', 'ethics'):
        for dimension in visualizations[f'{kind}Evidence']:
            for segment in dimension['segments']:
                segment['articleKeys'] = sorted(article['citationKey'] for article in articles
                    if {'dimension': dimension['dimension'], 'stance': segment['stance']} in article[f'{kind}EvidenceAssignments'])
                segment['count'] = len(segment['articleKeys'])
            dimension['articleCount'] = sum(segment['count'] for segment in dimension['segments'])
    write_json(generated / 'visualizations.json', visualizations)
    write_json(downloads / 'visualizations.json', visualizations)
    for name, rows in visualizations.items():
        path = downloads / f'visualization-{name.lower()}.csv'
        if not path.exists():
            continue
        if name in {'generalEvidence', 'ethicsEvidence'}:
            rows = [{'dimension': row['dimension'], 'articleCount': row['articleCount'], **segment}
                    for row in rows for segment in row['segments']]
        write_csv(path, rows)

    supplement = migrate_keys(load(generated / 'supplement.json'))
    for reference in supplement['references']:
        reference['authors'] = records[reference['citationKey']]['authors']
    write_json(generated / 'supplement.json', supplement)
    write_changed(downloads / 'included-studies.bib', '\n\n'.join(entry['bibtex'] for entry in included) + '\n')
    print(json.dumps(metadata['statistics'], indent=2))


if __name__ == '__main__':
    main()
