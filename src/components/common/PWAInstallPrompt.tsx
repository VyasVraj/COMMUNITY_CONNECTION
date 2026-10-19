import { useState } from 'react'
import { Download, X, Share, PlusSquare, Smartphone, Check } from 'lucide-react'
import { usePWAInstall } from '@/hooks/usePWAInstall'

export function PWAInstallPrompt() {
  const { canInstall, isIOS, hasDeferredPrompt, triggerInstall, dismissPrompt } = usePWAInstall()
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  if (!canInstall) return null

  const handleInstallClick = async () => {
    if (hasDeferredPrompt) {
      setIsInstalling(true)
      try {
        await triggerInstall()
      } finally {
        setIsInstalling(false)
      }
    } else if (isIOS) {
      setShowIosGuide(true)
    }
  }

  return (
    <>
      {/* Floating Bottom Install Banner */}
      <aside
        aria-label="Install Community Roots application"
        className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-md rounded-xl border border-navy-200 bg-white p-4 shadow-lg transition-transform animate-in fade-in slide-in-from-bottom-5 duration-300"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-navy-900">Install Community Roots</h2>
            <p className="mt-0.5 text-xs text-navy-600">
              Install to your home screen for quick access to family census and records.
            </p>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={isInstalling}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Download className="h-3.5 w-3.5" />
                {isIOS ? 'How to Install' : 'Install App'}
              </button>
              <button
                type="button"
                onClick={dismissPrompt}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-600 hover:bg-navy-50 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss installation prompt"
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* iOS Safari Instruction Modal */}
      {showIosGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-navy-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-navy-100">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-brand-600" />
                <h3 className="text-base font-semibold text-navy-900">Install on iPhone / iPad</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <ol className="mt-4 space-y-3.5 text-xs text-navy-700">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800">
                  1
                </span>
                <span>
                  Open this website in <strong>Safari</strong> on your iOS device.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800">
                  2
                </span>
                <span className="flex items-center gap-1.5">
                  Tap the <strong>Share</strong> button <Share className="inline h-4 w-4 text-brand-600" /> at the bottom or top of Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800">
                  3
                </span>
                <span className="flex items-center gap-1.5">
                  Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="inline h-4 w-4 text-brand-600" />.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800">
                  4
                </span>
                <span>
                  Tap <strong>Add</strong> in the top-right corner to complete installation.
                </span>
              </li>
            </ol>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowIosGuide(false)
                  dismissPrompt()
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 transition-colors"
              >
                <Check className="h-4 w-4" />
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
