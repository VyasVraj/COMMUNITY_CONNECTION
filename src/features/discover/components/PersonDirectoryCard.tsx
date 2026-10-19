/**
 * PersonDirectoryCard component
 *
 * Directory-safe summary card for an individual census person.
 *
 * PRIVACY & SECURITY INVARIANTS:
 * - Displays ONLY public directory attributes:
 *   name, maiden name, lineage (gotra, nukh, kul), birth place,
 *   lifespan years, status, and verification state.
 * - Contact fields (phone, email) and system internals (user_id, timestamps)
 *   are strictly excluded and never rendered.
 * - Navigates to /people/:id on interaction.
 */

import { useNavigate } from 'react-router-dom'
import { MapPin, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import type { PersonDiscoveryResult } from '../types'
import { ROUTES } from '@/constants/app'

interface PersonDirectoryCardProps {
  person: PersonDiscoveryResult
  onClick?: () => void
  className?: string
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0]?.toUpperCase() ?? ''
  const l = lastName.trim()[0]?.toUpperCase() ?? ''
  return f + l
}

function formatLifespan(
  dob: string | null,
  dod: string | null,
  status: string
): string | null {
  const birthYear = dob ? dob.slice(0, 4) : null
  const deathYear = dod ? dod.slice(0, 4) : null

  if (birthYear && deathYear) {
    return `${birthYear} – ${deathYear}`
  }
  if (birthYear) {
    return status === 'DECEASED' ? `b. ${birthYear} (Deceased)` : `b. ${birthYear}`
  }
  if (deathYear) {
    return `d. ${deathYear}`
  }
  return null
}

export function PersonDirectoryCard({
  person,
  onClick,
  className = '',
}: PersonDirectoryCardProps) {
  const navigate = useNavigate()

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  const initials = getInitials(person.first_name, person.last_name)
  const lifespan = formatLifespan(person.date_of_birth, person.date_of_death, person.status)

  const lineageBadges = [
    person.gotra ? `Gotra: ${person.gotra}` : null,
    person.nukh ? `Nukh: ${person.nukh}` : null,
    person.kul ? `Kul: ${person.kul}` : null,
  ].filter(Boolean)

  function handleClick() {
    if (onClick) {
      onClick()
    } else {
      navigate(ROUTES.PERSON_DETAIL(person.id))
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
      aria-label={`View record for ${fullName}`}
      className={[
        'group flex flex-col justify-between rounded-lg border border-navy-200 bg-white p-4 shadow-sm',
        'cursor-pointer transition-all duration-150 hover:border-brand-400 hover:shadow-md focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
        className,
      ].join(' ')}
    >
      <div>
        {/* Top row: Avatar + Name + Verification */}
        <div className="flex items-start gap-3">
          {/* Avatar Initials */}
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 group-hover:bg-brand-200"
            aria-hidden="true"
          >
            {initials}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-navy-900 group-hover:text-brand-600">
                {fullName}
              </h3>
              {person.verification_status === 'VERIFIED' && (
                <span title="Verified Member" aria-label="Verified Member">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                </span>
              )}
            </div>

            {person.maiden_name && (
              <p className="truncate text-xs text-navy-500">
                née {person.maiden_name}
              </p>
            )}

            {lifespan && (
              <p className="mt-0.5 text-xs text-navy-500">
                {lifespan}
              </p>
            )}
          </div>
        </div>

        {/* Origin / Birth Place */}
        {person.birth_place && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-navy-600">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-navy-400" aria-hidden="true" />
            <span className="truncate">{person.birth_place}</span>
          </div>
        )}

        {/* Lineage (Gotra, Nukh, Kul) */}
        {lineageBadges.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1 text-[11px] text-navy-600">
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

      {/* Bottom Footer: Status and Verification pill */}
      <div className="mt-3.5 flex items-center justify-between border-t border-navy-100 pt-2.5 text-[11px]">
        <div className="flex items-center gap-2">
          {person.status === 'DECEASED' ? (
            <span className="rounded-full bg-navy-100 px-2 py-0.5 font-medium text-navy-600">
              Deceased
            </span>
          ) : person.status === 'ACTIVE' ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-navy-50 px-2 py-0.5 font-medium text-navy-500">
              {person.status.toLowerCase()}
            </span>
          )}

          {person.gender && (
            <span className="capitalize text-navy-500">
              {person.gender.toLowerCase()}
            </span>
          )}
        </div>

        <div>
          {person.verification_status === 'VERIFIED' ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
              Verified
            </span>
          ) : person.verification_status === 'PENDING' ? (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Clock className="h-3 w-3" />
              <span>Pending</span>
            </span>
          ) : person.verification_status === 'REJECTED' ? (
            <span className="inline-flex items-center gap-1 text-red-600">
              <AlertCircle className="h-3 w-3" />
              <span>Rejected</span>
            </span>
          ) : (
            <span className="text-navy-400">Unverified</span>
          )}
        </div>
      </div>
    </div>
  )
}
