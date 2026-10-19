/**
 * FamilyCard — compact family summary card.
 *
 * Display-only. Shows a family's name, description preview, geographic location
 * (city, state, country), and community identity fields (gotra, kul, nukh)
 * where the record makes them available.
 *
 * This component does NOT enforce privacy rules — RLS at the database level
 * governs which records and fields are returned to the client. This component
 * renders whatever the service layer provides.
 *
 * Protected/system fields (id, created_by, status, verification_status, etc.)
 * are never rendered.
 *
 * ZERO access to family_members table.
 */

import { Users } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS } from '@/constants/app'
import type { PrivacyLevel } from '@/types'

type FamilyRow = Tables<'families'>

interface FamilyCardProps {
  family: FamilyRow
  /** Optional click handler — e.g. navigate to family detail */
  onClick?: () => void
}

/**
 * Compact family summary card suitable for use in lists and grids.
 */
export function FamilyCard({ family, onClick }: FamilyCardProps) {
  const location = [family.area, family.city, family.state, family.country]
    .filter(Boolean)
    .join(', ')

  const communityIdentity = [
    family.family_type,
    family.gotra,
    family.kul,
    family.nukh,
    family.mool_shakha ? `Shakha: ${family.mool_shakha}` : null,
    family.native_place ? `Origin: ${family.native_place}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const profilePrivacyLabel =
    PRIVACY_LEVEL_LABELS[family.profile_privacy as PrivacyLevel] ?? family.profile_privacy

  return (
    <div
      className={[
        'flex items-start gap-4 rounded-lg border border-navy-200 bg-white p-4 shadow-sm',
        onClick
          ? 'cursor-pointer transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      aria-label={onClick ? `View ${family.family_name} family record` : undefined}
    >
      {/* Icon badge */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700"
        aria-hidden="true"
      >
        <Users className="h-6 w-6" />
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-base font-semibold text-navy-900">
            {family.family_name}
          </p>
          <span className="inline-flex items-center rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-700 shrink-0">
            {profilePrivacyLabel}
          </span>
        </div>

        {/* Location */}
        {location && (
          <p className="mt-0.5 text-xs text-navy-600">{location}</p>
        )}

        {/* Community identity */}
        {communityIdentity && (
          <p className="mt-0.5 text-xs text-navy-500">{communityIdentity}</p>
        )}

        {/* Description preview */}
        {family.description && (
          <p className="mt-2 line-clamp-2 text-xs text-navy-600">
            {family.description}
          </p>
        )}
      </div>
    </div>
  )
}
