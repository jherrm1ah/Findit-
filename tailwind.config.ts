import type { Config } from "tailwindcss";

const config: Config = {
  // .jsx/.js was missing for app/ (components/ already covers both) — a
  // few real screens under app/ (LandingPage.jsx, HomeShell.jsx) are .jsx,
  // and any Tailwind class used only inside one of them, never duplicated
  // in components/, was silently never generated: no error, just an
  // unstyled element in production.
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
