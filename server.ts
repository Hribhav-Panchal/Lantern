import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper to initialize GenAI client with standard fallback or bearer token from front-end
const getGenAI = (customKey?: string) => {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server, and no custom API Key was provided.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Endpoints for TrialBridge

// 0. Configuration Check
app.get("/api/config", (req, res) => {
  res.json({ hasKey: !!process.env.GEMINI_API_KEY });
});

// 1. Intake Profile Extraction API
app.post("/api/extract", async (req, res) => {
  try {
    const { text, customKey } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Patient description is required." });
    }

    const ai = getGenAI(customKey);
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract structured clinical trial search information from this patient description. 
Only extract what is explicitly stated or can be strictly inferred from the details provided. Never infer biomarker status unless stated.

Patient description: "${text}"`,
      config: {
        systemInstruction: "You are an expert clinical trial coordinator specializing in medical oncological curation. Extract details with clinical accuracy.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            condition: { type: Type.STRING, description: "Primary cancer type e.g. 'non-small cell lung cancer' or 'breast cancer'" },
            stage: { type: Type.STRING, description: "Cancer stage if mentioned (e.g., 'Stage 3', 'Stage IV', 'metastatic'), else null" },
            biomarkers: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Any biomarkers, mutations, or receptors mentioned e.g. HER2+, estrogen receptor positive, Triple Negative, EGFR, ALK, PD-L1, BRCA1" 
            },
            prior_treatments: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Treatments already tried, e.g., chemotherapy, immunotherapy, radiation, surgery" 
            },
            location_city: { type: Type.STRING, description: "City where the patient resides, if mentioned, else null" },
            location_state: { type: Type.STRING, description: "State code where the patient resides (e.g. CA, NY), if mentioned, else null" },
            travel_radius_miles: { type: Type.NUMBER, description: "How far they can travel in miles, default 50 if not stated" },
            patient_age: { type: Type.NUMBER, description: "Age of the patient in years if mentioned, else null" },
            missing_fields: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Important clinical details not mentioned in the prompt that would highly affect trial eligibility (e.g., specific stage, exact receptor status, prior specific lines, organ functions)" 
            },
            search_terms: { type: Type.STRING, description: "Best targeted search string for ClinicalTrials.gov query.cond field, representing the cancer type" }
          },
          required: ["condition", "biomarkers", "prior_treatments", "missing_fields", "search_terms"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response received from Gemini model.");
    }

    const structuredData = JSON.parse(resultText);
    res.json(structuredData);
  } catch (error: any) {
    console.error("Extraction error:", error);
    res.status(500).json({ error: error.message || "Failed to extract patient profile from text." });
  }
});

// 2. Trial Eligibility Analyzer API
app.post("/api/explain", async (req, res) => {
  try {
    const { patientProfile, trial, customKey } = req.body;
    if (!patientProfile || !trial) {
      return res.status(400).json({ error: "patientProfile and trial data are required." });
    }

    const ai = getGenAI(customKey);

    const prompt = `
PATIENT PROFILE:
- Condition: ${patientProfile.condition}
- Stage: ${patientProfile.stage || "not specified"}
- Biomarkers: ${patientProfile.biomarkers?.join(", ") || "not specified"}
- Prior treatments: ${patientProfile.prior_treatments?.join(", ") || "not specified"}
- Age: ${patientProfile.patient_age || "not specified"}
- Location: ${patientProfile.location_city || "not specified"}, ${patientProfile.location_state || "not specified"}

TRIAL: ${trial.title}
PHASE: ${trial.phase || "not specified"}
SPONSOR: ${trial.sponsor || "not specified"}

ELIGIBILITY CRITERIA FROM CLINICALTRIALS.GOV:
${trial.eligibilityCriteria || "Not available"}

BRIEF SUMMARY:
${trial.summary || "Not available"}

Assess whether this patient might be a candidate for this trial.
CRITICAL RULES:
1. Never say the patient IS eligible. Always say they MAY be a candidate or are worth discussing with their physician.
2. possible_blockers must reference specific eligibility criteria (inclusion/exclusion) from the trial text above.
3. Use friendly, plain, and highly accessible English — define any medical terms or oncology jargon you use.
4. This output will be shown to a high-stress cancer patient or caregiver, not a doctor. Maintain a supportive, clear, and objective tone.
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a warm, helpful, and exceptionally clear oncology clinical coordinator translation assistant. Your goal is to simplify dense clinical criteria into an accessible, empathetic, and clinically sound guide for patients.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plain_english_summary: { type: Type.STRING, description: "2-3 sentences: what is this trial testing, in clear, jargon-free plain language" },
            relevance_reason: { type: Type.STRING, description: "Why this trial might be relevant or interesting to this specific patient" },
            possible_blockers: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Specific criteria that MIGHT exclude this patient. Phrase as 'May not qualify if...' Never say definitively excluded." 
            },
            missing_info_needed: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "What the doctor or patient would need to confirm (e.g. key lab values, exact cancer subtype) to know if the patient qualifies" 
            },
            questions_for_doctor: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Specific questions the patient should ask their oncologist about this trial" 
            },
            confidence: { 
              type: Type.STRING, 
              enum: ["high", "medium", "low"], 
              description: "Estimated candidate confidence based on available info matching trial criteria" 
            },
            confidence_reason: { type: Type.STRING, description: "One sentence explaining the reasoning behind this confidence level" }
          },
          required: ["plain_english_summary", "relevance_reason", "possible_blockers", "missing_info_needed", "questions_for_doctor", "confidence", "confidence_reason"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response received from eligibility explanation endpoint.");
    }

    const payload = JSON.parse(resultText);
    res.json(payload);
  } catch (error: any) {
    console.error("Explanation error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze trial eligibility." });
  }
});

