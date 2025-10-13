/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // Enable class-based dark mode
  content: [
    './src/**/*.{html,ts}',
  ],
  // Add safelist to prevent purging of dynamically used classes or complex animations
  safelist: [
    { pattern: /bg-(blue|gray|red|green|yellow)-(100|200|300|400|500|600|700|800|900)/ },
    { pattern: /text-(blue|gray|red|green|yellow)-(100|200|300|400|500|600|700|800|900)/ },
  ],
  theme: {
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    }
  },
  plugins: [],
}
