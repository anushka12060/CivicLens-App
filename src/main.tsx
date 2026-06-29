/**
 * main.tsx
 *
 * Application entry point for CivicLens.
 *
 * Mounts the React root inside <div id="root"> (defined in index.html) and
 * wraps the entire app in StrictMode to surface potential issues during
 * development (double-invoked effects, deprecated API warnings, etc.).
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ---------------------------------------------------------------------------
// Root mount
// ---------------------------------------------------------------------------

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    '[CivicLens] Root element <div id="root"> not found in index.html. ' +
    "Ensure the element exists before the application bundle is loaded."
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
