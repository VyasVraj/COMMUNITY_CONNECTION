/**
 * Unit Tests: Family Media & History Modals (Phase 11 — Subtask 3)
 * Tests coverage for:
 * - MediaViewerModal
 * - MediaUploadModal
 * - AlbumCreateModal
 * - StoryViewerModal
 * - StoryCreateModal
 */

import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MediaViewerModal } from '@/features/media/components/MediaViewerModal'
import { MediaUploadModal } from '@/features/media/components/MediaUploadModal'
import { AlbumCreateModal } from '@/features/media/components/AlbumCreateModal'
import { StoryViewerModal } from '@/features/media/components/StoryViewerModal'
import { StoryCreateModal } from '@/features/media/components/StoryCreateModal'
import type { FamilyAlbum, FamilyMediaItem, FamilyStory } from '@/features/media/types'

vi.mock('@/features/media/services/familyMedia.service', () => ({
  createFamilyAlbum: vi.fn().mockResolvedValue({ data: 'album-1', error: null }),
  uploadFamilyMedia: vi.fn().mockResolvedValue({ data: {}, error: null }),
  deleteFamilyMedia: vi.fn().mockResolvedValue({ data: true, error: null }),
  createFamilyStory: vi.fn().mockResolvedValue({ data: 'story-1', error: null }),
}))

