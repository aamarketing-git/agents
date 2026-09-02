import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 단일 HTML 파일 빌드 (미리보기·Artifact 게시용). 라우터는 해시 모드, PWA 제외.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  define: { 'import.meta.env.VITE_ROUTER': JSON.stringify('hash') },
  build: { outDir: 'dist-single', emptyOutDir: true, cssCodeSplit: false, assetsInlineLimit: 100000000 },
})
