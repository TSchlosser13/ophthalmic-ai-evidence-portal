export interface EvidenceAssignment {
  dimension: string;
  stance: string;
}

export interface ArticleIndexRecord {
  citationKey: string;
  slug: string;
  title: string;
  authors: string[];
  year: number;
  venue: string | null;
  doi: string | null;
  articleType: string;
  overallReasoning: string;
  contributionSummary: string;
  ophthalmicConditions: string[];
  modalities: string[];
  aiMethods: string[];
  clinicalTasks: string[];
  datasets: string[];
  countries: string[];
  validationTypes: string[];
  generalEvidenceAssignments: EvidenceAssignment[];
  ethicsEvidenceAssignments: EvidenceAssignment[];
}

export interface FilterState {
  query: string;
  year: string[];
  articleType: string[];
  condition: string[];
  modality: string[];
  method: string[];
  task: string[];
  dataset: string[];
  validation: string[];
  country: string[];
  generalEvidence: string[];
  ethicsEvidence: string[];
}
