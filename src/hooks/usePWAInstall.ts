import { useState, useEffect } from 'react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

const DISMISS_KEY = 'community_roots_pwa_dismissed'

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // 1. Detect if already in standalone display mode
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as unknown as { standalone: boolean }).standalone === true)

    setIsStandalone(isStandaloneMode)

    // 2. Detect iOS environment (iPhone, iPad, iPod)
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice =
      /iphone|ipad|ipod/.test(userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)

    setIsIOS(isIosDevice)

    // 3. Check if user dismissed prompt previously
    const dismissedTimestamp = localStorage.getItem(DISMISS_KEY)
    if (dismissedTimestamp) {
      // Re-prompt after 7 days if desired, otherwise remain dismissed
      const elapsed = Date.now() - parseInt(dismissedTimestamp, 10)
      if (elapsed < 7 * 24 * 60 * 60 * 1000) {
        setIsDismissed(true)
      }
    }

    // 4. Listen for browser's beforeinstallprompt event (Android Chrome, Edge, etc.)
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const triggerInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      return true
    }

    return false
  }

  const dismissPrompt = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString())
    setIsDismissed(true)
  }

  const canInstall = !isStandalone && !isDismissed && (Boolean(deferredPrompt) || isIOS)

  return {
    canInstall,
    isStandalone,
    isIOS,
    hasDeferredPrompt: Boolean(deferredPrompt),
    triggerInstall,
    dismissPrompt,
  }
}
