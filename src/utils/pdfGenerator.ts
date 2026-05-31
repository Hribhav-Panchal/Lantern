import { jsPDF } from "jspdf";
import { PatientProfile, AnalyzedTrial } from "../types";

export function generateDoctorPacket(profile: PatientProfile, selectedTrials: AnalyzedTrial[]) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 20;
  const maxContentWidth = pageWidth - margin * 2; // 170mm
  let currentY = 20;

  // Helper to add a new page and reset Y coordinate
  const checkPageBreak = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - margin) {
      doc.addPage();
      currentY = 20;
      addPageHeader();
    }
  };

  const addPageHeader = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setFillColor(15, 15, 14); // #0F0F0E
    doc.setTextColor(110, 110, 110);
    doc.text("Lantern — Clinical Trial Navigation Summary", margin, 12);
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, 14, pageWidth - margin, 14);
  };

  // 1. Cover Header (Strictly monochrome & clean)
  doc.setFillColor(15, 15, 14); // #0F0F0E
  doc.rect(margin, currentY, maxContentWidth, 12, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("LANTERN — CLINICAL REFERRAL & INTENSITY PROTOCOL", margin + 5, currentY + 8);
  currentY += 18;

  // 2. Prep Date and Patient Profile Title
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Prepared: ${new Date().toLocaleDateString()} | Oncology Referral Support Summary`, margin, currentY);
  currentY += 5;

  doc.setDrawColor(15, 15, 14); // #0F0F0E
  doc.setLineWidth(0.6);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 8;

  // Patient Sub-Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 15, 14);
  doc.text("PATIENT REFERRAL & CO-REGISTRY SUMMARY", margin, currentY);
  currentY += 6;

  // Profile fields table style
  const profileFields = [
    { label: "Primary Indication (Diagnosis)", value: profile.condition },
    { label: "Clinical Staging Details", value: profile.stage || "Not specified" },
    { label: "Known Biomarkers / Subtypes", value: profile.biomarkers?.join(", ") || "None specified" },
    { label: "Prior Oncology Therapeutics", value: profile.prior_treatments?.join(", ") || "None specified" },
    { label: "Clinical Geography Center", value: profile.location_city && profile.location_state ? `${profile.location_city}, ${profile.location_state}` : "Anywhere" },
    { label: "Maximum Search Radius", value: `${profile.travel_radius_miles} miles` },
    { label: "Patient Age (Demographics)", value: profile.patient_age ? `${profile.patient_age} years` : "Not specified" },
  ];

  doc.setFont("helvetica", "normal");
  profileFields.forEach((field) => {
    checkPageBreak(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(26, 26, 24); // #1A1A18
    doc.text(`${field.label}:`, margin, currentY);

    doc.setFont("helvetica", "normal");
    const widthOfLabel = doc.getTextWidth(`${field.label}: `);
    const valLines = doc.splitTextToSize(field.value, maxContentWidth - widthOfLabel - 5);
    doc.text(valLines, margin + widthOfLabel + 2, currentY);
    currentY += (valLines.length * 4) + 2;
  });

  checkPageBreak(12);
  currentY += 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(107, 107, 103); // #6B6B67
  const disclaimerText = doc.splitTextToSize(
    "Disclaimer: This referral cohort is structured to facilitate peer-to-peer dialogues between patients and board-certified oncologists. Formal eligibility remains contingent on full clinical verification by the active trial site research nurse and Principal Investigator.",
    maxContentWidth
  );
  doc.text(disclaimerText, margin, currentY);
  currentY += (disclaimerText.length * 4) + 6;

  // 3. Loop trials
  selectedTrials.forEach((trial, index) => {
    checkPageBreak(30);
    doc.setDrawColor(229, 226, 218); // #E5E2DA
    doc.setLineWidth(0.4);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 8;

    // Trial Heading block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(15, 15, 14); // Monochrome
    doc.text(`TRIAL METRIC ${index + 1} OF ${selectedTrials.length} (SELECTED CANDIDATE)`, margin, currentY);
    currentY += 6;

    // Trial Title
    doc.setFontSize(10);
    doc.setTextColor(26, 26, 24);
    const splitTitle = doc.splitTextToSize(trial.title, maxContentWidth);
    doc.text(splitTitle, margin, currentY);
    currentY += (splitTitle.length * 5) + 2;

    // Trial metadata block
    checkPageBreak(15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(`REGISTRY ID: ${trial.nctId}    |    Development Phase: ${trial.phase}    |    Sponsor / Lead: ${trial.sponsor}`, margin, currentY);
    currentY += 5;

    // Location / Contacts
    let contactText = "Search registry protocols at clinicaltrials.gov for contact details.";
    if (trial.centralContact) {
      contactText = `${trial.centralContact.name || "Central Contact"} - Ph: ${trial.centralContact.phone || "N/A"}, Email: ${trial.centralContact.email || "N/A"}`;
    } else if (trial.locations && trial.locations.length > 0) {
      const loc = trial.locations.find(l => l.state === profile.location_state) || trial.locations[0];
      const facName = loc.facility || "Active Clinical Center";
      const conName = loc.contact?.name ? `(${loc.contact.name})` : "";
      const conPh = loc.contact?.phone ? ` Ph: ${loc.contact.phone}` : "";
      contactText = `${facName} ${conName}${conPh}, ${loc.city || ""}, ${loc.state || ""}`;
    }
    const splitContact = doc.splitTextToSize(`Referred Center contact: ${contactText}`, maxContentWidth);
    doc.text(splitContact, margin, currentY);
    currentY += (splitContact.length * 4) + 6;

    // Plain English Summary section (Highly Detailed/Doctor Centric)
    checkPageBreak(25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 15, 14);
    doc.text("Clinical Mechanism & Abstract Summary:", margin, currentY);
    currentY += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const splitSummary = doc.splitTextToSize(trial.explanation.plain_english_summary, maxContentWidth);
    doc.text(splitSummary, margin, currentY);
    currentY += (splitSummary.length * 4.5) + 5;

    // Why relevant
    checkPageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 15, 14);
    doc.text("Relevance Hypothesis & Molecular Alignment:", margin, currentY);
    currentY += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const splitRel = doc.splitTextToSize(trial.explanation.relevance_reason, maxContentWidth);
    doc.text(splitRel, margin, currentY);
    currentY += (splitRel.length * 4.5) + 5;

    // Potential blockers
    if (trial.explanation.possible_blockers?.length > 0) {
      checkPageBreak(25);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 15, 14); // Monochrome black highlight
      doc.text("Potential Exclusionary Blockers to Screen:", margin, currentY);
      currentY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      trial.explanation.possible_blockers.forEach((blocker) => {
        const lines = doc.splitTextToSize(`• [EXCLUSION] ${blocker}`, maxContentWidth - 4);
        checkPageBreak(lines.length * 4.5);
        doc.text(lines, margin + 2, currentY);
        currentY += (lines.length * 4.5) + 1.5;
      });
      currentY += 3;
    }

    // Questions to ask doctor
    if (trial.explanation.questions_for_doctor?.length > 0) {
      checkPageBreak(25);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 15, 14);
      doc.text("Proposed Peer-to-Peer Peer Consultation Queries:", margin, currentY);
      currentY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      trial.explanation.questions_for_doctor.forEach((q) => {
        const lines = doc.splitTextToSize(`• ${q}`, maxContentWidth - 4);
        checkPageBreak(lines.length * 4.5);
        doc.text(lines, margin + 2, currentY);
        currentY += (lines.length * 4.5) + 1.5;
      });
      currentY += 3;
    }

    // Info needed
    if (trial.explanation.missing_info_needed?.length > 0) {
      checkPageBreak(25);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(110, 110, 110);
      doc.text("Diagnostics & Laboratory Assays Needed to Confirm Eligibility:", margin, currentY);
      currentY += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(50, 50, 50);
      trial.explanation.missing_info_needed.forEach((info) => {
        const lines = doc.splitTextToSize(`• ${info}`, maxContentWidth - 4);
        checkPageBreak(lines.length * 4.5);
        doc.text(lines, margin + 2, currentY);
        currentY += (lines.length * 4.5) + 1.5;
      });
      currentY += 3;
    }
    
    currentY += 4;
  });

  // Footer Disclaimer block (forces bottom of final page or is checkPageBreaked)
  checkPageBreak(40);
  currentY += 5;
  doc.setFillColor(250, 250, 248); // #FAFAF8 neutral background
  doc.rect(margin, currentY, maxContentWidth, 30, "F");
  
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(15, 15, 14);
  doc.text("CLINICAL PROTOCOL REFERENCE & COMPLIANCE DATA", margin + 4, currentY + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  const footerLines = doc.splitTextToSize(
    "This summary documents registered NIH protocols (clinicaltrials.gov) parsed via LLM analysis. Lantern does not hold patient data, generate diagnostic claims, or author legal medical opinions. Actual patient suitability is governed by recruiting criteria managed by certified principal investigators at clinical sites.",
    maxContentWidth - 8
  );
  doc.text(footerLines, margin + 4, currentY + 9);

  // Trigger download
  const cleanName = profile.condition.toLowerCase().replace(/[^a-z0-9]/g, "_");
  doc.save(`Lantern_Referral_Report_${cleanName}.pdf`);
}
