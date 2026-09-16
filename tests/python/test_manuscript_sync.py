from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))

import sync_manuscript  # noqa: E402
from manuscript_bibliography import citation_record, parse_bibtex  # noqa: E402
from validate_data import ETHICS_DIMENSIONS, GENERAL_DIMENSIONS  # noqa: E402


class ManuscriptParsingTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.manuscript = Path(temporary.name)
        (self.manuscript / 'supplementary').mkdir()
        self.keys = {'gp', 'gn', 'gb', 'ec', 'er', 'eb'} | sync_manuscript.RETRACTED_KEYS
        self.lines = []
        for dimensions, labels, keys in [
            (GENERAL_DIMENSIONS, ['Positive framing', 'Negative framing', 'Balanced'], ['gp', 'gn', 'gb']),
            (ETHICS_DIMENSIONS, ['Caused', 'Resolved', 'Caused and resolved'], ['ec', 'er', 'eb']),
        ]:
            for dimension in dimensions:
                published_dimension = dimension.replace('standardization', 'standardisation')
                self.lines.append(r'\multicolumn{2}{l}{\textbf{' + published_dimension + r'}} \\')
                self.lines.extend(label + r' & \cite{' + key + r'} \\' for label, key in zip(labels, keys))

    def parse(self, lines=None):
        (self.manuscript / 'supplementary/EGM.tex').write_text('\n'.join(self.lines if lines is None else lines), encoding='utf-8')
        return sync_manuscript.evidence_assignments(self.manuscript, self.keys)

    def test_all_eighteen_dimensions_and_six_stance_labels_are_read(self) -> None:
        result = self.parse()
        for key, kind, stance, dimensions in [
            ('gp', 'general', 'positive', GENERAL_DIMENSIONS),
            ('gn', 'general', 'negative', GENERAL_DIMENSIONS),
            ('gb', 'general', 'balanced', GENERAL_DIMENSIONS),
            ('ec', 'ethics', 'caused', ETHICS_DIMENSIONS),
            ('er', 'ethics', 'resolved', ETHICS_DIMENSIONS),
            ('eb', 'ethics', 'both', ETHICS_DIMENSIONS),
        ]:
            with self.subTest(key=key):
                self.assertEqual(result[key][kind], [{'dimension': dimension, 'stance': stance} for dimension in dimensions])
                self.assertEqual(sum(map(len, result[key].values())), 9)
        for key in sync_manuscript.RETRACTED_KEYS:
            self.assertEqual(result[key], {'general': [], 'ethics': []})

    def test_duplicate_empty_list_cannot_hide_a_missing_stance(self) -> None:
        lines = list(self.lines)
        lines[3] = r'Negative framing & --- \\'
        with self.assertRaises(ValueError):
            self.parse(lines)

    def test_wrong_stance_family_is_rejected(self) -> None:
        lines = list(self.lines)
        lines[37] = r'Positive framing & \cite{ec} \\'
        with self.assertRaises(ValueError):
            self.parse(lines)

    def test_unknown_publication_and_retracted_assignment_are_rejected(self) -> None:
        for key in ['unknown-publication', *sorted(sync_manuscript.RETRACTED_KEYS)]:
            with self.subTest(key=key):
                lines = list(self.lines)
                lines[1] = r'Positive framing & \cite{' + key + r'} \\'
                with self.assertRaises(ValueError):
                    self.parse(lines)

    def test_publication_summaries_keep_escaped_ampersands_and_decode_tex(self) -> None:
        rows = [rf'\cite{{study{i:03}}}: Title & 2024 & Included \& evaluated. & Assessed \textbf{{performance}}. \\' for i in range(427)]
        (self.manuscript / 'supplementary/publications.tex').write_text('\n'.join(rows), encoding='utf-8')
        result = sync_manuscript.publication_rows(self.manuscript)
        self.assertEqual(len(result), 427)
        self.assertEqual(result['study000'], {'overallReasoning': 'Included & evaluated.', 'contributionSummary': 'Assessed performance.'})

    def test_migration_preserves_ids_slugs_and_does_not_change_free_text(self) -> None:
        temporary, restored = 'perdomo2019classification', 'a610a9d426b3'
        original = {'id': restored, 'slug': restored, 'citationKey': temporary, 'articleKeys': [temporary],
                    'linkedArticles': [{'citationKey': temporary, 'slug': restored}], 'summary': f'Record {temporary} discussed here.'}
        result = sync_manuscript.migrate_keys(original)
        self.assertEqual(result, {'id': restored, 'slug': restored, 'citationKey': restored, 'articleKeys': [restored],
                                 'linkedArticles': [{'citationKey': restored, 'slug': restored}], 'summary': original['summary']})
        self.assertEqual(original['citationKey'], temporary)
        self.assertEqual(sync_manuscript.migrate_keys(result), result)


class RevisedSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.articles = json.loads((ROOT / 'src/data/generated/articles.json').read_text(encoding='utf-8'))
        cls.by_key = {article['citationKey']: article for article in cls.articles}

    def assert_csv_projection(self, csv_path: Path, records: list[dict]) -> None:
        with csv_path.open(encoding='utf-8-sig', newline='') as stream:
            reader = csv.DictReader(stream)
            rows = list(reader)
            fields = reader.fieldnames
        self.assertEqual(len(rows), len(records), csv_path.name)
        self.assertTrue(fields, csv_path.name)
        for index, (row, record) in enumerate(zip(rows, records)):
            for field in fields:
                with self.subTest(file=csv_path.name, row=index, field=field):
                    self.assertIn(field, record)
                    expected = record[field]
                    actual = row[field]
                    if isinstance(expected, (list, dict)):
                        self.assertEqual(json.loads(actual), expected)
                    elif expected is None:
                        self.assertEqual(actual, '')
                    elif isinstance(expected, bool):
                        self.assertEqual(actual.lower(), str(expected).lower())
                    elif isinstance(expected, (int, float)):
                        self.assertEqual(float(actual), expected)
                    else:
                        self.assertEqual(actual, expected)

    def test_csv_downloads_match_all_corresponding_json_fields(self) -> None:
        for name in ['articles', 'datasets', 'general-evidence-assignments', 'ethics-evidence-assignments']:
            downloads = ROOT / 'public/downloads'
            records = json.loads((downloads / f'{name}.json').read_text(encoding='utf-8'))
            self.assert_csv_projection(downloads / f'{name}.csv', records)

    def test_egm_and_annual_chart_csvs_match_the_visualization_snapshot(self) -> None:
        values = json.loads((ROOT / 'src/data/generated/visualizations.json').read_text(encoding='utf-8'))
        for name in ['generalEvidence', 'ethicsEvidence', 'publicationTimeline']:
            rows = values[name]
            if name.endswith('Evidence'):
                rows = [{'dimension': row['dimension'], 'articleCount': row['articleCount'], **segment}
                        for row in rows for segment in row['segments']]
            self.assert_csv_projection(ROOT / f'public/downloads/visualization-{name.lower()}.csv', rows)
        for name in ['publicationTimeline', 'publicationTimelineByClinicalTarget', 'publicationTimelineByMethod', 'publicationTimelineByTask']:
            self.assertEqual(sum(row['Total'] for row in values[name]), 427, name)
            self.assertEqual(next(row['Total'] for row in values[name] if row['year'] == 2024), 74, name)

    def test_retracted_publications_remain_in_corpus_without_assignments(self) -> None:
        for key in sync_manuscript.RETRACTED_KEYS:
            with self.subTest(key=key):
                self.assertIn(key, self.by_key)
                self.assertEqual(self.by_key[key]['generalEvidenceAssignments'], [])
                self.assertEqual(self.by_key[key]['ethicsEvidenceAssignments'], [])

    def test_restored_publication_keys_preserve_established_urls(self) -> None:
        for temporary, restored in {
            'perdomo2019classification': 'a610a9d426b3',
            'subramanian2022classification': '925beb945b38',
            'schlegl2018fluid': 'cfc9b29316ca',
            'Kumar2023_Bioengineering_Corpus': 'ad6ea1627565',
        }.items():
            with self.subTest(key=restored):
                self.assertNotIn(temporary, self.by_key)
                self.assertEqual(self.by_key[restored]['id'], restored)
                self.assertEqual(self.by_key[restored]['slug'], restored)

    def test_downloadable_bibtex_matches_publication_authors_and_citations(self) -> None:
        entries = parse_bibtex((ROOT / 'public/downloads/included-studies.bib').read_text(encoding='utf-8'))
        self.assertEqual(len(entries), 427)
        self.assertEqual({entry['key'] for entry in entries}, set(self.by_key))
        for entry in entries:
            with self.subTest(key=entry['key']):
                record = citation_record(entry)
                article = self.by_key[entry['key']]
                self.assertEqual(article['authors'], record['authors'])
                self.assertEqual(article['citationText'], record['citationText'])
                self.assertEqual(article['bibtex'], record['bibtex'])


if __name__ == '__main__':
    unittest.main()
