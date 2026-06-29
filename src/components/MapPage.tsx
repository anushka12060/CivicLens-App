import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { CivicIssue } from "../types";
import { ThumbsUp, Calendar, Sparkles } from "lucide-react";
import ResolutionAgentModal from "./ResolutionAgentModal";
import SearchBar from "./SearchBar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default map centre (New Delhi) used before geolocation resolves. */
const DEFAULT_LAT = 28.6139;
const DEFAULT_LNG = 77.209;

/** Leaflet map zoom level used on initial load and after location resolves. */
const DEFAULT_ZOOM = 12;

/** Zoom level applied when flying to a selected marker. */
const FOCUS_ZOOM = 14;

/** Animation duration (seconds) for the flyTo transition. */
const FLY_DURATION = 1.5;

/** Padding factor applied to fitBounds so markers aren't flush with the edge. */
const BOUNDS_PADDING = 0.3;

/** Milliseconds in one day — used for priority score calculation. */
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Severity thresholds for colour-coding map pins and list badges. */
const SEVERITY_HIGH = 7;
const SEVERITY_MEDIUM = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MapPageProps {
  /** Full list of civic issues passed down from App. */
  issues: CivicIssue[];
  /** Callback to register an upvote on an issue. */
  onUpvoteIssue: (id: string) => void;
  /** Resolved GPS position of the current user, or null while pending. */
  userLocation: { lat: number; lng: number } | null;
}

