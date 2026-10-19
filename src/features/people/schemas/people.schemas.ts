/**
 * People feature — Zod validation schemas
 *
 * Derived exclusively from the deployed `persons` table schema
 * (src/types/database.types.ts — generated, do not hand-edit).
 *
 * SECURITY NOTE:
 * These schemas define what a regular authenticated user may supply as input.
 * Protected system fields are intentionally ABSENT from all schemas:
 *   - id            (DB generated)
 *   - created_at    (DB generated)
 *   - updated_at    (DB managed via trigger)
 *   - created_by    (set from auth.uid() inside the service, never user input)
 *   - user_id       (NULL until Phase 8 claim flow — PERSON != USER boundary)
 *   - status        (system managed: DRAFT → ACTIVE via admin/moderation)
 *   - verification_status (system managed)
 *   - deleted_at    (set only by softDeletePerson service function)
 */

import { z } from 'zod'
import { sanitizeText } from '@/lib/sanitization'

// ---------------------------------------------------------------------------
// Shared field validators — derived from deployed schema constraints
// ---------------------------------------------------------------------------

/** Deployed: char_length(first_name) BETWEEN 1 AND 100, NOT NULL */
const firstNameField = z
  .string({ required_error: 'First name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'First name is required')
      .max(100, 'First name must not exceed 100 characters')
  )

/** Deployed: char_length(last_name) BETWEEN 1 AND 100, NOT NULL */
const lastNameField = z
  .string({ required_error: 'Last name is required' })
  .transform(sanitizeText)
  .pipe(
    z
      .string()
      .min(1, 'Last name is required')
      .max(100, 'Last name must not exceed 100 characters')
  )

/** Deployed: middle_name VARCHAR nullable */
const middleNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Middle name must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: maiden_name VARCHAR nullable */
const maidenNameField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Maiden name must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: gender enum ('MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY') nullable */
const genderField = z
  .enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'])
  .nullable()
  .optional()

/** Deployed: date_of_birth DATE nullable — stored as ISO string */
const dateOfBirthField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be in YYYY-MM-DD format')
  .nullable()
  .optional()

/** Deployed: date_of_death DATE nullable — stored as ISO string */
const dateOfDeathField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of death must be in YYYY-MM-DD format')
  .nullable()
  .optional()

/** Deployed: birth_place VARCHAR nullable */
const birthPlaceField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(200, 'Birth place must not exceed 200 characters'))
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

/** Deployed: email_contact VARCHAR nullable */
const emailContactField = z
  .string()
  .email('Please enter a valid email address')
  .max(254, 'Email must not exceed 254 characters')
  .nullable()
  .optional()

/** Deployed: phone VARCHAR nullable */
const phoneField = z
  .string()
  .max(30, 'Phone number must not exceed 30 characters')
  .nullable()
  .optional()

/** Deployed: phone_secondary VARCHAR nullable */
const phoneSecondaryField = z
  .string()
  .max(30, 'Secondary phone must not exceed 30 characters')
  .nullable()
  .optional()

/** Deployed: marital_status VARCHAR nullable */
const maritalStatusField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(50, 'Marital status must not exceed 50 characters'))
  .nullable()
  .optional()

/** Deployed: blood_group VARCHAR nullable */
const bloodGroupField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(10, 'Blood group must not exceed 10 characters'))
  .nullable()
  .optional()

/** Deployed: education VARCHAR nullable */
const educationField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(200, 'Education must not exceed 200 characters'))
  .nullable()
  .optional()

/** Deployed: occupation VARCHAR nullable */
const occupationField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(200, 'Occupation must not exceed 200 characters'))
  .nullable()
  .optional()

/** Deployed: birth_order INT nullable */
const birthOrderField = z
  .number()
  .int('Birth order must be an integer')
  .min(1, 'Birth order must be at least 1')
  .nullable()
  .optional()

