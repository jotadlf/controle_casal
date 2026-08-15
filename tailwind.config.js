/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F6F7F5',
        ink: '#1A1D23',
        teal: {
          DEFAULT: '#0F5257',
          light: '#E4EFEF',
          dark: '#0A3A3D',
        },
        amber: {
          DEFAULT: '#E8A33D',
          light: '#FBF0DC',
        },
        coral: {
          DEFAULT: '#E15B4F',
          light: '#FBE7E5',
        },
        line: '#E1E4E0',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}
