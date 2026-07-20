# Data dictionary

## `citationKey`

Type: `string`

Unchanged BibTeX citation key and stable article identifier.

Missing values: Never missing for included records.

## `title`

Type: `string`

Publication title from BibTeX, with the inclusion table as fallback.

Missing values: Critical error.

## `authors`

Type: `string[]`

Author names from BibTeX, deduplicated across repeated source variants.

Missing values: Empty array.

## `year`

Type: `integer`

Publication year from the authoritative included-publication table.

Missing values: Critical error.

## `abstract`

Type: `string|null`

Abstract from the merged extraction table when available.

Missing values: null.

## `overallReasoning`

Type: `string`

Concise article-level reasoning transcribed from the final included-publication table.

Missing values: Critical error.

## `contributionSummary`

Type: `string`

Concise article-level contribution and summary transcribed from the final included-publication table.

Missing values: Critical error.

## `publicationMode`

Type: `enum`

Copyright-aware publication mode: full_text_public, abstract_only, external_link_only, or restricted.

Missing values: Never missing.

## `sourceType`

Type: `string|null`

Selected local source format after deterministic source precedence.

Missing values: null when no source file is matched.

## `ophthalmicConditions`

Type: `string[]`

Conservative rule-based categories derived from the curated article summary and abstract.

Missing values: Other / unspecified.

## `modalities`

Type: `string[]`

Explicit imaging or clinical-data modalities found in the curated article text.

Missing values: Empty array.

## `aiMethods`

Type: `string[]`

Explicit AI method families found in the curated article text.

Missing values: Empty array.

## `clinicalTasks`

Type: `string[]`

Explicit task families found in the curated article text.

Missing values: Empty array.

## `datasets`

Type: `string[]`

Named registry resources explicitly mentioned in the curated article text.

Missing values: Empty array.

## `countries`

Type: `string[]`

Countries explicitly present in source affiliation text; never inferred from names.

Missing values: Empty array.

## `validationTypes`

Type: `string[]`

Validation descriptors only when explicit textual evidence is present.

Missing values: Empty array.

## `generalEvidenceAssignments`

Type: `object[]`

General EGM dimension and framing assignments parsed from EGM_20260720.tex.

Missing values: Empty array.

## `ethicsEvidenceAssignments`

Type: `object[]`

Ethics EGM dimension and framed role parsed from EGM_20260720.tex.

Missing values: Empty array.