// 3. Conversational Trial Companion API
app.post("/api/chat", async (req, res) => {
  try {
    const { history, patientProfile, trials, customKey } = req.body;
    if (!patientProfile) {
      return res.status(400).json({ error: "patientProfile is required." });
    }

    const ai = getGenAI(customKey);

    const trialsSummary = (trials || []).map((t: any) => 
      `- NCT ID: ${t.nctId} (${t.phase || "Unknown Phase"})
  Title: ${t.title}
  Confidence: ${t.explanation?.confidence || "unknown"}
  Why Relevant: ${t.explanation?.relevance_reason || "Matches criteria"}
  Exclusions/Blockers: ${t.explanation?.possible_blockers?.join(", ") || "None highlighted"}`
    ).join("\n\n");

    const chatHistoryContext = (history || []).map((m: any) => 
      `${m.sender === "ai" ? "Assistant" : "User"}: ${m.text}`
    ).join("\n");

    const prompt = `You are the conversational companion of TrialBridge, a clinical trial matching software.
Below is the oncology patient's diagnostic and demographic profile, along with the 5 clinical trials we successfully found and analyzed for them.

PATIENT PROFILE:
- Condition: ${patientProfile.condition}
- Stage: ${patientProfile.stage || "Not specified"}
- Biomarkers: ${patientProfile.biomarkers?.join(", ") || "None reported"}
- Previous Treatments: ${patientProfile.prior_treatments?.join(", ") || "None reported"}
- Location: ${patientProfile.location_city || "USA"}, ${patientProfile.location_state || "USA"}

TOP FOUND MATCHING CLINICAL TRIALS:
${trialsSummary}

CONVERSATION HISTORY SO FAR:
${chatHistoryContext}

GUIDELINES FOR RESPONSE:
1. Maintain an exceptionally clear, supportive, supportive-yet-objective tone. Use friendly, plain, and highly accessible English, avoiding dense medical jargon (always translate details or acronyms into warm, comfortable explanations).
2. NEVER guarantee eligibility or make definitive diagnostic remarks. Always emphasize that this is not medical advice, and refer back to checking eligibility variables during upcoming consultation visits.
3. Be concise and keep individual replies easily digestible. Do not dump essays. Focus in on exactly what was asked.

Generate the assistant's next response:`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "You are a warm, helpful, and clear oncology clinical coordinator assistant translation companion."
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: error.message || "Failed to process chat response." });
  }
});

// Configure Vite or Static Serve
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
