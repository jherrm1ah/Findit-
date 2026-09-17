import type { Config } from "tailwindcss";

// Both faces are already loaded in app/globals.css (Google Fonts import)
// but were, before this, used almost nowhere: Work Sans appeared in exactly
// one file and IBM Plex Mono in none — every button, nav label, and price
// in the app was falling back to the browser's own generic system font
// the whole time, indistinguishable from any other app. This makes the
// fonts FindIt already chose the actual defaults, everywhere, in one place,
// rather than something opted into per component.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Work Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
