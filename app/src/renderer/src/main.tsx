import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'
import { docCss } from '@shared/render/docCss'

const shared = document.createElement('style')
shared.textContent = docCss
document.head.appendChild(shared)

window.addEventListener('error', (e) => void window.pagebinder.log(`error: ${e.message} at ${e.filename}:${e.lineno}`))
window.addEventListener('unhandledrejection', (e) => void window.pagebinder.log(`unhandled rejection: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
