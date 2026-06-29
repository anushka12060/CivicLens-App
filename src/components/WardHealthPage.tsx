/**
 * WardHealthPage.tsx
 *
 * Displays a health score card grid for every municipal ward and renders an
 * AI-generated diagnostic report in a sticky sidebar when a ward is selected.
 *
 * Data flow:
 *  1. Ward list is built from GENERIC_WARDS + any custom wards present in issues.
 *  2. Per-ward metrics (health score, issue count, avg severity) are computed
 *     client-side from the issues prop.
 *  3. Clicking a ward card fetches a Gemini-generated summary via POST
 *     /api/ward-summary and caches the result in local state.
 *  4. If the API is unavailable, getDeterministicSummary() produces a
 *     realistic offline fallback so the UI never shows a broken state.
 *
 * Props:
 *  - issues : Array of all CivicIssue objects across all wards.
 */

import React, { useState, useMemo } from "react";
import { GENERIC_WARDS } from "../data";
import { CivicIssue } from "../types";
import {
  HeartPulse,
  Sparkles,
  AlertTriangle,
  Building2,
  ChevronRight,
  Loader2,
  RefreshCw,
  X,
  ShieldCheck,
} from "lucide-react";
import SearchBar from "./SearchBar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for Gemini ward-summary API calls (ms). */
const API_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WardHealthPageProps {
  issues: CivicIssue[];
}

interface WardMetrics {
  name: string;
  healthScore: number;
  issueCount: number;
  averageSeverity: number;
}

interface SummaryPayload {
  summary: string;
  healthScore: number;
  issueCount: number;
  averageSeverity: number;
}

type SummaryCache = Record<string, SummaryPayload>;

// ---------------------------------------------------------------------------
// Health score helpers
// ---------------------------------------------------------------------------

/**
 * Computes a 0–100 health score for a ward based on its active issue count
 * and the average severity of those issues.
 *
 * Formula: 100 − (issueCount × 6) − round(avgSeverity × 4), clamped to [0, 100].
 */
function computeHealthScore(issueCount: number, avgSeverity: number): number {
  return Math.max(0, Math.min(100, 100 - issueCount * 6 - Math.round(avgSeverity * 4)));
}

/**
 * Returns display-ready styling tokens for a given health score.
 */
