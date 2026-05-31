import { Trial, TrialLocation } from "../types";

export function parseTrialData(rawStudy: any): Trial {
  const protocolSection = rawStudy.protocolSection || {};
  const identification = protocolSection.identificationModule || {};
  const statusMod = protocolSection.statusModule || {};
  const design = protocolSection.designModule || {};
  const sponsorCollab = protocolSection.sponsorCollaboratorsModule || {};
  const description = protocolSection.descriptionModule || {};
  const eligibility = protocolSection.eligibilityModule || {};
  const contactsLocations = protocolSection.contactsLocationsModule || {};

  const minAge = eligibility.minimumAge || "No minimum age";
  const maxAge = eligibility.maximumAge || "No maximum age";

  const locations: TrialLocation[] = (contactsLocations.locations || []).map((loc: any) => ({
    facility: loc.facility || "",
    city: loc.city || "",
    state: loc.state || "",
    contact: loc.contacts && loc.contacts[0] ? {
      name: loc.contacts[0].name || "",
      phone: loc.contacts[0].phone || "",
      email: loc.contacts[0].email || ""
    } : undefined
  }));

  const centralContact = contactsLocations.centralContacts && contactsLocations.centralContacts[0] ? {
    name: contactsLocations.centralContacts[0].name || "",
    phone: contactsLocations.centralContacts[0].phone || "",
    email: contactsLocations.centralContacts[0].email || ""
  } : undefined;

  return {
    nctId: identification.nctId || "N/A",
    title: identification.briefTitle || "Untitled Study",
    status: statusMod.overallStatus || "Unknown status",
    phase: design.phases && design.phases[0] ? design.phases[0] : "Phase N/A",
    sponsor: sponsorCollab.leadSponsor?.name || "Unknown sponsor",
    summary: description.briefSummary || "No brief summary available.",
    eligibilityCriteria: eligibility.eligibilityCriteria || "No eligibility criteria text available.",
    minAge,
    maxAge,
    locations,
    centralContact
  };
}
