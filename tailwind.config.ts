import type { Config } from "tailwindcss";

/**
 * Brand tokens per spec §12. Colors are driven by CSS variables declared in
 * globals.css so hover/active/focus shades derive from the two primaries rather
 * than inventing new hues. Blue dominates, red supports — never a red field.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "penn-blue": "var(--penn-blue)",
        "penn-blue-hover": "var(--penn-blue-hover)",
        "penn-blue-tint": "var(--penn-blue-tint)",
        "penn-red": "var(--penn-red)",
        "penn-red-hover": "var(--penn-red-hover)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        border: "var(--border)",
        // Cohort palette (data-driven, deliberately distinct from brand primaries)
        "cohort-lion": "var(--cohort-lion)",
        "cohort-dragon": "var(--cohort-dragon)",
        "cohort-bee": "var(--cohort-bee)",
        "cohort-tiger": "var(--cohort-tiger)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Arial", "sans-serif"],
      },
      borderColor: {
        DEFAULT: "var(--border)",
      },
      keyframes: {
        "row-pulse": {
          "0%": { backgroundColor: "var(--penn-blue-tint)" },
          "100%": { backgroundColor: "transparent" },
        },
        "live-ping": {
          "75%, 100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      animation: {
        "row-pulse": "row-pulse 1.6s ease-out",
        "live-ping": "live-ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
