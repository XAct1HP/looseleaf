/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#111C38',
          soft: '#26314D',
          muted: '#3C465F',
        },
        coral: {
          DEFAULT: '#FF6468',
          deep: '#E9484D',
          soft: '#FFE5E2',
          wash: '#FFF1EF',
        },
        notebook: {
          DEFAULT: '#A9C8F5',
          deep: '#6E9BE0',
          soft: '#EAF3FF',
        },
        margin: {
          DEFAULT: '#DF62AD',
          soft: '#FCE9F4',
        },
        paper: '#FFFDF8',
        cream: '#FFF6EB',
        graphite: '#566070',
        mist: '#8B93A3',
        rule: '#EDE7DC',
        moss: {
          DEFAULT: '#5C9A72',
          soft: '#E6F2EA',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Lora', 'Georgia', 'serif'],
        hand: ['"Caveat"', '"Bradley Hand"', 'cursive'],
      },
      borderRadius: {
        card: '22px',
        sheet: '28px',
      },
      boxShadow: {
        paper: '0 1px 2px rgba(17,28,56,0.04), 0 8px 24px -12px rgba(17,28,56,0.14)',
        lift: '0 2px 4px rgba(17,28,56,0.05), 0 18px 40px -18px rgba(17,28,56,0.22)',
        inset: 'inset 0 0 0 1px rgba(17,28,56,0.06)',
      },
      keyframes: {
        'draw-heart': {
          '0%': { strokeDashoffset: '120', transform: 'scale(0.8)' },
          '60%': { strokeDashoffset: '0', transform: 'scale(1.12)' },
          '100%': { strokeDashoffset: '0', transform: 'scale(1)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-note': {
          '0%': { opacity: '0', transform: 'translateY(14px) rotate(-1.5deg)' },
          '100%': { opacity: '1', transform: 'translateY(0) rotate(0)' },
        },
        'twinkle': {
          '0%, 100%': { opacity: '0', transform: 'scale(0.4)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        'float-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'draw-heart': 'draw-heart 340ms ease-out forwards',
        'pop-in': 'pop-in 220ms cubic-bezier(0.2,0.8,0.3,1) both',
        'slide-note': 'slide-note 280ms cubic-bezier(0.2,0.8,0.3,1) both',
        'twinkle': 'twinkle 1.6s ease-in-out infinite',
        'float-soft': 'float-soft 5s ease-in-out infinite',
        'fade-up': 'fade-up 320ms cubic-bezier(0.2,0.8,0.3,1) both',
      },
    },
  },
  plugins: [],
}
