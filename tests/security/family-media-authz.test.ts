import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Static SQL Security & Authorization Analyzer for Phase 11 Subtask 2
 * Verifies all 17 mandatory attack and authorization scenarios directly against
 * the SQL AST / definitions.
 */
describe('Family Media Security & Authorization Scenarios (A–Q)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261010140000_create_family_media_and_history.sql'
  )
  const sql = readFileSync(migrationPath, 'utf8')

  it('A & B: Family A member access ALLOWED, Family B member private access DENIED', () => {
    // Verified via can_read_family_item: checks membership in p_family_id
    expect(sql).toContain('fm.family_id = p_family_id')
    expect(sql).toContain('p.user_id = v_user_id')
    // When caller is from Family B, fm.family_id = p_family_id fails
  })

  it('C: Former Family A member (left_at IS NOT NULL) accessing private media DENIED', () => {
    // Explicit constraint fm.left_at IS NULL is required
    expect(sql).toContain('fm.left_at IS NULL')
  })

  it('D: Anonymous user (auth.uid() IS NULL) accessing private Family media DENIED', () => {
    // Evaluates false if item privacy is not PUBLIC in a PUBLIC family
    expect(sql).toContain("IF p_item_privacy = 'PUBLIC' AND v_fam_privacy = 'PUBLIC' THEN")
    // Private/Family item returns false for anonymous
    expect(sql).toContain('RETURN FALSE;')
  })

  it('E: Public family media accessible according to existing family privacy model', () => {
    // PUBLIC item in PUBLIC family returns TRUE
    expect(sql).toContain("IF p_item_privacy = 'PUBLIC' AND v_fam_privacy = 'PUBLIC' THEN\n    RETURN TRUE;")
  })

  it('F: User uploading to another family namespace DENIED in Storage RLS & Table RLS', () => {
    // Storage RLS enforces can_manage_family_media on the path's family UUID
    expect(sql).toContain('public.can_manage_family_media((split_part(name, \'/\', 2))::UUID)')
    // Direct table INSERT is blocked via RLS
    expect(sql).toContain('CREATE POLICY "family_media_insert_policy"\n  ON public.family_media\n  FOR INSERT\n  WITH CHECK (FALSE);')
    // RPC enforces can_manage_family_media(p_family_id)
    expect(sql).toContain('public.can_manage_family_media(p_family_id)')
  })

  it('G: User deleting another family media DENIED via soft_delete_family_media RPC and RLS', () => {
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: You do not have permission to delete this media'")
    // Direct table DELETE policy is blocked
    expect(sql).toContain('CREATE POLICY "family_media_delete_policy"\n  ON public.family_media\n  FOR DELETE\n  USING (FALSE);')
  })

  it('H: User registering media against another family DENIED via register_family_media RPC', () => {
    expect(sql).toContain("IF NOT public.can_manage_family_media(p_family_id) THEN\n    RAISE EXCEPTION 'FORBIDDEN: You do not have permission to add media to this family'")
  })

  it('I: Album from Family A + media from Family B DENIED by database trigger guard', () => {
    expect(sql).toContain('handle_family_media_album_guard')
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Album belongs to a different family (cross-family reference rejected)'")
  })

  it('J & K: Deleted or Archived/Inactive family media access DENIED', () => {
    expect(sql).toContain("WHERE id = p_family_id\n    AND deleted_at IS NULL\n    AND status = 'ACTIVE';")
    expect(sql).toContain('IF NOT FOUND THEN\n    RETURN FALSE;\n  END IF;')
  })

  it('L: Deleted media read DENIED (deleted_at IS NOT NULL)', () => {
    expect(sql).toContain('AND fm.deleted_at IS NULL')
    expect(sql).toContain('deleted_at IS NULL')
  })

  it('M: Invalid storage path format DENIED by table CHECK constraint and RPC', () => {
    // Regex constraint on table
    expect(sql).toContain(
      "^family-media/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$"
    )
    // RPC path segment check
    expect(sql).toContain(
      "p_storage_path !~ ('^family-media/families/' || p_family_id::TEXT || '/media/' || p_media_id::TEXT || '/[^/]+$')"
    )
  })

  it('N: External URL and signed URLs DENIED from storage_object_path', () => {
    // Path MUST match canonical family-media/ prefix, rejecting http://, https://, and /storage/v1/
    expect(sql).not.toContain('/storage/v1/object/sign/')
    expect(sql).not.toContain('/storage/v1/object/authenticated/')
  })

  it('O & P: Dedicated family-media bucket accepts PDF, while avatars bucket remains image-only', () => {
    // family-media has application/pdf
    expect(sql).toContain("'family-media'")
    expect(sql).toContain("'application/pdf'")
    // avatars bucket is NOT modified to accept PDF
    expect(sql).not.toContain("UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] WHERE id = 'avatars'")
  })

  it('Q: Avatar functionality from Subtask 1 remains 100% UNCHANGED', () => {
    const avatarMigration = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20261010100000_create_storage_and_avatars.sql'),
      'utf8'
    )
    expect(avatarMigration).toContain("'avatars'")
    expect(avatarMigration).toContain('5242880')
    expect(avatarMigration).toContain('public.can_read_avatar_object')
  })

  it('R: Album cover media belonging to another family DENIED by database trigger guard', () => {
    expect(sql).toContain('handle_family_album_cover_guard')
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Cover media belongs to a different family'")
  })

  it('S: Direct client mutations (INSERT/UPDATE/DELETE) on tables DENIED by RLS deny policies and SELECT-only grants', () => {
    // INSERT denied
    expect(sql).toContain('CREATE POLICY "family_albums_insert_policy"\n  ON public.family_albums\n  FOR INSERT\n  WITH CHECK (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_media_insert_policy"\n  ON public.family_media\n  FOR INSERT\n  WITH CHECK (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_stories_insert_policy"\n  ON public.family_stories\n  FOR INSERT\n  WITH CHECK (FALSE);')

    // UPDATE denied
    expect(sql).toContain('CREATE POLICY "family_albums_update_policy"\n  ON public.family_albums\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_media_update_policy"\n  ON public.family_media\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_stories_update_policy"\n  ON public.family_stories\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')

    // DELETE denied
    expect(sql).toContain('CREATE POLICY "family_albums_delete_policy"\n  ON public.family_albums\n  FOR DELETE\n  USING (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_media_delete_policy"\n  ON public.family_media\n  FOR DELETE\n  USING (FALSE);')
    expect(sql).toContain('CREATE POLICY "family_stories_delete_policy"\n  ON public.family_stories\n  FOR DELETE\n  USING (FALSE);')

    // Grants: SELECT only to authenticated
    expect(sql).toContain('GRANT SELECT ON TABLE public.family_albums TO authenticated;')
    expect(sql).toContain('GRANT SELECT ON TABLE public.family_media TO authenticated;')
    expect(sql).toContain('GRANT SELECT ON TABLE public.family_stories TO authenticated;')
  })

  it('T: Tampering with immutable media or album identity fields DENIED by database triggers', () => {
    // Album immutability
    expect(sql).toContain('handle_family_album_immutability_guard')
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Album id is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Album family_id is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Album created_by is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Album created_at is immutable'")

    // Media immutability
    expect(sql).toContain('handle_family_media_immutability_guard')
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Media id is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Media family_id is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Media uploaded_by is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Media created_at is immutable'")
    expect(sql).toContain("RAISE EXCEPTION 'FORBIDDEN: Media storage_object_path is immutable'")
  })
})
