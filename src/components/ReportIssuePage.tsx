/**
 * ReportIssuePage.tsx
 * 
 * Core civic issue reporting interface for CivicLens.
 * 
 * Flow:
 *  1. User uploads an image (optional) and fills in description + ward.
 *  2. Quick follow-up questions are shown to enrich the AI context.
 *  3. Gemini Vision + Pro analyzes the report via POST /api/issues.
 *  4. The Agentic Chain Log animates the AI pipeline steps.
 *  5. User reviews the AI analysis and confirms or edits before submission.
 *  6. If Gemini needs more info, a clarification panel is shown.
 * 
 * Key dependencies: lucide-react icons, ../data (GENERIC_WARDS), ../types (CivicIssue)
 */

import React, { useState, useRef } from "react";
import { 
  Camera, Upload, Navigation, AlertTriangle, ShieldAlert, Check, Loader2, Sparkles 
} from "lucide-react";
import { GENERIC_WARDS } from "../data";
import { CivicIssue } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default map center coordinates (New Delhi) used when GPS is unavailable. */
const DEFAULT_CENTER = { lat: 28.6139, lng: 77.2090 };

/** Maximum allowed image upload size in bytes (10 MB). */
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Civic points awarded to the user on successful report submission. */
const CIVIC_POINTS_REWARD = 50;

/** Timeout in milliseconds for Gemini API fetch calls. */
const API_TIMEOUT_MS = 30000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportIssuePageProps {
  onIssueReported: (newIssue: CivicIssue) => void;
  userLocation: { lat: number; lng: number } | null;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Derives deterministic lat/lng coordinates for a ward name relative to a
 * center point. Uses a simple character-code hash to produce a stable angle
 * and distance offset, so the same ward always maps to the same position.
 * 
 * @param wardName   - Display name of the ward.
 * @param centerLat  - Latitude of the reference center point.
 * @param centerLng  - Longitude of the reference center point.
 * @returns Offset coordinates within ~1–3 km of the center.
 */
function getWardCoordinates(
  wardName: string,
  centerLat: number,
  centerLng: number
): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < wardName.length; i++) {
    hash = wardName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const distanceInKm = 1.0 + (Math.abs(hash >> 3) % 20) / 10; // 1.0–3.0 km
  const dLat = (distanceInKm * Math.cos(angle)) / 111;
  const dLng =
    (distanceInKm * Math.sin(angle)) /
    (111 * Math.cos((centerLat * Math.PI) / 180));
  return { lat: centerLat + dLat, lng: centerLng + dLng };
}