describe('Family Media & History Modals', () => {
  const familyId = '11111111-1111-1111-1111-111111111111'

  const mockPhoto: FamilyMediaItem = {
    id: 'media-1',
    family_id: familyId,
    album_id: 'album-1',
    storage_object_path: 'families/family-1/photos/photo.webp',
    media_type: 'PHOTO',
    original_filename: 'wedding_photo.webp',
    mime_type: 'image/webp',
    file_size: 524288,
    caption: 'Great Grandfather Wedding',
    description: 'Taken in 1948 in ancestral village.',
    display_order: 1,
    uploaded_by: 'user-1',
    created_at: '2026-10-15T12:00:00Z',
    updated_at: '2026-10-15T12:00:00Z',
    resolved_url: 'https://storage.supabase.co/signed/photo.webp',
  }

  const mockPdf: FamilyMediaItem = {
    id: 'media-2',
    family_id: familyId,
    album_id: null,
    storage_object_path: 'families/family-1/documents/record.pdf',
    media_type: 'DOCUMENT',
    original_filename: 'ancestral_deed.pdf',
    mime_type: 'application/pdf',
    file_size: 2097152,
    caption: 'Ancestral Land Deed',
    description: 'Original title deed copy.',
    display_order: 2,
    uploaded_by: 'user-1',
    created_at: '2026-10-15T13:00:00Z',
    updated_at: '2026-10-15T13:00:00Z',
    resolved_url: 'https://storage.supabase.co/signed/record.pdf',
  }

  const mockAlbum: FamilyAlbum = {
    id: 'album-1',
    family_id: familyId,
    title: 'Heritage Portraits',
    description: 'Generational portraits',
    privacy_level: 'FAMILY',
    cover_media_id: null,
    created_by: 'user-1',
    created_at: '2026-10-15T10:00:00Z',
    updated_at: '2026-10-15T10:00:00Z',
  }

  const mockStory: FamilyStory = {
    id: 'story-1',
    family_id: familyId,
    title: 'The Great Migration of 1952',
    summary: 'A short account of the family relocating to the city.',
    content: 'In late autumn of 1952, our great-grandparents traveled by train.\n\nThey started with only two wooden trunks.',
    author_id: 'user-1',
    privacy_level: 'FAMILY',
    featured_media_id: 'media-1',
    created_at: '2026-10-15T14:00:00Z',
    updated_at: '2026-10-15T14:00:00Z',
    featured_media: mockPhoto,
  }

  describe('MediaViewerModal', () => {
    it('returns null when closed or mediaItem is null', () => {
      const closed = renderToStaticMarkup(
        <MediaViewerModal isOpen={false} onClose={vi.fn()} mediaItem={mockPhoto} />
      )
      expect(closed).toBe('')

      const noItem = renderToStaticMarkup(
        <MediaViewerModal isOpen={true} onClose={vi.fn()} mediaItem={null} />
      )
      expect(noItem).toBe('')
    })

    it('renders image viewer with metadata and delete button when canManage=true', () => {
      const html = renderToStaticMarkup(
        <MediaViewerModal isOpen={true} onClose={vi.fn()} mediaItem={mockPhoto} canManage={true} />
      )

      expect(html).toContain('Great Grandfather Wedding')
      expect(html).toContain('Taken in 1948 in ancestral village.')
      expect(html).toContain('PHOTO')
      expect(html).toContain('512.0 KB')
      expect(html).toContain('Delete')
      expect(html).toContain('src="https://storage.supabase.co/signed/photo.webp"')
    })

    it('renders PDF document preview and hides delete button when canManage=false', () => {
      const html = renderToStaticMarkup(
        <MediaViewerModal isOpen={true} onClose={vi.fn()} mediaItem={mockPdf} canManage={false} />
      )

      expect(html).toContain('Ancestral Land Deed')
      expect(html).toContain('Original title deed copy.')
      expect(html).toContain('PDF Document')
      expect(html).toContain('2.0 MB')
      expect(html).toContain('Open / Download PDF')
      expect(html).toContain('target="_blank"')
      expect(html).toContain('rel="noopener noreferrer"')
      expect(html).not.toContain('Delete')
    })
  })

  describe('MediaUploadModal', () => {
    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <MediaUploadModal
          isOpen={false}
          onClose={vi.fn()}
          familyId={familyId}
          albums={[mockAlbum]}
          onSuccess={vi.fn()}
        />
      )
      expect(html).toBe('')
    })

    it('renders drag & drop zone, albums selector, and size limit notice', () => {
      const html = renderToStaticMarkup(
        <MediaUploadModal
          isOpen={true}
          onClose={vi.fn()}
          familyId={familyId}
          albums={[mockAlbum]}
          onSuccess={vi.fn()}
        />
      )

      expect(html).toContain('Upload Family Photo or Document')
      expect(html).toContain('Click to select or drag and drop file here')
      expect(html).toContain('JPEG, PNG, WEBP, GIF, or PDF (up to 20MB)')
      expect(html).toContain('Heritage Portraits')
      expect(html).toContain('Caption')
      expect(html).toContain('Description / Context')
      expect(html).toContain('Upload Media')
    })
  })

  describe('AlbumCreateModal', () => {
    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <AlbumCreateModal
          isOpen={false}
          onClose={vi.fn()}
          familyId={familyId}
          onSuccess={vi.fn()}
        />
      )
      expect(html).toBe('')
    })

    it('renders title input, description textarea, and privacy levels', () => {
      const html = renderToStaticMarkup(
        <AlbumCreateModal
          isOpen={true}
          onClose={vi.fn()}
          familyId={familyId}
          onSuccess={vi.fn()}
        />
      )

      expect(html).toContain('Create Photo Album')
      expect(html).toContain('Album Title')
      expect(html).toContain('Album Visibility')
      expect(html).toContain('FAMILY')
      expect(html).toContain('COMMUNITY')
      expect(html).toContain('PUBLIC')
      expect(html).toContain('PRIVATE')
      expect(html).toContain('Create Album')
    })
  })

  describe('StoryViewerModal', () => {
    it('returns null when closed or story is null', () => {
      const closed = renderToStaticMarkup(
        <StoryViewerModal isOpen={false} onClose={vi.fn()} story={mockStory} />
      )
      expect(closed).toBe('')

      const noStory = renderToStaticMarkup(
        <StoryViewerModal isOpen={true} onClose={vi.fn()} story={null} />
      )
      expect(noStory).toBe('')
    })

    it('renders story title, summary, narrative text and featured photo safely', () => {
      const storyWithMedia: FamilyStory = {
        ...mockStory,
        featured_media: {
          ...mockPhoto,
          caption: 'Great Grandfather Wedding',
          resolved_url: 'https://storage.supabase.co/signed/photo.webp',
        },
      }
      const html = renderToStaticMarkup(
        <StoryViewerModal isOpen={true} onClose={vi.fn()} story={storyWithMedia} />
      )

      expect(html).toContain('The Great Migration of 1952')
      expect(html).toContain('A short account of the family relocating to the city.')
      expect(html).toContain('In late autumn of 1952, our great-grandparents traveled by train.')
      expect(html).toContain('They started with only two wooden trunks.')
      expect(html).toContain('src="https://storage.supabase.co/signed/photo.webp"')
      // Verify no dangerouslySetInnerHTML attributes
      expect(html).not.toContain('dangerouslySetInnerHTML')
    })
  })

  describe('StoryCreateModal', () => {
    it('returns null when closed', () => {
      const html = renderToStaticMarkup(
        <StoryCreateModal
          isOpen={false}
          onClose={vi.fn()}
          familyId={familyId}
          onSuccess={vi.fn()}
        />
      )
      expect(html).toBe('')
    })

    it('renders title, summary, story text content, and featured photo picker', () => {
      const html = renderToStaticMarkup(
        <StoryCreateModal
          isOpen={true}
          onClose={vi.fn()}
          familyId={familyId}
          availableMedia={[mockPhoto, mockPdf]}
          onSuccess={vi.fn()}
        />
      )

      expect(html).toContain('Record Family History or Story')
      expect(html).toContain('Story Title')
      expect(html).toContain('Brief Summary')
      expect(html).toContain('Narrative Content')
      expect(html).toContain('Great Grandfather Wedding')
      expect(html).toContain('Attach Featured Photo')
      expect(html).toContain('Save Story')
    })
  })
})
