/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf6ed',
          100: '#fbebd5',
          200: '#f6d3a8',
          300: '#f0b472',
          400: '#e88f40',
          500: '#e1721b',
          600: '#d25b14',
          700: '#ae4413',
          800: '#8b3616',
          900: '#702d15',
          950: '#3d1408',
        },
      },
    },
  },
  plugins: [],
}
