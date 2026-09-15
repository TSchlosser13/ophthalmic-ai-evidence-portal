from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from audit_public_output import (  # noqa: E402
    ALLOWED_PUBLIC_PDF_PATHS,
    find_forbidden_keys,
    is_allowed_collection_descriptor,
)


ARTICLE_INDEX_FIELDS = {
    "citationKey",
    "slug",
    "title",
    "authors",
    "year",
    "venue",
    "doi",
    "articleType",
    "overallReasoning",
    "contributionSummary",
    "ophthalmicConditions",
    "modalities",
    "aiMethods",
    "clinicalTasks",
    "datasets",
    "countries",
    "validationTypes",
    "generalEvidenceAssignments",
    "ethicsEvidenceAssignments",
}

ARTICLE_EXPORT_FIELDS = {
    "id",
    "slug",
    "citationKey",
    "title",
    "authors",
    "year",
    "venue",
    "doi",
    "pmid",
    "openAlexId",
    "url",
    "articleType",
    "ophthalmicConditions",
    "modalities",
    "aiMethods",
    "aiRoles",
    "clinicalTasks",
    "datasets",
    "countries",
    "validationTypes",
    "externalOrMulticenterValidation",
    "dataChallenges",
    "implementationBarriers",
    "generalEvidenceAssignments",
    "ethicsEvidenceAssignments",
    "contributionSummary",
    "overallReasoning",
    "citationText",
}

GENERATED_ARTICLE_FIELDS = ARTICLE_EXPORT_FIELDS | {"references", "bibtex"}

DATASET_FIELDS = {
    "id",
    "slug",
    "name",
    "aliases",
    "area",
    "modality",
    "scale",
    "typicalTasks",
    "resourceUrl",
    "licence",
    "originalPublicationKeys",
    "articleCount",
    "linkedArticles",
    "originalPublications",
}

REVIEW_METADATA_FIELDS = {
    "title",
    "shortTitle",
    "abstract",
    "keywords",
    "journal",
    "status",
    "authors",
    "affiliations",
    "statistics",
    "progression",
    "scopeStatement",
    "evidenceMapCaution",
}

REVIEW_STATISTIC_FIELDS = {
    "includedStudies",
    "generalEvidenceAssignments",
    "ethicsEvidenceAssignments",
}

VISUALIZATION_FIELDS = {
    "publicationTimeline",
    "publicationTimelineByClinicalTarget",
    "publicationTimelineByMethod",
    "publicationTimelineByTask",
    "taskClinicalTargetHeatmap",
    "methodTaskHeatmap",
    "generalEvidence",
    "ethicsEvidence",
    "conditions",
    "tasks",
    "modalities",
    "methods",
    "validation",
    "implementationContext",
    "datasets",
}

ASSIGNMENT_FIELDS = {"citationKey", "dimension", "stance", "kind"}

REMOVED_PUBLIC_PATHS = (
    "src/data/generated/validation-report.json",
    "src/data/generated/build-metadata.json",
    "src/data/generated/route-manifest.json",
    "public/data/review-metadata.json",
    "public/data/visualizations.json",
    "public/downloads/data-provenance.json",
    "public/downloads/egm-audit-validation.json",
    "public/downloads/validation-report.json",
    "public/downloads/validation-report.md",
    "public/downloads/build-metadata.json",
    "public/downloads/main-manuscript.pdf",
    "public/downloads/supplementary-material.pdf",
    "public/downloads/visualization-prisma.csv",
    "public/downloads/visualization-publicationtimelinebyclinicaltarget.csv",
    "public/downloads/visualization-publicationtimelinebymethod.csv",
    "public/downloads/visualization-publicationtimelinebytask.csv",
)


def load_json(relative_path: str) -> Any:
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


