import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hermes: {
          bg: "hsl(var(--background))",
          surface: "hsl(var(--surface))",
          elevated: "hsl(var(--surface-elevated))",
          border: "hsl(var(--border))",
          text: "hsl(var(--text))",
          muted: "hsl(var(--muted))",
          green: "hsl(var(--green))",
          greenDeep: "hsl(var(--green-deep))",
          yellow: "hsl(var(--yellow))",
          yellowDeep: "hsl(var(--yellow-deep))",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(67, 245, 141, 0.15), 0 12px 32px rgba(0, 0, 0, 0.35)",
      },
      keyframes: {
        "hermes-pulse": {
          "0%, 100%": { opacity: "0.35", transform: "scaleY(0.8)" },
          "50%": { opacity: "1", transform: "scaleY(1.15)" },
        },
        "hermes-fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "hermes-pulse": "hermes-pulse 1.4s ease-in-out infinite",
        "hermes-fade-in": "hermes-fade-in 0.35s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
