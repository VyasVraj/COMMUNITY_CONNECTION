/**
 * ClaimPersonModal — Modal dialog to submit a claim on an unclaimed census person record.
 * (Phase 8 Subtask 2)
 *
 * Implements PERSON != USER:
 * - Submits a claim row into public.person_claims.
 * - Does NOT directly link persons.user_id.
 * - Informs the user that claims undergo community moderator verification.
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { useClaimMutations } from '../hooks/usePersonClaim'
import type { PersonRow } from '@/types'

export interface ClaimPersonModalProps {
  person: PersonRow
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function ClaimPersonModal({
  person,
  isOpen,
  onClose,
  onSuccess,
}: ClaimPersonModalProps) {
  const [evidenceNotes, setEvidenceNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const { submitClaim } = useClaimMutations()

  const personFullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  useEffect(() => {
    if (isOpen) {
      setEvidenceNotes('')
      setErrorMsg(null)
    }
  }, [isOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (evidenceNotes.length > 1000) {
      setErrorMsg('Evidence notes cannot exceed 1000 characters.')
      return
    }

    try {
      await submitClaim.mutateAsync({
        personId: person.id,
        evidenceNotes: evidenceNotes.trim() || undefined,
      })
      onSuccess?.()
      onClose()
    } catch (err) {
      setErrorMsg(
        (err as { message?: string }).message ??
          'Unable to submit claim. Please try again later.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <h2 id="claim-modal-title" className="text-lg font-semibold text-navy-900">
              Claim Census Record
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 text-sm text-navy-600 space-y-2">
          <p>
            You are requesting to link your user account to the census record for{' '}
            <strong className="text-navy-900">{personFullName || 'this individual'}</strong>.
          </p>
          <p className="text-xs text-navy-500 bg-navy-50 p-2.5 rounded-lg border border-navy-100">
            <strong>Community Integrity Note:</strong> To maintain reliable genealogical records, all
            person claims are reviewed and approved by community moderators before account linking occurs.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <label
                htmlFor="evidence-notes"
                className="block text-sm font-medium text-navy-700"
              >
                Verification Evidence & Notes (Optional)
              </label>
              <span
                className={`text-xs ${
                  evidenceNotes.length > 1000 ? 'text-red-600 font-semibold' : 'text-navy-400'
                }`}
              >
                {evidenceNotes.length}/1000
              </span>
            </div>
            <textarea
              id="evidence-notes"
              name="evidenceNotes"
              rows={4}
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              disabled={submitClaim.isPending}
              maxLength={1000}
              placeholder="Provide information to help moderators verify your identity (e.g., family relationship, parents' names, community origin, or contact confirmation)..."
              className="w-full rounded-md border border-navy-300 p-2.5 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-navy-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitClaim.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={submitClaim.isPending}
              disabled={submitClaim.isPending || evidenceNotes.length > 1000}
            >
              Submit Claim for Review
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
