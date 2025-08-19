/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}", 
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./hooks/**/*.{js,jsx,ts,tsx}",
    "./services/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: '#007AFF',
        secondary: '#34C759',
        tertiary: '#FF9500',
        background: '#F2F2F7',
        backgroundSoft: '#F8F9FA',
        text: '#000000',
        textSecondary: '#8E8E93',
        border: '#C6C6C8',
        shadow: '#000000',
      }
    },
  },
  plugins: [],
}