import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertBannerProps {
  /** Callback fired when the user dismisses the banner. */
  onDismiss: () => void;
  /** Callback fired when the user clicks "View Issue". */
  onViewIssue: () => void;
  /** Name of the highest-priority ward shown in the alert message. */
  wardName: string;
  /** Severity score (1–10) of the top-priority issue. */
  severity: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * AlertBanner
 *
 * A dismissible top-of-page notification that surfaces the highest-priority
 * civic issue detected by the AI monitor. Animates in/out via Framer Motion.
 */
export default function AlertBanner({
  onDismiss,
  onViewIssue,
  wardName,
  severity,
}: AlertBannerProps) {
  return (
    <AnimatePresence>
      <motion.div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="w-full bg-[#FFFBEB] border-l-4 border-amber-500 shadow-sm z-40 overflow-hidden"
      >
        <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          {/* ── Left: indicator + message ── */}
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            {/* Pulsing dot + label — hidden on smallest screens to save space */}
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <span
                className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"
                aria-hidden="true"
              />
              <span className="text-[10px] font-semibold text-amber-900 uppercase tracking-widest whitespace-nowrap">
                AI Monitor Active
              </span>
            </div>

            {/* Divider — hidden on mobile */}
            <div className="hidden sm:block h-4 w-px bg-amber-200 shrink-0" aria-hidden="true" />

            {/* Alert message */}
            <p className="text-sm text-amber-900 font-medium min-w-0">
              <span className="font-bold">{wardName}</span>
              {" · Severity "}
              <span className="font-bold">{severity}/10</span>
              {" issue detected — flagged for autonomous municipal escalation"}
            </p>
          </div>

          {/* ── Right: actions ── */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              onClick={onViewIssue}
              aria-label={`View the Severity ${severity} issue in ${wardName}`}
              className="text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
            >
              View Issue
            </button>
            <button
              onClick={onDismiss}
              aria-label="Dismiss alert"
              className="text-amber-500 hover:text-amber-700 transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
