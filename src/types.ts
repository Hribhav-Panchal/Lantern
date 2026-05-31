export interface PatientProfile {
  condition: string;
  stage: string | null;
  biomarkers: string[];
  prior_treatments: string[];
  location_city: string | null;
  location_state: string | null;
  travel_radius_miles: number;
  patient_age: number | null;
  missing_fields: string[];
  search_terms: string;
  lat?: number;
  lng?: number;
}

export interface LocationContact {
  name?: string;
  phone?: string;
  email?: string;
}

export interface TrialLocation {
  facility?: string;
  city?: string;
  state?: string;
  contact?: LocationContact;
}

export interface Trial {
  nctId: string;
  title: string;
  status: string;
  phase: string;
  sponsor: string;
  summary: string;
  eligibilityCriteria: string;
  minAge: string;
  maxAge: string;
  locations: TrialLocation[];
  centralContact?: LocationContact;
}

export interface TrialExplanation {
  plain_english_summary: string;
  relevance_reason: string;
  possible_blockers: string[];
  missing_info_needed: string[];
  questions_for_doctor: string[];
  confidence: "high" | "medium" | "low";
  confidence_reason: string;
}

export interface AnalyzedTrial extends Trial {
  explanation: TrialExplanation;
}