interface SeverityStyles {
  background: string;
  border: string;
  text: string;
  bg: string;
  borderClass: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns colour tokens for a given severity score.
 * Red ≥ 7 · Amber ≥ 4 · Green below 4.
 */
function getSeverityStyles(severity: number): SeverityStyles {
  if (severity >= SEVERITY_HIGH) {
    return {
      background: "#EF4444",
      border: "#DC2626",
      text: "text-red-600",
      bg: "bg-red-50",
      borderClass: "border-red-100",
    };
  }
  if (severity >= SEVERITY_MEDIUM) {
    return {
      background: "#F59E0B",
      border: "#D97706",
      text: "text-amber-600",
      bg: "bg-amber-50",
      borderClass: "border-amber-100",
    };
  }
  return {
    background: "#10B981",
    border: "#059669",
    text: "text-green-600",
    bg: "bg-green-50",
    borderClass: "border-green-100",
  };
}

/**
 * Builds the HTML string injected into a Leaflet popup for a given issue.
 * Kept outside the component to avoid re-creation on every render.
 */
function buildPopupContent(issue: CivicIssue, color: string, score: number): string {
  return `
    <div style="font-family: sans-serif; min-width: 180px; max-width: 260px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="background-color:${color}20;color:${color};border:1px solid ${color}40;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:bold;text-transform:uppercase;">
          Severity ${issue.severity}
        </span>
        <span style="background-color:#f1f5f9;color:#475569;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:bold;text-transform:uppercase;">
          ${issue.ward}
        </span>
      </div>
      <h4 style="font-size:12px;font-weight:bold;color:#0f172a;margin:0 0 4px;line-height:1.2;">${issue.title}</h4>
      <p style="font-size:11px;color:#475569;margin:0 0 8px;line-height:1.4;">${issue.description}</p>
      <div style="border-top:1px solid #e2e8f0;padding-top:6px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:9px;color:#94a3b8;font-weight:600;">
        <span style="text-transform:uppercase;">REPORTS: ${issue.reportCount}</span>
        <span style="background-color:#eff6ff;color:#2563eb;border:1px solid #dbeafe;padding:2px 6px;border-radius:4px;font-weight:bold;text-transform:uppercase;">
          SCORE: ${score}
        </span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * MapPage — Ward Spatial Registry
 *
 * Renders an interactive Leaflet map alongside a filterable issue list.
 * Clicking a list card or map pin cross-highlights both views and triggers
 * a smooth flyTo animation. The Resolution Agent modal is accessible from
 * each issue card.
 */
export default function MapPage({ issues, onUpvoteIssue, userLocation }: MapPageProps) {
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedIssueForResolution, setSelectedIssueForResolution] = useState<CivicIssue | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Leaflet instance refs — never stored in React state to avoid re-renders
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markersRef = useRef<unknown[]>([]);
  const markerInstancesRef = useRef<Record<string, unknown>>({});

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const filteredIssues = useMemo(
    () => issues.filter((i) => i.ward.toLowerCase().includes(searchTerm.toLowerCase())),
    [issues, searchTerm]
  );

  // ---------------------------------------------------------------------------
  // Map initialisation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const L = (window as { L?: unknown }).L as {
      map: (...args: unknown[]) => unknown;
      tileLayer: (...args: unknown[]) => { addTo: (m: unknown) => void };
    } | undefined;

    if (!L || !mapContainerRef.current || mapInstanceRef.current) return;

    const centerLat = userLocation?.lat ?? DEFAULT_LAT;
    const centerLng = userLocation?.lng ?? DEFAULT_LNG;

    const map = (L.map as Function)(mapContainerRef.current, { zoomControl: true })
      .setView([centerLat, centerLng], DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      (map as { remove: () => void }).remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Re-centre map when user location resolves
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const map = mapInstanceRef.current as { setView: (c: number[], z: number) => void } | null;
    if (map && userLocation) {
      map.setView([userLocation.lat, userLocation.lng], DEFAULT_ZOOM);
    }
  }, [userLocation]);

  // ---------------------------------------------------------------------------
  // Sync markers whenever filtered issues change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const L = (window as { L?: unknown }).L as {
      circleMarker: (...args: unknown[]) => unknown;
      featureGroup: (markers: unknown[]) => { getBounds: () => { pad: (n: number) => unknown } };
    } | undefined;

    const map = mapInstanceRef.current as {
      fitBounds: (b: unknown) => void;
    } | null;

    if (!L || !map) return;

    // Remove all existing markers
    (markersRef.current as { remove: () => void }[]).forEach((m) => m.remove());
    markersRef.current = [];

    const newInstances: Record<string, unknown> = {};

    filteredIssues.forEach((issue) => {
      const color = getSeverityStyles(issue.severity).background;
      const daysOpen = Math.max(
        1,
        Math.round((Date.now() - new Date(issue.createdAt).getTime()) / MS_PER_DAY)
      );
      const score = parseFloat(((issue.severity * issue.reportCount) / daysOpen).toFixed(1));

      const marker = (
        (L.circleMarker as Function)([issue.lat, issue.lng], {
          radius: 8,
          fillColor: color,
          color: "#ffffff",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
      ) as any;
      marker.addTo(map).bindPopup(buildPopupContent(issue, color, score));

      (marker as { on: (e: string, cb: () => void) => void }).on("click", () =>
        setSelectedIssueId(issue.id)
      );
      (marker as { on: (e: string, cb: () => void) => void }).on("popupclose", () =>
        setSelectedIssueId((curr) => (curr === issue.id ? null : curr))
      );

      markersRef.current.push(marker);
      newInstances[issue.id] = marker;
    });

    markerInstancesRef.current = newInstances;

    // Auto-fit bounds to show all markers
    if (filteredIssues.length > 0 && markersRef.current.length > 0) {
      const group = L.featureGroup(markersRef.current);
      map.fitBounds(group.getBounds().pad(BOUNDS_PADDING));
    }
  }, [filteredIssues]);

  // ---------------------------------------------------------------------------
  // Fly to selected marker
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedIssueId) return;
    const map = mapInstanceRef.current as {
      flyTo: (latlng: unknown, zoom: number, opts: object) => void;
    } | null;
    const marker = markerInstancesRef.current[selectedIssueId] as {
      getLatLng: () => unknown;
      openPopup: () => void;
    } | undefined;

    if (map && marker) {
      map.flyTo(marker.getLatLng(), FOCUS_ZOOM, { animate: true, duration: FLY_DURATION });
      marker.openPopup();
    }
  }, [selectedIssueId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCardClick = useCallback((id: string) => setSelectedIssueId(id), []);

  const handleUpvote = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onUpvoteIssue(id);
    },
    [onUpvoteIssue]
  );

  const handleOpenAgent = useCallback((e: React.MouseEvent, issue: CivicIssue) => {
    e.stopPropagation();
    setSelectedIssueForResolution(issue);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="max-w-7xl mx-auto px-4 md:px-6 py-6 h-auto md:h-[calc(100vh-64px)] flex flex-col bg-[#F8FAFC]"
      id="map_page_container"
    >
      {/* ── Header ── */}
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 border-l-4 border-teal-400 pl-3">
          Ward Spatial Registry
        </h1>
        <p className="text-slate-500 text-xs mt-1">
          Interactive map of reported municipal incidents. Pins are colour-coded by severity
          (Red: Critical · Amber: Action Required · Green: Standard Monitoring).
        </p>
      </div>

      <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* ── Map ── */}
        <div
          className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs h-64 md:h-[450px] lg:h-full relative"
          id="map_frame"
        >
          <div
            ref={mapContainerRef}
            className="w-full h-full z-10"
            id="leaflet_map_element"
            role="application"
            aria-label="Interactive ward map"
          />

          {/* Legend overlay */}
          <div
            className="absolute bottom-4 left-4 bg-white/95 backdrop-blur border border-slate-200 p-2.5 rounded-lg shadow-sm flex gap-4 z-20"
            aria-label="Map legend"
          >
            {[
              { color: "bg-red-500", label: "High Severity" },
              { color: "bg-amber-500", label: "Moderate" },
              { color: "bg-green-500", label: "Standard" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${color}`} aria-hidden="true" />
                <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wider">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Issue list sidebar ── */}
        <div
          className="lg:col-span-4 flex flex-col h-[350px] lg:h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs p-4"
          id="map_sidebar"
        >
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 shrink-0">
            Active Registry ({filteredIssues.length})
          </h2>

