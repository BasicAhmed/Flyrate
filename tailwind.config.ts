import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        subtle: "rgb(var(--color-subtle) / <alpha-value>)",
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        surface2: "rgb(var(--color-surface2) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hot: "#FF7A3D",
          dim: "#C43F00",
          50: "#FFF1EA",
        },
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        whatsapp: { DEFAULT: "#25D366", dark: "#1DA851" },
      },
      fontFamily: {
        display: ["IBM Plex Sans Arabic", "system-ui", "sans-serif"],
        body: ["IBM Plex Sans Arabic", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        // Layered elevation. --shadow-rgb swaps per theme.
        card: "0 1px 0 0 rgb(var(--highlight-rgb) / 0.05) inset, 0 1px 2px rgb(var(--shadow-rgb) / 0.20), 0 12px 32px -12px rgb(var(--shadow-rgb) / 0.55)",
        lift: "0 1px 0 0 rgb(var(--highlight-rgb) / 0.06) inset, 0 2px 4px rgb(var(--shadow-rgb) / 0.22), 0 24px 48px -16px rgb(var(--shadow-rgb) / 0.65)",
        soft: "0 1px 2px rgb(var(--shadow-rgb) / 0.16), 0 4px 12px -4px rgb(var(--shadow-rgb) / 0.35)",
        well: "inset 0 1px 3px rgb(var(--shadow-rgb) / 0.35)",
        glow: "0 1px 0 0 rgb(255 255 255 / 0.25) inset, 0 10px 28px -8px rgb(var(--color-primary) / 0.6)",
        "glow-lg": "0 0 0 1px rgb(var(--color-primary) / 0.25), 0 20px 60px -16px rgb(var(--color-primary) / 0.5)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #C43F00 0%, #FE5200 50%, #FF9A3D 100%)",
        "grid-fade":
          "radial-gradient(circle at 20% 0%, rgba(254,82,0,0.14), transparent 45%), radial-gradient(circle at 100% 30%, rgba(254,82,0,0.08), transparent 40%)",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        rise: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        ticker: "ticker 38s linear infinite",
        rise: "rise 0.6s cubic-bezier(0.16,1,0.3,1) forwards",
      },
    },
  },
  plugins: [],
};
export default config;
