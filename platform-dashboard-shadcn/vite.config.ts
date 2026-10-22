import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const deploymentSha = process.env.VITE_DEPLOY_SHA || loadEnv(mode, process.cwd(), 'VITE_').VITE_DEPLOY_SHA || 'local'
  return {
    plugins: [react(), tailwindcss(), {
      name: 'getprio-deployment-sha',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replaceAll('%VITE_DEPLOY_SHA%', deploymentSha),
      },
    }],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5176,
      strictPort: true,
    },
  }
})
