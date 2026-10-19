/**
 * Application entry point
 *
 * Mounts the React application into the DOM.
 * Imports global styles before React tree renders.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { App } from '@/app/App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error(
    '[Community Roots] Root element #root not found. ' +
      'Check index.html — the <div id="root"> element must exist.'
  )
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Register service worker for PWA support in compatible environments
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      // In development, log service worker errors to console for transparent debugging
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[PWA] Service worker registration error:', error)
      }
    })
  })
}
