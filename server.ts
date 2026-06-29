import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { CivicIssue } from "./src/types";

dotenv.config();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 3000;
const DEFAULT_LAT = 28.6139;
const DEFAULT_LNG = 77.2090;
const GEMINI_MODEL = "gemini-2.0-flash";
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();

/** Increase payload limit to accept base64 image uploads (~10 MB images). */
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// ---------------------------------------------------------------------------
// In-memory data store
// ---------------------------------------------------------------------------

/**
 * Pre-seeded civic issues used to populate the app on first load.
 * IDs "1"–"5" are treated as demo issues by the frontend.
 */
let issues: CivicIssue[] = [
  {
    id: "1",
    title: "Severe Road Waterlogging & Blockage",
    description:
      "Heavy monsoon shower waterlogging on the main outer ring road near the flyover. Cars are stuck and traffic is at a complete standstill.",
    ward: "Rajpur",
    lat: 28.5500,
    lng: 77.3000,
    imageUrl: null,
    issueType: "Waterlogging / Flooding",
    severity: 9,
    affectedRadius: "200 meters",
    department: "Municipal Storm Water Drain Dept",
    confidence: 96,
    reasoning:
      "High water levels reaching vehicle bumpers under a primary commercial flyover completely disrupts high-density traffic, indicating an emergency flood event.",
    reportCount: 42,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "2",
    title: "Dangerous Deep Crater Pothole",
    description:
      "Deep pothole right after the 80 Feet Road crossing. Two motorcyclists slipped here yesterday evening.",
    ward: "Shastri Nagar",
    lat: 28.6700,
    lng: 77.1900,
    imageUrl: null,
    issueType: "Road Damage",
    severity: 8,
    affectedRadius: "15 meters",
    department: "Municipal Road Infrastructure",
    confidence: 92,
    reasoning:
      "An asphalt collapse on a central arterial road is a severe hazard, especially for two-wheelers, with recorded minor accidents compounding urgency.",
    reportCount: 28,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "3",
    title: "Unattended Commercial Waste Dump",
    description:
      "Huge pile of mixed organic waste, plastics, and wooden boxes left directly on the footpath near the main commercial street, smelling bad.",
    ward: "Civil Lines",
    lat: 28.6800,
    lng: 77.2200,
    imageUrl: null,
    issueType: "Waste Management",
    severity: 6,
    affectedRadius: "40 meters",
    department: "Municipal Solid Waste Management",
    confidence: 89,
    reasoning:
      "Accumulation of commercial garbage blocks a high-traffic pedestrian walkway, causing unsanitary conditions and odor pollution.",
    reportCount: 19,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "4",
    title: "Broken Streetlights Stretch",
    description:
      "A stretch of three streetlights is completely broken, leaving the footpath and half of the road pitch black at night.",
    ward: "Lajpat Nagar",
    lat: 28.5700,
    lng: 77.2400,
    imageUrl: null,
    issueType: "Street Lighting",
    severity: 5,
    affectedRadius: "120 meters",
    department: "Municipal Electrical Division",
    confidence: 91,
    reasoning:
      "Multiple non-functional streetlights on a highly frequented commercial corridor reduce nighttime visibility and raise neighbourhood security concerns.",
    reportCount: 11,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "5",
    title: "Construction Debris Sidewalk Obstruction",
    description:
      "Large pile of concrete blocks, cement sacks, and debris dumped on the sidewalk. Pedestrians have to walk on the busy main road.",
    ward: "Gandhi Nagar",
    lat: 28.6500,
    lng: 77.2800,
    imageUrl: null,
    issueType: "Footpath Obstruction",
    severity: 7,
    affectedRadius: "25 meters",
    department: "Municipal Ward Enforcement",
    confidence: 94,
    reasoning:
      "Unlawful disposal of construction debris entirely blocking a public walkway forces active foot traffic into a fast-moving vehicle lane.",
    reportCount: 15,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Gemini client (lazy singleton)
// ---------------------------------------------------------------------------

let aiInstance: GoogleGenAI | null = null;

/**
 * Returns the shared Gemini client, initialising it on first call.
 * Throws if GEMINI_API_KEY is absent so callers can fall back gracefully.
 */
function getGeminiClient(): GoogleGenAI {
  if (!aiInstance) {
    const raw = process.env.GEMINI_API_KEY ?? "";
    const apiKey = raw.trim().replace(/^["']|["']$/g, "");
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not defined. Please add it to your Secrets in Settings."
      );
    }
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return aiInstance;
}

// ---------------------------------------------------------------------------
// Local heuristic analyser (Gemini fallback)
// ---------------------------------------------------------------------------

interface LocalAnalysis {
  title: string;
  issueType: string;
  severity: number;
  affectedRadius: string;
  department: string;
  confidence: number;
  reasoning: string;
}

/**
 * Performs keyword-based civic-issue classification when the Gemini API is
 * unavailable or rate-limited. Returns a deterministic LocalAnalysis object.
 */
function getLocalIssueAnalysis(description: string, ward: string): LocalAnalysis {
  const desc = description.toLowerCase();

  let issueType = "Other";
  let severity = 5;
  let affectedRadius = "50 meters";
  let department = "Municipal Ward Office";
  let title = "Reported Civic Issue";
  let reasoning =
    "Determined via local municipal pattern matching because the AI agent service is operating in high-availability backup mode.";

  if (
    desc.includes("pothole") ||
    desc.includes("cracked") ||
    desc.includes("road") ||
    desc.includes("street") ||
    desc.includes("asphalt") ||
    desc.includes("pavement")
  ) {
    issueType = "Road Damage";
    title = "Asphalt Wear & Road Damage";
    severity =
      desc.includes("deep") || desc.includes("huge") || desc.includes("accident") ? 8 : 6;
    affectedRadius = "30 meters";
    department = "Municipal Road Infrastructure";
    reasoning = `Localised asphalt deterioration detected near ${ward}. Requires cold-mix patching to restore pavement integrity.`;
  } else if (
    desc.includes("sewage") ||
    desc.includes("sewer") ||
    desc.includes("smell") ||
    desc.includes("foul") ||
    desc.includes("manhole") ||
    desc.includes("leakage")
  ) {
    issueType = "Sewage Overflow";
    title = "Sewer Main Pipeline Overflow";
    severity = 8;
    affectedRadius = "100 meters";
    department = "Municipal Water Supply & Sewage";
    reasoning = `Critical wastewater leakage reported in ${ward}. Jetting machine deployment and pressure-testing required.`;
  } else if (
    desc.includes("garbage") ||
    desc.includes("trash") ||
    desc.includes("waste") ||
    desc.includes("debris") ||
    desc.includes("dump") ||
    desc.includes("litter")
  ) {
    issueType = "Waste Management";
    title = "Unregulated Solid Waste Accumulation";
    severity = desc.includes("pile") || desc.includes("overflow") ? 6 : 5;
    affectedRadius = "25 meters";
    department = "Municipal Solid Waste Management";
    reasoning = `Improperly discarded waste creating a bio-burden in ${ward}. Sanitation trucks and enforcement required.`;
  } else if (
    desc.includes("flood") ||
    desc.includes("waterlog") ||
    desc.includes("clogged drain") ||
    desc.includes("standing water")
  ) {
    issueType = "Waterlogging / Flooding";
    title = "Stormwater Drain Waterlogging";
    severity = desc.includes("deep") || desc.includes("submerge") ? 9 : 7;
    affectedRadius = "150 meters";
    department = "Municipal Storm Water Drain Dept";
    reasoning =
      "Storm drain congestion causing standing water. Emergency clearing of catch basins recommended.";
  } else if (
    desc.includes("sidewalk") ||
    desc.includes("obstruct") ||
    desc.includes("blocked") ||
    desc.includes("encroachment")
  ) {
    issueType = "Footpath Obstruction";
    title = "Pedestrian Corridor Obstruction";
    severity = 4;
    affectedRadius = "15 meters";
    department = "Municipal Ward Enforcement";
    reasoning =
      "Footpath blockage forcing pedestrians onto vehicle lanes. Enforcement and cleanup required.";
  } else if (
    desc.includes("street light") ||
    desc.includes("dark") ||
    desc.includes("streetlight") ||
    desc.includes("broken lamp")
  ) {
    issueType = "Street Lighting";
    title = "Streetlight Luminaire Failure";
    severity = desc.includes("unsafe") || desc.includes("crime") ? 6 : 5;
    affectedRadius = "200 meters";
    department = "Municipal Electrical Division";
    reasoning = `Non-functional streetlights in ${ward}. Luminaire replacement and wiring audit needed.`;
  }

  if (title === "Reported Civic Issue") {
    const words = description.trim().split(" ");
    title =
      words.length <= 4
        ? description
        : words.slice(0, 4).join(" ") + "...";
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return { title, issueType, severity, affectedRadius, department, confidence: 95, reasoning };
}

// ---------------------------------------------------------------------------
// Ward summary generator (Gemini fallback)
// ---------------------------------------------------------------------------

/**
 * Returns a deterministic, ward-aware health summary string used when the
 * Gemini API cannot be reached for the ward-health diagnostic endpoint.
 */
function getDeterministicSummary(
  wardName: string,
  activeCount: number,
  avgSeverity: number
): string {
  if (activeCount === 0) {
    return (
      `Ward ${wardName} is currently exhibiting an exemplary civic health standing with zero active reports. ` +
      `There are no immediate risks or concerns.\nRecommended Action: Conduct routine preventive inspections to sustain standards.`
    );
  }

  let primaryConcern = "general infrastructure safety";
  let recommendation = "Schedule standard municipal maintenance patrols.";

  const lw = wardName.toLowerCase();
  if (lw.includes("rajpur") || lw.includes("flood")) {
    primaryConcern = "severe waterlogging and drainage blockages";
    recommendation = "Deploy emergency teams to clear major storm water drains.";
  } else if (lw.includes("shastri") || lw.includes("pothole")) {
    primaryConcern = "critical asphalt erosion and hazardous potholes";
    recommendation = "Dispatch road crews to repair hazardous potholes immediately.";
  } else if (lw.includes("civil") || lw.includes("waste")) {
    primaryConcern = "unregulated commercial waste dumping";
    recommendation = "Increase sanitation patrol frequencies and issue warning notices.";
  } else if (lw.includes("lajpat") || lw.includes("light")) {
    primaryConcern = "non-functional streetlights creating safety hazards";
    recommendation = "Initiate immediate repair of broken lamp fixtures.";
  } else if (lw.includes("gandhi") || lw.includes("obstruction")) {
    primaryConcern = "construction debris obstructing footpaths";
    recommendation = "Launch an enforcement drive to clear sidewalk obstructions.";
  } else if (lw.includes("nehru") || lw.includes("colony")) {
    primaryConcern = "aging public utility networks and minor water leaks";
    recommendation = "Conduct an urgent pressure-testing audit on pipelines.";
  } else if (lw.includes("model") || lw.includes("town")) {
    primaryConcern = "unregulated parking and sidewalk encroachment";
    recommendation = "Enforce clear zones on pavements and mark parking spots.";
  } else if (lw.includes("sector")) {
    primaryConcern = "pavement damage near residential parks";
    recommendation = "Paint pedestrian crosswalks and install speed-calming humps.";
  } else if (lw.includes("mg road")) {
    primaryConcern = "high-density traffic bottlenecks";
    recommendation = "Adjust signal timings at critical intersections.";
  }

  const healthScore = Math.max(
    0,
    Math.min(100, 100 - activeCount * 6 - Math.round(avgSeverity * 4))
  );

  return (
    `Ward ${wardName} currently exhibits a civic health status of ${healthScore}/100 with ${activeCount} active reports. ` +
    `Escalating issues in ${primaryConcern} threaten localised community safety.\n` +
    `Recommended Action: ${recommendation}`
  );
}

// ---------------------------------------------------------------------------
// Route: GET /api/issues
// ---------------------------------------------------------------------------

/** Returns all currently stored civic issues. */
app.get("/api/issues", (_req: Request, res: Response) => {
  res.json(issues);
});

// ---------------------------------------------------------------------------
// Route: POST /api/issues/:id/upvote
// ---------------------------------------------------------------------------

/** Increments the reportCount for the specified issue (duplicate endorsement). */
app.post("/api/issues/:id/upvote", (req: Request, res: Response) => {
  const { id } = req.params;
  const issue = issues.find((i) => i.id === id);
  if (!issue) {
    return res.status(404).json({ error: "Issue not found." });
  }
  issue.reportCount += 1;
  res.json({ success: true, issue });
});

// ---------------------------------------------------------------------------
// Route: POST /api/issues  — analyse & submit a new civic issue
// ---------------------------------------------------------------------------

/**
 * Accepts a civic report from the frontend, runs it through Gemini Vision
 * for classification, then persists and returns the enriched CivicIssue.
 * Falls back to local heuristics if Gemini is unavailable.
 */
app.post("/api/issues", async (req: Request, res: Response) => {
  try {
    let { description, ward, lat, lng, imageBase64, quickDetails } = req.body;

    if (!description?.trim()) {
      return res.status(400).json({ error: "Description is a required field." });
    }

    ward = ward?.trim() || "Not Specified";

    let analysis: LocalAnalysis & { isValid?: boolean; isDemo?: boolean } | null = null;

    try {
      const ai = getGeminiClient();
      const parts: unknown[] = [];

      // Attach image bytes when provided
      if (imageBase64) {
        let base64Data = imageBase64;
        let mimeType = "image/jpeg";
        if (imageBase64.includes(";base64,")) {
          const [meta, data] = imageBase64.split(";base64,");
          mimeType = meta.split(":")[1] ?? "image/jpeg";
          base64Data = data;
        }
        parts.push({ inlineData: { mimeType, data: base64Data } });
      }

      const whenNoticed = quickDetails?.duration || "Not specified";
      const affectedRadiusVal = quickDetails?.impact || "Not specified";
      const impactLevelVal = quickDetails?.danger || "Not specified";

      const promptText = `You are CivicLens AI, a civic issue analyzer. Analyze the following report and respond ONLY in this exact JSON format, no extra text:

{
  "title": "clear 5-7 word issue title",
  "issueType": "one of: Road Infrastructure, Water & Drainage, Electricity, Waste Management, Public Safety, Green Spaces, Traffic, Building & Construction, Sanitation, Other",
  "severity": <number 1-10>,
  "affectedRadius": "Local Street/Neighbourhood/Ward/District",
  "department": "responsible department name",
  "confidence": <number 50-95>,
  "reasoning": "2-3 sentence explanation of the analysis",
  "isValid": <true or false>
}

Rules:
- If quick details are filled in (not 'Not specified'), treat as valid even if description is short.
- If input is gibberish, random, or not a civic issue AND quick details are also empty: set isValid to false, severity to 0, issueType to 'Invalid Report', title to 'Unable to process report', reasoning to 'The provided description does not contain enough information to identify a civic issue.'
- Always return valid JSON only.

Input:
Description: "${description}"
When noticed: ${whenNoticed}
Affected radius: ${affectedRadiusVal}
Impact level: ${impactLevelVal}
Ward: "${ward}"
Image provided: ${imageBase64 ? "yes" : "no"}`;

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              issueType: { type: Type.STRING },
              severity: { type: Type.INTEGER },
              affectedRadius: { type: Type.STRING },
              department: { type: Type.STRING },
              confidence: { type: Type.INTEGER },
              reasoning: { type: Type.STRING },
              isValid: { type: Type.BOOLEAN },
            },
            required: [
              "title","issueType","severity","affectedRadius",
              "department","confidence","reasoning","isValid",
            ],
          },
        },
      });

      analysis = JSON.parse(response.text?.trim() ?? "{}");
    } catch {
      // Gemini unavailable — use local heuristics and flag as demo mode
      analysis = { ...getLocalIssueAnalysis(description, ward), isValid: true, isDemo: true };
    }

    const newIssue: CivicIssue = {
      id: String(issues.length + 1),
      title: analysis?.title || "New Reported Issue",
      description,
      ward,
      lat: Number(lat) || DEFAULT_LAT,
      lng: Number(lng) || DEFAULT_LNG,
      imageUrl: imageBase64 || null,
      issueType: analysis?.issueType || "Other",
      severity: Number(analysis?.severity) || 5,
      affectedRadius: analysis?.affectedRadius || "Unknown",
      department: analysis?.department || "Municipal Ward Office",
      confidence: Number(analysis?.confidence) || 90,
      reasoning: analysis?.reasoning || "Based on user description.",
      quickDetails,
      isDemo: analysis?.isDemo,
      isValid: analysis?.isValid !== false,
      reportCount: 1,
      createdAt: new Date().toISOString(),
    };

    if (newIssue.isValid !== false) {
      issues.push(newIssue);
    }

    return res.json(newIssue);
  } catch (err: unknown) {
    // Emergency fallback — always return something valid so the UX never breaks
    try {
      const { description, ward, lat, lng, imageBase64, quickDetails } = req.body;
      const fallback = getLocalIssueAnalysis(description ?? "Civic report", ward ?? "General Ward");
      const emergencyIssue: CivicIssue = {
        id: String(issues.length + 1),
        title: fallback.title,
        description: description ?? "Civic report description.",
        ward: ward ?? "General Ward",
        lat: Number(lat) || DEFAULT_LAT,
        lng: Number(lng) || DEFAULT_LNG,
        imageUrl: imageBase64 ?? null,
        issueType: fallback.issueType,
        severity: fallback.severity,
        affectedRadius: fallback.affectedRadius,
        department: fallback.department,
        confidence: fallback.confidence,
        reasoning: fallback.reasoning,
        quickDetails,
        isValid: true,
        reportCount: 1,
        createdAt: new Date().toISOString(),
      };
      issues.push(emergencyIssue);
      return res.json(emergencyIssue);
    } catch {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      return res.status(500).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------------------
// Route: POST /api/ward-summary
// ---------------------------------------------------------------------------

/**
 * Generates an AI-powered ward health diagnostic summary.
 * Falls back to getDeterministicSummary when Gemini is unavailable.
 */
app.post("/api/ward-summary", async (req: Request, res: Response) => {
  try {
    const { wardName, healthScore, activeCount, avgSeverity } = req.body;

    if (!wardName) {
      return res.status(400).json({ error: "Ward name is required." });
    }

    const wardIssues = issues.filter(
      (i) => i.ward.toLowerCase() === wardName.toLowerCase()
    );
    const fallbackCount = wardIssues.length;
    const fallbackAvg =
      fallbackCount > 0
        ? Math.round(
            (wardIssues.reduce((s, i) => s + i.severity, 0) / fallbackCount) * 10
          ) / 10
        : 0;
    const fallbackScore = Math.max(
      0,
      Math.min(100, 100 - fallbackCount * 6 - Math.round(fallbackAvg * 4))
    );

    const finalCount = activeCount !== undefined ? Number(activeCount) : fallbackCount;
    const finalAvg = avgSeverity !== undefined ? Number(avgSeverity) : fallbackAvg;
    const finalScore = healthScore !== undefined ? Number(healthScore) : fallbackScore;

    const prompt = `You are CivicLens AI. Generate a ward health diagnostic for ${wardName} with health score ${finalScore}, ${finalCount} active issues, average severity ${finalAvg}/10.

Respond in exactly this format — no headers, no bullet points:
First sentence: One sentence describing the current ward health status specifically.
Second sentence: One specific risk or concern based on the data.
Recommended Action: [One clear, specific action in 10 words or less]

Keep total response under 60 words.`;

    let summaryText = "";
    const apiKey = (process.env.GEMINI_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");

    if (apiKey) {
      try {
        const ai = getGeminiClient();
        const result = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });
        summaryText = result.text ?? "";
      } catch {
        summaryText = getDeterministicSummary(wardName, finalCount, finalAvg);
      }
    } else {
      summaryText = getDeterministicSummary(wardName, finalCount, finalAvg);
    }

    return res.json({
      ward: wardName,
      healthScore: finalScore,
      activeCount: finalCount,
      issueCount: finalCount,
      averageSeverity: finalAvg,
      avgSeverity: finalAvg,
      summary: summaryText.trim() || getDeterministicSummary(wardName, finalCount, finalAvg),
    });
  } catch (err: unknown) {
    try {
      const { wardName, activeCount, avgSeverity, healthScore } = req.body;
      const name = wardName ?? "Selected Ward";
      const count = Number(activeCount) || 0;
      const sev = Number(avgSeverity) || 0;
      const score = Number(healthScore) || 100;
      return res.json({
        ward: name,
        healthScore: score,
        activeCount: count,
        issueCount: count,
        averageSeverity: sev,
        avgSeverity: sev,
        summary: getDeterministicSummary(name, count, sev),
      });
    } catch {
      const message = err instanceof Error ? err.message : "Ward summary generation failed.";
      return res.status(500).json({ error: message });
    }
  }
});

// ---------------------------------------------------------------------------
// Route: POST /api/resolve-issue
// ---------------------------------------------------------------------------

/**
 * Uses Gemini to generate a formal resolution plan including a complaint
 * email draft, timeline, community action steps, and AI reasoning.
 */
app.post("/api/resolve-issue", async (req: Request, res: Response) => {
  try {
    const { issue } = req.body;
    if (!issue) {
      return res.status(400).json({ error: "Issue details are required." });
    }

    const ai = getGeminiClient();

    const prompt = `You are a Municipal Resolution Expert.
Analyze the following civic issue and provide:
1. A formal complaint email draft addressed to the ${issue.department}.
2. A suggested timeline for resolution (in days).
3. Community action steps residents can take.
4. Step-by-step reasoning for this resolution plan.

Issue Details:
- Title: ${issue.title}
- Description: ${issue.description}
- Ward: ${issue.ward}
- Severity: ${issue.severity}/10
- Issue Type: ${issue.issueType}

Return a JSON object with keys: "emailDraft", "timelineDays", "communityActionSteps" (string[]), "reasoning" (string[]).`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const resolution = JSON.parse(result.text ?? "{}");
    return res.json(resolution);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate resolution plan.";
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Route: POST /api/ask-gemini
// ---------------------------------------------------------------------------

/**
 * Handles multi-turn conversational AI chat within the Resolution Agent modal.
 * Maintains full message history per request for context-aware responses.
 */
app.post("/api/ask-gemini", async (req: Request, res: Response) => {
  try {
    const { issue, messages } = req.body;
    if (!issue || !messages) {
      return res.status(400).json({ error: "Issue and messages are required." });
    }

    const systemPrompt = `You are CivicLens AI, an intelligent civic issue assistant. You have complete context of the current issue:
- Title: ${issue.title}
- Ward: ${issue.ward}
- Severity: ${issue.severity}/10
- Type: ${issue.issueType}
- Department: ${issue.department}
- Description: ${issue.description}
- Status: ${issue.status ?? "Pending"}

RULES:
1. Keep ALL responses under 80 words. No exceptions.
2. Never ask for information already provided above.
3. If the user greets you, greet back in one line and ask what they need.
4. If the user sends gibberish, say "I didn't understand that. Ask me anything about this civic issue."
5. If asked about status, use the status from context above.
6. Never promise real-world actions (notifications, emails, calls).
7. If the question is unrelated to this civic issue, say "I can only help with this civic report."
8. Be conversational, direct, and helpful.`;

    const ai = getGeminiClient();

    const contents = [
      { role: "user", parts: [{ text: systemPrompt }] },
      ...messages.map((m: { role: string; text: string }) => ({
        role: m.role === "agent" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
    ];

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: { maxOutputTokens: 300 },
    });

    return res.json({ response: response.text });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to get AI response.";
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Vite dev server / static production assets
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CivicLens server running on http://localhost:${PORT}`);
  });
}

startServer();
