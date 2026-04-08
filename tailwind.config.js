/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-primary)',
        card: 'var(--bg-card)',
        primary: 'var(--text-primary)',
        dim: 'var(--text-secondary)',
        'pixel-green': '#10b981',
        'alipay-blue': '#0ea5e9',
        'expense-red': '#ef4444',
        'income-yellow': '#eab308',
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', 'cursive'],
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Microsoft YaHei"', '"Heiti SC"', 'monospace'],
      },
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '12': '48px',
        '16': '64px',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'text-glow': 'textGlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'box-glow': 'boxGlow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
      },
      keyframes: {
        textGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 4px rgba(16, 185, 129, 0.5))' },
          '50%': { opacity: '0.5', filter: 'drop-shadow(0 0 0 rgba(16, 185, 129, 0))' },
        },
        boxGlow: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 15px rgba(16, 185, 129, 0.5)' },
          '50%': { opacity: '0.5', boxShadow: '0 0 5px rgba(16, 185, 129, 0.1)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
}
