/**
 * Application Root
 *
 * Top-level application component.
 * Composes providers and router.
 */

import { AppProviders } from './providers'
import { AppRouter } from './router'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
