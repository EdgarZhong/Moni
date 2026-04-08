import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@ui/styles/index.css'
import App from '@bootstrap/AppRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
