/**
 * FamilyDetail — read-only full-detail view of a family record.
 *
 * Renders all user-visible fields from a FamilyRow. Does NOT render:
 * - id, created_by (internal identifiers)
 * - status, verification_status (admin-managed fields, Phase 13)
 * - deleted_at (internal)
 *
 * Phase 4 Subtask 2:
 * Integrates live MemberList roster component.
 *
 * No dangerouslySetInnerHTML. All values rendered as React text.
 */

import { useState } from 'react'
import { Camera } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS } from '@/constants/app'
import type { PrivacyLevel } from '@/types'
import { MemberList } from '@/features/family-members'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { Button } from '@/components/forms/Button'

type FamilyRow = Tables<'families'>

/** Formats an ISO date string to a locale-readable date. */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Render a detail row: label + value */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between border-b border-navy-100 py-2.5 text-sm">
      <dt className="text-navy-500">{label}</dt>
      <dd className="max-w-[55%] text-right font-medium text-navy-800 break-words">
        {value || '—'}
      </dd>
    </div>
  )
}

export interface FamilyDetailProps {
  family: FamilyRow
  canManageMembers?: boolean
  onAvatarUpdated?: (newUrl: string | null) => void
}

/**
 * Full read-only family detail panel.
 */
export function FamilyDetail({ family, canManageMembers = false, onAvatarUpdated }: FamilyDetailProps) {
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(family.avatar_url ?? null)

  return (
    <div className="space-y-6">
      {/* Overview section */}
      <section aria-labelledby="family-name-heading" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-5">
        <div className="flex items-center gap-4">
          <AvatarImage
            src={currentAvatarUrl}
            name={family.family_name}
            alt={family.family_name}
            size="xl"
            shape="rounded"
            isFamily
          />
          <div>
            <h2 id="family-name-heading" className="text-xl font-semibold text-navy-900">
              {family.family_name}
            </h2>
            {family.description && (
              <p className="mt-1 text-sm text-navy-600 whitespace-pre-line">
                {family.description}
              </p>
            )}
          </div>
        </div>

        {canManageMembers && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAvatarDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Change crest
            </Button>
          </div>
        )}
      </section>

      {avatarDialogOpen && (
        <AvatarUploadDialog
          isOpen={avatarDialogOpen}
          onClose={() => setAvatarDialogOpen(false)}
          target={{ type: 'family', id: family.id }}
          currentAvatarUrl={currentAvatarUrl}
          onSuccess={(newUrl) => {
            setCurrentAvatarUrl(newUrl)
            setAvatarDialogOpen(false)
            onAvatarUpdated?.(newUrl)
          }}
        />
      )}

      {/* Location */}
      <section aria-labelledby="location-heading">
        <h3
          id="location-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Location & Household Address
        </h3>
        <dl>
          <DetailRow label="Address" value={family.address} />
          <DetailRow label="Area / Locality" value={family.area} />
          <DetailRow label="City" value={family.city} />
          <DetailRow label="State / Province" value={family.state} />
          <DetailRow label="Postal Code" value={family.postal_code} />
          <DetailRow label="Country" value={family.country} />
          <DetailRow label="Native Place" value={family.native_place} />
        </dl>
      </section>

      {/* Community Identity */}
      <section aria-labelledby="community-heading">
        <h3
          id="community-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Community Identity & Lineage
        </h3>
        <dl>
          <DetailRow label="Family Type" value={family.family_type} />
          <DetailRow label="Mukhi / Elder" value={family.mukhi_name} />
          <DetailRow label="Gotra" value={family.gotra} />
          <DetailRow label="Kul" value={family.kul} />
          <DetailRow label="Nukh" value={family.nukh} />
          <DetailRow label="Mool Shakha" value={family.mool_shakha} />
          <DetailRow label="Census Status" value={family.census_status} />
        </dl>
      </section>

      {/* Privacy Settings */}
      <section aria-labelledby="privacy-heading">
        <h3
          id="privacy-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Privacy Settings
        </h3>
        <dl>
          <DetailRow
            label="Family profile visibility"
            value={PRIVACY_LEVEL_LABELS[family.profile_privacy as PrivacyLevel] ?? family.profile_privacy}
          />
          <DetailRow
            label="Members list visibility"
            value={PRIVACY_LEVEL_LABELS[family.members_privacy as PrivacyLevel] ?? family.members_privacy}
          />
        </dl>
      </section>

      {/* Family Membership Roster (Phase 4 Subtask 2) */}
      <section aria-labelledby="family-roster-section-heading">
        <MemberList familyId={family.id} canManageMembers={canManageMembers} />
      </section>


      {/* Record Metadata */}
      <section aria-labelledby="meta-heading">
        <h3
          id="meta-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Record Info
        </h3>
        <dl>
          <DetailRow label="Created" value={formatDate(family.created_at)} />
          <DetailRow label="Last updated" value={formatDate(family.updated_at)} />
        </dl>
      </section>
    </div>
  )
}