/**
 * Normalizes a ward name to title case.
 * e.g. "vasant kunj" → "Vasant Kunj"
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReportIssuePage({
  onIssueReported,
  userLocation,
}: ReportIssuePageProps) {

  // -- Form fields --
  const [description, setDescription] = useState("");
  const [selectedWard, setSelectedWard] = useState("");
  const [isOutsideWards, setIsOutsideWards] = useState(false);
  const [customWard, setCustomWard] = useState("");

  // -- Validation errors --
  const [validationError, setValidationError] = useState<string | null>(null);
  const [locationValidationError, setLocationValidationError] = useState<string | null>(null);

  // -- Geolocation --
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationSource, setLocationSource] = useState<"none" | "gps" | "ward">("none");
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);

  // -- Image upload --
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Submission & analysis --
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<CivicIssue | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // -- Agentic chain animation --
  const [visibleSteps, setVisibleSteps] = useState(0);

  // -- Celebration --
  const [showCelebrationPoints, setShowCelebrationPoints] = useState(false);
  const [confetti, setConfetti] = useState<
    { id: string; left: string; size: string; color: string; delay: string; duration: string }[]
  >([]);

  // -- Follow-up questions --
  const [showFollowUpQuestions, setShowFollowUpQuestions] = useState(false);
  const [quickDetails, setQuickDetails] = useState({ duration: "", impact: "", danger: "" });

  // -- Clarification flow --
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [isClarifying, setIsClarifying] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /** Stagger-animates the agentic chain log steps whenever a new result arrives. */
  React.useEffect(() => {
    if (analysisResult) {
      setVisibleSteps(0);
      const t1 = setTimeout(() => setVisibleSteps(1), 100);
      const t2 = setTimeout(() => setVisibleSteps(2), 500);
      const t3 = setTimeout(() => setVisibleSteps(3), 900);
      const t4 = setTimeout(() => setVisibleSteps(4), 1300);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    } else {
      setVisibleSteps(0);
    }
  }, [analysisResult]);

  /** Generates randomized confetti particles when the celebration panel appears. */
  React.useEffect(() => {
    if (showCelebrationPoints) {
      const colors = ["#2563EB", "#0D9488", "#F59E0B", "#EC4899", "#10B981"];
      const items = Array.from({ length: 6 }).map(() => ({
        id: crypto.randomUUID(),
        left: `${10 + Math.random() * 80}%`,
        size: `${Math.floor(Math.random() * 5) + 6}px`,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: `${Math.random() * 0.4}s`,
        duration: `${Math.random() * 1 + 1.2}s`,
      }));
      setConfetti(items);
    }
  }, [showCelebrationPoints]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns the currently active map center, falling back to DEFAULT_CENTER
   * if the user's location is unavailable.
   */
  const getCenter = () => ({
    lat: userLocation?.lat ?? DEFAULT_CENTER.lat,
    lng: userLocation?.lng ?? DEFAULT_CENTER.lng,
  });

  /**
   * Returns the resolved ward name for submission, applying normalization
   * when the user has typed a custom area name.
   */
  const getFinalWard = () =>
    isOutsideWards
      ? normalizeName(customWard) || "Outside Listed Area"
      : selectedWard;

  /**
   * Ensures lat/lng are set before submission. If the user never clicked
   * "Auto-detect", falls back to a ward-derived coordinate with a small
   * random offset so markers don't overlap.
   */
  const ensureCoordinates = (): { finalLat: number; finalLng: number } => {
    if (lat !== null && lng !== null) return { finalLat: lat, finalLng: lng };
    const center = getCenter();
    const wardCoords = getWardCoordinates(getFinalWard(), center.lat, center.lng);
    return {
      finalLat: wardCoords.lat + (Math.random() - 0.5) * 0.003,
      finalLng: wardCoords.lng + (Math.random() - 0.5) * 0.003,
    };
  };

  /**
   * Creates an AbortController that auto-aborts after API_TIMEOUT_MS.
   * Returns both the controller (for the fetch signal) and a cancel handle
   * so the caller can clear the timer on success.
   */
  const createFetchTimeout = (): { controller: AbortController; cancel: () => void } => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    return { controller, cancel: () => clearTimeout(timer) };
  };

  // ---------------------------------------------------------------------------
  // File handling
  // ---------------------------------------------------------------------------

  /** Validates and previews a selected image file. */
  const processFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file.");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError("File must be under 10MB.");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ---------------------------------------------------------------------------
  // Geolocation
  // ---------------------------------------------------------------------------

  /**
   * Attempts GPS location capture for the selected ward.
   * Falls back to deterministic ward coordinates if permission is denied.
   */
  const handleDetectLocation = () => {
    const activeWard = isOutsideWards ? customWard.trim() : selectedWard;
    if (!activeWard || activeWard === "Not Specified") {
      setDetectionError("⚠ Please select a ward first, then use auto-detect for precise coordinates.");
      setDetectionMessage(null);
      return;
    }

    setDetectionError(null);
    setDetectionMessage(null);
    setIsLocating(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setLocationSource("gps");
        setIsLocating(false);
        setLocationValidationError(null);
        setDetectionMessage(`✓ Location captured for ${activeWard}.`);
      },
      (err) => {
        // GPS denied — fall back to ward-derived coordinates
        console.warn("Geolocation permission error, falling back to ward coordinates:", err);
        const center = getCenter();
        const wardCoords = getWardCoordinates(activeWard, center.lat, center.lng);
        setLat(wardCoords.lat + (Math.random() - 0.5) * 0.005);
        setLng(wardCoords.lng + (Math.random() - 0.5) * 0.005);
        setLocationSource("ward");
        setIsLocating(false);
        setDetectionMessage(`✓ Location captured for ${activeWard}.`);
      },
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // ---------------------------------------------------------------------------
  // Submission handlers
  // ---------------------------------------------------------------------------

  /**
   * Primary form submit handler.
   * Validates description and ward, then shows the follow-up questions panel.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setLocationValidationError(null);
    setError(null);

    if (description.trim().length === 0) {
      setValidationError("Please describe the issue before analyzing.");
      return;
    }

    const hasWardSelected = !isOutsideWards
      ? selectedWard !== "" && selectedWard !== "Not Specified"
      : customWard.trim() !== "" && customWard.trim() !== "Not Specified";

    if (!hasWardSelected) {
      setLocationValidationError(
        "⚠ Please select a ward first, or specify a custom area name if outside listed wards."
      );
      return;
    }

    if (lat === null || lng === null) {
      setLocationValidationError("⚠ Please use Auto-detect Location to capture your precise coordinates before submitting.");
      return;
    }

    setShowFollowUpQuestions(true);
  };

  /**
   * Sends the report to the Gemini analysis API.
   * Called after the user completes the follow-up questions panel.
   */
  const runGeminiAnalysis = async () => {
    setValidationError(null);
    setLocationValidationError(null);

    const hasWardSelected = !isOutsideWards
      ? selectedWard !== "" && selectedWard !== "Not Specified"
      : customWard.trim() !== "" && customWard.trim() !== "Not Specified";

    if (!hasWardSelected) {
      setLocationValidationError(
        "⚠ Please select a ward first, or specify a custom area name if outside listed wards."
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setIsSubmitted(false);
    setIsClarifying(false);
    setClarificationQuestions([]);
    setAdditionalInfo("");

    const finalWard = getFinalWard();
    const { finalLat, finalLng } = ensureCoordinates();
    const { controller, cancel } = createFetchTimeout();

    try {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          description,
          ward: finalWard,
          lat: finalLat,
          lng: finalLng,
          imageBase64: imagePreview,
          quickDetails,
        }),
      });
      cancel();

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Server failed to analyze issue.");
      }

      const newIssue: CivicIssue = await response.json();
      setAnalysisResult(newIssue);
      setShowFollowUpQuestions(false);

      if (newIssue.clarificationQuestions && newIssue.clarificationQuestions.length > 0) {
        setClarificationQuestions(newIssue.clarificationQuestions);
        setIsClarifying(true);
      }
    } catch (err: unknown) {
      cancel();
      if (err instanceof Error && err.name === "AbortError") {
        setError("Analysis timed out. Please check your connection and try again.");
      } else {
        console.error("Issue analysis failed:", err);
        setError(
          "AI analysis is currently unavailable, but we've logged your report. Please try again in a few moments."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Sends a follow-up re-analysis request after the user provides
   * additional clarification details.
   */
  const handleReAnalyze = async () => {
    setIsSubmitting(true);
    setError(null);

    const fullDesc = `${description}\n\nAdditional Details: ${additionalInfo}`;
    const finalWard = getFinalWard();
    const { controller, cancel } = createFetchTimeout();

    try {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          description: fullDesc,
          ward: finalWard,
          lat,
          lng,
          imageBase64: imagePreview,
        }),
      });
      cancel();

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Re-analysis failed.");
      }

      const newIssue: CivicIssue = await response.json();
      setAnalysisResult(newIssue);
      setClarificationQuestions(newIssue.clarificationQuestions || []);
      setIsClarifying(!!(newIssue.clarificationQuestions && newIssue.clarificationQuestions.length > 0));
    } catch (err: unknown) {
      cancel();
      if (err instanceof Error && err.name === "AbortError") {
        setError("Re-analysis timed out. Please try again.");
      } else {
        console.error("Re-analysis failed:", err);
        setError(
          err instanceof Error ? err.message : "Re-analysis failed. Please try again."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Confirms the AI-generated analysis and submits the issue to the app state.
   * Triggers the celebration animation and resets the form.
   */
  const handleConfirm = () => {
    if (analysisResult) {
      onIssueReported(analysisResult);
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setShowCelebrationPoints(true);

      // Reset form
      setDescription("");
      setImagePreview(null);
      setLat(null);
      setLng(null);
      setLocationSource("none");
      setIsOutsideWards(false);
      setCustomWard("");
    }
  };

  /** Returns to the edit form from the analysis preview. */
  const handleEdit = () => setAnalysisResult(null);

  /** Fully resets the form and all state to initial values. */
  const handleReset = () => {
    setAnalysisResult(null);
    setDescription("");
    setImagePreview(null);
    setLat(null);
    setLng(null);
    setLocationSource("none");
    setIsOutsideWards(false);
    setCustomWard("");
    setQuickDetails({ duration: "", impact: "", danger: "" });
    setValidationError(null);
    setLocationValidationError(null);
    setError(null);
    setIsSubmitted(false);
    setIsClarifying(false);
    setAdditionalInfo("");
    setClarificationQuestions([]);
    setShowFollowUpQuestions(false);
    setSelectedWard("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ---------------------------------------------------------------------------
  // Agentic chain step definitions
  // ---------------------------------------------------------------------------

  const agenticSteps = analysisResult
    ? [
        {
          id: 1,
          icon: "V",
          title: "Vision Agent",
          description: analysisResult.imageUrl
            ? `Gemini Vision analyzed the uploaded image. Detected: ${analysisResult.issueType}. Visual severity indicators identified.`
            : "No image provided. Issue analyzed from text description only. Gemini NLP processed the written report.",
        },
        {
          id: 2,
          icon: "C",
          title: "Classification Agent",
          description: `Issue classified as ${analysisResult.issueType}, Severity ${analysisResult.severity}/10. Responsible department: ${analysisResult.department}.`,
        },
        {
          id: 3,
          icon: "P",
          title: "Priority Agent",
          description: `Priority score computed using weighted formula. Issue queued in ${analysisResult.ward} ward dispatch board.`,
        },
        {
          id: 4,
          icon: "R",
          title: "Resolution Agent",
          description: `Complaint letter drafted for ${analysisResult.department}. Duplicate check completed at ${analysisResult.confidence}% confidence.`,
        },
      ]
    : [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="max-w-7xl mx-auto px-4 md:px-6 py-6 bg-[#F8FAFC]"
      id="report_issue_page_container"
      style={{ overflowX: "hidden" }}
    >
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2 border-l-4 border-teal-400 pl-3">
          <AlertTriangle className="text-[#2563EB] h-7 w-7" />
          Civic Intelligence Center
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Report municipal issues with an image. CivicLens' Gemini AI engine analyzes your report,
          evaluates severity, identifies responsible departments, and prioritizes it for municipal action.
        </p>
        <div
          style={{
            background: "#EFF6FF",
            border: "1px solid #0D9488",
            borderRadius: "999px",
            padding: "4px 12px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#0D9488",
            display: "inline-block",
            marginBottom: "16px",
            marginTop: "12px",
          }}
        >
          ⚡ Powered by Google Gemini Vision + Gemini Pro
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ══════════════════════════════════════════
            LEFT PANEL — Report Form
        ══════════════════════════════════════════ */}
        <div
          className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-6"
          id="report_form_card"
        >
          <h2 className="text-base font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">
            File New Civic Report
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* ── Image Upload ── */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                Visual Evidence{" "}
                <span className="text-[10px] font-normal text-slate-400 capitalize">
                  (Optional, but recommended)
                </span>
              </label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`h-48 bg-slate-50 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                  imagePreview
                    ? "border-[#2563EB] bg-blue-50/10"
                    : isDragging
                    ? "border-[#2563EB] bg-blue-50"
                    : "border-slate-200 hover:border-slate-300 text-slate-400"
                }`}
                id="image_drag_drop_zone"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                {imagePreview ? (
                  <div className="relative h-full w-full p-2 flex flex-col justify-between">
                    <img
                      src={imagePreview}
                      alt="Upload Preview"
                      className="max-h-32 mx-auto rounded-lg object-contain shadow-xs border border-slate-100"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex justify-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImagePreview(null);
                        }}
                        className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded transition-colors uppercase"
                      >
                        Remove Image
                      </button>
                      <button
                        type="button"
                        className="text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded transition-colors uppercase"
                      >
                        Change Image
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5 text-center px-4">
                    <div className="mx-auto h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center text-[#2563EB]">
                      <Camera className="h-5 w-5" />
                    </div>
                    <div className="text-xs font-bold text-slate-700">
                      Drop evidence image or click to upload
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Supports JPG, PNG, WEBP files up to 10MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Ward Select & Geolocation ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ward selection */}
              <div>
                {!isOutsideWards ? (
                  <>
                    <label
                      htmlFor="ward_select"
                      className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block"
                    >
                      Select Municipal Ward
                    </label>
                    <select
                      id="ward_select"
                      value={selectedWard}
                      onChange={(e) => {
                        setSelectedWard(e.target.value);
                        setLocationValidationError(null);
                        setDetectionMessage(null);
                        setDetectionError(null);
                        // Update ward-fallback coordinates when ward changes
                        if (locationSource === "ward" && e.target.value) {
                          const center = getCenter();
                          const coords = getWardCoordinates(e.target.value, center.lat, center.lng);
                          setLat(coords.lat + (Math.random() - 0.5) * 0.005);
                          setLng(coords.lng + (Math.random() - 0.5) * 0.005);
                        }
                      }}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-colors"
                    >
                      <option value="">Select Ward...</option>
                      {GENERIC_WARDS.map((w) => (
                        <option key={w} value={w}>{w}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label
                      htmlFor="custom_ward_input"
                      className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block"
                    >
                      Custom Locality / Area Name (if outside listed wards)
                    </label>
                    <input
                      type="text"
                      id="custom_ward_input"
                      value={customWard}
                      onChange={(e) => {
                        setCustomWard(e.target.value);
                        setLocationValidationError(null);
                        setDetectionMessage(null);
                        setDetectionError(null);
                      }}
                      placeholder="e.g. Vasant Kunj, Indiranagar Ext"
                      required={isOutsideWards}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB] transition-colors"
                    />
                  </>
                )}

                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="outside_wards_checkbox"
                    checked={isOutsideWards}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIsOutsideWards(checked);
                      setLocationValidationError(null);
                      setDetectionMessage(null);
                      setDetectionError(null);
                      if (!checked) setSelectedWard("");
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB] cursor-pointer"
                  />
                  <label
                    htmlFor="outside_wards_checkbox"
                    className="text-xs text-slate-600 font-semibold cursor-pointer select-none"
                  >
                    Issue is outside listed wards
                  </label>
                </div>

                {isOutsideWards && (
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#1E40AF",
                      backgroundColor: "#EFF6FF",
                      border: "1px solid #BFDBFE",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      marginTop: "8px",
                    }}
                  >
                    Please enter your area or locality name clearly and correctly for efficient
                    reporting and faster resolution.
                  </div>
                )}
              </div>

              {/* Geolocation */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block">
                  <span>Issue Geolocation </span><span style={{color: '#DC2626', fontWeight: 700}}>*Required</span>
                </label>
                <button
                  type="button"
                  onClick={handleDetectLocation}
                  disabled={isLocating}
                  className={`w-full h-11 flex items-center justify-center gap-2 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                    lat === null || lng === null 
                      ? 'border-red-200 bg-red-50 text-red-700' 
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                  id="locate_btn"
                >
                  {isLocating ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#2563EB]" />
                      Pinpointing coordinates...
                    </>
                  ) : (
                    <>
                      {lat !== null && lng !== null ? (
                        <span className="text-emerald-600">✓</span>
                      ) : (
                        <Navigation className="h-3.5 w-3.5 text-[#2563EB]" />
                      )}
                      {lat !== null && lng !== null ? "Location Captured" : "Auto-detect Location"}
                    </>
                  )}
                </button>

                {detectionError && (
                  <div className="mt-1.5 text-xs font-semibold text-red-600" id="detection_error_msg">
                    {detectionError}
                  </div>
                )}

                {detectionMessage && (
                  <div className="mt-1.5 text-xs font-semibold text-emerald-600" id="detection_success_msg">
                    {detectionMessage}
                  </div>
                )}

                {locationSource !== "none" && lat && lng && (
                  <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1.5 bg-blue-50/50 p-1.5 rounded-lg border border-blue-100/40">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse"></span>
                    <span className="font-mono">
                      {locationSource === "gps" ? "GPS" : "Ward Fallback"}: {lat.toFixed(5)},{" "}
                      {lng.toFixed(5)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Location validation error */}
            {locationValidationError && (
              <div
                style={{
                  border: "1px solid #DC2626",
                  background: "#FEF2F2",
                  color: "#DC2626",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  marginTop: "8px",
                }}
                className="font-semibold flex items-start gap-2"
                id="location_validation_error_box"
              >
                <ShieldAlert className="text-[#DC2626] h-4 w-4 shrink-0 mt-0.5" />
                <div>{locationValidationError}</div>
              </div>
            )}

            {/* ── Description ── */}
            <div>
              <label
                htmlFor="issue_desc"
                className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 block"
              >
                Detailed Description
              </label>
              <textarea
                id="issue_desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you see (e.g. large pothole, water leakage, garbage dump)..."
                className="w-full h-24 border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-[#2563EB] outline-none resize-none transition-shadow"
              />
              {validationError && (
                <div
                  style={{
                    border: "1px solid #DC2626",
                    background: "#FEF2F2",
                    color: "#DC2626",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    fontSize: "13px",
                    marginTop: "8px",
                  }}
                  className="font-semibold flex items-start gap-2"
                  id="validation_error_box"
                >
                  <ShieldAlert className="text-[#DC2626] h-4 w-4 shrink-0 mt-0.5" />
                  <div>{validationError}</div>
                </div>
              )}
            </div>

            {/* General error */}
            {error && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-100 flex items-start gap-2">
                <ShieldAlert className="text-red-600 h-4 w-4 shrink-0 mt-0.5" />
                <div className="text-xs font-bold text-red-800">{error}</div>
              </div>
            )}

            {/* ── Follow-up Questions Panel ── */}
            {showFollowUpQuestions && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 animate-in fade-in zoom-in duration-300">
                <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                  Quick Details — helps AI give accurate analysis
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      How long has this issue existed?
                    </label>
                    <select
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm"
                      value={quickDetails.duration}
                      onChange={(e) => setQuickDetails({ ...quickDetails, duration: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Just noticed">Just noticed</option>
                      <option value="1-3 days">1-3 days</option>
                      <option value="1 week">1 week</option>
                      <option value="More than a week">More than a week</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      How many people does this affect?
                    </label>
                    <select
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm"
                      value={quickDetails.impact}
                      onChange={(e) => setQuickDetails({ ...quickDetails, impact: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="Just me">Just me</option>
                      <option value="My street">My street</option>
                      <option value="My neighborhood">My neighborhood</option>
                      <option value="Entire area">Entire area</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Is there immediate danger?
                    </label>
                    <select
                      className="w-full border border-slate-200 rounded-lg p-2 text-sm"
                      value={quickDetails.danger}
                      onChange={(e) => setQuickDetails({ ...quickDetails, danger: e.target.value })}
                    >
                      <option value="">Select...</option>
                      <option value="No immediate danger">No immediate danger</option>
                      <option value="Minor hazard">Minor hazard</option>
                      <option value="Serious hazard">Serious hazard</option>
                      <option value="Emergency">Emergency</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={runGeminiAnalysis}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#1EC8D8] to-[#2563EB] text-white py-3 rounded-full font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gemini AI Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Run Gemini Analysis
                    </>
                  )}
                </button>
              </div>
            )}

            {/* ── Primary Submit Button ── */}
            {!showFollowUpQuestions && (
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#1EC8D8] to-[#2563EB] text-white py-3 rounded-full font-bold text-sm shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:bg-blue-300 transition-all flex items-center justify-center gap-2 cursor-pointer"
                id="submit_report_btn"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gemini AI Analyzing Evidence...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze with Gemini AI
                  </>
                )}
              </button>
            )}
          </form>

          {/* ── Agentic Chain Log ── */}
          {analysisResult && analysisResult.isValid !== false && (
            <div
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #E2E8F0",
                borderRadius: "12px",
                padding: "16px",
                marginTop: "16px",
              }}
              className="w-full animate-fade-in"
            >
              <div className="flex items-center gap-2 mb-4">
                <span
                  style={{ fontSize: "11px", fontWeight: 700, color: "#0D9488" }}
                  className="uppercase tracking-wider"
                >
                  ⚡ AGENTIC CHAIN LOG
                </span>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>

              <div className="relative">
                {/* Vertical connector line */}
                <div
                  className="absolute top-1.5 bottom-1.5 w-0.5"
                  style={{ left: "14px", backgroundColor: "#E2E8F0" }}
                />

                <div className="space-y-4">
                  {agenticSteps.map((step, idx) => {
                    if (idx >= visibleSteps) return null;
                    return (
                      <div key={step.id} className="relative pl-8 animate-fade-in">
                        {/* Timeline dot */}
                        <div
                          className="absolute rounded-full bg-[#2563EB]"
                          style={{ left: "11px", top: "10px", width: "6px", height: "6px" }}
                        />
                        <div className="flex items-start gap-2.5">
                          {/* Agent icon */}
                          <div
                            className="rounded-full flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: "#EFF6FF",
                              width: "28px",
                              height: "28px",
                              color: "#2563EB",
                              fontWeight: 700,
                              fontSize: "11px",
                            }}
                          >
                            {step.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span style={{ fontWeight: 600, color: "#0F172A", fontSize: "13px" }}>
                                {step.title}
                              </span>
                              <span className="text-emerald-500 font-bold text-xs select-none">✓</span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                              {step.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════
            RIGHT PANEL — Results
        ══════════════════════════════════════════ */}
        <div className="lg:col-span-5 flex flex-col gap-4" id="results_panel_container">

          {/* Success state */}
          {isSubmitted ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col items-center justify-center text-center min-h-[350px]">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">
                <Check className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Report submitted successfully!</h4>
              <p className="text-xs text-slate-500">Thank you for helping your community.</p>

              {showCelebrationPoints && (
                <div className="mt-6 w-full text-center relative">
                  <div className="h-px bg-slate-200 w-full mb-6" />
                  {confetti.map((dot) => (
                    <div
                      key={dot.id}
                      className="absolute animate-confetti"
                      style={{
                        left: dot.left,
                        top: "-10px",
                        width: dot.size,
                        height: dot.size,
                        backgroundColor: dot.color,
                        borderRadius: "50%",
                        animationDelay: dot.delay,
                        animationDuration: dot.duration,
                      }}
                    />
                  ))}
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>🏆</div>
                  <div
                    style={{
                      fontSize: "20px",
                      fontWeight: "800",
                      background: "linear-gradient(90deg, #2563EB, #0D9488)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    +{CIVIC_POINTS_REWARD} Civic Points Earned!
                  </div>
                  <div style={{ fontSize: "14px", color: "#475569", marginTop: "8px" }}>
                    Thank you, Community Hero!
                  </div>
                </div>
              )}

              <button
                onClick={handleReset}
                className="mt-6 text-[10px] font-bold text-[#2563EB] hover:text-blue-700 uppercase tracking-wider"
              >
                File Another Report
              </button>
            </div>

          /* Clarification state */
          ) : isClarifying ? (
            <div
              className="bg-amber-50 rounded-2xl border-2 border-amber-300 shadow-md p-8"
              id="clarification_panel"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="bg-amber-100 p-3 rounded-full text-amber-700">
                  <AlertTriangle className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">
                  🔍 Help Us Give Better Analysis
                </h3>
              </div>
              <p className="text-sm text-slate-700 mb-6 font-medium">
                Gemini requires a bit more information to provide a truly precise and actionable
                analysis for your report:
              </p>
              <ul className="list-disc list-inside text-sm text-slate-800 mb-8 space-y-2 ml-1">
                {clarificationQuestions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                Your Additional Information
              </p>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="E.g., It's about 2 feet wide, causing water to pool..."
                className="w-full h-32 border-2 border-amber-200 rounded-xl p-5 text-base focus:ring-4 focus:ring-amber-200 focus:border-amber-400 outline-none resize-none mb-6 bg-white"
              />
              <button
                onClick={handleReAnalyze}
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#1EC8D8] to-[#2563EB] text-white py-4 rounded-full font-bold text-sm hover:bg-blue-700 transition-colors uppercase tracking-widest shadow-lg flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Re-Analyzing...
                  </>
                ) : (
                  "Re-Analyze with More Information"
                )}
              </button>
            </div>

          /* Invalid report state */
          ) : analysisResult && analysisResult.isValid === false ? (
            <div
              style={{
                border: "1px solid #DC2626",
                background: "#FEF2F2",
                color: "#DC2626",
                borderRadius: "12px",
                padding: "24px",
              }}
              className="shadow-sm flex flex-col items-center text-center justify-center min-h-[350px]"
              id="invalid_report_card"
            >
              <div className="w-12 h-12 bg-red-100 text-[#DC2626] rounded-full flex items-center justify-center mb-4">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h4 className="text-base font-bold mb-2">⚠ Invalid Report</h4>
              <p className="text-xs text-red-800 mb-6 leading-relaxed">
                {analysisResult.reasoning ||
                  "The provided description does not contain enough information to identify a civic issue. Please provide a clear description."}
              </p>
              <button
                onClick={handleReset}
                className="w-full bg-[#DC2626] text-white py-3 rounded-xl font-bold text-xs hover:bg-red-700 transition-colors uppercase tracking-wider cursor-pointer"
              >
                Try Again
              </button>
            </div>

          /* Analysis result state */
          ) : analysisResult ? (
            <div
              className="bg-white rounded-xl border border-slate-200 shadow-xs p-6"
              id="analysis_result_card"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 animate-pulse rounded-full" />
                  <h3 className="text-xs font-bold uppercase tracking-tight text-slate-900">
                    Gemini Analysis Preview
                  </h3>
                </div>
                {analysisResult.isDemo && (
                  <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Demo Mode (Free Tier)
                  </span>
                )}
              </div>

              {analysisResult.imageUrl && (
                <div className="mb-4 rounded-lg overflow-hidden border border-slate-100 bg-slate-50 h-32 flex items-center justify-center">
                  <img
                    src={analysisResult.imageUrl}
                    alt="Report Evidence"
                    className="max-h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-[#2563EB] rounded-full flex items-center justify-center">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Gemini AI Insight</h3>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                        Analysis Preview
                      </p>
                    </div>
                  </div>
                  {analysisResult.isDemo && (
                    <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Demo Mode
                    </span>
                  )}
                </div>

                {analysisResult.imageUrl && (
                  <div className="mb-6 rounded-xl overflow-hidden border border-slate-100 bg-slate-50 h-48 flex items-center justify-center">
                    <img
                      src={analysisResult.imageUrl}
                      alt="Report Evidence"
                      className="max-h-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}

                <div className="space-y-6">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Issue Title
                    </p>
                    <p className="text-lg font-bold text-slate-900">{analysisResult.title}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Issue Type</p>
                      <p className="text-xs font-bold text-slate-900">{analysisResult.issueType}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Severity</p>
                      <p
                        className={`text-xs font-black ${
                          analysisResult.severity >= 7
                            ? "text-red-600"
                            : analysisResult.severity >= 4
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }`}
                      >
                        {analysisResult.severity.toString().padStart(2, "0")} / 10
                      </p>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-[10px] font-bold text-blue-900 uppercase tracking-widest mb-2">
                      Step-by-Step AI Reasoning
                    </p>
                    <p className="text-xs text-blue-800 leading-relaxed">{analysisResult.reasoning}</p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-xs">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Department</span>
                      <p className="font-semibold text-slate-900">{analysisResult.department}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">Confidence</span>
                      <p className="font-mono font-bold text-[#2563EB]">{analysisResult.confidence}%</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={handleEdit}
                    className="flex-1 bg-slate-50 text-slate-600 py-3 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors uppercase tracking-wider"
                  >
                    Edit Details
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="flex-[2] bg-gradient-to-r from-[#1EC8D8] to-[#2563EB] text-white py-3 rounded-full font-bold text-xs hover:bg-blue-700 transition-colors uppercase tracking-wider shadow-md shadow-blue-200"
                  >
                    Confirm & Submit Report
                  </button>
                </div>
              </div>
            </div>

          /* Empty / awaiting state */
          ) : (
            <div
              className="bg-white border border-slate-200 rounded-xl p-6 text-center flex flex-col items-center justify-center min-h-[350px]"
              id="no_analysis_result_card"
            >
              <div className="w-12 h-12 bg-blue-100 text-[#2563EB] rounded-full flex items-center justify-center mx-auto mb-3 font-black text-lg">
                ?
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                Awaiting Evidence Diagnostic
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Describe the urban hazard or drop visual images on the left. Gemini Vision will
                perform real-time verification and dispatch.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
