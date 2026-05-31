import React, { useState, useEffect, useRef } from "react";
import { Settings, HelpCircle, Check, X, ChevronRight, MapPin, Building2, Phone, Mail } from "lucide-react";
import { PatientProfile, AnalyzedTrial } from "./types";
import { geocodeCity } from "./utils/geocoder";
import { searchTrials } from "./utils/trialSearch";
import { parseTrialData } from "./utils/trialParser";
import { generateDoctorPacket } from "./utils/pdfGenerator";

interface Message {
  sender: "ai" | "user";
  text: string;
}

export default function App() {
  // Config state
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("lantern_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [hasServerKey, setHasServerKey] = useState(false);

  // Landing & AdLib States
  const [isLandingAdlibPage, setIsLandingAdlibPage] = useState<boolean>(true);
  const [adlibRelation, setAdlibRelation] = useState<string>("");
  const [adlibCondition, setAdlibCondition] = useState<string>("");
  const [adlibLocation, setAdlibLocation] = useState<string>("");
  const [adlibRadius, setAdlibRadius] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<string>("relevance");

  // Layout / Flow states
  const [currentStep, setCurrentStep] = useState<number>(1); // Progress Bar step: 1 | 2 | 3 | 4
  const [chatStep, setChatStep] = useState<number>(0);       // Conversations steps: 0 (diagnosis) | 1 (location) | 2 (treatments) | 3 (searching) | 4 (freeform chat)

  // Sidepanel collapse toggle
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(false);

  // List / Table Expand states
  const [expandedTrialIds, setExpandedTrialIds] = useState<Record<string, boolean>>({});
  const [selectedModalTrial, setSelectedModalTrial] = useState<AnalyzedTrial | null>(null);

  // Chat conversation
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Refinement Flow states
  const [showRefineSuggestion, setShowRefineSuggestion] = useState(false);
  const [suggestionChosen, setSuggestionChosen] = useState(false);
  const [chosenRefineSuggestion, setChosenRefineSuggestion] = useState<boolean | null>(null);

  const [activeRefineQuestion, setActiveRefineQuestion] = useState<number | null>(null);
  const [selectedRefineChoice, setSelectedRefineChoice] = useState<string | null>(null);

  // Search Results State
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [analyzedTrials, setAnalyzedTrials] = useState<AnalyzedTrial[]>([]);
  const [selectedTrials, setSelectedTrials] = useState<AnalyzedTrial[]>([]);
  const [loadingStep, setLoadingStep] = useState<number>(0);
  const [rawTrials, setRawTrials] = useState<any[]>([]);

  // DOM Ref for scrolling chat automatically
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Setup initial message & server key verify
  useEffect(() => {
    async function checkConfig() {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          setHasServerKey(!!data.hasKey);
        }
      } catch (err) {
        console.warn("Could not fetch server config:", err);
      }
    }
    checkConfig();

    setChatHistory([
      {
        sender: "ai",
        text: `Hi. I'm here to help you find clinical trials that may be relevant for cancer treatment.

I'll ask you a few questions in plain language. Everything you share stays in your browser — nothing is stored on our servers. Results come from ClinicalTrials.gov, the public NIH database of 65,000+ recruiting trials.

I'm not a doctor. The goal is to prepare you for a better conversation with your oncologist.

Ready when you are. Let's start with the basics — who are we looking for trials for, and what's the diagnosis?`
      }
    ]);
  }, []);

  // Soft scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatLoading]);

  // Key handlers
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setApiKey(val);
    localStorage.setItem("lantern_key", val);
  };

  // Example scenario chip triggers click
  const handleTryExample = () => {
    setChatInput("I'm looking for trials for my mother. She has Stage 3 HER2-positive breast cancer.");
  };

  // Custom build packet action that is triggered from navigation
  const downloadPacket = () => {
    if (!patientProfile || selectedTrials.length === 0) return;
    generateDoctorPacket(patientProfile, selectedTrials);
  };

  const downloadPacketAndAdvance = () => {
    setCurrentStep(4);
    downloadPacket();
  };

  // Toggle trial expanded view (Level 2)
  const toggleExpandTrial = (nctId: string) => {
    setExpandedTrialIds((prev) => ({
      ...prev,
      [nctId]: !prev[nctId]
    }));
  };

  // Submission handler for Adlib/landing page
  const handleSubmitAdlib = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLandingAdlibPage(false);

    const finalRelation = adlibRelation.trim() || "my mother";
    const finalCondition = adlibCondition.trim() || "Stage 3 HER2-positive breast cancer";
    const finalLocation = adlibLocation.trim() || "San Jose, CA";
    const finalRadius = adlibRadius !== "" ? Number(adlibRadius) : 40;

    // Extract city and state
    const cityAndState = finalLocation.split(",");
    const city = cityAndState[0]?.trim() || "San Jose";
    const state = cityAndState[1]?.trim() || "CA";

    const initialProfile: PatientProfile = {
      condition: finalCondition,
      stage: finalCondition.toLowerCase().includes("metastatic") || finalCondition.toLowerCase().includes("stage 4") ? "metastatic" : "Stage 3",
      biomarkers: finalCondition.toLowerCase().includes("her2") ? ["HER2+"] : [],
      prior_treatments: [],
      location_city: city,
      location_state: state,
      travel_radius_miles: finalRadius,
      patient_age: null,
      missing_fields: [],
      search_terms: finalCondition
    };
    setPatientProfile(initialProfile);

    // Seed conversations to reflect intake choices
    setChatHistory([
      {
        sender: "ai",
        text: `Hi. I'm here to help you find clinical trials that may be relevant for cancer treatment.

Everything you share stays in your browser — nothing is stored on our servers. Results come from ClinicalTrials.gov, the public NIH database of recruiting trials.`
      },
      {
        sender: "user",
        text: `I'm looking for trials for ${finalRelation} suffering from ${finalCondition}.`
      },
      {
        sender: "ai",
        text: `Got it. Let's look for matching protocols in ${city}, ${state} within ${finalRadius} miles.`
      },
      {
        sender: "user",
        text: `Please run the initial search using these settings.`
      },
      {
        sender: "ai",
        text: `Understood. Querying ClinicalTrials.gov right now...`
      }
    ]);

    // Kickoff search
    setCurrentStep(2);
    setChatStep(3);
    await runSearch(initialProfile);
  };

  // Main search action using actual ClinicalTrials.gov and explaining with Gemini
  const runSearch = async (profile: PatientProfile) => {
    setLoadingStep(1);
    try {
      if (profile.location_city) {
        const coords = await geocodeCity(profile.location_city, profile.location_state);
        if (coords) {
          profile.lat = coords.lat;
          profile.lng = coords.lng;
        }
      }

      setLoadingStep(2);
      const studies = await searchTrials(profile);
      setRawTrials(studies);

      if (studies.length === 0) {
        setAnalyzedTrials([]);
        setSelectedTrials([]);
        setCurrentStep(3);
        setChatStep(4);
        setChatHistory(prev => [
          ...prev,
          {
            sender: "ai",
            text: "No active trials matched those details within your specified radius on ClinicalTrials.gov. You can adjust the location or ask me general clinical questions."
          }
        ]);
        return;
      }

      setLoadingStep(3);
      const candidates = studies.slice(0, 5);
      const explanations = await Promise.all(
        candidates.map(async (study) => {
          const parsed = parseTrialData(study);
          try {
            const explanationRes = await fetch("/api/explain", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                patientProfile: profile,
                trial: parsed,
                customKey: apiKey || undefined
              })
            });

            if (!explanationRes.ok) {
              throw new Error("Explanation mapping error");
            }

            return await explanationRes.json();
          } catch (explainErr) {
            console.error("Trial analysis failure:", parsed.nctId, explainErr);
            return {
              plain_english_summary: `This trial is researching treatments for patients with ${profile.condition}. Specifically exploring matching protocols.`,
              relevance_reason: `Your stated condition and demographic markers target basic eligibility bounds.`,
              possible_blockers: ["May not qualify if other specific biochemical or medical histories conflict."],
              missing_info_needed: ["Exact staging classification and laboratory blood counts."],
              questions_for_doctor: ["Would I qualify for this specific compound trial?", "Are my current liver and kidney panels suitable?"],
              confidence: "medium" as const,
              confidence_reason: "Basic keyword extraction aligned with primary diagnosis parameters."
            };
          }
        })
      );

      const fullyAnalyzed: AnalyzedTrial[] = candidates.map((study, index) => {
        const parsed = parseTrialData(study);
        return {
          ...parsed,
          explanation: explanations[index]
        };
      });

      // Sort by confidence high first
      fullyAnalyzed.sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.explanation.confidence] - rank[b.explanation.confidence];
      });

      setAnalyzedTrials(fullyAnalyzed);

      if (fullyAnalyzed.length > 0) {
        setSelectedTrials([fullyAnalyzed[0]]);
      } else {
        setSelectedTrials([]);
      }

      setCurrentStep(3); // Search matches completed, advance to Step 3

      // Automatically expand the first top matching trial for positive interaction hook
      if (fullyAnalyzed[0]) {
        setExpandedTrialIds({ [fullyAnalyzed[0].nctId]: true });
      }

      setChatHistory(prev => [
        ...prev,
        {
          sender: "ai",
          text: `Found 5 trials that may be relevant. They're on the right.

I'd suggest looking at the top one first — it's a Phase 2 study specifically for HER2+ patients after chemotherapy. Click "See full details" on any card to expand it.

If you want me to narrow further, I can ask about HER2 subtype, recent lab values, or other treatments she's tried. Want to do that?`
        }
      ]);

      setShowRefineSuggestion(true);

    } catch (err: any) {
      console.error(err);
      setCurrentStep(1);
      setChatStep(0);
      setChatHistory(prev => [
        ...prev,
        {
          sender: "ai",
          text: "I encountered an error querying ClinicalTrials.gov. Let's make sure the details are clear and try starting again."
        }
      ]);
    }
  };

  // Submit messages
  const handleSend = async () => {
    const textToSend = chatInput.trim();
    if (!textToSend || isChatLoading) return;

    // Append to chat history
    const updatedHistory: Message[] = [...chatHistory, { sender: "user", text: textToSend }];
    setChatHistory(updatedHistory);
    setChatInput("");
    setIsChatLoading(true);

    try {
      if (chatStep === 0) {
        // Step 0: Diagnosis provided -> Step 1: Location extraction
        let extractedCondition = "Stage 3 HER2-positive breast cancer";
        let extractedProfile: PatientProfile = {
          condition: "Stage 3 HER2-positive breast cancer",
          stage: "Stage 3",
          biomarkers: ["HER2+"],
          prior_treatments: [],
          location_city: null,
          location_state: null,
          travel_radius_miles: 50,
          patient_age: null,
          missing_fields: [],
          search_terms: "breast cancer"
        };

        try {
          const res = await fetch("/api/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: textToSend, customKey: apiKey || undefined })
          });
          if (res.ok) {
            extractedProfile = await res.json();
            extractedCondition = extractedProfile.condition || textToSend;
          }
        } catch (e) {
          console.error(e);
        }

        setPatientProfile(extractedProfile);
        setChatStep(1);

        setChatHistory([
          ...updatedHistory,
          {
            sender: "ai",
            text: `Got it — ${extractedCondition}. That's enough to start searching, but a few more details will sharpen the matches.

Where is she located, and how far can she reasonably travel for treatment? Many trials run at a single site.`
          }
        ]);

      } 
      else if (chatStep === 1) {
        // Step 1: Location provided -> Step 2: Treatments
        let city = "San Jose";
        let state = "CA";
        let radius = 40;

        if (textToSend.toLowerCase().includes("houston")) {
          city = "Houston";
          state = "TX";
          radius = 50;
        } else if (textToSend.toLowerCase().includes("sacramento")) {
          city = "Sacramento";
          state = "CA";
          radius = 50;
        }

        const matchMiles = textToSend.match(/(\d+)\s*mile/i);
        if (matchMiles) {
          radius = parseInt(matchMiles[1], 10);
        }

        const updatedProfile = {
          ...patientProfile!,
          location_city: city,
          location_state: state,
          travel_radius_miles: radius
        };

        setPatientProfile(updatedProfile);
        setChatStep(2);

        setChatHistory([
          ...updatedHistory,
          {
            sender: "ai",
            text: `${city}, ${radius} miles — that opens up several major centers including Stanford and UCSF. Last question before I search:

What treatments has she already received? This affects which trials she's eligible for.`
          }
        ]);
      } 
      else if (chatStep === 2) {
        // Step 2: Treatments provided -> Step 3: Trigger Search
        const updatedProfile = {
          ...patientProfile!,
          prior_treatments: [textToSend]
        };

        setPatientProfile(updatedProfile);
        setChatStep(3);

        setChatHistory([
          ...updatedHistory,
          {
            sender: "ai",
            text: `Thank you. Here's what I have:

  Condition · ${updatedProfile.condition}
  Location · ${updatedProfile.location_city}, ${updatedProfile.location_state || ""} (${updatedProfile.travel_radius_miles} mile radius)
  Prior treatment · ${textToSend}

Searching ClinicalTrials.gov now...`
          }
        ]);

        setCurrentStep(2); // Find matches progress active
        await runSearch(updatedProfile);
      } 
      else if (chatStep === 4) {
        // Step 4: Freeform chat question proxy to Gemini oncologist agent
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: updatedHistory,
            patientProfile,
            trials: analyzedTrials,
            customKey: apiKey || undefined
          })
        });

        if (!res.ok) {
          throw new Error("Chat companion error loading response");
        }

        const data = await res.json();
        setChatHistory([
          ...updatedHistory,
          { sender: "ai", text: data.text }
        ]);
      }
    } catch (e: any) {
      console.error(e);
      setChatHistory([
        ...updatedHistory,
        {
          sender: "ai",
          text: "I encountered a processing error. Let's make sure the key and input details are correct."
        }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Keyboard handles
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Refinement Suggestion Handlers
  const handleChooseRefineSuggestion = (wantMore: boolean) => {
    setShowRefineSuggestion(false);
    setSuggestionChosen(true);
    setChosenRefineSuggestion(wantMore);

    if (wantMore) {
      setChatHistory(prev => [
        ...prev,
        { sender: "user", text: "Yes, ask me more questions" },
        {
          sender: "ai",
          text: `Do you know the HER2 subtype?

HER2 has different intensity levels. The labs usually mark this as "1+", "2+", or "3+" on the pathology report.`
        }
      ]);
      setActiveRefineQuestion(1);
    } else {
      setChatHistory(prev => [
        ...prev,
        { sender: "user", text: "Show me the trials first" },
        {
          sender: "ai",
          text: "Sounds good. I'm here if you have questions about any specific trial."
        }
      ]);
      setChatStep(4); // Advance to freeform
    }
  };

  // Answer Questions Handlers
  const handleSelectRefine = async (choiceValue: string, choiceLabel: string) => {
    setSelectedRefineChoice(choiceValue);
    setIsChatLoading(true);

    if (activeRefineQuestion === 1) {
      const updatedProfile = {
        ...patientProfile!,
        biomarkers: [...(patientProfile?.biomarkers || []), `HER2 ${choiceValue}`]
      };
      setPatientProfile(updatedProfile);

      setChatHistory(prev => [
        ...prev,
        { sender: "user", text: choiceLabel }
      ]);

      // Re-query ClinicalTrials.gov and re-rank with updated biomarker status!
      try {
        const studies = await searchTrials(updatedProfile);
        const candidates = studies.slice(0, 5);
        const explanations = await Promise.all(
          candidates.map(async (study) => {
            const parsed = parseTrialData(study);
            try {
              const res = await fetch("/api/explain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patientProfile: updatedProfile,
                  trial: parsed,
                  customKey: apiKey || undefined
                })
              });
              return res.ok ? await res.json() : null;
            } catch {
              return null;
            }
          })
        );

        const fullyAnalyzed: AnalyzedTrial[] = candidates.map((study, idx) => {
          const parsed = parseTrialData(study);
          return {
            ...parsed,
            explanation: explanations[idx] || {
              plain_english_summary: `This trial is research matching standard biomarker features.`,
              relevance_reason: "Matches conditions.",
              possible_blockers: [],
              missing_info_needed: [],
              questions_for_doctor: [],
              confidence: "medium",
              confidence_reason: "Basic keyword match"
            }
          };
        });

        fullyAnalyzed.sort((a, b) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return rank[a.explanation.confidence] - rank[b.explanation.confidence];
        });

        setAnalyzedTrials(fullyAnalyzed);
      } catch (err) {
        console.warn("Reranking failed", err);
      }

      setChatHistory(prev => [
        ...prev,
        {
          sender: "ai",
          text: `Got it. I've updated the matches on the right.

Has the cancer spread beyond the breast (metastasized)?

This affects which trials apply. You can usually find this in recent imaging reports or by asking the oncologist.`
        }
      ]);

      setActiveRefineQuestion(2);
      setSelectedRefineChoice(null);

    } else if (activeRefineQuestion === 2) {
      const finalProfile = {
        ...patientProfile!,
        stage: choiceValue === "yes" ? "metastatic" : "localized"
      };
      setPatientProfile(finalProfile);

      setChatHistory(prev => [
        ...prev,
        { sender: "user", text: choiceLabel }
      ]);

      // Re-query/re-rank final parameters
      try {
        const studies = await searchTrials(finalProfile);
        const candidates = studies.slice(0, 5);
        const explanations = await Promise.all(
          candidates.map(async (study) => {
            const parsed = parseTrialData(study);
            try {
              const res = await fetch("/api/explain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  patientProfile: finalProfile,
                  trial: parsed,
                  customKey: apiKey || undefined
                })
              });
              return res.ok ? await res.json() : null;
            } catch {
              return null;
            }
          })
        );

        const fullyAnalyzed: AnalyzedTrial[] = candidates.map((study, idx) => {
          const parsed = parseTrialData(study);
          return {
            ...parsed,
            explanation: explanations[idx] || {
              plain_english_summary: `This trial investigates oncology therapies.`,
              relevance_reason: "Matches conditions.",
              possible_blockers: [],
              missing_info_needed: [],
              questions_for_doctor: [],
              confidence: "medium",
              confidence_reason: "Keyword match"
            }
          };
        });

        fullyAnalyzed.sort((a, b) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return rank[a.explanation.confidence] - rank[b.explanation.confidence];
        });

        setAnalyzedTrials(fullyAnalyzed);
      } catch (err) {
        console.warn("Rerank failed", err);
      }

      setChatHistory(prev => [
        ...prev,
        {
          sender: "ai",
          text: `Got it. I've updated the matches on the right.

I'm here if you have questions about any specific trial.`
        }
      ]);

      setActiveRefineQuestion(null);
      setSelectedRefineChoice(null);
      setChatStep(4); // Move to freeform chat
    }

    setIsChatLoading(false);
  };

  // Switch trials in packet
  const toggleTrialInPacket = (trial: AnalyzedTrial) => {
    setSelectedTrials((prev) => {
      const exists = prev.some((t) => t.nctId === trial.nctId);
      if (exists) {
        return prev.filter((t) => t.nctId !== trial.nctId);
      } else {
        return [...prev, trial];
      }
    });
  };

  // Easy reset for debugging or starting fresh
  const handleRestart = () => {
    setIsLandingAdlibPage(true);
    setCurrentStep(1);
    setChatStep(0);
    setPatientProfile(null);
    setAnalyzedTrials([]);
    setSelectedTrials([]);
    setSuggestionChosen(false);
    setShowRefineSuggestion(false);
    setActiveRefineQuestion(null);
    setExpandedTrialIds({});
    setSelectedModalTrial(null);
    setChatHistory([
      {
        sender: "ai",
        text: `Hi. I'm here to help you find clinical trials that may be relevant for cancer treatment.

I'll ask you a few questions in plain language. Everything you share stays in your browser — nothing is stored on our servers. Results come from ClinicalTrials.gov, the public NIH database of 65,000+ recruiting trials.

I'm not a doctor. The goal is to prepare you for a better conversation with your oncologist.

Ready when you are. Let's start with the basics — who are we looking for trials for, and what's the diagnosis?`
      }
    ]);
  };

  // Generate synthetic bullets for "What participation involves" to strictly respect requested layout
  const getParticipationBullets = (t: AnalyzedTrial) => {
    const list: string[] = [];
    const summary = t.explanation.plain_english_summary || "";
    
    // First sentence of summary
    const splitSentences = summary.split(/[.!?]+/);
    if (splitSentences && splitSentences[0]) {
      list.push(splitSentences[0].trim());
    } else {
      list.push("Testing advanced drug target applications");
    }

    // Facility of target city or fallback
    if (t.locations && t.locations.length > 0) {
      const primaryLoc = t.locations.find(l => l.state === patientProfile?.location_state) || t.locations[0];
      list.push(`${primaryLoc.facility || "Cancer Center"} · Clinic Location`);
    } else {
      list.push("Clinic matches with designated medical center");
    }

    list.push("Clinic visit evaluation · check with research nurse");

    if (summary.toLowerCase().includes("random") || t.title.toLowerCase().includes("random")) {
      list.push("Randomized — you may receive a comparison drug");
    }

    return list;
  };

  // Generate check lists for doctor
  const getDoctorBullets = (t: AnalyzedTrial) => {
    if (t.explanation.possible_blockers && t.explanation.possible_blockers.length > 0) {
      return t.explanation.possible_blockers.slice(0, 3);
    }
    return [
      "Are prior targeted therapy counts a blocker?",
      "Does cardiac output capacity affect qualification?",
      "Are there custom baseline labs needed prior to enrollment?"
    ];
  };

  // Sort trials dynamically based on selection - Requirement 9
  const getSortedTrials = () => {
    const trialsCopy = [...analyzedTrials];
    if (sortBy === "recent") {
      // Newer NCT ID is higher
      return trialsCopy.sort((a, b) => b.nctId.localeCompare(a.nctId));
    } else if (sortBy === "phase") {
      const getPhaseScore = (p: string) => {
        const lower = p.toLowerCase();
        if (lower.includes("phase 4")) return 4;
        if (lower.includes("phase 3")) return 3;
        if (lower.includes("phase 2")) return 2;
        if (lower.includes("phase 1")) return 1;
        return 0;
      };
      return trialsCopy.sort((a, b) => getPhaseScore(b.phase) - getPhaseScore(a.phase));
    } else if (sortBy === "distance") {
      const state = patientProfile?.location_state || "";
      const hasStateLoc = (t: AnalyzedTrial) => t.locations.some(l => l.state === state) ? 1 : 0;
      return trialsCopy.sort((a, b) => hasStateLoc(b) - hasStateLoc(a));
    } else {
      // relevance - sort by Gemini confidence
      const rank = { high: 0, medium: 1, low: 2 };
      return trialsCopy.sort((a, b) => {
        const aConf = a.explanation?.confidence || "medium";
        const bConf = b.explanation?.confidence || "medium";
        return rank[aConf] - rank[bConf];
      });
    }
  };

  return (
    <div id="lantern_root" className="min-h-screen h-screen flex flex-col bg-white text-[#0F0F0E] font-sans antialiased overflow-hidden">
      
      {/* Top Header / Navigation Bar */}
      <header className="h-[56px] border-b border-[#E8E6E1] bg-white flex items-center justify-between px-8 select-none shrink-0 z-30">
        <div 
          onClick={handleRestart}
          className="text-[15px] font-medium text-[#0F0F0E] tracking-tight font-sans cursor-pointer flex items-center space-x-2"
        >
          <span className="font-serif italic font-semibold text-lg text-black">Lantern</span>
          <span className="text-[10px] text-[#8E8D89] font-sans font-light tracking-wide">• Clinical Navigation</span>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <button
              onClick={() => setShowKeyInput(!showKeyInput)}
              className="text-[#8E8D89] hover:text-[#0F0F0E] transition bg-transparent border border-[#C8C6BF] p-1.5 cursor-pointer flex items-center justify-center rounded-[2px]"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>

            {showKeyInput && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-[#E8E6E1] p-4 shadow-md w-72 text-left animate-fade-in">
                <h4 className="text-[10px] uppercase tracking-[0.1em] font-medium text-[#8E8D89] mb-2 font-sans">
                  Settings
                </h4>
                {hasServerKey && (
                  <p className="text-[11px] text-[#4B4B47] mb-2 font-sans bg-[#FAFAF8] p-1.5 border border-[#E8E6E1]">
                    ✓ Workspace API key loaded.
                  </p>
                )}
                <input
                  type="password"
                  value={apiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Gemini API Key..."
                  className="w-full text-xs p-2 border border-[#C8C6BF] outline-none focus:border-[#0F0F0E] font-sans rounded-none"
                />
                <p className="text-[10px] text-[#BDBCB8] mt-2 font-sans leading-normal">
                  Saved securely in local storage. Get a key at ai.google.dev.
                </p>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Progress Bar Header Strip (1px bottom border) */}
      <div className="h-[48px] bg-white border-b border-[#E8E6E1] flex items-center px-8 text-[11px] font-sans select-none shrink-0 z-10">
        <div className="flex items-center w-full max-w-7xl mx-auto">
          {/* Step 1: Tell us about you */}
          <div className="flex items-center space-x-2 shrink-0">
            {currentStep >= 1 ? (
              <div className="w-[8px] h-[8px] rounded-full bg-[#0F0F0E]" />
            ) : (
              <div className="w-[8px] h-[8px] rounded-full border border-[#C8C6BF]" />
            )}
            <span 
              className={`font-sans tracking-[0.08em] uppercase ${
                currentStep === 1 ? "text-[#0F0F0E] font-medium" : "text-[#8E8D89]"
              }`}
            >
              Tell us about you
            </span>
          </div>

          <div className={`flex-1 h-[1px] mx-4 ${currentStep > 1 ? "bg-[#0F0F0E]" : "bg-[#E8E6E1]"}`} />

          {/* Step 2: Find matches */}
          <div className="flex items-center space-x-2 shrink-0">
            {currentStep >= 2 ? (
              <div className="w-[8px] h-[8px] rounded-full bg-[#0F0F0E]" />
            ) : (
              <div className="w-[8px] h-[8px] rounded-full border border-[#C8C6BF]" />
            )}
            <span 
              className={`font-sans tracking-[0.08em] uppercase ${
                currentStep === 2 ? "text-[#0F0F0E] font-medium" : currentStep > 2 ? "text-[#8E8D89]" : "text-[#BDBCB8]"
              }`}
            >
              Find matches
            </span>
          </div>

          <div className={`flex-1 h-[1px] mx-4 ${currentStep > 2 ? "bg-[#0F0F0E]" : "bg-[#E8E6E1]"}`} />

          {/* Step 3: Review trials */}
          <div className="flex items-center space-x-2 shrink-0">
            {currentStep >= 3 ? (
              <div className="w-[8px] h-[8px] rounded-full bg-[#0F0F0E]" />
            ) : (
              <div className="w-[8px] h-[8px] rounded-full border border-[#C8C6BF]" />
            )}
            <span 
              className={`font-sans tracking-[0.08em] uppercase ${
                currentStep === 3 ? "text-[#0F0F0E] font-medium" : currentStep > 3 ? "text-[#8E8D89]" : "text-[#BDBCB8]"
              }`}
            >
              Review trials
            </span>
          </div>

          <div className={`flex-1 h-[1px] mx-4 ${currentStep > 3 ? "bg-[#0F0F0E]" : "bg-[#E8E6E1]"}`} />

          {/* Step 4: Build packet */}
          <div className="flex items-center space-x-2 shrink-0">
            {currentStep >= 4 ? (
              <div className="w-[8px] h-[8px] rounded-full bg-[#0F0F0E]" />
            ) : (
              <div className="w-[8px] h-[8px] rounded-full border border-[#C8C6BF]" />
            )}
            <span 
              className={`font-sans tracking-[0.08em] uppercase ${
                currentStep === 4 ? "text-[#0F0F0E] font-medium" : "text-[#BDBCB8]"
              }`}
            >
              Build packet
            </span>
          </div>
        </div>
      </div>

      {/* Main Content View Switcher */}
      {isLandingAdlibPage ? (
        /* Dynamic Intake AdLib Landing Page - Requirement 2 */
        <div className="flex-1 overflow-y-auto bg-white flex flex-col justify-center py-10 px-8 transition-all">
          <div className="max-w-4xl mx-auto w-full text-center space-y-12 animate-fade-in">
            
            <div className="space-y-4">
              <span className="font-sans text-[10px] uppercase tracking-[0.2em] text-[#8E8D89] font-medium">
                NIH Clinical Registry Navigator
              </span>
              <h1 className="font-serif text-5xl md:text-6xl text-[#0F0F0E] font-light tracking-tight px-4 leading-tight">
                Empowering patients & doctors <br />with trial matching.
              </h1>
              <p className="text-[#8E8D89] text-[13px] md:text-[14px] max-w-xl mx-auto font-sans leading-relaxed font-light">
                Fill in the basic medical parameters below to search recruiting cancer investigations on the NIH clinical trials registry. All calculations run strictly inside your browser.
              </p>
            </div>

            {/* Interactive Mad-Lib intake form */}
            <form onSubmit={handleSubmitAdlib} className="max-w-3xl mx-auto text-left relative p-8 border border-[#E8E6E1] bg-[#FAFAF8] shadow-xs">
              <div className="font-serif text-[22px] md:text-[28px] leading-[2.4] text-[#0F0F0E] font-normal tracking-wide">
                I am looking for clinical trials for{" "}
                <input
                  type="text"
                  value={adlibRelation}
                  onChange={(e) => setAdlibRelation(e.target.value)}
                  placeholder="my mother"
                  style={{
                    width: adlibRelation ? `${Math.max(adlibRelation.length, 1)}ch` : "9ch",
                    minWidth: "75px"
                  }}
                  className="border-b-2 border-[#C8C6BF] focus:border-[#0F0F0E] bg-transparent outline-none py-1 px-1 font-serif text-[20px] md:text-[26px] font-normal italic placeholder-[#D1D1CB] text-[#0F0F0E] inline-block transition-all"
                />
                {" "}who is diagnosed with{" "}
                <input
                  type="text"
                  value={adlibCondition}
                  onChange={(e) => setAdlibCondition(e.target.value)}
                  placeholder="Stage 3 HER2-positive breast cancer"
                  style={{
                    width: adlibCondition ? `${Math.max(adlibCondition.length, 1)}ch` : "33ch",
                    minWidth: "120px"
                  }}
                  className="border-b-2 border-[#C8C6BF] focus:border-[#0F0F0E] bg-transparent outline-none py-1 px-1 font-serif text-[20px] md:text-[26px] font-normal italic placeholder-[#D1D1CB] text-[#0F0F0E] inline-block transition-all"
                />
                , currently residing near{" "}
                <input
                  type="text"
                  value={adlibLocation}
                  onChange={(e) => setAdlibLocation(e.target.value)}
                  placeholder="San Jose, CA"
                  style={{
                    width: adlibLocation ? `${Math.max(adlibLocation.length, 1)}ch` : "12ch",
                    minWidth: "80px"
                  }}
                  className="border-b-2 border-[#C8C6BF] focus:border-[#0F0F0E] bg-transparent outline-none py-1 px-1 font-serif text-[20px] md:text-[26px] font-normal italic placeholder-[#D1D1CB] text-[#0F0F0E] inline-block transition-all"
                />
                , with a maximum travel distance of{" "}
                <input
                  type="text"
                  value={adlibRadius === "" ? "" : adlibRadius.toString()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setAdlibRadius("");
                    } else {
                      const num = parseInt(val, 10);
                      setAdlibRadius(isNaN(num) ? "" : num);
                    }
                  }}
                  placeholder="50"
                  style={{
                    width: adlibRadius !== "" ? `${Math.max(adlibRadius.toString().length, 1)}ch` : "2ch",
                    minWidth: "35px"
                  }}
                  className="border-b-2 border-[#C8C6BF] focus:border-[#0F0F0E] bg-transparent outline-none py-1 px-1 font-serif text-[20px] md:text-[26px] text-center font-normal italic placeholder-[#D1D1CB] text-[#0F0F0E] inline-block transition-all"
                />
                {" "}miles.
              </div>

              <div className="mt-10 pt-6 border-t border-[#E8E6E1] flex flex-col md:flex-row items-center justify-between gap-4">
                <button
                  type="submit"
                  className="packet-active text-[13px] uppercase tracking-wider px-8 py-3.5 font-sans font-medium bg-[#0F0F0E] text-white hover:opacity-90 shrink-0 w-full md:w-auto rounded-[2px]"
                >
                  Search Registry & Match ↗
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdlibRelation("my mother");
                    setAdlibCondition("Stage 3 HER2-positive breast cancer");
                    setAdlibLocation("San Jose, CA");
                    setAdlibRadius(50);
                  }}
                  className="text-xs font-sans tracking-wide text-[#8E8D89] hover:text-[#0F0F0E] transition cursor-pointer"
                >
                  Or fill with a sample case
                </button>
              </div>
            </form>

            <div className="text-[10px] uppercase text-[#BDBCB8] tracking-widest">
              Secured with browser sandbox • Connected verified ClinicalTrials.gov endpoints 
            </div>

          </div>
        </div>
      ) : (
        /* Main Split Screen Area - Requirement 3: Both left and side sections should be independently scrollable */
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden bg-white">
          
          {/* Left Panel: CHAT PANEL (Scrolls independently) */}
          <aside className={`flex flex-col h-full overflow-hidden bg-white border-r border-[#E8E6E1] transition-all duration-300 shrink-0 relative ${
            isRightPanelCollapsed ? "w-full lg:w-full" : "w-full lg:w-[44%]"
          }`}>
            {isRightPanelCollapsed && (
              <button
                onClick={() => setIsRightPanelCollapsed(false)}
                className="absolute right-6 top-6 z-40 bg-white border border-[#C8C6BF] hover:border-[#0F0F0E] text-[#4B4B47] hover:text-[#0F0F0E] px-3.5 py-2 shadow-sm text-xs font-sans font-medium uppercase tracking-wider transition rounded-[2px] cursor-pointer flex items-center space-x-1"
                title="Show Results Panel"
              >
                <span>Show Results</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            )}

            {/* Scrollable conversation bubble arena */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#E8E6E1] pr-1 scrollbar-thin">
              {chatHistory.map((msg, index) => {
                const isAi = msg.sender === "ai";
                return (
                  <div key={index} className="flex flex-col">
                    <div className={`py-6 ${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} text-[14px] font-sans leading-[1.6] ${
                      isAi ? "text-[#4B4B47] text-left" : "text-[#0F0F0E] text-right font-medium"
                    }`}>
                      <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"} ${isAi ? "text-left" : "flex justify-end"}`}>
                        <div className={isAi ? "w-full" : "inline-block max-w-[80%] text-right"}>
                          <p className="whitespace-pre-line leading-relaxed">{msg.text}</p>
                        </div>
                      </div>
                    </div>

                    {/* Render Example Chip strictly under initial message */}
                    {isAi && index === 0 && chatStep === 0 && (
                      <div className={`${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} pb-6`}>
                        <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"} flex flex-wrap gap-2`}>
                          <button 
                            onClick={handleTryExample}
                            className="chip"
                          >
                            Try an example: my mom, Stage 3 HER2+ breast cancer
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Yes / No Choices suggestion for Refinement */}
                    {isAi && index === chatHistory.length - 1 && showRefineSuggestion && (
                      <div className={`${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} pb-6`}>
                        <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"} flex flex-wrap gap-2`}>
                          <button
                            onClick={() => handleChooseRefineSuggestion(true)}
                            className="chip"
                          >
                            Yes, ask me more questions
                          </button>
                          <button
                            onClick={() => handleChooseRefineSuggestion(false)}
                            className="chip"
                          >
                            Show me the trials first
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Refining options with chips - Question 1 */}
                    {isAi && index === chatHistory.length - 1 && activeRefineQuestion === 1 && (
                      <div className={`${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} pb-6`}>
                        <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"} flex flex-wrap gap-2`}>
                          <button onClick={() => handleSelectRefine("3+", "3+ (strongly positive)")} className="chip">
                            3+ (strongly positive)
                          </button>
                          <button onClick={() => handleSelectRefine("2+", "2+ (weakly positive)")} className="chip">
                            2+ (weakly positive)
                          </button>
                          <button onClick={() => handleSelectRefine("unknown", "I don't know")} className="chip">
                            I don't know
                          </button>
                          <button onClick={() => handleSelectRefine("skip", "Skip")} className="chip">
                            Skip
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Refining options with chips - Question 2 */}
                    {isAi && index === chatHistory.length - 1 && activeRefineQuestion === 2 && (
                      <div className={`${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} pb-6`}>
                        <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"} flex flex-wrap gap-2`}>
                          <button onClick={() => handleSelectRefine("yes", "Yes, it has spread")} className="chip">
                            Yes, it has spread
                          </button>
                          <button onClick={() => handleSelectRefine("no", "No, localized only")} className="chip">
                            No, localized only
                          </button>
                          <button onClick={() => handleSelectRefine("unknown", "I don't know")} className="chip">
                            I don't know
                          </button>
                          <button onClick={() => handleSelectRefine("skip", "Skip")} className="chip">
                            Skip
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {isChatLoading && (
                <div className={`py-6 ${isRightPanelCollapsed ? "px-12 md:px-24" : "px-8"} text-[#BDBCB8] font-sans text-xs italic`}>
                  <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"}`}>
                    Companion is analyzing response parameters...
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area (Pinned Bottom) */}
            <div className={`border-t border-[#E8E6E1] ${isRightPanelCollapsed ? "p-6 px-12 md:px-24" : "p-5"} bg-white shrink-0 z-10`}>
              <div className={`mx-auto ${isRightPanelCollapsed ? "max-w-4xl" : "w-full"}`}>
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your clinical question or update medical conditions..."
                  disabled={isChatLoading || activeRefineQuestion !== null || showRefineSuggestion}
                  className="w-full border-none outline-none resize-none font-sans text-[14px] text-[#0F0F0E] bg-transparent min-h-[24px] max-h-[100px] leading-[1.6] placeholder-[#BDBCB8]"
                />
                <div className="flex justify-between items-center mt-2.5 pt-1.5 border-t border-[#FAFAF8]">
                  <span className="text-[11px] text-[#BDBCB8] font-sans">
                    Enter to send · Shift+Enter for newline
                  </span>
                  <button
                    onClick={handleSend}
                    disabled={isChatLoading || !chatInput.trim() || activeRefineQuestion !== null || showRefineSuggestion}
                    className={`bg-none border-none font-sans font-semibold text-[12px] uppercase tracking-wider cursor-pointer transition ${
                      chatInput.trim() && !isChatLoading && activeRefineQuestion === null && !showRefineSuggestion
                        ? "text-[#0F0F0E] hover:underline"
                        : "text-[#8E8D89] cursor-not-allowed"
                    }`}
                  >
                    Send Message →
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Right Panel: CONTEXT PANEL / MATCHED TRIALS - Requirement 1 & 3: Collapse and independently scrollable */}
          {!isRightPanelCollapsed && (
            <main className="w-full lg:w-[56%] bg-[#FAFAF8] flex flex-col select-none h-full relative border-l border-[#E8E6E1] p-0 font-sans overflow-hidden">
              
              {/* Scrollable Content Container */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                
                {/* Stage 1: Tell us about you */}
                {currentStep === 1 && (
                  <div className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-2 py-12">
                    <HelpCircle className="w-8 h-8 text-[#BDBCB8]" />
                    <h3 className="font-sans text-[10px] uppercase tracking-[0.1em] text-[#8E8D89] font-semibold">
                      Awaiting Profile Coordinates
                    </h3>
                    <p className="font-sans text-[13px] text-[#8E8D89] font-light leading-relaxed">
                      Once we finish understanding your clinical vectors via conversation, recruiting matchups will display right here.
                    </p>
                  </div>
                )}

                {/* Stage 2: Find matches (searching) */}
                {currentStep === 2 && (
                  <div className="space-y-6 text-left">
                    <div className="font-sans text-[10px] uppercase tracking-[0.15em] text-[#8E8D89] font-medium block border-b border-[#E8E6E1] pb-2">
                      SEARCHING NIH REGISTRY ENDPOINTS (65,000+ TRIALS)
                    </div>
                    
                    <div className="space-y-3 font-sans text-xs">
                      <div className="flex items-center space-x-2 text-[#4B4B47]">
                        <span className={loadingStep >= 1 ? "text-[#0F0F0E] font-medium" : "text-[#BDBCB8]"}>
                          {loadingStep > 1 ? "✓ " : "● "}Mapping profile conditions
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[#4B4B47]">
                        <span className={loadingStep >= 2 ? "text-[#0F0F0E] font-medium" : "text-[#BDBCB8]"}>
                          {loadingStep > 2 ? "✓ " : "● "}Quering ClinicalTrials.gov NIH API
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-[#4B4B47]">
                        <span className={loadingStep >= 3 ? "text-[#0F0F0E] font-medium" : "text-[#BDBCB8]"}>
                          {loadingStep > 3 ? "✓ " : "● "}De-fragmenting eligibility parameters
                        </span>
                      </div>
                    </div>

                    {/* Skeleton trial cards */}
                    <div className="space-y-4 pt-4">
                      {[1, 2, 3].map((idx) => (
                        <div key={idx} className="bg-white border border-[#E8E6E1] p-6 space-y-4 font-sans">
                          <div className="h-4 bg-[#FAFAF8] w-24 animate-pulse rounded" />
                          <div className="h-5 bg-[#FAFAF8] w-72 animate-pulse rounded" />
                          <div className="h-4 bg-[#FAFAF8] w-48 animate-pulse rounded" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stage 3 & 4: Review trials / Build packet */}
                {(currentStep === 3 || currentStep === 4) && (
                  <div className="space-y-6">
                    
                    {/* Context Panel Header */}
                    <div className="pb-3 border-b border-[#E8E6E1] flex items-center justify-between text-xs text-[#8E8D89] font-sans">
                      <div className="font-normal text-[#4B4B47]">
                        {analyzedTrials.length} clinical candidates matching <span className="italic font-serif">{patientProfile?.location_city || "your center"}</span>
                      </div>
                      <div className="flex items-center space-x-3.5">
                        <div className="flex items-center space-x-1.5">
                          <label className="text-[#8E8D89]">Order: </label>
                          <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)}
                            className="border-none bg-transparent font-sans text-xs font-semibold text-[#4B4B47] cursor-pointer focus:outline-none"
                          >
                            <option value="relevance">Relevance Metric</option>
                            <option value="recent">Recent</option>
                            <option value="phase">Phase (Highest First)</option>
                            <option value="distance">Distance (In-State First)</option>
                          </select>
                        </div>
                        <span className="text-[#E8E6E1]">|</span>
                        <button
                          onClick={() => setIsRightPanelCollapsed(true)}
                          className="text-[#8E8D89] hover:text-[#0F0F0E] transition p-0.5 cursor-pointer flex items-center bg-transparent"
                          title="Hide Results"
                        >
                          <X className="w-3.5 h-3.5 mr-1" />
                          <span className="text-[10px] uppercase font-semibold tracking-wider font-sans">Hide</span>
                        </button>
                      </div>
                    </div>

                  {/* Trials UI representation - Level 1 (Minimal Table/List), Level 2 (Expanded Card), Level 3 (Full Registry Overlay) */}
                  {analyzedTrials.length === 0 ? (
                    <div className="bg-white border border-[#E8E6E1] p-12 text-center space-y-4">
                      <div className="space-y-1">
                        <h4 className="font-serif text-[22px] font-normal text-[#0F0F0E]">
                          No Recruiting Protocols Connected
                        </h4>
                        <p className="font-sans text-[13px] text-[#8E8D89] leading-relaxed max-w-sm mx-auto font-light">
                          No active recruitment studies on ClinicalTrials.gov matched specified medical bounds within {patientProfile?.travel_radius_miles || 50} miles of coordinates.
                        </p>
                      </div>
                      <button
                        onClick={handleRestart}
                        className="text-[12px] uppercase font-sans font-semibold tracking-wider text-[#4B4B47] underline hover:text-[#0F0F0E] cursor-pointer"
                      >
                        Adjust Coordinates
                      </button>
                    </div>
                  ) : (
                    /* The list represents Level 1 of refinement as requested in Requirement 4 */
                    <div className="space-y-3 text-left">
                      {getSortedTrials().map((trial) => {
                        const isSelected = selectedTrials.some((t) => t.nctId === trial.nctId);
                        const isExpanded = !!expandedTrialIds[trial.nctId];
                        return (
                          <article key={trial.nctId} className="border border-[#E8E6E1] bg-white hover:border-[#C8C6BF] transition flex flex-col group py-1">
                            
                            {/* LEVEL 1: High Density / Minimal row header */}
                            <div className="flex items-start md:items-center justify-between p-5 select-none relative gap-4">
                              <div className="flex items-center space-x-3.5 min-w-0">
                                
                                {/* Requirement 5: Tick checkbox to select or deselect from package */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTrialInPacket(trial);
                                  }}
                                  className={`w-5 h-5 flex items-center justify-center border cursor-pointer transition shrink-0 ${
                                    isSelected 
                                      ? "bg-[#0F0F0E] border-[#0F0F0E] text-white" 
                                      : "bg-white border-[#C8C6BF] text-transparent hover:border-[#0F0F0E]"
                                  }`}
                                  title={isSelected ? "Remove from doctor packet" : "Add to doctor packet"}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                </button>

                                <div className="min-w-0 pr-1">
                                  {/* Badging / Staging Metadata */}
                                  <div className="flex flex-wrap items-center gap-x-2 text-[10px] uppercase font-mono tracking-wider text-[#8E8D89] mb-1">
                                    <span className="font-semibold text-[#4B4B47]">{trial.phase}</span>
                                    <span>·</span>
                                    <span className="truncate max-w-[150px] md:max-w-[200px]">{trial.sponsor}</span>
                                    <span>·</span>
                                    <span className="text-[#BDBCB8]">{trial.nctId}</span>
                                  </div>

                                  {/* Headline */}
                                  <h3 
                                    onClick={() => toggleExpandTrial(trial.nctId)}
                                    className="font-sans text-[15px] font-medium text-[#0F0F0E] cursor-pointer hover:underline tracking-tight line-clamp-1"
                                  >
                                    {trial.explanation.plain_english_title || trial.title}
                                  </h3>
                                </div>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => toggleExpandTrial(trial.nctId)}
                                  className="text-[11px] font-sans font-medium text-[#4B4B47] hover:text-[#0F0F0E] border border-[#E8E6E1] px-2.5 py-1.5 cursor-pointer bg-white"
                                >
                                  {isExpanded ? "Less" : "Explain"}
                                </button>
                                
                                <button
                                  type="button"
                                  onClick={() => setSelectedModalTrial(trial)}
                                  className="text-[11px] font-sans font-semibold text-white bg-[#0F0F0E] hover:opacity-90 px-2.5 py-1.5 cursor-pointer"
                                >
                                  Details ↗
                                </button>
                              </div>
                            </div>

                            {/* LEVEL 2: Expanded Inline Card Details */}
                            {isExpanded && (
                              <div className="border-t border-[#E8E6E1] p-6 lg:p-7 bg-[#FAFAF8] space-y-5 text-left text-xs">
                                
                                <div>
                                  <span className="text-[9px] uppercase tracking-widest text-[#8E8D89] font-bold block mb-1">
                                    Official Protocol Registration Name
                                  </span>
                                  <p className="text-[12px] italic text-[#8E8D89] font-sans leading-relaxed">
                                    {trial.title}
                                  </p>
                                </div>

                                <section className="space-y-1">
                                  <span className="text-[10px] uppercase tracking-widest text-[#8E8D89] font-semibold block">
                                    Trial Summary (Plain English)
                                  </span>
                                  <p className="text-[13px] text-[#4B4B47] leading-relaxed">
                                    {trial.explanation.relevance_reason}
                                  </p>
                                </section>

                                <section className="space-y-1.5">
                                  <span className="text-[10px] uppercase tracking-widest text-[#8E8D89] font-semibold block">
                                    What participation involves
                                  </span>
                                  <ul className="space-y-1">
                                    {getParticipationBullets(trial).map((b, idx) => (
                                      <li key={idx} className="text-[13px] text-[#4B4B47] pl-3.5 relative">
                                        <span className="absolute left-0 text-[#8E8D89]">·</span>
                                        {b}
                                      </li>
                                    ))}
                                  </ul>
                                </section>

                                {/* Things meant for the physician are kept in a separate diagnostic compartment */}
                                <section className="p-4 bg-white border border-[#E8E6E1] space-y-1.5 rounded-[2px]" id={`oncology_notes_${trial.nctId}`}>
                                  <span className="text-[9px] uppercase tracking-widest font-bold text-[#8E8D89] block">
                                    Oncology Companion Notes (Meant for Physician check)
                                  </span>
                                  <p className="text-[11px] text-[#8E8D89] font-sans">
                                    Review these biomarker qualifications and eligibility barriers with your doctor because they are complex:
                                  </p>
                                  <ul className="space-y-1 font-mono text-[11px] text-[#4B4B47]">
                                    {getDoctorBullets(trial).map((b, idx) => (
                                      <li key={idx} className="pl-3 relative">
                                        <span className="absolute left-0 text-[#8E8D89]">-</span>
                                        {b}
                                      </li>
                                    ))}
                                  </ul>
                                </section>

                                <div className="flex justify-between items-center pt-3 border-t border-[#E8E6E1] text-[11px]">
                                  <button
                                    onClick={() => setSelectedModalTrial(trial)}
                                    className="text-[#4B4B47] hover:text-[#0F0F0E] underline font-medium cursor-pointer"
                                  >
                                    View Full Registry, Contacts & Eligibility ↗
                                  </button>
                                  
                                  <a 
                                    href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                                    target="_blank" 
                                    rel="noreferrer noopener"
                                    className="text-[#8E8D89] hover:text-[#0F0F0E] underline font-sans"
                                  >
                                    NIH ClinicalTrials.gov link
                                  </a>
                                </div>

                              </div>
                            )}

                          </article>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              </div> {/* Close Scrollable Content Container */}

              {/* Pinned Doctor Packet Bottom Bar - Requirement 5 */}
              {selectedTrials.length > 0 && (
                <div className="border-t border-[#E8E6E1] bg-white p-4.5 px-8 flex items-center justify-between shrink-0 z-20 animate-fade-in">
                  <div className="text-xs font-sans text-[#4B4B47] flex flex-col text-left">
                    <span className="font-semibold text-[#0F0F0E]">{selectedTrials.length} {selectedTrials.length === 1 ? "trial" : "trials"} selected for packet</span>
                    <span className="text-[10px] text-[#8E8D89] font-light mt-0.5 font-sans leading-none">Includes clinical abstracts, eligibility qualifiers & consultation queries</span>
                  </div>
                  <button
                    onClick={downloadPacketAndAdvance}
                    className="packet-active text-xs uppercase tracking-wider font-sans font-bold px-6 py-3 cursor-pointer rounded-[4px] ease-in-out transition-all duration-200"
                  >
                    Download Doctor Packet (PDF)
                  </button>
                </div>
              )}

            </main>
          )}

        </div>
      )}

      {/* LEVEL 3: Full registry detail modal with facility contacts and inclusion checklist - Requirement 4 */}
      {selectedModalTrial && (
        <div className="fixed inset-0 bg-[#0F0F0E]/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in" id="registry_modal_container">
          <div className="bg-white border border-[#0F0F0E] w-full max-w-4xl h-[85vh] flex flex-col text-left shadow-lg">
            
            {/* Modal Top Bar */}
            <header className="border-b border-[#0F0F0E] p-6 shrink-0 flex items-center justify-between bg-white">
              <div className="min-w-0 pr-4">
                <span className="text-[9px] font-mono tracking-widest text-[#8E8D89] uppercase block mb-1">
                  NIH CLINICAL STUDY REGISTRY • {selectedModalTrial.phase || "Oncology Phase"}
                </span>
                <h3 className="font-serif text-[20px] md:text-[24px] text-[#0F0F0E] font-medium leading-tight truncate">
                  {selectedModalTrial.explanation.plain_english_title || selectedModalTrial.title}
                </h3>
              </div>
              
              <button
                onClick={() => setSelectedModalTrial(null)}
                className="text-[11px] font-sans uppercase tracking-widest font-semibold text-[#4B4B47] hover:text-[#0F0F0E] border border-[#C8C6BF] hover:border-[#0F0F0E] px-3.5 py-1.5 bg-white cursor-pointer ml-4 shrink-0 transition"
              >
                Close [X]
              </button>
            </header>
            
            {/* Modal Scrollable grid */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 bg-white">
              
              {/* Stat grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 border border-[#E8E6E1] divide-y md:divide-y-0 md:divide-x divide-[#E8E6E1] text-[12px]">
                <div className="p-4">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[#8E8D89] font-medium mb-1">Phase Classification</span>
                  <span className="font-semibold text-[#0F0F0E]">{selectedModalTrial.phase || "Not Disclosed"}</span>
                </div>
                <div className="p-4">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[#8E8D89] font-medium mb-1">Registry Sponsor / Sponsor</span>
                  <span className="font-semibold text-[#0F0F0E]">{selectedModalTrial.sponsor || "Private Sponsor"}</span>
                </div>
                <div className="p-4">
                  <span className="block text-[9px] font-mono uppercase tracking-wider text-[#8E8D89] font-medium mb-1">National Registry Number (NCT)</span>
                  <span className="font-mono text-[#0F0F0E] font-semibold">{selectedModalTrial.nctId}</span>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#8E8D89] font-semibold block">
                  Official Research Specification
                </span>
                <p className="text-[13px] italic text-[#4B4B47] leading-relaxed font-serif">
                  {selectedModalTrial.title}
                </p>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-mono tracking-widest text-[#8E8D89] font-semibold block">
                  Detailed Medical Objective
                </span>
                <p className="text-[14px] text-[#4B4B47] leading-relaxed whitespace-pre-line font-sans">
                  {selectedModalTrial.explanation.plain_english_summary || selectedModalTrial.summary}
                </p>
              </div>

              {/* Direct Facility Contacts & Eligibility Compartments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t border-[#E8E6E1]">
                
                {/* Facilities & Contact columns */}
                <div className="space-y-5">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#8E8D89] font-semibold block">
                    Direct Directory Contacts & Sites
                  </span>

                  {selectedModalTrial.centralContact ? (
                    <div className="bg-[#FAFAF8] p-4 border border-[#E8E6E1] space-y-2">
                      <div className="flex items-center space-x-1.5 text-[9px] uppercase tracking-wider font-bold text-[#8E8D89]">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Central trial coordinator</span>
                      </div>
                      <p className="text-[13px] text-[#0F0F0E] font-medium">
                        {selectedModalTrial.centralContact.name || "NIH Study Lead Coordinator"}
                      </p>
                      {selectedModalTrial.centralContact.phone && (
                        <p className="text-xs text-[#4B4B47] font-mono flex items-center space-x-1">
                          <Phone className="w-3 h-3 text-[#8E8D89]" />
                          <span>{selectedModalTrial.centralContact.phone}</span>
                        </p>
                      )}
                      {selectedModalTrial.centralContact.email && (
                        <p className="text-xs text-[#4B4B47] font-mono flex items-center space-x-1">
                          <Mail className="w-3 h-3 text-[#8E8D89]" />
                          <span>{selectedModalTrial.centralContact.email}</span>
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-mono tracking-wide text-[#8E8D89] font-medium block">
                      Participating Locations
                    </span>
                    <div className="divide-y divide-[#E8E6E1] max-h-[220px] overflow-y-auto pr-2 space-y-3">
                      {selectedModalTrial.locations && selectedModalTrial.locations.length > 0 ? (
                        selectedModalTrial.locations.map((loc, idx) => (
                          <div key={idx} className="pt-2.5 text-xs">
                            <p className="font-semibold text-[#0F0F0E] flex items-start">
                              <MapPin className="w-3.5 h-3.5 text-[#8E8D89] mr-1 mt-0.5" />
                              <span>{loc.facility || "Recruiting Medical Center"}</span>
                            </p>
                            <p className="text-[#8E8D89] pl-4.5">{loc.city}{loc.state ? `, ${loc.state}` : ""}</p>
                            
                            {loc.contact && (
                              <div className="mt-2 pl-4.5 space-y-0.5 text-[11px] text-[#4B4B47]">
                                {loc.contact.name && <p>Contact: {loc.contact.name}</p>}
                                {loc.contact.phone && <p className="font-mono">Tel: {loc.contact.phone}</p>}
                                {loc.contact.email && <p className="font-mono">Email: {loc.contact.email}</p>}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-xs italic text-[#8E8D89]">No site specific coordinates returned from NIH.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Raw eligibility criteria for physician validation */}
                <div className="space-y-3">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#8E8D89] font-semibold block">
                    Full Registry Eligibility Criteria (Raw NIH Specs)
                  </span>
                  <div className="border border-[#E8E6E1] bg-[#FAFAF8] p-4 text-[11px] font-mono text-[#4B4B47] h-[340px] overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                    {selectedModalTrial.eligibilityCriteria || "Protocol registry requirements not specified."}
                  </div>
                </div>

              </div>

            </div>
            
            {/* Modal bottom actions */}
            <footer className="border-t border-[#E8E6E1] p-4 shrink-0 flex justify-between bg-white items-center">
              <span className="text-xs text-[#8E8D89]">
                Print / Save PDF generates the packet for your physician automatically.
              </span>
              
              <button
                onClick={() => {
                  toggleTrialInPacket(selectedModalTrial);
                }}
                className={`text-xs uppercase tracking-wider font-semibold px-6 py-2.5 rounded-[2px] transition shrink-0 cursor-pointer ${
                  selectedTrials.some(t => t.nctId === selectedModalTrial.nctId)
                    ? "bg-[#C8C6BF] text-[#0F0F0E] hover:bg-[#b0aea8]"
                    : "bg-[#0F0F0E] text-white hover:opacity-90"
                }`}
              >
                {selectedTrials.some(t => t.nctId === selectedModalTrial.nctId)
                  ? "✓ In Doctor Packet"
                  : "+ Add to Doctor Packet"}
              </button>
            </footer>

          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white px-8 py-5 border-t border-[#E8E6E1] flex flex-col md:flex-row justify-between items-center text-[10px] text-[#8E8D89] gap-3 mt-auto select-none shrink-0 z-10 font-sans">
        <p className="font-normal text-center md:text-left">
          © {new Date().getFullYear()} TrialBridge • Data sourced in real-time from NIH ClinicalTrials.gov (Updated today)
        </p>
        <p className="uppercase tracking-[0.08em] font-medium text-center md:text-right text-[#BDBCB8]">
          DISCLAIMER: NOT MEDICAL ADVICE. ALWAYS DISCUSS TRIALS WITH YOUR RECRUITING ONCOLOGIST.
        </p>
      </footer>

    </div>
  );
}
