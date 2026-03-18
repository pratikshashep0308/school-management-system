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
        ink: '#0f0e17',
        paper: '#faf8f4',
        warm: '#f2ede6',
        accent: { DEFAULT: '#d4522a', light: '#e8846a', dark: '#b8411f' },
        gold: '#c9a84c',
        sage: '#4a7c59',
        slate: '#5a6474',
        muted: '#9aa0ac',
        border: '#e4ddd4',
      },
    },
  },
  plugins: [],
};
