/**
 * PersonForm — create/edit form for person records.
 *
 * Uses React Hook Form + zodResolver with a flat form schema.
 * All fields are the user-editable subset of the persons table.
 *
 * SECURITY NOTE:
 * Protected/system fields are NOT present in this form:
 *   id, created_at, updated_at, created_by, user_id,
 *   status, verification_status, deleted_at
 *
 * The service/schema layer remains the authority for protected fields.
 * Even if a caller attempted to inject protected fields, the schema would
 * strip them and the RLS policies would reject them.
 *
 * FORM PREPROCESSING:
 * HTML form elements return empty strings for unfilled optional fields.
 * A sanitization step in onFormSubmit converts empty strings to undefined
 * before calling the parent's onSubmit, so that the service layer receives
 * clean data consistent with what the original schemas expect.
 */

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type CreatePersonInput } from '../schemas/people.schemas'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { PrivacyLevelSelect } from '@/components/forms/PrivacyLevelSelect'
import type { PrivacyLevel } from '@/types'

// ---------------------------------------------------------------------------
// Form schema — a flat schema for RHF that accepts string inputs from HTML.
// Empty strings for optional fields are coerced to undefined in onFormSubmit.
// Privacy and gender have explicit enum validation.
// ---------------------------------------------------------------------------

const PRIVACY_ENUM = z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'])

/** Form-level schema: all optional fields accept string (HTML input value) */
const personFormSchema = z.object({
  first_name: z
    .string({ required_error: 'First name is required' })
    .min(1, 'First name is required')
    .max(100, 'First name must not exceed 100 characters'),
  last_name: z
    .string({ required_error: 'Last name is required' })
    .min(1, 'Last name is required')
    .max(100, 'Last name must not exceed 100 characters'),
  middle_name: z.string().max(100).optional(),
  maiden_name: z.string().max(100).optional(),
  gender: z.string().optional(),
  date_of_birth: z.string().optional(),
  date_of_death: z.string().optional(),
  birth_place: z.string().max(200).optional(),
  marital_status: z.string().max(50).optional(),
  blood_group: z.string().max(10).optional(),
  education: z.string().max(200).optional(),
  occupation: z.string().max(200).optional(),
  birth_order: z.string().optional(),
  native_place: z.string().max(100).optional(),
  current_address: z.string().max(500).optional(),
  current_area: z.string().max(100).optional(),
  current_city: z.string().max(100).optional(),
  current_state: z.string().max(100).optional(),
  current_postal_code: z.string().max(20).optional(),
  gotra: z.string().max(100).optional(),
  kul: z.string().max(100).optional(),
  nukh: z.string().max(100).optional(),
  email_contact: z.string().optional(),
  phone: z.string().max(30).optional(),
  phone_secondary: z.string().max(30).optional(),
  profile_privacy: PRIVACY_ENUM.default('COMMUNITY'),
  contact_privacy: PRIVACY_ENUM.default('COMMUNITY'),
  dob_privacy: PRIVACY_ENUM.default('COMMUNITY'),
})

type PersonFormValues = z.infer<typeof personFormSchema>

// ---------------------------------------------------------------------------
// Sanitization: convert empty string fields to undefined before calling service
// ---------------------------------------------------------------------------

function sanitizeOptional(v: string | undefined): string | null | undefined {
  if (v === '' || v === undefined) return undefined
  return v
}

function sanitizeNumber(v: string | undefined): number | undefined {
  if (!v || v.trim() === '') return undefined
  const parsed = parseInt(v, 10)
  return isNaN(parsed) ? undefined : parsed
}

function sanitizeFormValues(values: PersonFormValues): CreatePersonInput {
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    middle_name: sanitizeOptional(values.middle_name),
    maiden_name: sanitizeOptional(values.maiden_name),
    gender: (sanitizeOptional(values.gender) as CreatePersonInput['gender']) ?? undefined,
    date_of_birth: sanitizeOptional(values.date_of_birth),
    date_of_death: sanitizeOptional(values.date_of_death),
    birth_place: sanitizeOptional(values.birth_place),
    marital_status: sanitizeOptional(values.marital_status),
    blood_group: sanitizeOptional(values.blood_group),
    education: sanitizeOptional(values.education),
    occupation: sanitizeOptional(values.occupation),
    birth_order: sanitizeNumber(values.birth_order),
    native_place: sanitizeOptional(values.native_place),
    current_address: sanitizeOptional(values.current_address),
    current_area: sanitizeOptional(values.current_area),
    current_city: sanitizeOptional(values.current_city),
    current_state: sanitizeOptional(values.current_state),
    current_postal_code: sanitizeOptional(values.current_postal_code),
    gotra: sanitizeOptional(values.gotra),
    kul: sanitizeOptional(values.kul),
    nukh: sanitizeOptional(values.nukh),
    email_contact: sanitizeOptional(values.email_contact),
    phone: sanitizeOptional(values.phone),
    phone_secondary: sanitizeOptional(values.phone_secondary),
    profile_privacy: values.profile_privacy,
    contact_privacy: values.contact_privacy,
    dob_privacy: values.dob_privacy,
  }
}

