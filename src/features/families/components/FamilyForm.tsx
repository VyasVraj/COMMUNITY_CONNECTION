/**
 * FamilyForm — create/edit form for family records.
 *
 * Uses React Hook Form + zodResolver with a flat form schema.
 * All fields are the user-editable subset of the families table.
 *
 * SECURITY NOTE:
 * Protected/system fields are NOT present in this form:
 *   id, created_at, updated_at, created_by,
 *   status, verification_status, deleted_at
 *
 * The service/schema layer remains the authority for protected fields.
 * Even if a caller attempted to inject protected fields, the schema would
 * strip them and RLS policies would reject them.
 *
 * DESCRIPTION FIELD:
 * Native <textarea> supporting up to 2000 characters, styled consistently
 * with the Input component.
 *
 * PRIVACY CONTROLS:
 * Reuses the shared PrivacyLevelSelect component for both independent privacy fields:
 *   - profile_privacy (default: COMMUNITY)
 *   - members_privacy (default: COMMUNITY)
 */

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type CreateFamilyInput } from '../schemas/families.schemas'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { PrivacyLevelSelect } from '@/components/forms/PrivacyLevelSelect'
import type { PrivacyLevel } from '@/types'

// ---------------------------------------------------------------------------
// Form schema — a flat schema for RHF accepting HTML input values
// ---------------------------------------------------------------------------

const PRIVACY_ENUM = z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'])

const familyFormSchema = z.object({
  family_name: z
    .string({ required_error: 'Family name is required' })
    .min(1, 'Family name is required')
    .max(200, 'Family name must not exceed 200 characters'),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional(),
  city: z.string().max(100, 'City must not exceed 100 characters').optional(),
  state: z.string().max(100, 'State must not exceed 100 characters').optional(),
  country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
  address: z.string().max(500, 'Address must not exceed 500 characters').optional(),
  area: z.string().max(100, 'Area must not exceed 100 characters').optional(),
  postal_code: z.string().max(20, 'Postal code must not exceed 20 characters').optional(),
  native_place: z.string().max(100, 'Native place must not exceed 100 characters').optional(),
  gotra: z.string().max(100, 'Gotra must not exceed 100 characters').optional(),
  kul: z.string().max(100, 'Kul must not exceed 100 characters').optional(),
  nukh: z.string().max(100, 'Nukh must not exceed 100 characters').optional(),
  mool_shakha: z.string().max(100, 'Mool Shakha must not exceed 100 characters').optional(),
  family_type: z.string().max(50, 'Family type must not exceed 50 characters').optional(),
  mukhi_name: z.string().max(150, 'Mukhi name must not exceed 150 characters').optional(),
  census_status: z.string().max(50, 'Census status must not exceed 50 characters').optional(),
  profile_privacy: PRIVACY_ENUM.default('COMMUNITY'),
  members_privacy: PRIVACY_ENUM.default('COMMUNITY'),
})

type FamilyFormValues = z.infer<typeof familyFormSchema>

// ---------------------------------------------------------------------------
// Sanitization helper: convert empty strings to undefined
// ---------------------------------------------------------------------------

function sanitizeOptional(v: string | undefined): string | undefined {
  if (v === '' || v === undefined) return undefined
  const trimmed = v.trim()
  return trimmed === '' ? undefined : trimmed
}