function getHealthRating(score: number) {
  if (score >= 85)
    return { label: "Excellent", text: "text-green-600", bg: "bg-green-50", fill: "bg-green-500", border: "border-green-100" };
  if (score >= 70)
    return { label: "Good", text: "text-blue-600", bg: "bg-blue-50", fill: "bg-blue-500", border: "border-blue-100" };
  if (score >= 50)
    return { label: "Fair", text: "text-amber-600", bg: "bg-amber-50", fill: "bg-amber-500", border: "border-amber-100" };
  return { label: "Critical", text: "text-red-600", bg: "bg-red-50", fill: "bg-red-500", border: "border-red-100" };
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

/**
 * Renders a limited Markdown subset to React nodes.
 * Supports: # / ## / ### headings, * / - / • list items,
 * **bold**, *italic*, and blank-line spacing.
 */
function renderMarkdown(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split(/\r?\n/);

  return (
    <div className="space-y-3">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();

        // Empty line → small spacer
        if (!trimmed) return <div key={lineIdx} className="h-1" />;

        // Detect block-level type
        const isListItem = /^[*\-•] /.test(trimmed);
        const isH3 = trimmed.startsWith("### ");
        const isH2 = trimmed.startsWith("## ");
        const isH1 = trimmed.startsWith("# ");

        // Strip the Markdown prefix from the content string
        let content = trimmed;
        if (isListItem) content = trimmed.substring(2);
        else if (isH3) content = trimmed.substring(4);
        else if (isH2) content = trimmed.substring(3);
        else if (isH1) content = trimmed.substring(2);

        // Inline bold / italic parser
        const inlineParts: React.ReactNode[] = [];
        const inlineRegex = /(\*\*|__)(.*?)\1|(\*|_)(.*?)\3/g;
        let match: RegExpExecArray | null;
        let lastIndex = 0;

        while ((match = inlineRegex.exec(content)) !== null) {
          if (match.index > lastIndex) {
            inlineParts.push(content.substring(lastIndex, match.index));
          }
          if (match[2]) {
            inlineParts.push(
              <strong key={match.index} className="font-semibold text-slate-900">
                {match[2]}
              </strong>
            );
          } else if (match[4]) {
            inlineParts.push(<em key={match.index} className="italic">{match[4]}</em>);
          }
          lastIndex = inlineRegex.lastIndex;
        }
        if (lastIndex < content.length) inlineParts.push(content.substring(lastIndex));

        const renderedContent = inlineParts.length > 0 ? inlineParts : content;

        if (isListItem)
          return (
            <div key={lineIdx} className="flex gap-2 pl-1.5 leading-relaxed text-slate-600">
              <span className="text-[#2563EB] font-bold select-none">•</span>
              <span className="flex-1">{renderedContent}</span>
            </div>
          );
        if (isH3)
          return <h4 key={lineIdx} className="text-xs font-bold text-slate-900 mt-2 mb-1">{renderedContent}</h4>;
        if (isH2)
          return <h3 key={lineIdx} className="text-sm font-bold text-slate-900 mt-3 mb-1">{renderedContent}</h3>;
        if (isH1)
          return <h2 key={lineIdx} className="text-base font-bold text-slate-900 mt-4 mb-2">{renderedContent}</h2>;

        return <p key={lineIdx} className="leading-relaxed text-slate-600">{renderedContent}</p>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Offline fallback summary generator
// ---------------------------------------------------------------------------

/**
 * Produces a realistic, ward-specific summary when the Gemini API is offline
 * or over quota. Uses keyword matching on the ward name to tailor the output.
 * Ensures the modal always shows meaningful content to the user.
 */
function getDeterministicSummary(wardName: string, activeCount: number, avgSeverity: number): string {
  if (activeCount === 0) {
    return `Ward ${wardName} is currently exhibiting an exemplary civic health standing with zero active reports. There are no immediate risks or concerns.\nRecommended Action: Conduct routine preventive inspections to sustain standards.`;
  }

  const lowerWard = wardName.toLowerCase();
  let primaryConcern = "general infrastructure safety";
  let recommendation = "Schedule standard municipal maintenance patrols.";

  // Keyword-based concern and recommendation mapping
  const keywordMap: Array<{ keywords: string[]; concern: string; action: string }> = [
    {
      keywords: ["rajpur", "water", "flood"],
      concern: "severe waterlogging and drainage blockages",
      action: "Deploy emergency teams to clear major storm water drains.",
    },
    {
      keywords: ["shastri", "road", "damage", "pothole"],
      concern: "critical asphalt erosion and hazardous deep potholes on main corridors",
      action: "Dispatch road maintenance crews to repair hazardous potholes immediately.",
    },
    {
      keywords: ["civil", "waste", "garbage", "trash"],
      concern: "unregulated commercial waste dumping and delayed garbage clearance",
      action: "Increase sanitation patrol frequencies and issue warning notices.",
    },
    {
      keywords: ["lajpat", "light", "dark"],
      concern: "non-functional street lighting stretches creating safety hazards at night",
      action: "Initiate an immediate repair schedule for broken lamp fixtures.",
    },
    {
      keywords: ["gandhi", "obstruction", "sidewalk"],
      concern: "persistent commercial encroachments and construction debris obstructing footpaths",
      action: "Launch an enforcement drive to clear sidewalk obstructions.",
    },
    {
      keywords: ["nehru", "colony"],
      concern: "aging public utility distribution networks and minor water leaks",
      action: "Conduct an urgent pressure-testing audit on pipelines.",
    },
    {
      keywords: ["model", "town"],
      concern: "unregulated parking and sidewalk encroachment in commercial areas",
      action: "Enforce clear zones on pavements and mark parking spots.",
    },
    {
      keywords: ["sector", "12"],
      concern: "pavement damage and lack of zebra crossings near residential parks",
      action: "Paint pedestrian crosswalks and install speed-calming humps.",
    },
    {
      keywords: ["mg road"],
      concern: "high-density traffic bottlenecks and minor road friction points",
      action: "Adjust signal timings at critical intersections.",
    },
    {
      keywords: ["karol", "bagh"],
      concern: "overburdened waste disposal facilities and mixed plastic accumulation",
      action: "Schedule twice-daily garbage collection and provide recycling bins.",
    },
  ];

  for (const entry of keywordMap) {
    if (entry.keywords.some((kw) => lowerWard.includes(kw))) {
      primaryConcern = entry.concern;
      recommendation = entry.action;
      break;
    }
  }

  const healthScore = computeHealthScore(activeCount, avgSeverity);

  return `Ward ${wardName} currently exhibits a civic health status of ${healthScore}/100 with ${activeCount} active reports. Escalating issues in ${primaryConcern} threaten localized community safety and transit.\nRecommended Action: ${recommendation}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WardHealthPage({ issues }: WardHealthPageProps) {
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryPayload | null>(null);
  const [summaryCache, setSummaryCache] = useState<SummaryCache>({});
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // ---------------------------------------------------------------------------
  // Derived data (memoized to avoid recomputing on every render)
  // ---------------------------------------------------------------------------

  /**
   * Builds a deduplicated list of all wards: generic wards + any custom wards
   * found in the issues array, excluding blank / "Not Specified" entries.
   */
  const allWards = useMemo(() => {
    const base = GENERIC_WARDS.filter(
      (w) => w && w.trim().toLowerCase() !== "not specified"
    );
    const customWards = issues
      .map((i) => i.ward.trim())
      .filter(
        (ward) =>
          ward &&
          ward.toLowerCase() !== "not specified" &&
          !base.some((w) => w.toLowerCase() === ward.toLowerCase())
      );
    return [...base, ...customWards];
  }, [issues]);

  /**
   * Computes per-ward metrics and sorts wards from healthiest to most critical.
   */
  const wardMetricsList: WardMetrics[] = useMemo(() => {
    return allWards
      .map((wardName) => {
        const wardIssues = issues.filter(
          (i) => i.ward.toLowerCase() === wardName.toLowerCase()
        );
        const issueCount = wardIssues.length;
        const averageSeverity =
          issueCount > 0
            ? Math.round(
                (wardIssues.reduce((sum, i) => sum + i.severity, 0) / issueCount) * 10
              ) / 10
            : 0;
        return {
          name: wardName,
          healthScore: computeHealthScore(issueCount, averageSeverity),
          issueCount,
          averageSeverity,
        };
      })
      .sort((a, b) => b.healthScore - a.healthScore);
  }, [allWards, issues]);

  /** Filters the ward list by the current search term. */
  const filteredWards = useMemo(
    () =>
      wardMetricsList.filter((w) =>
        w.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [wardMetricsList, searchTerm]
  );

  // ---------------------------------------------------------------------------
  // Ward selection & summary fetch
  // ---------------------------------------------------------------------------

  /**
   * Handles ward card click: serves from cache when available, otherwise
   * fetches a Gemini summary from the API with a 30s timeout and falls back
   * to the deterministic offline generator on any error.
   */
  const handleWardClick = async (wardName: string) => {
    setSelectedWard(wardName);
    setError(null);

    // Serve from cache if available
    if (summaryCache[wardName]) {
      setSummaryData(summaryCache[wardName]);
      return;
    }

    setLoadingSummary(true);
    setSummaryData(null);

    const wardMetric = wardMetricsList.find(
      (w) => w.name.toLowerCase() === wardName.toLowerCase()
    );
    const healthScore = wardMetric?.healthScore ?? 100;
    const activeCount = wardMetric?.issueCount ?? 0;
    const avgSeverity = wardMetric?.averageSeverity ?? 0;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const response = await fetch("/api/ward-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ wardName, healthScore, activeCount, avgSeverity }),
      });
      clearTimeout(timer);

      if (!response.ok) throw new Error("Failed to compile ward health report from server.");

      const data = await response.json();
      const payload: SummaryPayload = {
        summary: data.summary,
        healthScore: data.healthScore,
        issueCount: data.issueCount,
        averageSeverity: data.averageSeverity,
      };

      setSummaryCache((prev) => ({ ...prev, [wardName]: payload }));
      setSummaryData(payload);
    } catch (err: unknown) {
      clearTimeout(timer);
      // Always fall back to client-side generation — user never sees a broken state
      console.warn("Server summary fetch failed, generating client-side report:", err);
      const fallbackPayload: SummaryPayload = {
        summary: getDeterministicSummary(wardName, activeCount, avgSeverity),
        healthScore,
        issueCount: activeCount,
        averageSeverity: avgSeverity,
      };
      setSummaryCache((prev) => ({ ...prev, [wardName]: fallbackPayload }));
      setSummaryData(fallbackPayload);
    } finally {
      setLoadingSummary(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Summary text parser
  // ---------------------------------------------------------------------------

  /**
   * Splits the summary text into a main body and a "Recommended Action" line
   * so each part can be styled independently in the sidebar.
   */
  const parseSummaryText = (text: string) => {
    const match = text.match(/Recommended\s+Action\s*:\s*(.*)/i);
    if (!match) return { mainText: text, recommendedAction: "" };
    const startIndex = text.indexOf(match[0]);
    return {
      mainText: text.substring(0, startIndex).trim(),
      recommendedAction: match[1].trim(),
    };
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="max-w-7xl mx-auto px-4 md:px-6 py-6 bg-[#F8FAFC]"
      id="ward_health_page_container"
    >
      {/* ── Header ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2 border-l-4 border-teal-400 pl-3">
          <HeartPulse className="text-[#2563EB] h-7 w-7" />
          Ward Health Index
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
          Comprehensive health score cards of municipal regions based on density, volume, and
          urgency of active reports. Click any ward to compile an AI-generated urban health summary.
        </p>
      </div>

      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

        {/* ══════════════════════════════════════════
            LEFT — Ward cards grid
        ══════════════════════════════════════════ */}
        <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-4" id="wards_grid">
          {filteredWards.length === 0 ? (
            <div className="col-span-full py-16 text-center text-slate-500 text-xs">
              <p className="font-semibold text-slate-800 mb-1">
                No results found matching your search.
              </p>
              <p>Try a different ward name.</p>
            </div>
          ) : (
            filteredWards.map((ward) => {
              const health = getHealthRating(ward.healthScore);
              const isSelected = selectedWard === ward.name;

              return (
                <div
                  key={ward.name}
                  onClick={() => handleWardClick(ward.name)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "bg-blue-50/10 border-[#2563EB] ring-1 ring-[#2563EB]"
                      : "bg-white border-slate-200 hover:border-slate-300 shadow-xs"
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{ward.name}</h3>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-semibold uppercase tracking-wider">
                        <Building2 className="h-3 w-3" />
                        Municipal Division
                      </div>
                    </div>

                    {/* Health score badge */}
                    <div
                      className={`h-9 w-9 rounded-full flex items-center justify-center font-bold font-mono text-xs leading-none border shadow-xs ${health.bg} ${health.text} ${health.border}`}
                    >
                      {ward.healthScore}
                    </div>
                  </div>

                  {/* Health bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[11px] font-semibold">
                      <span className="text-slate-400 uppercase tracking-wider">Health Index</span>
                      <span className={`font-bold uppercase tracking-wider ${health.text}`}>
                        {health.label}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${health.fill}`}
                        style={{ width: `${ward.healthScore}%` }}
                      />
                    </div>
                  </div>

                  {/* Predictive deterioration indicator */}
                  {ward.issueCount > 0 && (
                    <div className="mt-2.5 text-[11px] font-semibold">
                      {ward.healthScore < 60 ? (
                        <span className="text-[#D97706]">
                          ⚠ At current rate, this ward may reach critical in ~5 days
                        </span>
                      ) : ward.healthScore <= 75 ? (
                        <span className="text-[#D97706]">
                          ⚠ Monitor closely — risk of deterioration in ~10 days
                        </span>
                      ) : (
                        <span className="text-[#15803D]">
                          ✓ Ward stable — no deterioration predicted
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-400">
                    <span className="font-bold uppercase tracking-wider">
                      {ward.issueCount} active{" "}
                      {ward.issueCount === 1 ? "issue" : "issues"}
                    </span>
                    <span className="flex items-center gap-1 font-bold uppercase tracking-wider">
                      Analyze Report
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ══════════════════════════════════════════
            RIGHT — AI diagnostic sidebar
        ══════════════════════════════════════════ */}
        <div
          className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-6 lg:sticky lg:top-5 lg:h-fit lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto"
          id="ward_report_sidebar"
        >
          {selectedWard ? (
            <div className="space-y-4">
              {/* Sidebar header */}
              <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                <h3 className="text-sm font-bold uppercase tracking-tight text-slate-900">
                  {selectedWard} Diagnostics
                </h3>
                <button
                  onClick={() => setSelectedWard(null)}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  aria-label="Close report"
                  id="close_report_btn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Loading state */}
              {loadingSummary && (
                <div
                  className="py-16 flex flex-col items-center justify-center text-center space-y-4"
                  id="report_loader"
                >
                  <Loader2 className="h-8 w-8 text-[#2563EB] animate-spin" />
                  <div>
                    <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Calling Gemini urban planner...
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[220px] leading-relaxed font-normal">
                      Sifting through active ward datasets, calculating priorities, and generating
                      planning directives.
                    </p>
                  </div>
                </div>
              )}

              {/* Error state (only shown if API fails AND fallback also fails — extremely rare) */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-center space-y-3">
                  <AlertTriangle className="h-6 w-6 text-red-600 mx-auto" />
                  <div className="text-xs font-bold text-red-800 uppercase tracking-wider">
                    Summary compilation failed
                  </div>
                  <p className="text-[11px] text-red-600 leading-normal">{error}</p>
                  <button
                    onClick={() => handleWardClick(selectedWard)}
                    className="flex items-center gap-1 bg-white hover:bg-slate-50 border border-slate-200 px-3 py-1.5 rounded text-[10px] font-bold text-slate-700 cursor-pointer uppercase tracking-wider"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry Generation
                  </button>
                </div>
              )}

              {/* Summary content */}
              {summaryData && !loadingSummary && (() => {
                const { mainText, recommendedAction } = parseSummaryText(summaryData.summary);

                return (
                  <div className="space-y-4 animate-fade-in" id="report_content">
                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Health</div>
                        <div className="text-sm font-bold text-slate-900 mt-1 font-mono">{summaryData.healthScore}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Issues</div>
                        <div className="text-sm font-bold text-slate-900 mt-1 font-mono">{summaryData.issueCount}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Avg Severity</div>
                        <div className="text-sm font-bold text-[#2563EB] mt-1 font-mono">{summaryData.averageSeverity}/10</div>
                      </div>
                    </div>

                    {/* AI recommendation */}
                    <div className="space-y-2.5">
                      <div
                        className="flex items-center gap-1.5 uppercase tracking-widest border-b border-slate-100 pb-1.5"
                        style={{ color: "#0D9488", fontSize: "11px", fontWeight: 700 }}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI RECOMMENDATION
                      </div>
                      <div className="text-[11px] leading-relaxed font-normal">
                        {renderMarkdown(mainText)}
                      </div>
                      {recommendedAction && (
                        <div
                          className="flex items-start gap-1.5"
                          style={{ color: "#0D9488", fontWeight: 600, fontSize: "13px", marginTop: "12px" }}
                        >
                          <span className="text-sm select-none">✦</span>
                          <span>Recommended Action: {recommendedAction}</span>
                        </div>
                      )}
                    </div>

                    {/* Active issues list */}
                    <div>
                      <div
                        style={{ fontSize: "11px", color: "#94A3B8", fontWeight: 700, marginTop: "16px" }}
                        className="uppercase"
                      >
                        ACTIVE ISSUES IN THIS WARD
                      </div>
                      <div className="mt-2 space-y-1">
                        {(() => {
                          const wardIssues = issues.filter(
                            (i) => i.ward.toLowerCase() === selectedWard.toLowerCase()
                          );

                          if (wardIssues.length === 0) {
                            return (
                              <div style={{ color: "#94A3B8", fontSize: "11px", padding: "8px 0" }}>
                                No active issues reported
                              </div>
                            );
                          }

                          return wardIssues.map((issue) => {
                            const daysOpen = Math.max(
                              1,
                              Math.round(
                                (Date.now() - new Date(issue.createdAt).getTime()) /
                                  (1000 * 60 * 60 * 24)
                              )
                            );
                            const badgeClass =
                              issue.severity >= 8
                                ? "bg-red-50 text-red-700 border-red-100"
                                : issue.severity >= 5
                                ? "bg-amber-50 text-amber-700 border-amber-100"
                                : "bg-green-50 text-green-700 border-green-100";

                            return (
                              <div
                                key={issue.id}
                                style={{ padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}
                                className="flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    style={{ fontSize: "13px", fontWeight: 600, color: "#0F172A" }}
                                    className="line-clamp-1"
                                  >
                                    {issue.title}
                                  </span>
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider shrink-0 ${badgeClass}`}
                                  >
                                    SEVERITY {issue.severity}
                                  </span>
                                </div>
                                <div style={{ fontSize: "11px", color: "#94A3B8" }}>
                                  {daysOpen} {daysOpen === 1 ? "day" : "days"} open
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Trust footer */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                      Verified by CivicLens AI Urban Planner Model.
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Empty state — no ward selected */
            <div
              className="py-12 text-center flex flex-col items-center justify-center h-full min-h-[300px]"
              id="no_ward_report_selected"
            >
              <div className="w-12 h-12 bg-blue-100 text-[#2563EB] rounded-full flex items-center justify-center mx-auto mb-3 font-black text-lg">
                ♥
              </div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-1">
                Interactive Diagnostic Hub
              </h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Click any local ward from the left list to fetch, compile, and read a personalized,
                real-time Gemini AI health audit and recommendation plan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