class PublicSchemaTests(unittest.TestCase):
    def assert_record_fields(self, records: list[dict[str, Any]], expected: set[str], label: str) -> None:
        self.assertTrue(records, f"{label} must not be empty")
        for index, record in enumerate(records):
            self.assertEqual(set(record), expected, f"{label}[{index}] has an unexpected public schema")

    def test_generated_article_schema_is_strictly_public(self) -> None:
        records = load_json("src/data/generated/articles.json")
        self.assertEqual(len(records), 427)
        self.assert_record_fields(records, GENERATED_ARTICLE_FIELDS, "generated articles")

    def test_browser_article_index_has_exact_allowlist(self) -> None:
        records = load_json("public/data/articles-index.json")
        self.assertEqual(len(records), 427)
        self.assert_record_fields(records, ARTICLE_INDEX_FIELDS, "article index")

    def test_downloadable_articles_have_exact_allowlist(self) -> None:
        records = load_json("public/downloads/articles.json")
        self.assertEqual(len(records), 427)
        self.assert_record_fields(records, ARTICLE_EXPORT_FIELDS, "downloadable articles")

    def test_dataset_payloads_have_exact_allowlist(self) -> None:
        for relative_path in (
            "src/data/generated/datasets.json",
            "public/downloads/datasets.json",
        ):
            records = load_json(relative_path)
            self.assertEqual(len(records), 20)
            self.assert_record_fields(records, DATASET_FIELDS, relative_path)

    def test_review_metadata_has_only_public_summary_fields(self) -> None:
        relative_path = "src/data/generated/review-metadata.json"
        metadata = load_json(relative_path)
        self.assertEqual(set(metadata), REVIEW_METADATA_FIELDS, relative_path)
        self.assertEqual(set(metadata["statistics"]), REVIEW_STATISTIC_FIELDS, f"{relative_path}.statistics")

    def test_visualization_payload_omits_study_flow(self) -> None:
        for relative_path in (
            "src/data/generated/visualizations.json",
            "public/downloads/visualizations.json",
        ):
            visualizations = load_json(relative_path)
            self.assertEqual(set(visualizations), VISUALIZATION_FIELDS, relative_path)
            self.assertNotIn("prisma", visualizations)

    def test_assignment_exports_have_exact_allowlist(self) -> None:
        for relative_path in (
            "public/downloads/general-evidence-assignments.json",
            "public/downloads/ethics-evidence-assignments.json",
        ):
            records = load_json(relative_path)
            self.assert_record_fields(records, ASSIGNMENT_FIELDS, relative_path)

    def test_internal_reports_and_retired_public_paths_are_not_public(self) -> None:
        for relative_path in REMOVED_PUBLIC_PATHS:
            self.assertFalse((ROOT / relative_path).exists(), f"Forbidden public artifact still exists: {relative_path}")

    def test_only_intended_review_documents_are_public(self) -> None:
        actual_pdf_paths = {
            path.relative_to(ROOT)
            for path in (ROOT / "public").rglob("*")
            if path.is_file() and path.suffix.casefold() == ".pdf"
        }
        self.assertEqual(actual_pdf_paths, ALLOWED_PUBLIC_PDF_PATHS)

        for relative_path in sorted(ALLOWED_PUBLIC_PDF_PATHS, key=lambda path: path.as_posix()):
            with self.subTest(path=relative_path.as_posix()):
                path = ROOT / relative_path
                self.assertTrue(path.is_file())
                self.assertGreater(path.stat().st_size, 5)
                with path.open("rb") as handle:
                    self.assertEqual(handle.read(5), b"%PDF-")

    def test_all_generated_public_json_is_free_of_forbidden_keys(self) -> None:
        roots = (
            ROOT / "src" / "data" / "generated",
            ROOT / "public" / "data",
            ROOT / "public" / "downloads",
        )
        for directory in roots:
            for path in sorted(directory.glob("*.json")):
                with self.subTest(path=path.relative_to(ROOT).as_posix()):
                    value = json.loads(path.read_text(encoding="utf-8"))
                    self.assertEqual(find_forbidden_keys(value), [], path.relative_to(ROOT).as_posix())

    def test_forbidden_key_detector_rejects_nested_poison_fields(self) -> None:
        poisoned = {
            "safe": [
                {"sourcePath": "private/paper.pdf"},
                {"nested": {"fullTextAvailable": True}},
                {"audit": {"final_confidence": "high"}},
            ]
        }
        findings = find_forbidden_keys(poisoned)
        joined = "\n".join(findings)
        self.assertIn("sourcePath", joined)
        self.assertIn("fullTextAvailable", joined)
        self.assertIn("final_confidence", joined)
        self.assertEqual(find_forbidden_keys({"title": "Safe", "validationTypes": ["External validation"]}), [])

    def test_public_collection_descriptors_are_limited_to_home(self) -> None:
        label = "collection or retrieval detail"
        for relative_path in (Path("dist/index.html"),):
            for phrase in ("Harmonized records", "Four bibliographic databases", "Search cutoff"):
                self.assertTrue(is_allowed_collection_descriptor(relative_path, label, phrase))
        self.assertFalse(is_allowed_collection_descriptor(Path("dist/publications/index.html"), label, "Search cutoff"))
        self.assertFalse(
            is_allowed_collection_descriptor(
                Path("dist/README.md"),
                label,
                "Search and screening statistics",
            )
        )


if __name__ == "__main__":
    unittest.main()
