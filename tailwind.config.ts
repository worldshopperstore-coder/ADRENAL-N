/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46',
          800: '#27272a',
          900: '#18181b',
          950: '#09090b',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'boltify': '0 0 0 1px rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.2)',
        'boltify-lg': '0 0 0 1px rgba(255,255,255,0.05), 0 4px 6px rgba(0,0,0,0.3), 0 10px 24px rgba(0,0,0,0.25)',
        'boltify-card': '0 1px 3px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.12)',
        'boltify-glow': '0 0 20px rgba(249,115,22,0.15)',
        'vibrant-emerald': '0 0 20px rgba(16,185,129,0.25), 0 0 6px rgba(16,185,129,0.1)',
        'vibrant-violet': '0 0 20px rgba(139,92,246,0.25), 0 0 6px rgba(139,92,246,0.1)',
        'vibrant-sky': '0 0 20px rgba(14,165,233,0.25), 0 0 6px rgba(14,165,233,0.1)',
        'vibrant-amber': '0 0 20px rgba(245,158,11,0.25), 0 0 6px rgba(245,158,11,0.1)',
        'vibrant-rose': '0 0 20px rgba(244,63,94,0.25), 0 0 6px rgba(244,63,94,0.1)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
