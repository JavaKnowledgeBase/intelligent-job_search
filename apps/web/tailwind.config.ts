import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#162130",
        tide: "#e9f2f4",
        sand: "#f9f4ea",
        coral: "#d96b43",
        pine: "#26413c",
      },
    },
  },
  plugins: [],
};

export default config;

