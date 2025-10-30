import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f3f7ff',
          100: '#e6efff',
          200: '#c4d9ff',
          300: '#97b9ff',
          400: '#6c93ff',
          500: '#4f73ff',
          600: '#3c55f3',
          700: '#2f41d0',
          800: '#2938a8',
          900: '#283585'
        }
      }
    },
  },
  plugins: [],
} satisfies Config


