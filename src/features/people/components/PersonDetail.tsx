/**
 * PersonDetail — read-only full-detail view of a person record.
 *
 * Renders all user-visible fields from a PersonRow. Does NOT render:
 * - id, created_by, user_id (internal identifiers)
 * - status, verification_status (admin-only fields, Phase 13)
 * - deleted_at (internal)
 *
 * This is a presentation component only. It takes data already fetched and
 * makes no network calls. Use usePerson() in the parent page to load data.
 *
 * No dangerouslySetInnerHTML. All values are rendered as React text.
 */

import { useState } from 'react'
import { Camera } from 'lucide-react'
import type { Tables } from '@/types/database.types'
import { PRIVACY_LEVEL_LABELS } from '@/constants/app'
import type { PrivacyLevel } from '@/types'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'
import { Button } from '@/components/forms/Button'

type PersonRow = Tables<'persons'>

/** Human-readable gender labels */
const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  OTHER: 'Other',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
}

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

interface PersonDetailProps {
  person: PersonRow
  canEdit?: boolean
  onAvatarUpdated?: (newUrl: string | null) => void
}

/**
 * Full read-only person detail panel.
 */
export function PersonDetail({ person, canEdit = false, onAvatarUpdated }: PersonDetailProps) {
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState<string | null>(person.avatar_url ?? null)

  const fullName = [person.first_name, person.middle_name, person.last_name]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="space-y-6">
      {/* Name and avatar section */}
      <section aria-labelledby="person-name-heading" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-5">
        <div className="flex items-center gap-4">
          <AvatarImage
            src={currentAvatarUrl}
            name={fullName}
            alt={fullName}
            size="xl"
            shape="circle"
          />
          <div>
            <h2 id="person-name-heading" className="text-xl font-semibold text-navy-900">
              {fullName}
            </h2>
            {person.maiden_name && (
              <p className="mt-0.5 text-sm text-navy-500">née {person.maiden_name}</p>
            )}
          </div>
        </div>

        {canEdit && (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAvatarDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Camera className="h-4 w-4" />
              Change photo
            </Button>
          </div>
        )}
      </section>

      {avatarDialogOpen && (
        <AvatarUploadDialog
          isOpen={avatarDialogOpen}
          onClose={() => setAvatarDialogOpen(false)}
          target={{ type: 'person', id: person.id }}
          currentAvatarUrl={currentAvatarUrl}
          onSuccess={(newUrl) => {
            setCurrentAvatarUrl(newUrl)
            setAvatarDialogOpen(false)
            onAvatarUpdated?.(newUrl)
          }}
        />
      )}

      {/* Identity */}
      <section aria-labelledby="identity-heading">
        <h3
          id="identity-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Identity & Demographics
        </h3>
        <dl>
          <DetailRow
            label="Gender"
            value={person.gender ? GENDER_LABELS[person.gender] : null}
          />
          <DetailRow label="Date of birth" value={formatDate(person.date_of_birth)} />
          <DetailRow label="Date of death" value={formatDate(person.date_of_death)} />
          <DetailRow label="Birth place" value={person.birth_place} />
          <DetailRow label="Marital status" value={person.marital_status} />
          <DetailRow label="Blood group" value={person.blood_group} />
          <DetailRow label="Birth order" value={person.birth_order ? String(person.birth_order) : null} />
        </dl>
      </section>

      {/* Education & Occupation */}
      <section aria-labelledby="education-heading">
        <h3
          id="education-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Education & Occupation
        </h3>
        <dl>
          <DetailRow label="Education" value={person.education} />
          <DetailRow label="Occupation" value={person.occupation} />
        </dl>
      </section>

      {/* Current Residence & Origin */}
      <section aria-labelledby="residence-heading">
        <h3
          id="residence-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Residence & Origin
        </h3>
        <dl>
          <DetailRow label="Current address" value={person.current_address} />
          <DetailRow label="Area / Locality" value={person.current_area} />
          <DetailRow label="City" value={person.current_city} />
          <DetailRow label="State / Province" value={person.current_state} />
          <DetailRow label="Postal code" value={person.current_postal_code} />
          <DetailRow label="Native place" value={person.native_place} />
        </dl>
      </section>

      {/* Community identity */}
      <section aria-labelledby="community-heading">
        <h3
          id="community-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Community identity
        </h3>
        <dl>
          <DetailRow label="Gotra" value={person.gotra} />
          <DetailRow label="Kul" value={person.kul} />
          <DetailRow label="Nukh" value={person.nukh} />
        </dl>
      </section>

      {/* Contact */}
      <section aria-labelledby="contact-heading">
        <h3
          id="contact-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Contact
        </h3>
        <dl>
          <DetailRow label="Email" value={person.email_contact} />
          <DetailRow label="Phone" value={person.phone} />
          <DetailRow label="Secondary phone" value={person.phone_secondary} />
        </dl>
      </section>

      {/* Privacy settings */}
      <section aria-labelledby="privacy-heading">
        <h3
          id="privacy-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Privacy settings
        </h3>
        <dl>
          <DetailRow
            label="Profile visibility"
            value={PRIVACY_LEVEL_LABELS[person.profile_privacy as PrivacyLevel]}
          />
          <DetailRow
            label="Contact visibility"
            value={PRIVACY_LEVEL_LABELS[person.contact_privacy as PrivacyLevel]}
          />
          <DetailRow
            label="Date of birth visibility"
            value={PRIVACY_LEVEL_LABELS[person.dob_privacy as PrivacyLevel]}
          />
        </dl>
      </section>

      {/* Record meta */}
      <section aria-labelledby="meta-heading">
        <h3
          id="meta-heading"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy-400"
        >
          Record info
        </h3>
        <dl>
          <DetailRow label="Added" value={formatDate(person.created_at)} />
          <DetailRow label="Last updated" value={formatDate(person.updated_at)} />
        </dl>
      </section>
    </div>
  )
}
