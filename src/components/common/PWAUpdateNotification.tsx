import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function PWAUpdateNotification() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null)
  const [showUpdate, setShowUpdate] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleControllerChange = () => {
      // Reload page when new service worker activates
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return

      // If a worker is already waiting to activate
      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setShowUpdate(true)
      }

      // If a new worker is installed during the session
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker)
            setShowUpdate(true)
          }
        })
      })
    })

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' })
    } else {
      window.location.reload()
    }
  }

  if (!showUpdate) return null

  return (
    <aside
      aria-label="Application update available"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 rounded-xl border border-navy-200 bg-white p-4 shadow-xl animate-in fade-in slide-in-from-top-5 duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <RefreshCw className="h-4 w-4 animate-spin-reverse" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-navy-900">Update Available</h2>
          <p className="mt-0.5 text-xs text-navy-600">
            A new version of Community Roots is ready. Reload to apply improvements.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleUpdate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 transition-colors"
            >
              Update Now
            </button>
            <button
              type="button"
              onClick={() => setShowUpdate(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-600 hover:bg-navy-50"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowUpdate(false)}
          aria-label="Dismiss update notification"
          className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
