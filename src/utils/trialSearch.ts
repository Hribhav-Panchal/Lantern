import { PatientProfile } from "../types";

export async function searchTrials(patientProfile: PatientProfile): Promise<any[]> {
  const queryCond = patientProfile.search_terms || patientProfile.condition;
  
  // Clean terms to search for
  const params = new URLSearchParams({
    "query.cond": queryCond,
    "filter.overallStatus": "RECRUITING",
    "pageSize": "15",
    "format": "json",
    // Field list requested by ClinicalTrials.gov API v2
    "fields": "NCTId,BriefTitle,OverallStatus,Phase,LeadSponsorName,BriefSummary,EligibilityCriteria,LocationFacility,LocationCity,LocationState,CentralContactName,CentralContactPhone,CentralContactEMail,StartDate"
  });

  // Include biomarkers in query.term if we have them
  if (patientProfile.biomarkers && patientProfile.biomarkers.length > 0) {
    params.set("query.term", patientProfile.biomarkers.join(" "));
  }

  // Include geo filter if latitude and longitude exist
  if (patientProfile.lat !== undefined && patientProfile.lng !== undefined) {
    const radius = patientProfile.travel_radius_miles || 50;
    params.set("filter.geo", `distance(${patientProfile.lat},${patientProfile.lng},${radius}mi)`);
  }

  const url = `https://clinicaltrials.gov/api/v2/studies?${params.toString()}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ClinicalTrials.gov lookup failed with status: ${response.status}`);
  }

  const data = await response.json();
  return data.studies || [];
}
