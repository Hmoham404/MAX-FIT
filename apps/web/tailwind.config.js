/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'rgb(var(--brand) / <alpha-value>)', fg: 'rgb(var(--brand-fg) / <alpha-value>)' },
        ink: '#0B0D10',
        anthracite: '#171A20',
        smoke: '#F3F4F6',
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'Oswald', 'Impact', 'sans-serif'],
        sans: ['Inter', '"Noto Sans Arabic"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { marquee: 'marquee 30s linear infinite' },
    },
  },
  plugins: [],
};