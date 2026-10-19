/**
 * Families service — CRUD operations on public.families
 *
 * All operations use the single typed Supabase client (anon key only).
 * Authorization is enforced exclusively by PostgreSQL RLS policies.
 *
 * SECURITY RULES:
 * - Never accept `created_by` from user-controlled input.
 * - `created_by` is always set from the caller-supplied authenticated userId.
 * - `status` and `verification_status` are system fields; not set by this service.
 * - Soft-delete only: set `deleted_at`; never execute a SQL DELETE.
 *   The deployed `families_delete_deny` and `families_soft_delete_creator`
 *   policies enforce this at the PostgreSQL level.
 * - Do NOT replicate RLS logic here; rely on the database to enforce it.
 * - This service does NOT read or write the `family_members` join table.
 *   Family membership management is Phase 4 scope.
 *
 * Error responses always return user-friendly messages; raw DB errors are not
 * exposed to callers.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type { Tables } from '@/types/database.types'
import {
  createFamilySchema,
  updateFamilySchema,
  type CreateFamilyInput,
  type UpdateFamilyInput,
} from '../schemas/families.schemas'
import { ZodError } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The full family row as returned from the database. */
export type FamilyRow = Tables<'families'>

/** Parameters for listing families — minimal; pagination deferred to future phase. */
export interface ListFamiliesParams {
  /** Maximum number of records to return. Defaults to 50. Phase 3 limitation. */
  limit?: number
}

// ---------------------------------------------------------------------------
// createFamily
// ---------------------------------------------------------------------------

/**
 * Create a new family record.
 *
 * The caller must supply the authenticated user's ID as `createdBy`.
 * This value is set on `created_by` in the database — it is never taken
 * from user-controlled input.
 *
 * @param input - User-supplied family data (validated against createFamilySchema).
 * @param createdBy - The authenticated user's UUID (from auth.uid()).
 */
export async function createFamily(
  input: CreateFamilyInput,
  createdBy: string
): Promise<ApiResponse<FamilyRow>> {
  const parseResult = createFamilySchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  const { data, error } = await supabase
    .from('families')
    .insert({
      ...validated,
      created_by: createdBy,
    })
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// getFamily
// ---------------------------------------------------------------------------

/**
 * Fetch a single family by its UUID.
 *
 * Visibility is governed by RLS. The caller will only receive a record if
 * the deployed RLS policies permit it for the current session.
 * Soft-deleted records are always excluded.
 *
 * @param familyId - The UUID of the family to fetch.
 */
export async function getFamily(familyId: string): Promise<ApiResponse<FamilyRow>> {
  const { data, error } = await supabase
    .from('families')
    .select('*')
    .eq('id', familyId)
    .is('deleted_at', null)
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// updateFamily
// ---------------------------------------------------------------------------

/**
 * Update user-editable fields on a family record.
 *
 * Only explicitly user-editable fields are accepted. Protected fields
 * (created_by, status, verification_status, deleted_at) cannot be
 * modified through this function.
 *
 * RLS enforces that only the record creator (or an admin) can update.
 * Soft-deleted records are excluded from the update target.
 *
 * @param familyId - The UUID of the family to update.
 * @param input - Fields to update (validated against updateFamilySchema).
 */
export async function updateFamily(
  familyId: string,
  input: UpdateFamilyInput
): Promise<ApiResponse<FamilyRow>> {
  const parseResult = updateFamilySchema.safeParse(input)
  if (!parseResult.success) {
    return {
      data: null,
      error: {
        message: formatZodError(parseResult.error),
        code: 'VALIDATION_ERROR',
      },
    }
  }

  const validated = parseResult.data

  const { data, error } = await supabase
    .from('families')
    .update(validated)
    .eq('id', familyId)
    .is('deleted_at', null)
    .select()
    .single()

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data, error: null }
}

// ---------------------------------------------------------------------------
// listFamilies
// ---------------------------------------------------------------------------

/**
 * List family records visible to the current session.
 *
 * RLS governs which records are returned based on privacy level and
 * the caller's authentication state:
 *  - Unauthenticated: receives only PUBLIC records.
 *  - Authenticated member: receives PUBLIC + COMMUNITY records.
 *  - Record creator: additionally receives their own records at any privacy level.
 *
 * Soft-deleted records (deleted_at IS NOT NULL) are always excluded.
 *
 * NOTE: Pagination is not yet implemented. The limit parameter provides a
 * ceiling to avoid unbounded result sets. Full cursor-based pagination is
 * deferred to Phase 6 (Discovery).
 *
 * @param params - Optional list parameters.
 */
export async function listFamilies(
  params: ListFamiliesParams = {}
): Promise<ApiResponse<FamilyRow[]>> {
  const limit = params.limit ?? 50

  const { data, error } = await supabase
    .from('families')
    .select('*')
    .is('deleted_at', null)
    .order('family_name', { ascending: true })
    .limit(limit)

  if (error) {
    return {
      data: null,
      error: {
        message: 'Could not load family records. Please try again.',
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: data ?? [], error: null }
}

// ---------------------------------------------------------------------------
// softDeleteFamily
// ---------------------------------------------------------------------------

/**
 * Soft-delete a family record by setting `deleted_at` to the current timestamp.
 *
 * This function NEVER executes a SQL DELETE.
 *
 * The deployed database enforces this at two levels:
 *   - `families_delete_deny`: WITH CHECK (FALSE) — blocks all hard deletes.
 *   - `families_soft_delete_creator`: permits UPDATE of `deleted_at` by the creator.
 *
 * Soft-deleted records are hidden from normal queries via RLS conditions
 * on `deleted_at IS NULL`.
 *
 * @param familyId - The UUID of the family to soft-delete.
 */
export async function softDeleteFamily(familyId: string): Promise<ApiResponse<void>> {
  const { error } = await supabase
    .from('families')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', familyId)
    .is('deleted_at', null) // Idempotency guard: skip if already soft-deleted

  if (error) {
    return {
      data: null,
      error: {
        message: mapFamilyError(error.message, error.code),
        code: error.code,
        cause: error,
      },
    }
  }

  return { data: undefined, error: null }
}

// ---------------------------------------------------------------------------
// Internal error helpers
// ---------------------------------------------------------------------------

/**
 * Maps raw Supabase/PostgreSQL error messages to user-friendly text.
 * Never expose raw database error messages to users.
 */
function mapFamilyError(message: string, code?: string): string {
  if (code === '42501') {
    return 'You do not have permission to perform this action.'
  }
  if (code === 'PGRST116') {
    return 'Family not found.'
  }
  if (code === '23505') {
    return 'A duplicate record already exists.'
  }
  if (code === '23503') {
    return 'Related record not found.'
  }
  const lower = message.toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * Formats a Zod validation error into a concise, user-readable string.
 */
function formatZodError(error: ZodError): string {
  const issues = error.issues
  if (issues.length === 0) return 'Validation failed.'
  return issues
    .map((issue) => issue.message)
    .filter((msg, idx, arr) => arr.indexOf(msg) === idx) // deduplicate
    .join('; ')
}
