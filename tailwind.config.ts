import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1280px' },
    },
    extend: {
      fontFamily: {
        // Body: high legibility at small sizes and inside tables.
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // Display: one typeface drawing both Arabic and Latin, so headings
        // keep the same voice across locales.
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Fluid display scale (ratio 1.25) so headings breathe on wide screens
        // without a pile of breakpoint overrides.
        'display-sm': ['clamp(1.5rem, 1.2rem + 1.2vw, 1.953rem)', { lineHeight: '1.25' }],
        'display-md': ['clamp(1.875rem, 1.4rem + 1.9vw, 2.441rem)', { lineHeight: '1.2' }],
        'display-lg': ['clamp(2.25rem, 1.6rem + 2.8vw, 3.052rem)', { lineHeight: '1.15' }],
        'display-xl': ['clamp(2.75rem, 1.8rem + 4vw, 3.815rem)', { lineHeight: '1.1' }],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // The amber signature. Named apart from `accent` (a surface tint) on
        // purpose — mixing the two is what makes brand colour look accidental.
        brand: {
          DEFAULT: 'hsl(var(--brand-accent))',
          foreground: 'hsl(var(--brand-accent-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 6px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 6px)',
        sm: 'calc(var(--radius) - 10px)',
      },
      transitionTimingFunction: {
        brand: 'var(--ease-brand)',
      },
      transitionDuration: {
        micro: '120ms',
        element: '220ms',
        page: '380ms',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          from: { backgroundPosition: '180% 0' },
          to: { backgroundPosition: '-80% 0' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.1', transform: 'scale(1.08)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.4s var(--ease-brand) infinite',
        'rise-in': 'rise-in 380ms var(--ease-brand) both',
        'pulse-ring': 'pulse-ring 1.8s var(--ease-brand) infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
