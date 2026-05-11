/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			'background-alt': 'hsl(var(--background-alt))',
  			foreground: 'hsl(var(--foreground))',
  			ink: 'hsl(var(--ink))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))',
  				teal: {
  					DEFAULT: 'hsl(var(--accent-teal))',
  					foreground: 'hsl(var(--accent-teal-foreground))'
  				},
  				violet: {
  					DEFAULT: 'hsl(var(--accent-violet))',
  					foreground: 'hsl(var(--accent-violet-foreground))'
  				},
  				coral: {
  					DEFAULT: 'hsl(var(--accent-coral))',
  					foreground: 'hsl(var(--accent-coral-foreground))'
  				},
  				sand: {
  					DEFAULT: 'hsl(var(--accent-sand))',
  					foreground: 'hsl(var(--accent-sand-foreground))'
  				}
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		backgroundImage: {
  			'signature-gradient': 'var(--gradient-signature)',
  			'cta-gradient': 'var(--gradient-cta)',
  			'hero': 'var(--gradient-hero)',
  			'warm-gradient': 'var(--gradient-warm)',
  			'cool-gradient': 'var(--gradient-cool)',
  			'ink': 'var(--gradient-ink)',
  			'card-gradient': 'var(--gradient-card)',
  			'disruptor-gradient': 'var(--gradient-disruptor)'
  		},
  		borderRadius: {
  			sm: 'calc(var(--radius-dense) - 2px)',
  			md: 'var(--radius-dense)',
  			lg: 'var(--radius)',
  			xl: 'calc(var(--radius) + 0.25rem)'
  		},
  		boxShadow: {
  			'xs': '0 1px 2px 0 rgb(0 0 0 / 0.03)',
  			'soft': '0 1px 3px 0 rgb(0 0 0 / 0.04), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
  			'card': 'var(--shadow-card)',
  			'elevated': '0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  			'elegant': 'var(--shadow-lg)',
  			'glow': 'var(--shadow-glow)'
  		},
  		letterSpacing: {
  			'tighter-hero': '-0.045em',
  			'tighter-h2': '-0.03em',
  			'eyebrow': '0.18em'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: 0 },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: 0 }
  			},
  			'fade-in': {
  				from: { opacity: 0 },
  				to: { opacity: 1 }
  			},
  			'fade-in-up': {
  				from: { opacity: 0, transform: 'translateY(12px)' },
  				to: { opacity: 1, transform: 'translateY(0)' }
  			},
  			'slide-up': {
  				from: { opacity: 0, transform: 'translateY(4px)' },
  				to: { opacity: 1, transform: 'translateY(0)' }
  			},
  			'scale-in': {
  				from: { opacity: 0, transform: 'scale(0.95)' },
  				to: { opacity: 1, transform: 'scale(1)' }
  			},
  			'scale-out': {
  				from: { opacity: 1, transform: 'scale(1)' },
  				to: { opacity: 0, transform: 'scale(0.95)' }
  			},
  			'slide-in-right': {
  				from: { opacity: 0, transform: 'translateX(16px)' },
  				to: { opacity: 1, transform: 'translateX(0)' }
  			},
  			'slide-out-right': {
  				from: { opacity: 1, transform: 'translateX(0)' },
  				to: { opacity: 0, transform: 'translateX(16px)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.4s ease-out both',
  			'fade-in-up': 'fade-in-up 0.6s ease-out both',
  			'slide-up': 'slide-up 0.15s ease-out',
  			'scale-in': 'scale-in 0.2s ease-out both',
  			'scale-out': 'scale-out 0.2s ease-in both',
  			'slide-in-right': 'slide-in-right 0.3s ease-out both',
  			'slide-out-right': 'slide-out-right 0.3s ease-in both'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
