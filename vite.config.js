import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANTE: troque 'casa-app' pelo nome exato do seu repositório no GitHub.
// Se o repo se chama "controle-domestico", troque a linha base para '/controle-domestico/'
export default defineConfig({
  plugins: [react()],
  base: '/controle_casal/',
})
