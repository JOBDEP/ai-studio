import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0b0f",
        panel: "#141419",
        border: "#26262f",
        accent: "#7c5cff",
        accent2: "#ff5c8a",
      },
    },
  },
  plugins: [],
};

export default config;
