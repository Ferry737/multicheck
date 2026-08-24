import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#16181D", soft: "#3F434C", muted: "#6B7079", faint: "#9CA0A8" },
        paper: "#FFFFFF",
        page: "#F6F5F2",
        line: "#ECEAE5",
        brand: { DEFAULT: "#16A38B", deep: "#0E8A76", soft: "#EAFBF7" },
        good: "#1F8A4C",
        bad: "#C0392B",
      },
      fontFamily: { sans: ["system-ui", "Archivo", "Inter", "sans-serif"] },
      borderRadius: { card: "14px" },
      boxShadow: { card: "0 1px 2px rgba(16,18,22,0.05), 0 1px 3px rgba(16,18,22,0.06)" },
    },
  },
  plugins: [],
};
export default config;
