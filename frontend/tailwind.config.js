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
        // White-first neutral ramp.
        ink: '#14181f',
        paper: '#ffffff',
        warm: '#f7f8fa',      // barely-there grey for zebra rows / subtle sections
        canvas: '#ffffff',
        slate: '#3f4550',
        muted: '#7a828f',
        border: '#ebedf0',
        // Brand accent = logo blue (keeps bg-accent/text-accent working app-wide).
        accent: { DEFAULT: '#0f6cbd', light: '#4a9be8', dark: '#0b5596' },
        // The Future Step School logo palette.
        logo: {
          red: '#d21f1f', orange: '#e06a00', green: '#128a4a',
          blue: '#0f6cbd', sky: '#1499d6', purple: '#6a2c9c',
        },
        // Status hues (aligned to logo family).
        gold: '#e06a00',   // warning / orange
        sage: '#128a4a',   // success / green
      },
      boxShadow: {
        soft: '0 1px 2px rgba(20,24,31,0.04), 0 1px 3px rgba(20,24,31,0.06)',
        card: '0 2px 8px rgba(20,24,31,0.06), 0 8px 24px rgba(20,24,31,0.06)',
        lift: '0 8px 28px rgba(20,24,31,0.09), 0 20px 56px rgba(20,24,31,0.10)',
      },
      borderRadius: { xl: '1rem', '2xl': '1.25rem' },
    },
  },
  plugins: [],
};