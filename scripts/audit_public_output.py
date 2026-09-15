from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
GENERATED_DIR = ROOT / "src" / "data" / "generated"
PUBLIC_DIR = ROOT / "public"
PUBLIC_DATA_DIR = PUBLIC_DIR / "data"
DOWNLOADS_DIR = PUBLIC_DIR / "downloads"
DIST_DIR = ROOT / "dist"

ALLOWED_PUBLIC_PDF_PATHS = frozenset({
    Path("public/documents/main.pdf"),
    Path("public/documents/main_supplementary.pdf"),
})
ALLOWED_DIST_PDF_PATHS = frozenset(
    Path("dist") / path.relative_to("public")
    for path in ALLOWED_PUBLIC_PDF_PATHS
)
ALLOWED_PDF_PATHS = ALLOWED_PUBLIC_PDF_PATHS | ALLOWED_DIST_PDF_PATHS

PUBLIC_ARTICLE_FIELDS = {
    "id", "slug", "citationKey", "title", "authors", "year", "venue", "doi", "pmid", "openAlexId", "url",
    "articleType", "ophthalmicConditions", "modalities", "aiMethods", "aiRoles", "clinicalTasks", "datasets",
    "countries", "validationTypes", "externalOrMulticenterValidation", "dataChallenges", "implementationBarriers",
    "generalEvidenceAssignments", "ethicsEvidenceAssignments", "contributionSummary", "overallReasoning",
    "references", "bibtex", "citationText",
}

ARTICLE_INDEX_FIELDS = {
    "citationKey", "slug", "title", "authors", "year", "venue", "doi", "articleType", "overallReasoning",
    "contributionSummary", "ophthalmicConditions", "modalities", "aiMethods", "clinicalTasks", "datasets",
    "countries", "validationTypes", "generalEvidenceAssignments", "ethicsEvidenceAssignments",
}

ARTICLE_EXPORT_FIELDS = PUBLIC_ARTICLE_FIELDS - {"references", "bibtex"}

PUBLIC_DATASET_FIELDS = {
    "id", "slug", "name", "aliases", "area", "modality", "scale", "typicalTasks", "resourceUrl", "licence",
    "originalPublicationKeys", "articleCount", "linkedArticles", "originalPublications",
}

PUBLIC_REVIEW_METADATA_FIELDS = {
    "title", "shortTitle", "abstract", "keywords", "journal", "status", "authors", "affiliations", "statistics",
    "progression", "scopeStatement", "evidenceMapCaution",
}

PUBLIC_REVIEW_STATISTICS_FIELDS = {
    "includedStudies", "generalEvidenceAssignments", "ethicsEvidenceAssignments",
}

FORBIDDEN_NORMALIZED_KEYS = {
    "publicationmode", "metadatamatchmethod", "searchtext", "openaccessurl", "sourceline", "prisma",
    "prismaexclusions", "prismaexclusionnote", "harmonizedrecords", "databases", "searchstart", "searchend",
    "searchcutoff", "recordwithoutabstracts", "recordswithoutabstracts", "recordswithfulltextlocated",
    "recordswithpublicfulltextrendered", "sourceformatcounts", "sourcescopecounts", "publicationmodecounts",
    "matchingprecedence", "sourceselectionprecedence", "sha256", "inputhashes", "finalconfidence",
    "confidencecounts", "reconciliationrows", "reconciliationarticles",
}

FORBIDDEN_FILE_NAMES = {
    "data-provenance.json",
    "egm-audit-validation.json",
    "validation-report.json",
    "validation-report.md",
    "build-metadata.json",
    "visualization-prisma.csv",
}

TEXT_SUFFIXES = {
    ".bib", ".csv", ".css", ".html", ".js", ".json", ".md", ".svg", ".txt", ".webmanifest", ".xml",
}

