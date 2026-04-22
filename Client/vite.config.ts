import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          // Uses the Render URL if provided in environment, otherwise localhost
          target: env.VITE_API_URL || 'https://box-office-online.onrender.com',
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})