          <div
            className="space-y-2 overflow-y-auto flex-1 pr-1"
            id="map_issues_list"
            role="list"
            aria-label="Filtered civic issues"
          >
            {filteredIssues.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs" role="status">
                <p className="font-semibold text-slate-800 mb-1">
                  No results found matching your search.
                </p>
                <p>Try a different ward name.</p>
              </div>
            ) : (
              filteredIssues.map((issue) => {
                const styles = getSeverityStyles(issue.severity);
                const isFocused = selectedIssueId === issue.id;

                return (
                  <div
                    key={issue.id}
                    role="listitem"
                    onClick={() => handleCardClick(issue.id)}
                    aria-selected={isFocused}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleCardClick(issue.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      isFocused
                        ? "bg-blue-50/10 border-[#2563EB] ring-1 ring-[#2563EB]"
                        : "border-slate-100 hover:border-slate-200 bg-white"
                    }`}
                  >
                    {/* Severity + Ward */}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${styles.bg} ${styles.text} ${styles.borderClass}`}
                      >
                        Severity {issue.severity}/10
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        {issue.ward}
                      </span>
                    </div>

                    {/* Title + description */}
                    <h3 className="text-xs font-bold text-slate-800 truncate">{issue.title}</h3>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-normal">
                      {issue.description}
                    </p>

                    {/* Actions row */}
                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-50 text-[10px] text-slate-400">
                      <button
                        onClick={(e) => handleUpvote(e, issue.id)}
                        aria-label={`Upvote issue: ${issue.title}`}
                        className="flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-blue-600 transition-colors"
                      >
                        <ThumbsUp className="h-3 w-3 text-slate-400" aria-hidden="true" />
                        {issue.reportCount} Reports
                      </button>

                      <button
                        onClick={(e) => handleOpenAgent(e, issue)}
                        aria-label={`Open resolution agent for: ${issue.title}`}
                        className="flex items-center gap-1 font-bold text-amber-700 hover:text-amber-800 uppercase tracking-wider"
                      >
                        <Sparkles className="h-3 w-3" aria-hidden="true" />
                        Agent
                      </button>

                      <span className="flex items-center gap-1 font-semibold uppercase tracking-wider">
                        <Calendar className="h-3 w-3 text-slate-400" aria-hidden="true" />
                        {new Date(issue.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Resolution Agent Modal */}
          {selectedIssueForResolution && (
            <ResolutionAgentModal
              issue={selectedIssueForResolution}
              onClose={() => setSelectedIssueForResolution(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
