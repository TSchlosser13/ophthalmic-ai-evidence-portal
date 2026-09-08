# Data dictionary

## `citationKey`

Type: `string`

Unchanged BibTeX citation key and stable article identifier.

Missing values: Never missing for included records.

## `title`

Type: `string`

Publication title.

Missing values: Critical error.

## `authors`

Type: `string[]`

Publication author names.

Missing values: Empty array.

## `year`

Type: `integer`

Publication year.

Missing values: Critical error.

## `overallReasoning`

Type: `string`

Curated publication-level synopsis.

Missing values: Critical error.

## `contributionSummary`

Type: `string`

Curated publication-level contribution summary.

Missing values: Critical error.

## `ophthalmicConditions`

Type: `string[]`

Conservative clinical-context categories derived from curated publication information.

Missing values: Other / unspecified.

## `modalities`

Type: `string[]`

Explicit imaging or clinical-data modalities found in the curated publication text.

Missing values: Empty array.

## `aiMethods`

Type: `string[]`

Explicit AI method families found in the curated publication text.

Missing values: Empty array.

## `clinicalTasks`

Type: `string[]`

Explicit task families found in the curated publication text.

Missing values: Empty array.

## `datasets`

Type: `string[]`

Named registry resources explicitly mentioned in the curated publication text.

Missing values: Empty array.

## `countries`

Type: `string[]`

Countries explicitly present in affiliation metadata; never inferred from names.

Missing values: Empty array.

## `validationTypes`

Type: `string[]`

Validation descriptors only when explicit textual evidence is present.

Missing values: Empty array.

## `generalEvidenceAssignments`

Type: `object[]`

General evidence-map dimension and framing assignments.

Missing values: Empty array.

## `ethicsEvidenceAssignments`

Type: `object[]`

Ethics evidence-map dimension and framed role assignments.

Missing values: Empty array.
