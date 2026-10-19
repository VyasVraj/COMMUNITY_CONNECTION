import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateMediaFile,
  sanitizeFilename,
  getFamilyAlbums,
  createFamilyAlbum,
  getFamilyMedia,
  uploadFamilyMedia,
  deleteFamilyMedia,
  getFamilyStories,
  createFamilyStory,
  resolveFamilyMediaUrls,
} from '@/features/media/services/familyMedia.service'
import { supabase } from '@/lib/supabase'

const mockUpload = vi.fn()
const mockRemove = vi.fn()
const mockCreateSignedUrl = vi.fn()
const mockCreateSignedUrls = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockOrder = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        remove: mockRemove,
        createSignedUrl: mockCreateSignedUrl,
        createSignedUrls: mockCreateSignedUrls,
      })),
    },
    from: vi.fn(() => ({
      select: mockSelect,
    })),
    rpc: vi.fn(),
  },
}))

describe('familyMedia.service unit tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockReset()
    mockRemove.mockReset()
    mockCreateSignedUrl.mockReset()
    mockCreateSignedUrls.mockReset()
    mockSelect.mockReset()
    mockEq.mockReset()
    mockIs.mockReset()
    mockOrder.mockReset()
    mockRpc.mockReset()

    // Default chaining setup for supabase.from
    mockSelect.mockReturnValue({ eq: mockEq })
    mockEq.mockReturnValue({ is: mockIs })
    mockIs.mockReturnValue({ order: mockOrder })
    mockOrder.mockReturnValue({ order: mockOrder, data: [], error: null })
  })

  describe('validateMediaFile', () => {
    it('approves standard image within 20MB limit', () => {
      const file = new File(['dummy-content'], 'photo.jpg', { type: 'image/jpeg' })
      const res = validateMediaFile(file)
      expect(res.valid).toBe(true)
      expect(res.error).toBeUndefined()
    })

    it('rejects file exceeding max size', () => {
      const file = { size: 25 * 1024 * 1024, type: 'image/png' } as File
      const res = validateMediaFile(file)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('exceeds the maximum allowed limit')
    })

    it('rejects file with unsupported MIME type', () => {
      const file = new File(['dummy'], 'virus.exe', { type: 'application/x-msdownload' })
      const res = validateMediaFile(file)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('Unsupported file type')
    })
  })

  describe('sanitizeFilename', () => {
    it('replaces dangerous characters with underscores while keeping extension', () => {
      expect(sanitizeFilename('../../evil..file.png')).toBe('______evil__file.png')
      expect(sanitizeFilename('Family Photo @ 2024.webp')).toBe('Family_Photo___2024.webp')
    })
  })

  describe('getFamilyAlbums', () => {
    it('returns family albums from database query', async () => {
      const fakeAlbums = [
        { id: 'album-1', family_id: 'fam-1', title: 'Summer Trip', privacy_level: 'FAMILY' },
      ]
      mockOrder.mockResolvedValueOnce({ data: fakeAlbums, error: null })

      const res = await getFamilyAlbums('fam-1')
      expect(res.error).toBeNull()
      expect(res.data).toEqual(fakeAlbums)
    })

    it('handles query error gracefully', async () => {
      mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'DB connection error', code: '500' } })

      const res = await getFamilyAlbums('fam-1')
      expect(res.data).toBeNull()
      expect(res.error?.message).toBe('DB connection error')
    })
  })

  describe('createFamilyAlbum', () => {
    it('invokes create_family_album RPC successfully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { album_id: 'new-album-uuid' },
        error: null,
      } as never)

      const res = await createFamilyAlbum('fam-1', 'Heritage Photos', 'A collection', 'FAMILY')
      expect(res.error).toBeNull()
      expect(res.data?.album_id).toBe('new-album-uuid')
      expect(supabase.rpc).toHaveBeenCalledWith('create_family_album', {
        p_family_id: 'fam-1',
        p_title: 'Heritage Photos',
        p_description: 'A collection',
        p_privacy_level: 'FAMILY',
      })
    })
  })

  describe('uploadFamilyMedia', () => {
    it('uploads to storage and registers metadata via register_family_media RPC', async () => {
      const file = new File(['content'], 'tree_photo.webp', { type: 'image/webp' })
      mockUpload.mockResolvedValueOnce({ data: { path: 'some-path' }, error: null })
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true, media_id: 'media-uuid' },
        error: null,
      } as never)
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: 'https://supabase.co/signed-url' },
        error: null,
      })

      const res = await uploadFamilyMedia('fam-1', file, { caption: 'Family gathering' })
      expect(res.error).toBeNull()
      expect(res.data?.family_id).toBe('fam-1')
      expect(res.data?.original_filename).toBe('tree_photo.webp')
      expect(mockUpload).toHaveBeenCalled()
      expect(supabase.rpc).toHaveBeenCalledWith('register_family_media', expect.objectContaining({
        p_family_id: 'fam-1',
        p_caption: 'Family gathering',
        p_media_type: 'PHOTO',
      }))
    })

    it('rolls back storage upload if metadata registration RPC fails', async () => {
      const file = new File(['content'], 'failed_photo.png', { type: 'image/png' })
      mockUpload.mockResolvedValueOnce({ data: { path: 'some-path' }, error: null })
      mockRemove.mockResolvedValueOnce({ data: [], error: null })
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'RPC Forbidden', code: 'P0003' },
      } as never)

      const res = await uploadFamilyMedia('fam-1', file)
      expect(res.data).toBeNull()
      expect(res.error?.message).toBe('RPC Forbidden')
      expect(mockRemove).toHaveBeenCalled()
    })
  })

  describe('resolveFamilyMediaUrls', () => {
    it('returns empty Map for empty input', async () => {
      const res = await resolveFamilyMediaUrls([])
      expect(res.size).toBe(0)
      expect(mockCreateSignedUrls).not.toHaveBeenCalled()
    })

    it('batches multiple media paths into a single createSignedUrls request', async () => {
      mockCreateSignedUrls.mockResolvedValueOnce({
        data: [
          { path: 'families/fam-1/media/m1/photo1.jpg', signedUrl: 'https://supabase.co/signed1' },
          { path: 'families/fam-1/media/m2/photo2.jpg', signedUrl: 'https://supabase.co/signed2' },
        ],
        error: null,
      })

      const paths = [
        'family-media/families/fam-1/media/m1/photo1.jpg',
        'families/fam-1/media/m2/photo2.jpg',
      ]
      const res = await resolveFamilyMediaUrls(paths)

      expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1)
      expect(mockCreateSignedUrls).toHaveBeenCalledWith(
        ['families/fam-1/media/m1/photo1.jpg', 'families/fam-1/media/m2/photo2.jpg'],
        3600
      )
      expect(res.get('family-media/families/fam-1/media/m1/photo1.jpg')).toBe('https://supabase.co/signed1')
      expect(res.get('families/fam-1/media/m2/photo2.jpg')).toBe('https://supabase.co/signed2')
    })

    it('falls back to createSignedUrl when createSignedUrls is unavailable or fails', async () => {
      mockCreateSignedUrls.mockResolvedValueOnce({ data: null, error: { message: 'Batch error' } })
      mockCreateSignedUrl.mockResolvedValueOnce({
        data: { signedUrl: 'https://supabase.co/fallback-signed' },
        error: null,
      })

      const res = await resolveFamilyMediaUrls(['families/fam-1/media/m1/photo.jpg'])
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('families/fam-1/media/m1/photo.jpg', 3600)
      expect(res.get('families/fam-1/media/m1/photo.jpg')).toBe('https://supabase.co/fallback-signed')
    })
  })

  describe('getFamilyMedia', () => {
    it('returns family media items with batch signed URLs', async () => {
      const fakeMedia = [
        { id: 'media-1', family_id: 'fam-1', storage_object_path: 'family-media/families/fam-1/media/m1/photo.jpg' },
        { id: 'media-2', family_id: 'fam-1', storage_object_path: 'family-media/families/fam-1/media/m2/photo2.jpg' },
      ]
      const secondOrderMock = vi.fn().mockResolvedValueOnce({ data: fakeMedia, error: null })
      mockOrder.mockReturnValueOnce({ order: secondOrderMock })
      mockCreateSignedUrls.mockResolvedValueOnce({
        data: [
          { path: 'families/fam-1/media/m1/photo.jpg', signedUrl: 'https://supabase.co/signed-1' },
          { path: 'families/fam-1/media/m2/photo2.jpg', signedUrl: 'https://supabase.co/signed-2' },
        ],
        error: null,
      })

      const res = await getFamilyMedia('fam-1')
      expect(res.error).toBeNull()
      expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1)
      expect(res.data?.[0].id).toBe('media-1')
      expect(res.data?.[0].resolved_url).toBe('https://supabase.co/signed-1')
      expect(res.data?.[1].id).toBe('media-2')
      expect(res.data?.[1].resolved_url).toBe('https://supabase.co/signed-2')
    })
  })

  describe('getFamilyStories', () => {
    it('returns family stories from database query', async () => {
      const fakeStories = [
        { id: 'story-1', family_id: 'fam-1', title: 'Our Roots' },
      ]
      mockOrder.mockResolvedValueOnce({ data: fakeStories, error: null })

      const res = await getFamilyStories('fam-1')
      expect(res.error).toBeNull()
      expect(res.data).toEqual(fakeStories)
    })
  })

  describe('deleteFamilyMedia', () => {
    it('invokes soft_delete_family_media RPC successfully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { success: true },
        error: null,
      } as never)

      const res = await deleteFamilyMedia('media-123')
      expect(res.error).toBeNull()
      expect(res.data).toBe(true)
      expect(supabase.rpc).toHaveBeenCalledWith('soft_delete_family_media', {
        p_media_id: 'media-123',
      })
    })
  })

  describe('createFamilyStory', () => {
    it('invokes create_family_story RPC successfully', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { story_id: 'story-uuid' },
        error: null,
      } as never)

      const res = await createFamilyStory('fam-1', 'Origins in Village', 'A detailed story of our origin...')
      expect(res.error).toBeNull()
      expect(res.data?.story_id).toBe('story-uuid')
      expect(supabase.rpc).toHaveBeenCalledWith('create_family_story', expect.objectContaining({
        p_family_id: 'fam-1',
        p_title: 'Origins in Village',
      }))
    })
  })
})
