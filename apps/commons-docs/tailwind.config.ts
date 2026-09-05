import { createPreset } from 'fumadocs-ui/tailwind-plugin';
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './node_modules/fumadocs-ui/dist/**/*.js',
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './content/**/*.{md,mdx}',
    './mdx-components.tsx',
  ],
  presets: [createPreset()],
  theme: {
    extend: {
      fontFamily: {
        // Space Grotesk is the brand face shared with commons-app; Geist Sans
        // carries long-form prose and Geist Mono every code surface.
        space: ['var(--font-space-grotesk)', 'Helvetica', 'Arial', 'sans-serif'],
        sans: ['var(--font-geist-sans)', 'Arial', 'Helvetica', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        page: 'var(--page)',
        brand: {
          yellow: 'var(--brand-yellow)',
          pink: 'var(--brand-pink)',
          mint: 'var(--brand-mint)',
          cyan: 'var(--brand-cyan)',
          blue: 'var(--brand-blue)',
          lilac: 'var(--brand-lilac)',
        },
      },
      boxShadow: {
        // Same soft, warm-tinted elevation scale as the app.
        card: '0 2px 8px -2px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04)',
        floating:
          '0 8px 24px -8px rgba(28, 25, 23, 0.12), 0 2px 6px -2px rgba(28, 25, 23, 0.05)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
};

export default config;
