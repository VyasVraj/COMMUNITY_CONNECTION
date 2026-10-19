/**
 * PersonClaimSection — UI section rendered on PersonDetail to manage claiming.
 * (Phase 8 Subtask 2)
 *
 * ARCHITECTURAL & PRIVACY INVARIANTS:
 * - PERSON != USER:
 *   - Census records (persons) are distinct from application accounts (users/profiles).
 *   - A claim submits a review request into public.person_claims.
 *   - Account linking (persons.user_id) occurs exclusively through moderator approval (approve_person_claim RPC).
 *   - Claimants CANNOT self-approve claims or directly update persons.user_id.
 * - PRIVACY INTEGRITY:
 *   - If claimed by another user, the owner's identity/ID is never exposed to viewers.
 *   - Deceased, deleted, or inactive records cannot be claimed.
 */

import { useState } from 'react'
import { ShieldCheck, UserCheck, Clock, AlertCircle, UserPlus, Info } from 'lucide-react'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { usePersonClaim } from '../hooks/usePersonClaim'
import { ClaimPersonModal } from './ClaimPersonModal'
import { CancelClaimDialog } from './CancelClaimDialog'
import { Button } from '@/components/forms/Button'
import type { PersonRow } from '@/types'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants/app'

export interface PersonClaimSectionProps {
  person: PersonRow
}

export function PersonClaimSection({ person }: PersonClaimSectionProps) {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthContext()
  const callerUserId = user?.id

  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false)
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false)

  const { data: claim, isLoading: isClaimLoading } = usePersonClaim(person?.id)

  const personName = [person.first_name, person.last_name].filter(Boolean).join(' ')

  // 1. Ineligible census records (deceased, inactive, soft-deleted)
  const isDeceased = Boolean(person.date_of_death)
  const isInactive = person.status !== 'ACTIVE'
  const isDeleted = Boolean(person.deleted_at)

  if (isDeceased || isInactive || isDeleted) {
    return null
  }

  // 2. Unauthenticated viewer
  if (!isAuthLoading && (!isAuthenticated || !callerUserId)) {
    if (person.user_id) {
      return (
        <div
          data-testid="person-claim-claimed-by-other"
          className="rounded-lg border border-navy-200 bg-navy-50/50 p-4 text-sm text-navy-700 flex items-center gap-3"
        >
          <UserCheck className="h-5 w-5 text-navy-600 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium text-navy-900">Claimed Census Record</p>
            <p className="text-xs text-navy-500">
              This record is linked to a verified community member.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div
        data-testid="person-claim-unauthenticated"
        className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 text-sm text-navy-700 flex items-start gap-3"
      >
        <Info className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium text-navy-900">Is this your census record?</p>
          <p className="text-xs text-navy-600 mt-0.5">
            <Link to={ROUTES.SIGN_IN} className="font-semibold text-brand-700 hover:underline">
              Sign in
            </Link>{' '}
            or register to claim this census profile and manage your family information.
          </p>
        </div>
      </div>
    )
  }

  // 3. Current user is already linked to this person
  if (person.user_id && person.user_id === callerUserId) {
    return (
      <div
        data-testid="person-claim-self"
        className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900 flex items-center gap-3"
      >
        <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-emerald-950">Your Linked Profile</p>
          <p className="text-xs text-emerald-800">
            This census record is linked to your user account.
          </p>
        </div>
      </div>
    )
  }

  // 4. Record is claimed by another user (privacy-safe: zero leak of other user id)
  if (person.user_id && person.user_id !== callerUserId) {
    return (
      <div
        data-testid="person-claim-claimed-by-other"
        className="rounded-lg border border-navy-200 bg-navy-50/50 p-4 text-sm text-navy-700 flex items-center gap-3"
      >
        <UserCheck className="h-5 w-5 text-navy-600 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium text-navy-900">Claimed Census Record</p>
          <p className="text-xs text-navy-500">
            This record is linked to a verified community member.
          </p>
        </div>
      </div>
    )
  }

  // 5. Loading claim state for current authenticated user
  if (isClaimLoading) {
    return (
      <div
        data-testid="person-claim-loading"
        className="rounded-lg border border-navy-100 bg-white p-4 text-sm text-navy-400 animate-pulse"
      >
        Checking claim status…
      </div>
    )
  }

  // 6. Current user has a pending claim under review
  if (claim && claim.status === 'PENDING') {
    return (
      <>
        <div
          data-testid="person-claim-pending"
          className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-amber-900">Claim Under Review</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your claim for this record has been submitted and is awaiting community moderator verification.
                </p>
                {claim.evidence_notes && (
                  <p className="text-xs text-amber-700 mt-2 bg-amber-100/60 p-2 rounded border border-amber-200/60 italic">
                    Submitted evidence: &ldquo;{claim.evidence_notes}&rdquo;
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsCancelDialogOpen(true)}
              className="text-xs text-amber-900 hover:bg-amber-100 border-amber-300 shrink-0"
            >
              Withdraw claim
            </Button>
          </div>
        </div>

        <CancelClaimDialog
          claimId={claim.id}
          personId={person.id}
          personName={personName}
          isOpen={isCancelDialogOpen}
          onClose={() => setIsCancelDialogOpen(false)}
        />
      </>
    )
  }

  // 7. Current user's previous claim was rejected
  if (claim && claim.status === 'REJECTED') {
    return (
      <>
        <div
          data-testid="person-claim-rejected"
          className="rounded-lg border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-950"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold text-rose-900">Previous Claim Rejected</p>
                <p className="text-xs text-rose-800 mt-0.5">
                  Your previous claim request for this census record was not approved.
                </p>
                {claim.rejection_reason && (
                  <p className="text-xs text-rose-700 mt-2 bg-rose-100/60 p-2 rounded border border-rose-200/60">
                    Feedback: {claim.rejection_reason}
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsClaimModalOpen(true)}
              className="text-xs border-rose-300 text-rose-900 hover:bg-rose-100 shrink-0"
            >
              Submit new claim
            </Button>
          </div>
        </div>

        <ClaimPersonModal
          person={person}
          isOpen={isClaimModalOpen}
          onClose={() => setIsClaimModalOpen(false)}
        />
      </>
    )
  }

  // 8. Unclaimed and eligible: Present claim opportunity
  return (
    <>
      <div
        data-testid="person-claim-eligible"
        className="rounded-lg border border-brand-200 bg-brand-50/40 p-4 text-sm text-navy-800"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <UserPlus className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold text-navy-900">Is this your census record?</p>
              <p className="text-xs text-navy-600 mt-0.5">
                You can claim this record to link it with your account. A community moderator will verify your
                claim before linking.
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={() => setIsClaimModalOpen(true)}
            className="shrink-0 text-xs"
          >
            Claim record
          </Button>
        </div>
      </div>

      <ClaimPersonModal
        person={person}
        isOpen={isClaimModalOpen}
        onClose={() => setIsClaimModalOpen(false)}
      />
    </>
  )
}
