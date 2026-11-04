import { defineConfig } from 'vite'

export default defineConfig({
  // 相对路径，GitHub Pages 放在「用户名.github.io/仓库名/」时资源也能找到。
  base: './',
  server: {
    host: '127.0.0.1',
    port: 8741,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 8741,
    strictPort: true,
  },
})
