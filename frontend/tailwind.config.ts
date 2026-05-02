/** @type {import('tailwindcss').Config} */
import animate from 'tailwindcss-animate';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1.5rem' },
    extend: {
      colors: {
        // shadcn aliases
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Custom — stripe-warm semantic
        ink: {
          DEFAULT: '#0A2540',
          strong: '#051324',
          muted: '#5C6A7A',
          dim: '#8B95A3',
          faint: '#B5BCC7',
        },
        canvas: {
          DEFAULT: '#FCFBF7',
          card: '#FFFFFF',
          soft: '#F5F3EE',
          tint: '#FAF7F2',
          deep: '#0A2540',
        },
        brand: {
          DEFAULT: '#635BFF',
          deep: '#4730FF',
          tint: 'rgba(99,91,255,0.08)',
        },
        success: {
          DEFAULT: '#00875F',
          tint: 'rgba(0,135,95,0.10)',
        },
        danger: {
          DEFAULT: '#DC2626',
          tint: 'rgba(220,38,38,0.10)',
        },
        warn: {
          DEFAULT: '#C66B12',
          tint: 'rgba(198,107,18,0.10)',
        },
        info: {
          DEFAULT: '#2563EB',
          tint: 'rgba(37,99,235,0.10)',
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '1.4' }],
        xs:   ['12px', { lineHeight: '1.45' }],
        sm:   ['13px', { lineHeight: '1.5' }],
        base: ['14px', { lineHeight: '1.55' }],
        md:   ['15px', { lineHeight: '1.55' }],
        lg:   ['17px', { lineHeight: '1.5' }],
        xl:   ['20px', { lineHeight: '1.4' }],
        '2xl':['24px', { lineHeight: '1.3' }],
        '3xl':['32px', { lineHeight: '1.2' }],
        display: ['44px', { lineHeight: '1.1' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        pill: '999px',
        tiny: '4px',
      },
      boxShadow: {
        '1': '0 1px 2px rgba(10,37,64,.04), 0 1px 1px rgba(10,37,64,.03)',
        '2': '0 4px 12px rgba(10,37,64,.06), 0 1px 2px rgba(10,37,64,.04)',
        '3': '0 12px 32px rgba(10,37,64,.08), 0 2px 4px rgba(10,37,64,.04)',
        pop: '0 24px 48px rgba(10,37,64,.10), 0 4px 8px rgba(10,37,64,.05)',
        accent: '0 4px 12px rgba(99,91,255,.30)',
        'accent-pop': '0 8px 20px rgba(99,91,255,.40)',
      },
      backgroundImage: {
        'grad-brand':
          'linear-gradient(135deg, #635BFF 0%, #4F89FF 50%, #2DD4BF 100%)',
        'grad-brand-soft':
          'linear-gradient(135deg, rgba(99,91,255,.10) 0%, rgba(79,137,255,.07) 50%, rgba(45,212,191,.05) 100%)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        instant: '100ms',
        fast: '150ms',
        med: '250ms',
        slow: '400ms',
      },
    },
  },
  plugins: [animate],
};
