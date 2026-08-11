import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        deck: {
          bg: "#0b0d12",
          panel: "#12151c",
          border: "#232733",
          accent: "#7c5cff",
        },
      },
    },
  },
  plugins: [],
};

export default config;
