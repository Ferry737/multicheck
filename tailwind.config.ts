import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral-dominant, Swiss-clear palette
        ink: { DEFAULT: "#16181D", soft: "#3A3E47", muted: "#6B7079", faint: "#9CA1AB" },
        paper: "#FFFFFF",
        page: "#F4F3F0", // warm off-white
        surface: "#FFFFFF",
        line: "#E7E5E0", // hairline border
        lineStrong: "#D8D5CE",
        // ONE restrained accent — deep Swiss blue (serious, trustworthy, not crypto-teal)
        brand: { DEFAULT: "#2C5FE0", deep: "#1E45B0", soft: "#EEF2FE", ink: "#2C5FE0" },
        good: "#1F8A4C",
        goodSoft: "#EAF6EE",
        bad: "#C0392B",
        badSoft: "#FBEDEB",
        warn: "#B7791F",
        warnSoft: "#FBF3E3",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // disciplined type scale
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        xs: ["0.75rem", { lineHeight: "1.1rem" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.6rem" }],
        xl: ["1.375rem", { lineHeight: "1.7rem" }],
        "2xl": ["1.875rem", { lineHeight: "2.2rem", letterSpacing: "-0.01em" }],
        "3xl": ["2.5rem", { lineHeight: "2.7rem", letterSpacing: "-0.02em" }],
        "4xl": ["3.25rem", { lineHeight: "3.4rem", letterSpacing: "-0.02em" }],
      },
      borderRadius: { card: "16px", md: "12px", sm: "9px", pill: "999px" },
      boxShadow: {
        card: "0 1px 2px rgba(16,18,22,0.04), 0 1px 3px rgba(16,18,22,0.05)",
        float: "0 4px 16px rgba(16,18,22,0.08)",
      },
      spacing: { "18": "4.5rem", "22": "5.5rem" },
      maxWidth: { shell: "1080px" },
    },
  },
  plugins: [],
};
export default config;
