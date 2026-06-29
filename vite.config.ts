import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

/**
 * Vite configuration for CivicLens.
 *
 * Notable settings:
 * - Path alias `@` resolves to the project root for clean imports.
 * - HMR and file-watching are disabled via DISABLE_HMR env var when running
 *   inside Google AI Studio to prevent flickering during agent edits.
 * - GOOGLE_MAPS_PLATFORM_KEY is forwarded to the client bundle if present.
 */
export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === "true";

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },

    define: {
      "process.env.GOOGLE_MAPS_PLATFORM_KEY": JSON.stringify(
        process.env.GOOGLE_MAPS_PLATFORM_KEY ?? ""
      ),
    },

    server: {
      /** Disable HMR inside AI Studio to prevent UI flickering during agent edits. */
      hmr: !isHmrDisabled,
      /** Disable file watching when HMR is off to reduce CPU usage. */
      watch: isHmrDisabled ? null : {},
    },
  };
});
