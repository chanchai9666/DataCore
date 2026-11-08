/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['13px', '20px'],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '5px',
        lg: '6px',
      },
      colors: {
        toolbar: 'var(--bg-toolbar)',
        sidebar: 'var(--bg-sidebar)',
        grid: 'var(--bg-grid)',
        panel: 'var(--bg-panel)',
        line: 'var(--border)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        sel: 'var(--sel)',
        muted: 'var(--text-muted)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warn: 'var(--warn)',
      },
      height: {
        row: '24px',
        'row-sm': '22px',
        btn: '24px',
        toolbar: '56px',
        status: '22px',
      },
    },
  },
  plugins: [],
}
