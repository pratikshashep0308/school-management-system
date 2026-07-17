/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['DM Serif Display', 'serif'],
      },
      colors: {
        // Warm neutral ramp — refined for a premium, cohesive surface system.
        ink: '#1a1714',
        paper: '#ffffff',
        warm: '#faf7f2',
        canvas: '#f6f2ec',
        // Single brand accent (terracotta) — matches the CSS token + logo.
        accent: { DEFAULT: '#d4522a', light: '#e8846a', dark: '#b8411f' },
        // Supporting status hues (muted, accessible).
        gold: '#b8862b',
        sage: '#4a7c59',
        slate: '#4a453f',
        muted: '#8a8178',
        border: '#ece5db',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26,23,20,0.04), 0 1px 3px rgba(26,23,20,0.05)',
        card: '0 2px 6px rgba(26,23,20,0.05), 0 6px 16px rgba(26,23,20,0.06)',
        lift: '0 8px 24px rgba(26,23,20,0.08), 0 16px 48px rgba(26,23,20,0.10)',
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};