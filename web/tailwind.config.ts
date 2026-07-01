import type { Config } from 'tailwindcss';

// Palette Claupiece: deep purple/viola (tende al viola, richiesta prodotto).
// I token rispecchiano le CSS variables in globals.css → usabili come utility Tailwind.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-deep': 'var(--bg-deep)',
        'bg-base': 'var(--bg-base)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-glass': 'var(--bg-glass)',
        'text-high': 'var(--text-high)',
        'text-mid': 'var(--text-mid)',
        'text-low': 'var(--text-low)',
        'on-card-high': 'var(--on-card-high)',
        'on-card-mid': 'var(--on-card-mid)',
        'on-card-low': 'var(--on-card-low)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        gold: 'var(--gold)',
        border: 'var(--border)',
        'border-card': 'var(--border-card)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      fontFamily: {
        ui: 'var(--font-ui)',
        display: 'var(--font-display)',
      },
      boxShadow: {
        'glow-accent': 'var(--glow-accent)',
        card: 'var(--shadow-card)',
      },
    },
  },
  plugins: [],
};

export default config;
