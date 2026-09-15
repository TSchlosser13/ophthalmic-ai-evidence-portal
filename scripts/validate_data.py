from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from audit_public_output import (
    ARTICLE_EXPORT_FIELDS,
    ARTICLE_INDEX_FIELDS,
    PUBLIC_ARTICLE_FIELDS,
    PUBLIC_DATASET_FIELDS,
    PUBLIC_REVIEW_METADATA_FIELDS,
    PUBLIC_REVIEW_STATISTICS_FIELDS,
    audit_record_list,
)


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_INCLUDED = 427
GENERAL_DIMENSIONS = (
    "Model performance",
    "Technological limitations",
    "Real-world impact",
    "Data availability, integration, quality, and standardization",
    "Infrastructural demands",
    "Financial costs",
    "Regulatory requirements",
    "Cybersecurity risks",
    "Ethical concerns",
)
ETHICS_DIMENSIONS = (
    "Privacy",
    "Transparency",
    "Integrity",
    "Security",
    "Non-maleficence",
    "Trust",
    "Accountability",
    "Equity",
    "Autonomy",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def unique_strings(values: Any, label: str) -> set[str]:
    require(isinstance(values, list), f"{label} must be a list")
    require(all(isinstance(value, str) and value.strip() for value in values), f"{label} contains an invalid identifier")
    require(len(values) == len(set(values)), f"{label} contains duplicate identifiers")
    return set(values)


def stored_metadata(path: Path) -> dict[str, Any]:
    """Validate the public metadata used by the website."""
    metadata = load_json(path)
    if not isinstance(metadata, dict) or set(metadata) != PUBLIC_REVIEW_METADATA_FIELDS:
        raise ValueError("Stored review metadata has an invalid public schema")
    for field in ("title", "shortTitle", "abstract", "journal", "status"):
        if not isinstance(metadata[field], str) or not metadata[field].strip():
            raise ValueError(f"Stored review metadata has no usable {field}")
    keywords = metadata["keywords"]
    if not isinstance(keywords, list) or not keywords or any(
        not isinstance(item, str) or not item.strip() for item in keywords
    ):
        raise ValueError("Stored review metadata has no usable keywords")
    affiliations = metadata["affiliations"]
    authors = metadata["authors"]
    if not isinstance(affiliations, dict) or not affiliations or not isinstance(authors, list) or not authors:
        raise ValueError("Stored review metadata has no usable authors or affiliations")
    for author in authors:
        if not isinstance(author, dict) or not isinstance(author.get("name"), str) or not author["name"].strip():
            raise ValueError("Stored review metadata contains an unnamed author")
        ids = author.get("affiliationIds")
        if not isinstance(ids, list) or not ids or any(
            not isinstance(key, str) or key not in affiliations for key in ids
        ):
            raise ValueError(f"Stored review metadata has undefined affiliations for {author['name']}")
        if author.get("affiliations") != [affiliations[key] for key in ids]:
            raise ValueError(f"Stored review metadata has inconsistent affiliations for {author['name']}")
    statistics = metadata["statistics"]
    if not isinstance(statistics, dict) or set(statistics) != PUBLIC_REVIEW_STATISTICS_FIELDS:
        raise ValueError("Stored review metadata has invalid evidence statistics")
    if any(type(value) is not int or value < 0 for value in statistics.values()):
        raise ValueError("Stored review metadata has invalid evidence counts")
    return metadata


def validate_snapshot(root: Path) -> dict[str, int]:
    """Check the committed evidence and its public projections without private inputs."""
    generated = root / "src" / "data" / "generated"
    downloads = root / "public" / "downloads"
    schemas = {
        generated / "articles.json": PUBLIC_ARTICLE_FIELDS,
        generated / "datasets.json": PUBLIC_DATASET_FIELDS,
        root / "public" / "data" / "articles-index.json": ARTICLE_INDEX_FIELDS,
        downloads / "articles.json": ARTICLE_EXPORT_FIELDS,
        downloads / "datasets.json": PUBLIC_DATASET_FIELDS,
    }
    findings: list[str] = []
    for path, fields in schemas.items():
        audit_record_list(path, fields, findings)
    require(not findings, "Stored evidence schema is invalid: " + "; ".join(findings))
    articles = load_json(generated / "articles.json")
    datasets = load_json(generated / "datasets.json")
    metadata = stored_metadata(generated / "review-metadata.json")
    visualizations = load_json(generated / "visualizations.json")
    require(len(articles) == EXPECTED_INCLUDED, f"Stored evidence must contain {EXPECTED_INCLUDED} publications")
    keys = unique_strings([article["citationKey"] for article in articles], "Publication citation keys")
    unique_strings([article["id"] for article in articles], "Publication IDs")
    unique_strings([article["slug"] for article in articles], "Publication slugs")
    articles_by_key = {article["citationKey"]: article for article in articles}
    require(bool(datasets), "Stored dataset registry is empty")
    unique_strings([dataset["id"] for dataset in datasets], "Dataset IDs")
    unique_strings([dataset["slug"] for dataset in datasets], "Dataset slugs")
    dataset_names = unique_strings([dataset["name"] for dataset in datasets], "Dataset names")
    for article in articles:
        require(isinstance(article["title"], str) and bool(article["title"].strip()), "A publication title is missing")
        names = unique_strings(article["datasets"], f"{article['citationKey']} datasets")
        require(names <= dataset_names, f"{article['citationKey']} references an unknown dataset")

    for path, fields in (
        (root / "public" / "data" / "articles-index.json", ARTICLE_INDEX_FIELDS),
        (downloads / "articles.json", ARTICLE_EXPORT_FIELDS),
    ):
        expected = [{field: article[field] for field in fields} for article in articles]
        require(load_json(path) == expected, f"{path.name} disagrees with stored publications")
    require(load_json(downloads / "datasets.json") == datasets, "Dataset export disagrees with stored datasets")

    for dataset in datasets:
        links = dataset["linkedArticles"]
        require(isinstance(links, list) and all(isinstance(link, dict) for link in links), "Invalid dataset publication links")
        linked_keys = unique_strings([link.get("citationKey") for link in links], f"{dataset['name']} publication links")
        expected_keys = {article["citationKey"] for article in articles if dataset["name"] in article["datasets"]}
        require(linked_keys <= keys and linked_keys == expected_keys, f"{dataset['name']} has inconsistent publication links")
        require(type(dataset["articleCount"]) is int and dataset["articleCount"] == len(linked_keys),
                f"{dataset['name']} has an inconsistent article count")
        for link in links:
            article = articles_by_key[link["citationKey"]]
            require(all(link.get(field) == article[field] for field in ("slug", "title", "year")),
                    f"{dataset['name']} has stale publication metadata")

    counts = {"normalizedArticles": len(articles), "datasets": len(datasets)}
    require(isinstance(visualizations, dict), "Stored visualizations must be an object")
    for kind, dimensions, stances in (
        ("general", GENERAL_DIMENSIONS, {"positive", "negative", "balanced"}),
        ("ethics", ETHICS_DIMENSIONS, {"caused", "resolved", "both"}),
    ):
        field = f"{kind}EvidenceAssignments"
        assignments: Counter[tuple[str, str, str]] = Counter()
        for article in articles:
            rows = article[field]
            require(isinstance(rows, list), f"{article['citationKey']} has invalid {kind} assignments")
            seen_dimensions = set()
            for row in rows:
                require(isinstance(row, dict) and set(row) == {"dimension", "stance"},
                        f"Invalid {kind} assignment schema")
                require(row["dimension"] in dimensions and row["stance"] in stances,
                        f"Unknown {kind} evidence dimension or stance")
                require(row["dimension"] not in seen_dimensions, f"Duplicate {kind} evidence dimension for {article['citationKey']}")
                seen_dimensions.add(row["dimension"])
                assignments[(article["citationKey"], row["dimension"], row["stance"])] += 1
        require(bool(assignments), f"Stored {kind} assignments are empty")
        exports = load_json(downloads / f"{kind}-evidence-assignments.json")
        require(isinstance(exports, list), f"Invalid {kind} assignment export")
        exported: Counter[tuple[str, str, str]] = Counter()
        for row in exports:
            require(isinstance(row, dict) and set(row) == {"citationKey", "dimension", "stance", "kind"},
                    f"Invalid {kind} assignment export schema")
            require(row["kind"] == kind, f"Incorrect {kind} assignment export kind")
            exported[(row["citationKey"], row["dimension"], row["stance"])] += 1
        require(exported == assignments, f"{kind} assignment export disagrees with stored publications")

        chart = visualizations.get(f"{kind}Evidence")
        require(isinstance(chart, list) and all(isinstance(row, dict) for row in chart), f"Invalid {kind} evidence chart")
        chart_dimensions = unique_strings([row.get("dimension") for row in chart], f"{kind} chart dimensions")
        require(chart_dimensions == set(dimensions), f"{kind} chart dimensions are incomplete")
        chart_assignments: Counter[tuple[str, str, str]] = Counter()
        for row in chart:
            segments = row.get("segments")
            require(isinstance(segments, list) and all(isinstance(segment, dict) for segment in segments),
                    f"Invalid {kind} chart segments")
            require(unique_strings([segment.get("stance") for segment in segments], f"{kind} chart stances") == stances,
                    f"{kind} chart stances are incomplete")
            dimension_keys: set[str] = set()
            for segment in segments:
                segment_keys = unique_strings(segment.get("articleKeys"), f"{kind} chart article keys")
                require(segment_keys <= keys, f"{kind} chart references an unknown publication")
                require(type(segment.get("count")) is int and segment["count"] == len(segment_keys),
                        f"{kind} chart has an inconsistent segment count")
                dimension_keys.update(segment_keys)
                chart_assignments.update((key, row["dimension"], segment["stance"]) for key in segment_keys)
            require(type(row.get("articleCount")) is int and row["articleCount"] == len(dimension_keys),
                    f"{kind} chart has an inconsistent article count")
        require(chart_assignments == assignments, f"{kind} chart disagrees with stored publications")
        counts[field] = sum(assignments.values())
    require(metadata["statistics"] == {
        "includedStudies": counts["normalizedArticles"],
        "generalEvidenceAssignments": counts["generalEvidenceAssignments"],
        "ethicsEvidenceAssignments": counts["ethicsEvidenceAssignments"],
    }, "Stored metadata evidence counts disagree with stored publications")
    require(load_json(downloads / "visualizations.json") == visualizations,
            "Visualization export disagrees with stored visualizations")
    return counts


def main() -> None:
    try:
        counts = validate_snapshot(ROOT)
    except (OSError, UnicodeError, ValueError, KeyError, TypeError) as error:
        print(f"Data validation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
    print(
        "Stored evidence snapshot checked: "
        f"{counts.get('normalizedArticles')} articles, "
        f"{counts.get('generalEvidenceAssignments')} general EGM assignments, "
        f"{counts.get('ethicsEvidenceAssignments')} ethics EGM assignments."
    )


if __name__ == "__main__":
    main()