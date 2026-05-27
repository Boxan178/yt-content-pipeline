import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Apple-grade Liquid Glass tokens (refresh 2026-05-27)
        bg: '#14161e',       // base — warm dark con sutil tinte azulado, NO puro negro (para que el glass refracte)
        sidebar: '#0d0f15',  // sidebar (excepción sólida, un punto más oscuro que el bg)
        panel: '#13131a',    // legacy alias — mantenido para retrocompat con clases existentes
        border: '#26262e',   // border sutil legacy
        accent: '#c9a96a',   // gold matte refinado (era #d4af37 más saturado)
        muted: '#5a5a66',    // muted más Apple (era #8a8a96)
        // Secondary accents para estados específicos
        cyan: '#22d3ee',     // info / scheduled / activeJobs glow
        magenta: '#d946ef',  // Lab experimental
        ok: '#22c55e',
        err: '#ef4444',
        warn: '#facc15',
      },
      fontFamily: {
        // next/font inyecta las variables CSS desde app/layout.tsx
        sans:    ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-sora)', 'var(--font-inter)', 'sans-serif'],
        mono:    ['var(--font-jetbrains)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        display: '-0.02em',  // tracking-tight Apple-style en headers
        label:   '0.22em',   // uppercase labels separadas
      },
      borderRadius: {
        '4xl': '28px',  // channel cards, hero containers — más generoso que rounded-3xl
      },
    },
  },
  plugins: [],
};

export default config;