// ---------------------------------------------------------------------------
// Gender options
// ---------------------------------------------------------------------------

const GENDER_OPTIONS = [
  { value: '', label: '— Select gender —' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
] as const

// ---------------------------------------------------------------------------
// PersonForm props
// ---------------------------------------------------------------------------

interface PersonFormProps {
  mode: 'create' | 'edit'
  /**
   * Pre-fill the form with these values (used for edit mode).
   * Null values are rendered as empty strings in form fields.
   */
  defaultValues?: Partial<CreatePersonInput>
  /**
   * Called with validated and sanitized form data when the user submits.
   * The parent component is responsible for calling the appropriate mutation.
   */
  onSubmit: (data: CreatePersonInput) => Promise<void>
  /** Disables the form submit button and shows spinner while true. */
  isSubmitting?: boolean
  /** Error message to display below the form (from the parent mutation). */
  submitError?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert null/undefined to "" for HTML form field defaultValue */
function toFieldValue(v: string | null | undefined): string {
  return v ?? ''
}

// ---------------------------------------------------------------------------
// PersonForm
// ---------------------------------------------------------------------------

/**
 * Person create/edit form.
 *
 * Renders all user-editable fields grouped into sections:
 *   1. Name (required: first_name, last_name; optional: middle_name, maiden_name)
 *   2. Identity (gender, date_of_birth, date_of_death, birth_place)
 *   3. Community identity (gotra, kul, nukh)
 *   4. Contact (email_contact, phone, phone_secondary)
 *   5. Privacy (profile_privacy, contact_privacy, dob_privacy)
 */
export function PersonForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitError,
}: PersonFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: {
      first_name: toFieldValue(defaultValues?.first_name),
      last_name: toFieldValue(defaultValues?.last_name),
      middle_name: toFieldValue(defaultValues?.middle_name),
      maiden_name: toFieldValue(defaultValues?.maiden_name),
      gender: defaultValues?.gender ?? '',
      date_of_birth: toFieldValue(defaultValues?.date_of_birth),
      date_of_death: toFieldValue(defaultValues?.date_of_death),
      birth_place: toFieldValue(defaultValues?.birth_place),
      marital_status: toFieldValue(defaultValues?.marital_status),
      blood_group: toFieldValue(defaultValues?.blood_group),
      education: toFieldValue(defaultValues?.education),
      occupation: toFieldValue(defaultValues?.occupation),
      birth_order: defaultValues?.birth_order !== undefined && defaultValues?.birth_order !== null ? String(defaultValues.birth_order) : '',
      native_place: toFieldValue(defaultValues?.native_place),
      current_address: toFieldValue(defaultValues?.current_address),
      current_area: toFieldValue(defaultValues?.current_area),
      current_city: toFieldValue(defaultValues?.current_city),
      current_state: toFieldValue(defaultValues?.current_state),
      current_postal_code: toFieldValue(defaultValues?.current_postal_code),
      gotra: toFieldValue(defaultValues?.gotra),
      kul: toFieldValue(defaultValues?.kul),
      nukh: toFieldValue(defaultValues?.nukh),
      email_contact: toFieldValue(defaultValues?.email_contact),
      phone: toFieldValue(defaultValues?.phone),
      phone_secondary: toFieldValue(defaultValues?.phone_secondary),
      profile_privacy: (defaultValues?.profile_privacy as PrivacyLevel) ?? 'COMMUNITY',
      contact_privacy: (defaultValues?.contact_privacy as PrivacyLevel) ?? 'COMMUNITY',
      dob_privacy: (defaultValues?.dob_privacy as PrivacyLevel) ?? 'COMMUNITY',
    },
  })

  async function onFormSubmit(values: PersonFormValues) {
    await onSubmit(sanitizeFormValues(values))
  }

  const submitLabel = mode === 'create' ? 'Add person' : 'Save changes'

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
      className="space-y-8"
      aria-label={mode === 'create' ? 'Add person form' : 'Edit person form'}
    >
      {/* ---- Name ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Name
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            required
            autoComplete="given-name"
            error={errors.first_name?.message}
            {...register('first_name')}
          />
          <Input
            label="Last name"
            required
            autoComplete="family-name"
            error={errors.last_name?.message}
            {...register('last_name')}
          />
          <Input
            label="Middle name"
            autoComplete="additional-name"
            error={errors.middle_name?.message}
            {...register('middle_name')}
          />
          <Input
            label="Maiden name"
            hint="Birth surname, if applicable"
            error={errors.maiden_name?.message}
            {...register('maiden_name')}
          />
        </div>
      </fieldset>

      {/* ---- Identity ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Identity
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Gender — native select */}
          <div className="space-y-1">
            <label
              htmlFor="gender"
              className="block text-sm font-medium text-navy-700"
            >
              Gender
            </label>
            <select
              id="gender"
              aria-invalid={!!errors.gender}
              aria-describedby={errors.gender ? 'gender-error' : undefined}
              className={[
                'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white',
                'transition-colors focus:outline-none focus:ring-1',
                errors.gender
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                  : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
              ].join(' ')}
              {...register('gender')}
            >
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.gender && (
              <p id="gender-error" role="alert" className="text-xs text-red-600">
                {errors.gender.message}
              </p>
            )}
          </div>

          <Input
            label="Birth place"
            error={errors.birth_place?.message}
            {...register('birth_place')}
          />
          <Input
            label="Date of birth"
            type="date"
            hint="Format: YYYY-MM-DD"
            error={errors.date_of_birth?.message}
            {...register('date_of_birth')}
          />
          <Input
            label="Date of death"
            type="date"
            hint="Leave blank for living persons"
            error={errors.date_of_death?.message}
            {...register('date_of_death')}
          />
        </div>
      </fieldset>

      {/* ---- Demographics & Status ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Demographics & Vital Status
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Marital Status"
            hint="e.g. Married, Single, Widow"
            error={errors.marital_status?.message}
            {...register('marital_status')}
          />
          <Input
            label="Blood Group"
            hint="e.g. O+, B+, A+"
            error={errors.blood_group?.message}
            {...register('blood_group')}
          />
          <Input
            label="Birth Order"
            type="number"
            hint="Order of birth among siblings (1, 2, ...)"
            error={errors.birth_order?.message}
            {...register('birth_order')}
          />
        </div>
      </fieldset>

      {/* ---- Education & Occupation ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Education & Occupation
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Education / Qualification"
            hint="e.g. Graduate, M COM, B.Tech"
            error={errors.education?.message}
            {...register('education')}
          />
          <Input
            label="Occupation / Business"
            hint="e.g. Business, Engineer, Doctor, Student"
            error={errors.occupation?.message}
            {...register('occupation')}
          />
        </div>
      </fieldset>

      {/* ---- Residence & Origin ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Current Residence & Origin
        </legend>
        <div className="space-y-4">
          <Input
            label="Current Address"
            hint="Street, house or flat address"
            error={errors.current_address?.message}
            {...register('current_address')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Area / Locality"
              error={errors.current_area?.message}
              {...register('current_area')}
            />
            <Input
              label="City"
              error={errors.current_city?.message}
              {...register('current_city')}
            />
            <Input
              label="Postal Code / Pincode"
              error={errors.current_postal_code?.message}
              {...register('current_postal_code')}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="State / Province"
              error={errors.current_state?.message}
              {...register('current_state')}
            />
            <Input
              label="Native Place (Origin / Gam)"
              error={errors.native_place?.message}
              {...register('native_place')}
            />
          </div>
        </div>
      </fieldset>

      {/* ---- Community identity ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Community identity
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Gotra"
            error={errors.gotra?.message}
            {...register('gotra')}
          />
          <Input
            label="Kul"
            error={errors.kul?.message}
            {...register('kul')}
          />
          <Input
            label="Nukh"
            error={errors.nukh?.message}
            {...register('nukh')}
          />
        </div>
      </fieldset>

      {/* ---- Contact ---- */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Contact
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            hint="Community contact email — may differ from login email"
            error={errors.email_contact?.message}
            {...register('email_contact')}
          />
          <Input
            label="Phone"
            type="tel"
            autoComplete="tel"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Secondary phone"
            type="tel"
            error={errors.phone_secondary?.message}
            {...register('phone_secondary')}
          />
        </div>
      </fieldset>

      {/* ---- Privacy ---- */}
      <fieldset>
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Privacy settings
        </legend>
        <p className="mb-4 text-xs text-navy-500">
          Control who in the community can see each category of information.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PrivacyLevelSelect
            label="Profile visibility"
            hint="Who can see this person's record"
            error={errors.profile_privacy?.message}
            {...register('profile_privacy')}
          />
          <PrivacyLevelSelect
            label="Contact visibility"
            hint="Who can see email and phone"
            error={errors.contact_privacy?.message}
            {...register('contact_privacy')}
          />
          <PrivacyLevelSelect
            label="Date of birth visibility"
            hint="Who can see the date of birth"
            error={errors.dob_privacy?.message}
            {...register('dob_privacy')}
          />
        </div>
      </fieldset>

      {/* ---- Submission ---- */}
      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