FORBIDDEN_PHRASES = [
    ("abstract/full-text availability", re.compile(
        r"\babstract[-_ ]?only\b|\babstract (?:not )?available\b|\bfull[-_ ]?texts? "
        r"(?:located|source|available|rendered|assessed|assessment|review|exclusions?|status)\b|"
        r"\bfull text is not redistributed\b|\breadable full text\b|\bstatic full[- ]text index\b",
        re.IGNORECASE,
    )),
    ("source provenance or availability", re.compile(
        r"\bsource availability\b|\bsource and access\b|\bsource selection\b|\bdata provenance\b|"
        r"\bprovenance report\b|\blocal(?:ly)? available (?:evidence|source)\b|\blocal (?:full[- ]text|source)\b|"
        r"\bsource[- ](?:only|based|level|identity|inventory|representation|document|file|path|hash|metadata)\b",
        re.IGNORECASE,
    )),
    ("internal audit trail", re.compile(
        r"\bevidence (?:locator|excerpt)\b|\baudit[- ]source\b|\bsource[- ]level audit\b|\baudit trail\b|"
        r"\bpreceding (?:matrix|allocations?)\b|\bdecision matrix\b|\breconcil(?:e|ed|ing|iation)\b|"
        r"\bbelow high confidence\b|\bnon[- ]high[- ]confidence\b|\bhash[- ]carried\b|"
        r"\bdownload manifest\b|\bmerged extraction\b",
        re.IGNORECASE,
    )),
    ("internal path or hash", re.compile(
        r"\bsha256\b|manuscripts_v2_manual|current_source_[A-Za-z0-9_-]*decision_matrix|"
        r"_scripts[/\\]egm_audit|_scripts[/\\]data_all_merged",
        re.IGNORECASE,
    )),
    ("collection or retrieval detail", re.compile(
        r"\bharmonized records\b|\bfour bibliographic databases\b|\bsearch cutoff\b|"
        r"\bsearch strategy and selection criteria\b|\btitles? and abstracts?\b|"
        r"\breports? (?:were )?sought for retrieval\b|\bdatabase export(?: and harmonization)?\b|"
        r"\bsearch and screening statistics\b",
        re.IGNORECASE,
    )),
]

# These high-level review descriptors are intentionally displayed in the
# front-page statistics strip. Keep the exception
# path- and phrase-specific so collection and retrieval details remain blocked
# everywhere else.
PUBLIC_COLLECTION_DESCRIPTOR_PATHS = {
    Path("dist/index.html"),
}

ALLOWED_COLLECTION_DESCRIPTOR_PHRASES = {
    "harmonized records",
    "four bibliographic databases",
    "search cutoff",
}


def normalize_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.casefold())


def is_allowed_collection_descriptor(relative: Path, label: str, phrase: str) -> bool:
    return (
        relative in PUBLIC_COLLECTION_DESCRIPTOR_PATHS
        and label == "collection or retrieval detail"
        and phrase.casefold() in ALLOWED_COLLECTION_DESCRIPTOR_PHRASES
    )


