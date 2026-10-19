/**
 * FamilyDirectoryCard component
 *
 * Directory-safe summary card for a community family unit.
 *
 * PRIVACY & SECURITY INVARIANTS:
 * - Displays ONLY public directory attributes:
 *   family name, description, lineage (gotra, nukh, kul),
 *   residential location (city, state, country), status, and verification state.
 * - Internal identifiers and timestamps (created_by, created_at, updated_at, deleted_at)
 *   are strictly excluded and never rendered.
 * - ZERO access to private member records or user credentials.
 * - Navigates to /families/:id on interaction.
 */

import { useNavigate } from 'react-router-dom'
import { Users, MapPin } from 'lucide-react'
import type { FamilyDiscoveryResult } from '../types'
import { ROUTES } from '@/constants/app'

interface FamilyDirectoryCardProps {
  family: FamilyDiscoveryResult
  onClick?: () => void
  className?: string
}

export function FamilyDirectoryCard({
  family,
  onClick,
  className = '',
}: FamilyDirectoryCardProps) {
  const navigate = useNavigate()

  const location = [family.city, family.state, family.country]
    .filter(Boolean)
    .join(', ')

  const lineageBadges = [
    family.gotra ? `Gotra: ${family.gotra}` : null,
    family.nukh ? `Nukh: ${family.nukh}` : null,
    family.kul ? `Kul: ${family.kul}` : null,
  ].filter(Boolean)

  function handleClick() {
    if (onClick) {
      onClick()
    } else {
      navigate(ROUTES.FAMILY_DETAIL(family.id))
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      aria-label={`View ${family.family_name} family record`}
      className={[
        'group flex flex-col justify-between rounded-lg border border-navy-200 bg-white p-4 shadow-sm',
        'cursor-pointer transition-all duration-150 hover:border-brand-400 hover:shadow-md focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
        className,
      ].join(' ')}
    >
      <div>
        {/* Top row: Icon + Name + Verification */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700 group-hover:bg-teal-100"
            aria-hidden="true"
          >
            <Users className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-navy-900 group-hover:text-brand-600">
                {family.family_name}
              </h3>
            </div>

            {/* Location (City, State, Country) */}
            {location && (
              <div className="mt-1 flex items-center gap-1 text-xs text-navy-600">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden="true" />
                <span className="truncate">{location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Description preview */}
        {family.description && (
          <p className="mt-3 line-clamp-2 text-xs text-navy-600">
            {family.description}
          </p>
        )}

        {/* Lineage (Gotra, Nukh, Kul) */}
        {lineageBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1 text-[11px] text-navy-600">
            {lineageBadges.map((badge, idx) => (
              <span
                key={idx}
                className="rounded bg-navy-50 px-1.5 py-0.5 font-medium text-navy-700"
              >
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Footer: Status */}
      <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-2.5 text-[11px]">
        <div>
          {family.status === 'ACTIVE' ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              Active
            </span>
          ) : family.status === 'ARCHIVED' ? (
            <span className="rounded-full bg-navy-100 px-2 py-0.5 font-medium text-navy-600">
              Archived
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
              Draft
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