/** Deployed: native_place VARCHAR nullable */
const nativePlaceField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Native place must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: current_address VARCHAR nullable */
const currentAddressField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(500, 'Address must not exceed 500 characters'))
  .nullable()
  .optional()

/** Deployed: current_area VARCHAR nullable */
const currentAreaField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'Area must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: current_city VARCHAR nullable */
const currentCityField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'City must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: current_state VARCHAR nullable */
const currentStateField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(100, 'State must not exceed 100 characters'))
  .nullable()
  .optional()

/** Deployed: current_postal_code VARCHAR nullable */
const currentPostalCodeField = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().max(20, 'Postal code must not exceed 20 characters'))
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
// createPersonSchema
// ---------------------------------------------------------------------------

/**
 * Schema for creating a new person record.
 *
 * Required: first_name, last_name.
 * Optional: all other user-editable fields.
 *
 * Privacy defaults: the database defaults all privacy fields to COMMUNITY.
 * If not provided here, the database default applies.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * user_id, status, verification_status, deleted_at.
 */
export const createPersonSchema = z.object({
  first_name: firstNameField,
  last_name: lastNameField,
  middle_name: middleNameField,
  maiden_name: maidenNameField,
  gender: genderField,
  date_of_birth: dateOfBirthField,
  date_of_death: dateOfDeathField,
  birth_place: birthPlaceField,
  marital_status: maritalStatusField,
  blood_group: bloodGroupField,
  education: educationField,
  occupation: occupationField,
  birth_order: birthOrderField,
  native_place: nativePlaceField,
  current_address: currentAddressField,
  current_area: currentAreaField,
  current_city: currentCityField,
  current_state: currentStateField,
  current_postal_code: currentPostalCodeField,
  gotra: gotraField,
  kul: kulField,
  nukh: nukhField,
  email_contact: emailContactField,
  phone: phoneField,
  phone_secondary: phoneSecondaryField,
  // Privacy fields — default to COMMUNITY per project privacy model
  // Optional in input: if omitted by caller, the database default (COMMUNITY) applies.
  profile_privacy: privacyLevelField.optional().default('COMMUNITY'),
  contact_privacy: privacyLevelField.optional().default('COMMUNITY'),
  dob_privacy: privacyLevelField.optional().default('COMMUNITY'),
})

/** Input type — fields with defaults are optional. */
export type CreatePersonInput = z.input<typeof createPersonSchema>
/** Parsed/output type — all defaults have been applied. */
export type CreatePersonParsed = z.infer<typeof createPersonSchema>

// ---------------------------------------------------------------------------
// updatePersonSchema
// ---------------------------------------------------------------------------

/**
 * Schema for updating an existing person record.
 *
 * All fields are optional (partial update pattern).
 * Same user-editable field set as createPersonSchema.
 *
 * Protected fields NOT present: id, created_at, updated_at, created_by,
 * user_id, status, verification_status, deleted_at.
 */
export const updatePersonSchema = z
  .object({
    first_name: firstNameField.optional(),
    last_name: lastNameField.optional(),
    middle_name: middleNameField,
    maiden_name: maidenNameField,
    gender: genderField,
    date_of_birth: dateOfBirthField,
    date_of_death: dateOfDeathField,
    birth_place: birthPlaceField,
    marital_status: maritalStatusField,
    blood_group: bloodGroupField,
    education: educationField,
    occupation: occupationField,
    birth_order: birthOrderField,
    native_place: nativePlaceField,
    current_address: currentAddressField,
    current_area: currentAreaField,
    current_city: currentCityField,
    current_state: currentStateField,
    current_postal_code: currentPostalCodeField,
    gotra: gotraField,
    kul: kulField,
    nukh: nukhField,
    email_contact: emailContactField,
    phone: phoneField,
    phone_secondary: phoneSecondaryField,
    profile_privacy: privacyLevelField.optional(),
    contact_privacy: privacyLevelField.optional(),
    dob_privacy: privacyLevelField.optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  )

export type UpdatePersonInput = z.infer<typeof updatePersonSchema>