function sanitizeFormValues(values: FamilyFormValues): CreateFamilyInput {
  return {
    family_name: values.family_name.trim(),
    description: sanitizeOptional(values.description),
    city: sanitizeOptional(values.city),
    state: sanitizeOptional(values.state),
    country: sanitizeOptional(values.country),
    address: sanitizeOptional(values.address),
    area: sanitizeOptional(values.area),
    postal_code: sanitizeOptional(values.postal_code),
    native_place: sanitizeOptional(values.native_place),
    gotra: sanitizeOptional(values.gotra),
    kul: sanitizeOptional(values.kul),
    nukh: sanitizeOptional(values.nukh),
    mool_shakha: sanitizeOptional(values.mool_shakha),
    family_type: sanitizeOptional(values.family_type),
    mukhi_name: sanitizeOptional(values.mukhi_name),
    census_status: sanitizeOptional(values.census_status),
    profile_privacy: values.profile_privacy,
    members_privacy: values.members_privacy,
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FamilyFormProps {
  mode: 'create' | 'edit'
  /** Pre-fill values for edit mode */
  defaultValues?: Partial<CreateFamilyInput>
  /** Called with validated and sanitized data on submit */
  onSubmit: (data: CreateFamilyInput) => Promise<void>
  /** Loading/submitting state */
  isSubmitting?: boolean
  /** Error message to display from mutation failure */
  submitError?: string | null
}

function toFieldValue(v: string | null | undefined): string {
  return v ?? ''
}

// ---------------------------------------------------------------------------
// FamilyForm Component
// ---------------------------------------------------------------------------

export function FamilyForm({
  mode,
  defaultValues,
  onSubmit,
  isSubmitting = false,
  submitError,
}: FamilyFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FamilyFormValues>({
    resolver: zodResolver(familyFormSchema),
    defaultValues: {
      family_name: toFieldValue(defaultValues?.family_name),
      description: toFieldValue(defaultValues?.description),
      city: toFieldValue(defaultValues?.city),
      state: toFieldValue(defaultValues?.state),
      country: toFieldValue(defaultValues?.country),
      address: toFieldValue(defaultValues?.address),
      area: toFieldValue(defaultValues?.area),
      postal_code: toFieldValue(defaultValues?.postal_code),
      native_place: toFieldValue(defaultValues?.native_place),
      gotra: toFieldValue(defaultValues?.gotra),
      kul: toFieldValue(defaultValues?.kul),
      nukh: toFieldValue(defaultValues?.nukh),
      mool_shakha: toFieldValue(defaultValues?.mool_shakha),
      family_type: toFieldValue(defaultValues?.family_type),
      mukhi_name: toFieldValue(defaultValues?.mukhi_name),
      census_status: toFieldValue(defaultValues?.census_status),
      profile_privacy: (defaultValues?.profile_privacy as PrivacyLevel) ?? 'COMMUNITY',
      members_privacy: (defaultValues?.members_privacy as PrivacyLevel) ?? 'COMMUNITY',
    },
  })

  async function onFormSubmit(values: FamilyFormValues) {
    await onSubmit(sanitizeFormValues(values))
  }

  const submitLabel = mode === 'create' ? 'Create family' : 'Save changes'

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      noValidate
      className="space-y-8"
      aria-label={mode === 'create' ? 'Create family form' : 'Edit family form'}
    >
      {/* Overview */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Family Information
        </legend>
        <div className="space-y-4">
          <Input
            label="Family name"
            required
            hint="e.g. Sharma Family, Patel Household"
            error={errors.family_name?.message}
            {...register('family_name')}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Family Type"
              hint="e.g. Nuclear, Joint"
              error={errors.family_type?.message}
              {...register('family_type')}
            />
            <Input
              label="Head / Mukhi Name"
              hint="e.g. Elder or household mukhi"
              error={errors.mukhi_name?.message}
              {...register('mukhi_name')}
            />
          </div>

          {/* Description — native textarea */}
          <div className="space-y-1">
            <label
              htmlFor="description"
              className="block text-sm font-medium text-navy-700"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              maxLength={2000}
              placeholder="Brief introduction or background about this family..."
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'description-error' : undefined}
              className={[
                'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white placeholder:text-navy-400',
                'transition-colors focus:outline-none focus:ring-1',
                errors.description
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                  : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
              ].join(' ')}
              {...register('description')}
            />
            {errors.description && (
              <p id="description-error" role="alert" className="text-xs text-red-600">
                {errors.description.message}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Location */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Location & Household Address
        </legend>
        <div className="space-y-4">
          <Input
            label="Address"
            hint="Street, building, or apartment"
            error={errors.address?.message}
            {...register('address')}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="Area / Locality"
              error={errors.area?.message}
              {...register('area')}
            />
            <Input
              label="City"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              label="Postal Code / Pincode"
              error={errors.postal_code?.message}
              {...register('postal_code')}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Input
              label="State / Province"
              error={errors.state?.message}
              {...register('state')}
            />
            <Input
              label="Country"
              error={errors.country?.message}
              {...register('country')}
            />
            <Input
              label="Native Place (Sihdh Jo Gam / Origin)"
              error={errors.native_place?.message}
              {...register('native_place')}
            />
          </div>
        </div>
      </fieldset>

      {/* Community Identity */}
      <fieldset>
        <legend className="mb-4 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Community Lineage & Identity
        </legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
          <Input
            label="Mool Shakha"
            error={errors.mool_shakha?.message}
            {...register('mool_shakha')}
          />
        </div>
      </fieldset>

      {/* Privacy Settings */}
      <fieldset>
        <legend className="mb-1 text-sm font-semibold uppercase tracking-wide text-navy-500">
          Privacy Settings
        </legend>
        <p className="mb-4 text-xs text-navy-500">
          Configure independent visibility for this family profile and future membership roster.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <PrivacyLevelSelect
            label="Family profile visibility"
            hint="Who can see the family record itself"
            error={errors.profile_privacy?.message}
            {...register('profile_privacy')}
          />
          <PrivacyLevelSelect
            label="Members list visibility"
            hint="Intended visibility for family members list"
            error={errors.members_privacy?.message}
            {...register('members_privacy')}
          />
        </div>
      </fieldset>

      {/* Submission error display */}
      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {submitError}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
