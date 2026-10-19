/**
 * Families feature — Zod validation schemas
 *
 * Derived exclusively from the deployed `families` table schema
 * (src/types/database.types.ts — generated, do not hand-edit).
 *
 * SECURITY NOTE:
 * These schemas define what a regular authenticated user may supply as input.
 * Protected system fields are intentionally ABSENT from all schemas:
 *   - id                  (DB generated)
 *   - created_at          (DB generated)
 *   - updated_at          (DB managed via trigger)
 *   - created_by          (set from auth.uid() inside the service, never user input)
 *   - status              (system managed: DRAFT → ACTIVE via admin/moderation)
 *   - verification_status (system managed)
 *   - deleted_at          (set only by softDeleteFamily service function)
 */

import { z } from 'zod'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

// ---------------------------------------------------------------------------
// Shared field validators — derived from deployed schema constraints
// ---------------------------------------------------------------------------

/**
 * Deployed: family_name VARCHAR NOT NULL
 * The only required field for a family record.
 */
const familyNameField = z
  .string({ required_error: 'Family name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Family name is required')
      .max(200, 'Family name must not exceed 200 characters')
  )

/** Deployed: description TEXT nullable */
const descriptionField = z
  .string()
  .transform(sanitizeMultilineText)
  .pipe(z.string().max(2000, 'Description must not exceed 2000 characters'))
  .nullable()
  .optional()

/** Deployed: city VARCHAR nullable */
const cityField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'City must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: state VARCHAR nullable */
const stateField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'State must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: country VARCHAR nullable */
const countryField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Country must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: gotra VARCHAR nullable — community identity field */
const gotraField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Gotra must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: kul VARCHAR nullable — community identity field */
const kulField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Kul must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: nukh VARCHAR nullable — community identity field */
const nukhField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Nukh must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: mool_shakha VARCHAR nullable */
const moolShakhaField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Mool Shakha must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: family_type VARCHAR nullable */
const familyTypeField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(50, 'Family type must not exceed 50 characters'))
  .nullable()
  .optional()

/** Deployed: mukhi_name VARCHAR nullable */
const mukhiNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(150, 'Mukhi name must not exceed 150 characters'))
  .nullable()
  .optional()

/** Deployed: native_place VARCHAR nullable */
const nativePlaceField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Native place must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: address VARCHAR nullable */
const addressField = z
  .string()
  .transform(sanitizeMultilineText)
  .pipe(z.string().max(500, 'Address must not exceed 500 characters'))
  .nullable()
  .optional()

/** Deployed: area VARCHAR nullable */
const areaField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Area must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: postal_code VARCHAR nullable */
const postalCodeField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(20, 'Postal code must not exceed 20 characters'))
  .nullable()
  .optional()

/** Deployed: census_status VARCHAR nullable */
const censusStatusField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(50, 'Census status must not exceed 50 characters'))
  .nullable()
  .optional()

/**
 * Deployed: privacy_level enum
 * ('PRIVATE' | 'FAMILY' | 'CONNECTIONS' | 'COMMUNITY' | 'PUBLIC')
 */
const privacyLevelField = z.enum([
  'PRIVATE',
  'FAMILY',
  'CONNECTIONS',
  'COMMUNITY',
  'PUBLIC',
])

// ---------------------------------------------------------------------------
// createFamilySchema
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new family record.
 *
 * Required: family_name.
 * Optional: all other user-editable fields.
 *
 * Two independent privacy fields control visibility:
 *   - profile_privacy:  who can see the family record itself.
 *   - members_privacy:  who can see the member list for this family.
 * Both default to COMMUNITY per the project privacy model.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * status, verification_status, deleted_at.
 */
export const createFamilySchema = z.object({
  family_name: familyNameField,
  description: descriptionField,
  city: cityField,
  state: stateField,
  country: countryField,
  address: addressField,
  area: areaField,
  postal_code: postalCodeField,
  native_place: nativePlaceField,
  gotra: gotraField,
  kul: kulField,
  nukh: nukhField,
  mool_shakha: moolShakhaField,
  family_type: familyTypeField,
  mukhi_name: mukhiNameField,
  census_status: censusStatusField,
  // Privacy fields — both default to COMMUNITY per project privacy model
  // Optional in input: if omitted, the database default (COMMUNITY) applies.
  profile_privacy: privacyLevelField.optional().default('COMMUNITY'),
  members_privacy: privacyLevelField.optional().default('COMMUNITY'),
})

/** Input type — fields with defaults are optional. */
export type CreateFamilyInput = z.input<typeof createFamilySchema>
/** Parsed/output type — all defaults have been applied. */
export type CreateFamilyParsed = z.infer<typeof createFamilySchema>

// ---------------------------------------------------------------------------
// updateFamilySchema
// ---------------------------------------------------------------------------

/**
 * Schema for updating an existing family record.
 *
 * All fields are optional (partial update pattern).
 * Same user-editable field set as createFamilySchema.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * status, verification_status, deleted_at.
 */
export const updateFamilySchema = z
  .object({
    family_name: familyNameField.optional(),
    description: descriptionField,
    city: cityField,
    state: stateField,
    country: countryField,
    address: addressField,
    area: areaField,
    postal_code: postalCodeField,
    native_place: nativePlaceField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    mool_shakha: moolShakhaField,
    family_type: familyTypeField,
    mukhi_name: mukhiNameField,
    census_status: censusStatusField,
    profile_privacy: privacyLevelField.optional(),
    members_privacy: privacyLevelField.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )

export type UpdateFamilyInput = z.infer<typeof updateFamilySchema>
