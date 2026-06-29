import React, { useState, useCallback, useMemo } from "react";
import { CivicIssue } from "../types";
import {
  TrendingUp, ThumbsUp, ArrowUp, Building2, HelpCircle, Sparkles,
} from "lucide-react";
import ResolutionAgentModal from "./ResolutionAgentModal";
import SearchBar from "./SearchBar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of issues displayed on the priority board. */
const MAX_BOARD_ISSUES = 5;

/** Milliseconds in one day — used for priority score calculation. */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Severity thresholds for badge colour tiers. */
const SEVERITY_HIGH = 8;
const SEVERITY_MEDIUM = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriorityBoardPageProps {
  /** Full list of civic issues passed down from App. */
  issues: CivicIssue[];
  /** Callback to register an upvote / duplicate-report on an issue. */
  onUpvoteIssue: (id: string) => void;
}

/** CivicIssue enriched with computed priority metrics. */
interface RankedIssue extends CivicIssue {
  daysOpen: number;
  score: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * PriorityBoardPage
 *
 * Displays the top-5 civic issues sorted by the weighted priority formula:
 *   Priority Score = (Severity × Reports) / Days Open
 *
 * Features:
 * - Formula tooltip explaining the ranking algorithm.
 * - Per-issue status selector (Pending / In Progress / Resolved).
 * - Expandable description summary per row.
 * - Resolution Agent modal trigger.
 * - Ward-level search filtering.
 */
export default function PriorityBoardPage({ issues, onUpvoteIssue }: PriorityBoardPageProps) {
  const [upvotingIds, setUpvotingIds] = useState<Record<string, boolean>>({});
  const [showFormulaTooltip, setShowFormulaTooltip] = useState(false);
  const [selectedIssueForResolution, setSelectedIssueForResolution] = useState<CivicIssue | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [issueStatuses, setIssueStatuses] = useState<Record<string, string>>({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredIssues = useMemo(
    () => issues.filter((i) => i.ward.toLowerCase().includes(searchTerm.toLowerCase())),
    [issues, searchTerm]
  );

  const rankedIssues: RankedIssue[] = useMemo(
    () =>
      filteredIssues
        .map((issue) => {
          const daysOpen = Math.max(
            1,
            Math.round((Date.now() - new Date(issue.createdAt).getTime()) / MS_PER_DAY)
          );
          const score = parseFloat(((issue.severity * issue.reportCount) / daysOpen).toFixed(1));
          return { ...issue, daysOpen, score };
        })
        .sort((a, b) => b.score - a.score),
    [filteredIssues]
  );

  const topIssues = useMemo(() => rankedIssues.slice(0, MAX_BOARD_ISSUES), [rankedIssues]);

  const avgBacklog = useMemo(
    () =>
      filteredIssues.length > 0
        ? (rankedIssues.reduce((sum, i) => sum + i.daysOpen, 0) / filteredIssues.length).toFixed(1)
        : "0",
    [rankedIssues, filteredIssues.length]
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /** Registers an upvote for the given issue, guarding against double-clicks. */
  const handleUpvote = useCallback(
    async (id: string) => {
      if (upvotingIds[id]) return;
      setUpvotingIds((prev) => ({ ...prev, [id]: true }));
      try {
        await onUpvoteIssue(id);
      } finally {
        setUpvotingIds((prev) => ({ ...prev, [id]: false }));
      }
    },
    [upvotingIds, onUpvoteIssue]
  );

  /** Toggles the inline description summary for the given issue row. */
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIssueId((prev) => (prev === id ? null : id));
  }, []);

  /** Updates the local status for a single issue. */
  const handleStatusChange = useCallback((id: string, value: string) => {
    setIssueStatuses((prev) => ({ ...prev, [id]: value }));
  }, []);

  // ---------------------------------------------------------------------------
  // Style helpers
  // ---------------------------------------------------------------------------

  /** Returns Tailwind class string for severity badge colour tier. */
  const getSeverityBadge = useCallback((severity: number): string => {
    if (severity >= SEVERITY_HIGH) return "bg-red-50 text-red-700 border-red-100";
    if (severity >= SEVERITY_MEDIUM) return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-green-50 text-green-700 border-green-100";
  }, []);

  /** Returns inline style object for the status pill select element. */
  const getStatusStyle = useCallback((status: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      border: "none",
      borderRadius: "999px",
      padding: "4px 12px",
      fontSize: "11px",
      fontWeight: 600,
      cursor: "pointer",
      outline: "none",
      appearance: "none",
      WebkitAppearance: "none",
    };
    if (status === "in-progress") return { ...base, backgroundColor: "#EFF6FF", color: "#2563EB" };
    if (status === "resolved") return { ...base, backgroundColor: "#F0FDF4", color: "#15803D" };
    return { ...base, backgroundColor: "#F1F5F9", color: "#64748B" };
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="max-w-7xl mx-auto px-4 md:px-6 py-6 bg-[#F8FAFC]"
      id="priority_board_page_container"
    >
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2 border-l-4 border-teal-400 pl-3">
            <TrendingUp className="text-[#2563EB] h-7 w-7" aria-hidden="true" />
            Priority Dispatch Board
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Real-time urban queue sorting issues dynamically. Dispatch centres prioritise
            responses using the weighted formula to address the most urgent complaints first.
          </p>
        </div>

        {/* Formula tooltip */}
        <div className="relative">
          <button
            onClick={() => setShowFormulaTooltip((v) => !v)}
            aria-expanded={showFormulaTooltip}
            aria-controls="formula_tooltip"
            className="flex items-center gap-2 text-[10px] font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg transition-colors cursor-pointer uppercase tracking-wider"
            id="formula_info_btn"
          >
            <HelpCircle className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
            Sorting Algorithm Formula
          </button>

          {showFormulaTooltip && (
            <div
              id="formula_tooltip"
              role="tooltip"
              className="absolute right-0 mt-2 p-4 bg-white border border-slate-200 rounded-xl shadow-md z-30 w-72 text-[11px] text-slate-600 space-y-2 leading-relaxed"
            >
              <p className="font-bold text-slate-900">Priority Index Formula:</p>
              <p className="bg-slate-50 p-2 rounded-lg text-center font-mono text-[#2563EB] text-xs font-bold">
                (Severity × Reports) / Days Open
              </p>
              <p className="text-slate-400 text-[10px] leading-normal font-normal">
                High severity levels and repeat user endorsements push issues up the dispatch
                queue, while long wait times automatically inflate urgency pressure.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Search ── */}
      <SearchBar
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        placeholder="Search by ward, locality or area name"
      />

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6" id="stats_grid">
        {/* Top Priority Issue */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Top Priority Issue
          </p>
          {rankedIssues.length > 0 ? (
            <div className="mt-2">
              <p className="text-sm font-bold text-slate-900 truncate">{rankedIssues[0].title}</p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">
                {rankedIssues[0].ward} • Score: {rankedIssues[0].score}
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-2">
              No active reports
            </p>
          )}
        </div>

        {/* Queue Density */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Queue Density
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-950 font-mono">
              {filteredIssues.length}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              active cases
            </span>
          </div>
        </div>

        {/* Avg Resolution Backlog */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Avg Resolution Backlog
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-950 font-mono">{avgBacklog}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              days open
            </span>
          </div>
        </div>
      </div>

      {/* ── Rankings Table ── */}
      <div
        className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
        id="priority_board_table"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" aria-label="Priority dispatch board">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <th scope="col" className="py-4 px-6 text-center w-20">Rank</th>
                <th scope="col" className="py-4 px-6">Issue Summary</th>
                <th scope="col" className="py-4 px-6 w-40">Ward Location</th>
                <th scope="col" className="py-4 px-6 w-32">Severity</th>
                <th scope="col" className="py-4 px-6 text-center w-32">Reports</th>
                <th scope="col" className="py-4 px-6 text-center w-32">
                  <span className="block text-[9px] text-[#94A3B8] uppercase">Municipal View</span>
                  Status
                </th>
                <th scope="col" className="py-4 px-6 text-center w-32">Days Open</th>
                <th scope="col" className="py-4 px-6 text-right w-40 pr-8">Priority Score</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {topIssues.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-500 text-xs">
                    <p className="font-semibold text-slate-800 mb-1">
                      No issues found matching your search.
                    </p>
                    <p>Try a different ward name or report a new issue.</p>
                  </td>
                </tr>
              ) : (
                topIssues.map((issue, index) => {
                  const rank = index + 1;
                  const status = issueStatuses[issue.id] ?? "pending";

                  return (
                    <tr
                      key={issue.id}
                      className={`hover:bg-slate-50/50 transition-colors ${rank === 1 ? "bg-blue-50/5" : ""}`}
                    >
                      {/* Rank badge */}
                      <td className="py-4 px-6 text-center">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                            rank === 1
                              ? "bg-[#2563EB] text-white shadow-xs"
                              : rank === 2
                              ? "bg-slate-200 text-slate-700"
                              : rank === 3
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-400"
                          }`}
                          aria-label={`Rank ${rank}`}
                        >
                          {rank}
                        </span>
                      </td>

                      {/* Issue title + expandable description */}
                      <td className="py-4 px-6">
                        <div className="relative">
                          <button
                            onClick={() => handleToggleExpand(issue.id)}
                            aria-expanded={expandedIssueId === issue.id}
                            className="text-left w-full cursor-pointer select-none"
                          >
                            <p className="font-bold text-slate-800 text-xs hover:text-[#2563EB] transition-colors">
                              {issue.title}
                            </p>
                            <p className="text-[11px] text-[#2563EB] mt-0.5 font-semibold">
                              {expandedIssueId === issue.id ? "▲ Hide Summary" : "▼ View Summary"}
                            </p>
                          </button>

                          {expandedIssueId === issue.id && (
                            <div
                              role="region"
                              aria-label="Issue description"
                              className="absolute left-0 mt-2 z-50 whitespace-normal leading-relaxed text-left"
                              style={{
                                backgroundColor: "#ffffff",
                                border: "1px solid #E2E8F0",
                                borderRadius: "8px",
                                padding: "12px",
                                fontSize: "13px",
                                color: "#475569",
                                maxWidth: "400px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                                minWidth: "280px",
                              }}
                            >
                              {issue.description}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Ward */}
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                          <Building2 className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          {issue.ward}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getSeverityBadge(issue.severity)}`}
                        >
                          Severity {issue.severity}
                        </span>
                      </td>

                      {/* Reports + Upvote + Agent */}
                      <td className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-bold text-xs text-slate-800 font-mono">
                            {issue.reportCount}
                          </span>
                          <button
                            onClick={() => handleUpvote(issue.id)}
                            disabled={upvotingIds[issue.id]}
                            aria-label={`Upvote issue: ${issue.title}`}
                            className="inline-flex items-center gap-1 text-[9px] font-bold text-[#2563EB] bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-all cursor-pointer uppercase tracking-wider disabled:opacity-50"
                          >
                            <ThumbsUp className="h-2.5 w-2.5" aria-hidden="true" />
                            {upvotingIds[issue.id] ? "Voted" : "Upvote"}
                          </button>
                          <button
                            onClick={() => setSelectedIssueForResolution(issue)}
                            aria-label={`Open resolution agent for: ${issue.title}`}
                            className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded transition-all cursor-pointer uppercase tracking-wider mt-1"
                          >
                            <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                            Agent
                          </button>
                        </div>
                      </td>

                      {/* Status selector */}
                      <td className="py-4 px-6 text-center">
                        <select
                          value={status}
                          onChange={(e) => handleStatusChange(issue.id, e.target.value)}
                          aria-label={`Status for ${issue.title}`}
                          style={getStatusStyle(status)}
                        >
                          <option value="pending">Pending</option>
                          <option value="in-progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </td>

                      {/* Days open */}
                      <td className="py-4 px-6 text-center font-mono text-xs font-bold text-slate-500">
                        {issue.daysOpen}d
                      </td>

                      {/* Priority score */}
                      <td className="py-4 px-6 text-right pr-8">
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-[#2563EB] px-2.5 py-1 rounded text-xs font-bold font-mono border border-blue-100">
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          {issue.score}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <p className="text-[11px] text-[#94A3B8] text-center mt-6 mb-4">
            Showing top {MAX_BOARD_ISSUES} priority issues • Updated in real-time
          </p>
        </div>
      </div>

      {/* ── Resolution Agent Modal ── */}
      {selectedIssueForResolution && (
        <ResolutionAgentModal
          issue={selectedIssueForResolution}
          onClose={() => setSelectedIssueForResolution(null)}
        />
      )}
    </div>
  );
}
