import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Family Media & History Schema Contract (Phase 11 Subtask 2 Hardening)', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20261010140000_create_family_media_and_history.sql'
  )
  const sql = readFileSync(migrationPath, 'utf8')

  describe('Storage Bucket Isolation', () => {
    it('creates dedicated private family-media bucket with 20MB limit and image+pdf MIME allowlist', () => {
      expect(sql).toContain("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)")
      expect(sql).toContain("'family-media'")
      expect(sql).toContain("20971520") // 20 MB
      expect(sql).toContain("'application/pdf'")
      expect(sql).toContain("'image/jpeg'")
      expect(sql).toContain("'image/png'")
      expect(sql).toContain("'image/webp'")
      expect(sql).toContain("'image/gif'")
      // Must be private
      expect(sql).toContain("FALSE")
    })

    it('does not modify or alter the avatars bucket', () => {
      expect(sql).not.toContain("UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] WHERE id = 'avatars'")
      expect(sql).not.toContain("INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars'")
    })
  })

  describe('Domain Enums and Tables', () => {
    it('defines family_media_type enum with PHOTO, DOCUMENT, HISTORICAL_RECORD', () => {
      expect(sql).toContain("CREATE TYPE public.family_media_type AS ENUM")
      expect(sql).toContain("'PHOTO'")
      expect(sql).toContain("'DOCUMENT'")
      expect(sql).toContain("'HISTORICAL_RECORD'")
    })

    it('creates family_albums table with foreign key, lifecycle timestamps, and privacy level', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.family_albums')
      expect(sql).toContain('family_id UUID NOT NULL REFERENCES public.families(id)')
      expect(sql).toContain('privacy_level public.privacy_level NOT NULL DEFAULT \'FAMILY\'')
      expect(sql).toContain('deleted_at TIMESTAMPTZ')
      expect(sql).toContain('cover_media_id UUID')
    })

    it('creates family_media table with strict canonical storage path regex and size limit', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.family_media')
      expect(sql).toContain('family_id UUID NOT NULL REFERENCES public.families(id)')
      expect(sql).toContain('storage_object_path TEXT NOT NULL')
      // Asserts canonical path format: family-media/families/<uuid>/media/<uuid>/<filename>
      expect(sql).toContain(
        "^family-media/families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$"
      )
      expect(sql).toContain('20971520') // 20 MB
      expect(sql).toContain('display_order INT NOT NULL DEFAULT 0')
    })

    it('creates family_stories table for narrative history records', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.family_stories')
      expect(sql).toContain('family_id UUID NOT NULL REFERENCES public.families(id)')
      expect(sql).toContain('title TEXT NOT NULL')
      expect(sql).toContain('content TEXT NOT NULL')
      expect(sql).toContain('featured_media_id UUID')
      expect(sql).toContain('deleted_at TIMESTAMPTZ')
    })
  })

  describe('Cross-Family and Integrity Trigger Guards', () => {
    it('enforces album_guard: rejects cross-family album association', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_media_album_guard')
      expect(sql).toContain('FORBIDDEN: Album belongs to a different family (cross-family reference rejected)')
      expect(sql).toContain('CREATE TRIGGER family_media_album_guard')
    })

    it('enforces cover_guard: rejects cross-family album cover media association', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_album_cover_guard')
      expect(sql).toContain('FORBIDDEN: Cover media belongs to a different family')
      expect(sql).toContain('CREATE TRIGGER family_album_cover_guard')
    })

    it('enforces storage_path_guard: rejects mismatch between record IDs and path IDs', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_media_storage_path_guard')
      expect(sql).toContain('INVALID_ARGUMENT: storage_object_path family_id does not match record family_id')
      expect(sql).toContain('INVALID_ARGUMENT: storage_object_path media_id does not match record id')
      expect(sql).toContain('CREATE TRIGGER family_media_storage_path_guard')
    })

    it('enforces story featured_media_guard: rejects cross-family featured media', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_story_featured_media_guard')
      expect(sql).toContain('FORBIDDEN: Featured media belongs to a different family')
      expect(sql).toContain('CREATE TRIGGER family_story_featured_media_guard')
    })

    it('enforces album immutability: rejects modification of id, family_id, created_by, created_at', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_album_immutability_guard')
      expect(sql).toContain('FORBIDDEN: Album id is immutable')
      expect(sql).toContain('FORBIDDEN: Album family_id is immutable')
      expect(sql).toContain('FORBIDDEN: Album created_by is immutable')
      expect(sql).toContain('FORBIDDEN: Album created_at is immutable')
      expect(sql).toContain('CREATE TRIGGER family_album_immutability_guard')
    })

    it('enforces media immutability: rejects modification of id, family_id, uploaded_by, created_at, storage_object_path', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.handle_family_media_immutability_guard')
      expect(sql).toContain('FORBIDDEN: Media id is immutable')
      expect(sql).toContain('FORBIDDEN: Media family_id is immutable')
      expect(sql).toContain('FORBIDDEN: Media uploaded_by is immutable')
      expect(sql).toContain('FORBIDDEN: Media created_at is immutable')
      expect(sql).toContain('FORBIDDEN: Media storage_object_path is immutable')
      expect(sql).toContain('CREATE TRIGGER family_media_immutability_guard')
    })
  })

  describe('Helper Functions & Lifecycle Rules', () => {
    it('defines can_manage_family_media with SECURITY DEFINER and search_path = public', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_manage_family_media(p_family_id UUID)')
      expect(sql).toContain('SECURITY DEFINER')
      expect(sql).toContain('SET search_path = public')
      expect(sql).toContain('f.status = \'ACTIVE\'')
      expect(sql).toContain('fm.is_head = TRUE')
      expect(sql).toContain('fm.left_at IS NULL')
    })

    it('defines can_read_family_item enforcing active family lifecycle and privacy checks', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_read_family_item(')
      expect(sql).toContain('SECURITY DEFINER')
      expect(sql).toContain('SET search_path = public')
      expect(sql).toContain("f.status = 'ACTIVE'")
      expect(sql).toContain('fm.left_at IS NULL')
      expect(sql).toContain("p.status != 'ARCHIVED'")
      expect(sql).toContain('f.deleted_at IS NULL')
    })

    it('defines can_read_family_media_object checking family-media path and database registration', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.can_read_family_media_object(p_object_name TEXT)')
      expect(sql).toContain("split_part(p_object_name, '/', 1) != 'families'")
      expect(sql).toContain("split_part(p_object_name, '/', 3) != 'media'")
      expect(sql).toContain("fm.storage_object_path = ('family-media/' || p_object_name)")
      expect(sql).toContain('fm.deleted_at IS NULL')
    })
  })

  describe('Storage RLS Policies on storage.objects', () => {
    it('configures isolated family-media policies on storage.objects without touching avatars policies', () => {
      expect(sql).toContain('CREATE POLICY "family_media_select_policy"')
      expect(sql).toContain("bucket_id = 'family-media'")
      expect(sql).toContain('public.can_read_family_media_object(name)')

      expect(sql).toContain('CREATE POLICY "family_media_insert_policy"')
      expect(sql).toContain("bucket_id = 'family-media'")
      expect(sql).toContain("split_part(name, '/', 1) = 'families'")
      expect(sql).toContain("split_part(name, '/', 3) = 'media'")
      expect(sql).toContain("public.can_manage_family_media((split_part(name, '/', 2))::UUID)")

      expect(sql).toContain('CREATE POLICY "family_media_update_policy"')
      expect(sql).toContain('CREATE POLICY "family_media_delete_policy"')

      // Crucial: Must NOT alter avatars policies
      expect(sql).not.toContain('DROP POLICY IF EXISTS "avatars_select_policy"')
      expect(sql).not.toContain('DROP POLICY IF EXISTS "avatars_insert_policy"')
    })
  })

  describe('Authoritative RPCs and Audit Logging', () => {
    it('implements create_family_album, register_family_media, soft_delete_family_media, create_family_story', () => {
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_family_album')
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.register_family_media')
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.soft_delete_family_media')
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_family_story')
      expect(sql).toContain('PERFORM public.log_audit_event')
      // Validates canonical family-media namespace in RPC
      expect(sql).toContain(
        "p_storage_path !~ ('^family-media/families/' || p_family_id::TEXT || '/media/' || p_media_id::TEXT || '/[^/]+$')"
      )
    })
  })

  describe('Table RLS Direct Mutation Deny Policies', () => {
    it('blocks direct client INSERT/UPDATE/DELETE on family tables, routing all mutations to RPCs', () => {
      expect(sql).toContain('CREATE POLICY "family_albums_insert_policy"\n  ON public.family_albums\n  FOR INSERT\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_albums_update_policy"\n  ON public.family_albums\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_albums_delete_policy"\n  ON public.family_albums\n  FOR DELETE\n  USING (FALSE);')

      expect(sql).toContain('CREATE POLICY "family_media_insert_policy"\n  ON public.family_media\n  FOR INSERT\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_media_update_policy"\n  ON public.family_media\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_media_delete_policy"\n  ON public.family_media\n  FOR DELETE\n  USING (FALSE);')

      expect(sql).toContain('CREATE POLICY "family_stories_insert_policy"\n  ON public.family_stories\n  FOR INSERT\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_stories_update_policy"\n  ON public.family_stories\n  FOR UPDATE\n  USING (FALSE)\n  WITH CHECK (FALSE);')
      expect(sql).toContain('CREATE POLICY "family_stories_delete_policy"\n  ON public.family_stories\n  FOR DELETE\n  USING (FALSE);')
    })
  })

  describe('Privilege Hardening', () => {
    it('revokes direct table mutations and grants SELECT only to authenticated', () => {
      expect(sql).toContain('REVOKE ALL ON TABLE public.family_albums, public.family_media, public.family_stories FROM PUBLIC, anon;')
      expect(sql).toContain('GRANT SELECT ON TABLE public.family_albums TO authenticated;')
      expect(sql).toContain('GRANT SELECT ON TABLE public.family_media TO authenticated;')
      expect(sql).toContain('GRANT SELECT ON TABLE public.family_stories TO authenticated;')
      expect(sql).not.toContain('GRANT INSERT ON TABLE public.family_albums')
      expect(sql).not.toContain('GRANT UPDATE ON TABLE public.family_albums')
      expect(sql).not.toContain('GRANT INSERT ON TABLE public.family_media')
      expect(sql).not.toContain('GRANT UPDATE ON TABLE public.family_media')
      expect(sql).not.toContain('GRANT INSERT ON TABLE public.family_stories')
      expect(sql).not.toContain('GRANT UPDATE ON TABLE public.family_stories')

      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_family_album(UUID, TEXT, TEXT, public.privacy_level) FROM PUBLIC')
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.register_family_media')
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.soft_delete_family_media')
      expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_family_story')
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.can_read_family_item(UUID, public.privacy_level) TO authenticated, anon')
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.can_read_family_media_object(TEXT) TO authenticated, anon')
    })
  })
})
