/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-cyan': '#00AEEF',
        'brand-navy': '#002855',
        'brand-dark': '#0f172a',
        'odoo': {
          DEFAULT: '#714B67',
          dark: '#5a3b52'
        },
        'brand-primary': '#4C3073',
        'brand-primary-hover': '#3b2559',
        'brand-primary-dark': '#3b2559',
        'brand-primary-light': '#BC91D9',
        'brand-accent': '#8E43D9',
        'brand-light': '#BC91D9',
        'brand-danger': '#730202'
      },
    },
  },
  plugins: [],
}
