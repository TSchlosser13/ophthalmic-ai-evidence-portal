from __future__ import annotations

import contextlib
import io
import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_data  # noqa: E402


SNAPSHOT_PATHS = (
    "src/data/generated/articles.json",
    "src/data/generated/datasets.json",
    "src/data/generated/review-metadata.json",
    "src/data/generated/visualizations.json",
    "public/data/articles-index.json",
    "public/downloads/articles.json",
    "public/downloads/datasets.json",
    "public/downloads/general-evidence-assignments.json",
    "public/downloads/ethics-evidence-assignments.json",
    "public/downloads/visualizations.json",
)


class BuildInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "site"
        for relative in SNAPSHOT_PATHS:
            target = self.root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / relative, target)

    def read(self, relative: str):
        return json.loads((self.root / relative).read_text(encoding="utf-8"))

    def write(self, relative: str, value) -> None:
        (self.root / relative).write_text(json.dumps(value), encoding="utf-8")

    def test_standalone_build_checks_snapshot_and_preserves_all_bytes(self) -> None:
        before = {relative: (self.root / relative).read_bytes() for relative in SNAPSHOT_PATHS}
        output = io.StringIO()
        with patch.object(validate_data, "ROOT", self.root), contextlib.redirect_stdout(output):
            validate_data.main()
        self.assertIn("Stored evidence snapshot checked", output.getvalue())
        self.assertIn("427 articles, 1314 general EGM assignments, 345 ethics EGM assignments", output.getvalue())
        self.assertEqual(before, {relative: (self.root / relative).read_bytes() for relative in SNAPSHOT_PATHS})
        self.assertFalse((self.root / ".cache").exists())

    def test_invalid_metadata_affiliations_are_rejected(self) -> None:
        metadata = self.read("src/data/generated/review-metadata.json")
        metadata["authors"][0]["affiliationIds"] = ["missing"]
        self.write("src/data/generated/review-metadata.json", metadata)
        with self.assertRaisesRegex(ValueError, "undefined affiliations"):
            validate_data.validate_snapshot(self.root)

    def test_publication_count_uses_independent_inclusion_total(self) -> None:
        articles = self.read("src/data/generated/articles.json")
        self.write("src/data/generated/articles.json", articles[:-1])
        metadata = self.read("src/data/generated/review-metadata.json")
        metadata["statistics"]["includedStudies"] = len(articles) - 1
        self.write("src/data/generated/review-metadata.json", metadata)
        with self.assertRaisesRegex(ValueError, "427 publications"):
            validate_data.validate_snapshot(self.root)

    def test_duplicate_publication_identifiers_are_rejected(self) -> None:
        articles = self.read("src/data/generated/articles.json")
        articles[1]["citationKey"] = articles[0]["citationKey"]
        self.write("src/data/generated/articles.json", articles)
        with self.assertRaisesRegex(ValueError, "duplicate identifiers"):
            validate_data.validate_snapshot(self.root)

    def test_nonpublic_schema_is_rejected(self) -> None:
        articles = self.read("src/data/generated/articles.json")
        articles[0]["sourceFile"] = "private-input.csv"
        self.write("src/data/generated/articles.json", articles)
        with self.assertRaisesRegex(ValueError, "schema is invalid"):
            validate_data.validate_snapshot(self.root)

    def test_assignment_export_drift_is_rejected(self) -> None:
        relative = "public/downloads/general-evidence-assignments.json"
        assignments = self.read(relative)
        assignments[0]["citationKey"] = "unknown-publication"
        self.write(relative, assignments)
        with self.assertRaisesRegex(ValueError, "assignment export disagrees"):
            validate_data.validate_snapshot(self.root)

    def test_chart_cannot_reference_unknown_publications(self) -> None:
        relative = "src/data/generated/visualizations.json"
        visualizations = self.read(relative)
        visualizations["generalEvidence"][0]["segments"][0]["articleKeys"][0] = "unknown-publication"
        self.write(relative, visualizations)
        with self.assertRaisesRegex(ValueError, "chart references an unknown publication"):
            validate_data.validate_snapshot(self.root)

    def test_chart_count_drift_is_rejected(self) -> None:
        relative = "src/data/generated/visualizations.json"
        visualizations = self.read(relative)
        visualizations["ethicsEvidence"][0]["segments"][0]["count"] += 1
        self.write(relative, visualizations)
        with self.assertRaisesRegex(ValueError, "inconsistent segment count"):
            validate_data.validate_snapshot(self.root)

    def test_summary_count_drift_is_rejected(self) -> None:
        metadata = self.read("src/data/generated/review-metadata.json")
        metadata["statistics"]["ethicsEvidenceAssignments"] += 1
        self.write("src/data/generated/review-metadata.json", metadata)
        with self.assertRaisesRegex(ValueError, "metadata evidence counts disagree"):
            validate_data.validate_snapshot(self.root)

    def test_invalid_snapshot_causes_nonzero_exit(self) -> None:
        articles = self.read("src/data/generated/articles.json")
        self.write("src/data/generated/articles.json", articles[:-1])
        output = io.StringIO()
        with patch.object(validate_data, "ROOT", self.root), \
                contextlib.redirect_stderr(output), self.assertRaises(SystemExit) as error:
            validate_data.main()
        self.assertEqual(error.exception.code, 1)
        self.assertIn("Stored evidence must contain 427 publications", output.getvalue())


if __name__ == "__main__":
    unittest.main()