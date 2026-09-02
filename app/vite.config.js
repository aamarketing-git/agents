import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 웹(PWA) + 앱(Capacitor 래핑) 양쪽에서 동일 코드 사용
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '나의 커스텀 AI 비서',
        short_name: 'AI비서',
        description: '일정관리부터 고객관리, 자기관리까지. 성장에서 성공으로 가는 나만의 AI 비서',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#FBF8F1',
        theme_color: '#1E3A5F',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: { host: true, port: 5173 },
})
