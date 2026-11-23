/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts,scss}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f2f4f9',
          100: '#d9deea',
          200: '#b4bfd5',
          300: '#8f9fbf',
          400: '#6a80aa',
          500: '#213053',
          600: '#1b2844',
          700: '#152035',
          800: '#0f1826',
          900: '#090f18',
        },
        accent: {
          50: '#e1f1fb',
          100: '#c3e3f7',
          200: '#88c6ef',
          300: '#4da9e6',
          400: '#128cd4',
          500: '#045C94',
          600: '#034a76',
          700: '#023858',
          800: '#01263a',
          900: '#00141d',
        },
        secondary: {
          50: '#fff8e6',
          100: '#ffefc0',
          200: '#ffe082',
          300: '#ffd044',
          400: '#ffc31f',
          500: '#ffb71b',
          600: '#e09f14',
          700: '#b37c0f',
          800: '#85590a',
          900: '#573605',
        },
        complementary: {
          50: '#ffffff',
          100: '#fdfdfd',
          200: '#fbfbfb',
          300: '#f7f7f7',
          400: '#f4f4f4',
          500: '#f0f0f0',
          600: '#d9d9d9',
          700: '#bfbfbf',
          800: '#a6a6a6',
          900: '#8c8c8c',
        },
        dark: {
          50: '#f7f9fb',
          100: '#e3e6ee',
          200: '#c6cada',
          300: '#a9afc7',
          400: '#8c93b3',
          500: '#6f789f',
          600: '#505a78',
          700: '#323c51',
          800: '#1f2735',
          850: '#1a2030',
          900: '#131828',
          950: '#0b0f1b',
        }
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #213053 0%, #045C94 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(33, 48, 83, 0.08) 0%, rgba(4, 92, 148, 0.05) 100%)',
        'gradient-dark': 'linear-gradient(135deg, #1a2030 0%, #0f1826 100%)',
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(33, 48, 83, 0.18)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 20px 25px -5px rgba(33, 48, 83, 0.15), 0 10px 10px -5px rgba(4, 92, 148, 0.08)',
        'inner-glow': 'inset 0 2px 4px 0 rgba(255, 255, 255, 0.08)',
        'shadow-inner-glow': 'inset 0 2px 4px 0 rgba(255, 255, 255, 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-in-out',
        'slide-in': 'slideIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
