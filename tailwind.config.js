/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0b1f3a",
          50: "#e8f0fc",
          100: "#c5d9f5",
          200: "#8db3ea",
          300: "#558cd0",
          400: "#2d6ab5",
          500: "#164f8f",
          600: "#0f3d6f",
          700: "#0b2d52",
          800: "#0b1f3a",
          900: "#071428",
        },
        accent: {
          DEFAULT: "#22c55e",
          dark: "#16a34a",
          light: "#4ade80",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
