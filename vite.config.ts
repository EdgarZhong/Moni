import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mockFsMiddleware } from './mock-fs-middleware'
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), mockFsMiddleware()],
  resolve: {
    alias: [
      { find: '@bootstrap', replacement: path.resolve(__dirname, 'src/bootstrap') },
      { find: '@logic', replacement: path.resolve(__dirname, 'src/logic') },
      { find: '@ui', replacement: path.resolve(__dirname, 'src/ui') },
      { find: '@system', replacement: path.resolve(__dirname, 'src/system') },
      { find: '@shared', replacement: path.resolve(__dirname, 'src/shared') },
      { find: '@devtools', replacement: path.resolve(__dirname, 'src/devtools') },
      ...(process.env.NODE_ENV === 'development' ? [
      {
        find: '@capacitor/filesystem',
        replacement: path.resolve(__dirname, 'src/system/mocks/capacitor-filesystem.ts')
      },
      {
        find: '@capacitor/core',
        replacement: path.resolve(__dirname, 'src/system/mocks/capacitor-core.ts')
      }
      ] : [])
    ]
  },
  server: {
    proxy: {
      // 开发环境下代理 LLM API 请求以解决 CORS 问题
      // baseUrl 格式: https://api.moonshot.cn/v1
      // 代理转换: /api/moonshot/v1/chat/completions → https://api.moonshot.cn/v1/chat/completions
      '/api/moonshot': {
        target: 'https://api.moonshot.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/moonshot/, '')
      },
      '/api/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deepseek/, '')
      },
      '/api/siliconflow': {
        target: 'https://api.siliconflow.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/siliconflow/, '')
      },
      '/api/modelscope': {
        target: 'https://api-inference.modelscope.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/modelscope/, '')
      }
    }
  }
})
