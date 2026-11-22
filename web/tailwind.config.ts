import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        radar: {
          bg: "#0B0F19",
          card: "#121826",
          border: "#1E293B",
          accent: "#38BDF8",
          bullish: "#10B981",
          bearish: "#EF4444",
          neutral: "#94A3B8",
          divergence: "#F59E0B",
        },
      },
    },
  },
  plugins: [],
};
export default config;
