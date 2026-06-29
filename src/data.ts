/**
 * data.ts
 *
 * Static reference data for CivicLens.
 *
 * Exports:
 *  - GENERIC_WARDS   : Canonical list of municipal ward names used throughout
 *                      the app for ward selection dropdowns and health index.
 *  - INITIAL_ISSUES  : Five pre-seeded demo CivicIssue objects that the backend
 *                      serves on first load. Their lat/lng are overwritten at
 *                      runtime by App.tsx to spread them near the user's location.
 *
 * Note: INITIAL_ISSUES is kept here as the authoritative type-checked source of
 * truth for demo data. The backend mirrors these values — if you update one,
 * update the other.
 */

import { CivicIssue } from "./types";

// ---------------------------------------------------------------------------
// Ward list
// ---------------------------------------------------------------------------

/**
 * Canonical list of municipal wards available for issue reporting and the
 * Ward Health Index. Custom ward names entered by users are appended at
 * runtime and never mutate this array.
 */
export const GENERIC_WARDS: string[] = [
  "Rajpur",
  "Shastri Nagar",
  "Civil Lines",
  "Lajpat Nagar",
  "Gandhi Nagar",
  "Nehru Colony",
  "Model Town",
  "Sector 12",
  "MG Road",
  "Karol Bagh",
];

// ---------------------------------------------------------------------------
// Demo issues
// ---------------------------------------------------------------------------

/**
 * Five pre-populated demo issues seeded by the backend on first load.
 * Each issue covers a distinct civic issue type to demonstrate the full
 * range of CivicLens' AI classification capabilities.
 *
 * IDs "1"–"5" are treated as demo identifiers in App.tsx, where their
 * coordinates are randomised near the user's location at runtime.
 */
export const INITIAL_ISSUES: CivicIssue[] = [
  {
    id: "1",
    title: "Severe Road Waterlogging & Blockage",
    description:
      "Heavy monsoon shower waterlogging on the main outer ring road near the flyover. " +
      "Cars are stuck and traffic is at a complete standstill.",
    ward: "Rajpur",
    lat: 28.6250,
    lng: 77.2150,
    imageUrl: null,
    issueType: "Waterlogging / Flooding",
    severity: 9,
    affectedRadius: "200 meters",
    department: "Municipal Storm Water Drain Dept",
    confidence: 96,
    reasoning:
      "High water levels reaching vehicle bumpers under a primary commercial flyover " +
      "completely disrupts high-density traffic, indicating an emergency flood event.",
    reportCount: 42,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  },
  {
    id: "2",
    title: "Dangerous Deep Crater Pothole",
    description:
      "Deep pothole right after the 80 Feet Road crossing. " +
      "Two motorcyclists slipped here yesterday evening.",
    ward: "Shastri Nagar",
    lat: 28.6110,
    lng: 77.1950,
    imageUrl: null,
    issueType: "Road Damage",
    severity: 8,
    affectedRadius: "15 meters",
    department: "Municipal Road Infrastructure",
    confidence: 92,
    reasoning:
      "An asphalt collapse on a central arterial road is a severe hazard, especially for " +
      "two-wheelers, with recorded minor accidents compounding urgency.",
    reportCount: 28,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  },
  {
    id: "3",
    title: "Unattended Commercial Waste Dump",
    description:
      "Huge pile of mixed organic waste, plastics, and wooden boxes left directly on the " +
      "footpath near the main commercial street, smelling bad.",
    ward: "Civil Lines",
    lat: 28.6300,
    lng: 77.1850,
    imageUrl: null,
    issueType: "Waste Management",
    severity: 6,
    affectedRadius: "40 meters",
    department: "Municipal Solid Waste Management",
    confidence: 89,
    reasoning:
      "Accumulation of commercial garbage blocks a high-traffic pedestrian walkway, " +
      "causing unsanitary conditions and odor pollution.",
    reportCount: 19,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  },
  {
    id: "4",
    title: "Broken Streetlights Stretch",
    description:
      "A stretch of three streetlights is completely broken, leaving the footpath and " +
      "half of the road pitch black at night.",
    ward: "Lajpat Nagar",
    lat: 28.6050,
    lng: 77.2250,
    imageUrl: null,
    issueType: "Street Lighting",
    severity: 5,
    affectedRadius: "120 meters",
    department: "Municipal Electrical Division",
    confidence: 91,
    reasoning:
      "Multiple non-functional streetlights on a highly frequented commercial corridor " +
      "reduce nighttime visibility and raise neighbourhood safety concerns.",
    reportCount: 11,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  },
  {
    id: "5",
    title: "Construction Debris Sidewalk Obstruction",
    description:
      "Large pile of concrete blocks, cement sacks, and debris dumped on the sidewalk. " +
      "Pedestrians have to walk on the busy main road.",
    ward: "Gandhi Nagar",
    lat: 28.5950,
    lng: 77.2100,
    imageUrl: null,
    issueType: "Footpath Obstruction",
    severity: 7,
    affectedRadius: "25 meters",
    department: "Municipal Ward Enforcement",
    confidence: 94,
    reasoning:
      "Obstruction on a public footpath forces pedestrians into traffic, " +
      "creating a severe safety risk.",
    reportCount: 15,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    isDemo: true,
  },
];
