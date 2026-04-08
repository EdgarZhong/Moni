import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ui/styles/index.css'
import App from '@bootstrap/AppRoot'

/**
 * 开发态自动挂载浏览器调试入口。
 * - 只在 Vite DEV 模式执行
 * - 使用动态 import，避免正式构建产物携带调试实现
 * - 挂载成功后即可通过 window.__MONI_DEBUG__ / window.__MONI_E2E__ 直接调逻辑测试
 */
if (import.meta.env.DEV) {
  void import('@devtools/debug/e2e_runner').then(({ installMoniDebugTools }) => {
    installMoniDebugTools()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