def find_forbidden_keys(value: Any, path: str = "$") -> list[str]:
    """Return actionable JSON paths for public keys that may disclose private processing details."""
    findings: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            key_text = str(key)
            normalized = normalize_key(key_text)
            child_path = f"{path}.{key_text}"
            if (
                normalized in FORBIDDEN_NORMALIZED_KEYS
                or normalized.startswith("fulltext")
                or normalized.startswith("source")
            ):
                findings.append(f"{child_path}: forbidden key {key_text!r}")
            findings.extend(find_forbidden_keys(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            findings.extend(find_forbidden_keys(child, f"{path}[{index}]"))
    return findings


def load_json(path: Path, findings: list[str]) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        findings.append(f"{path}: invalid or unreadable JSON ({error})")
        return None


def audit_record_list(path: Path, expected: set[str], findings: list[str]) -> None:
    value = load_json(path, findings)
    if value is None:
        return
    if not isinstance(value, list):
        findings.append(f"{path}: expected a JSON array")
        return
    for index, record in enumerate(value):
        if not isinstance(record, dict):
            findings.append(f"{path}: $[{index}] is not an object")
            continue
        actual = set(record)
        if actual != expected:
            missing = sorted(expected - actual)
            extra = sorted(actual - expected)
            findings.append(f"{path}: $[{index}] schema mismatch; missing={missing}, extra={extra}")


def audit_object_schema(path: Path, expected: set[str], findings: list[str]) -> None:
    value = load_json(path, findings)
    if value is None:
        return
    if not isinstance(value, dict):
        findings.append(f"{path}: expected a JSON object")
        return
    actual = set(value)
    if actual != expected:
        findings.append(
            f"{path}: schema mismatch; missing={sorted(expected - actual)}, extra={sorted(actual - expected)}"
        )


def required_projection_paths() -> dict[Path, set[str]]:
    return {
        GENERATED_DIR / "articles.json": PUBLIC_ARTICLE_FIELDS,
        GENERATED_DIR / "datasets.json": PUBLIC_DATASET_FIELDS,
        PUBLIC_DATA_DIR / "articles-index.json": ARTICLE_INDEX_FIELDS,
        DOWNLOADS_DIR / "articles.json": ARTICLE_EXPORT_FIELDS,
        DOWNLOADS_DIR / "datasets.json": PUBLIC_DATASET_FIELDS,
    }


def iter_files(roots: Iterable[Path]) -> Iterable[Path]:
    for root in roots:
        if root.exists():
            yield from (path for path in root.rglob("*") if path.is_file())


def audit_schemas(findings: list[str]) -> None:
    for path, expected in required_projection_paths().items():
        if not path.exists():
            findings.append(f"{path}: required projection is missing")
        else:
            audit_record_list(path, expected, findings)

    review_path = GENERATED_DIR / "review-metadata.json"
    if not review_path.exists():
        findings.append(f"{review_path}: required projection is missing")
    else:
        audit_object_schema(review_path, PUBLIC_REVIEW_METADATA_FIELDS, findings)
        value = load_json(review_path, findings)
        if isinstance(value, dict):
            statistics = value.get("statistics")
            if not isinstance(statistics, dict) or set(statistics) != PUBLIC_REVIEW_STATISTICS_FIELDS:
                findings.append(
                    f"{review_path}: $.statistics must contain exactly {sorted(PUBLIC_REVIEW_STATISTICS_FIELDS)}"
                )


def audit_required_pdfs(stage: str, findings: list[str]) -> None:
    expected = set(ALLOWED_PUBLIC_PDF_PATHS)
    if stage == "dist":
        expected.update(ALLOWED_DIST_PDF_PATHS)
    for relative in sorted(expected, key=lambda path: path.as_posix()):
        path = ROOT / relative
        if not path.is_file():
            findings.append(f"{relative}: required public review document is missing")
            continue
        if path.stat().st_size <= 5:
            findings.append(f"{relative}: public review document is empty")
            continue
        try:
            with path.open("rb") as handle:
                signature = handle.read(5)
        except OSError as error:
            findings.append(f"{relative}: unreadable PDF ({error})")
            continue
        if signature != b"%PDF-":
            findings.append(f"{relative}: invalid PDF signature")


def audit_file(path: Path, findings: list[str]) -> None:
    relative = path.relative_to(ROOT)
    lowered_parts = [part.casefold() for part in relative.parts]
    if path.name.casefold() in FORBIDDEN_FILE_NAMES and path.parent != GENERATED_DIR:
        findings.append(f"{relative}: forbidden public artifact")
    is_public_pdf = (
        path.suffix.casefold() == ".pdf"
        and (PUBLIC_DIR in path.parents or DIST_DIR in path.parents)
    )
    if is_public_pdf and relative not in ALLOWED_PDF_PATHS:
        findings.append(f"{relative}: PDF file is not an approved public review document")
    if "prisma" in lowered_parts or path.stem.casefold().endswith("prisma"):
        findings.append(f"{relative}: PRISMA route/data artifact is not permitted")
    if path.suffix.casefold() not in TEXT_SUFFIXES:
        return
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError as error:
        findings.append(f"{relative}: unreadable ({error})")
        return
    if path.suffix.casefold() == ".json":
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            findings.append(f"{relative}: invalid JSON ({error})")
        else:
            findings.extend(f"{relative}: {item}" for item in find_forbidden_keys(value))
    for label, pattern in FORBIDDEN_PHRASES:
        for match in pattern.finditer(text):
            if is_allowed_collection_descriptor(relative, label, match.group(0)):
                continue
            line = text.count("\n", 0, match.start()) + 1
            excerpt = normalize_excerpt(text[match.start():match.end()])
            findings.append(f"{relative}:{line}: {label}: {excerpt!r}")


def normalize_excerpt(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()[:120]


def roots_for_stage(stage: str, findings: list[str]) -> list[Path]:
    roots = [GENERATED_DIR, PUBLIC_DIR]
    for root in roots:
        if not root.exists():
            findings.append(f"{root}: required public-output directory is missing")
    if stage == "dist":
        if not DIST_DIR.exists():
            findings.append(f"{DIST_DIR}: distribution directory is missing; build the site before the dist audit")
        else:
            roots.append(DIST_DIR)
    return roots


def run(stage: str) -> tuple[list[str], int]:
    findings: list[str] = []
    roots = roots_for_stage(stage, findings)
    audit_schemas(findings)
    audit_required_pdfs(stage, findings)
    files = list(iter_files(roots))
    for path in files:
        audit_file(path, findings)
    return sorted(set(findings)), len(files)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Reject private source-processing details from website artifacts.")
    parser.add_argument(
        "--stage",
        choices=("source", "dist"),
        default="source",
        help="Audit generated/public projections, or those projections plus the final distribution.",
    )
    args = parser.parse_args(argv)
    findings, file_count = run(args.stage)
    if findings:
        print(f"Public-output audit failed with {len(findings)} finding(s):", file=sys.stderr)
        for finding in findings:
            print(f"- {finding}", file=sys.stderr)
        raise SystemExit(1)
    print(f"Public-output audit passed for stage {args.stage!r} ({file_count} files scanned).")


if __name__ == "__main__":
    main()
