/**
 * Family Media Service — Albums, Media & Family History
 *
 * Handles client-side storage uploads to the private 'avatars' bucket
 * under the canonical 'families/<family_id>/media/<media_id>/<filename>' namespace,
 * accompanied by authoritative RPC persistence and query functions.
 */

import { supabase } from '@/lib/supabase'
import type { ApiResponse } from '@/types'
import type {
  FamilyAlbum,
  FamilyMediaItem,
  FamilyStory,
  FamilyMediaType,
  MediaUploadOptions,
} from '../types'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

/**
 * Maps raw Supabase / PostgreSQL errors in media services to safe messages.
 */
function mapMediaError(message?: string, code?: string, fallback = 'An error occurred.'): string {
  if (code === '42501') {
    return 'You do not have permission to perform this media action.'
  }
  if (code === '23505') {
    return 'A duplicate media record already exists.'
  }
  if (code === '23503') {
    return 'Referenced record was not found.'
  }
  const lower = (message ?? '').toLowerCase()
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error. Please check your connection and try again.'
  }
  return message && !message.includes('relation') && !message.includes('syntax')
    ? message
    : fallback
}

export const FAMILY_MEDIA_BUCKET = 'family-media'

export const ALLOWED_MEDIA_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]

export const MAX_MEDIA_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

/**
 * Extracts relative storage path from a canonical family-media path or Supabase URL.
 */
export function extractFamilyMediaPath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null

  // If path starts with canonical bucket prefix: family-media/...
  if (urlOrPath.startsWith(`${FAMILY_MEDIA_BUCKET}/`)) {
    return urlOrPath.slice(`${FAMILY_MEDIA_BUCKET}/`.length).split('?')[0]
  }

  // If path starts with families/...
  if (urlOrPath.startsWith('families/')) {
    return urlOrPath.split('?')[0]
  }

  // If full URL containing /family-media/
  const marker = `/${FAMILY_MEDIA_BUCKET}/`
  const index = urlOrPath.indexOf(marker)
  if (index === -1) return null
  return urlOrPath.slice(index + marker.length).split('?')[0]
}

/**
 * Resolves a stored family media reference into a temporary signed URL (1 hour expiry).
 */
export async function resolveFamilyMediaUrl(
  pathOrUrl: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!pathOrUrl) return null

  const relativePath = extractFamilyMediaPath(pathOrUrl)
  if (!relativePath) return null

  const { data, error } = await supabase.storage
    .from(FAMILY_MEDIA_BUCKET)
    .createSignedUrl(relativePath, expiresIn)

  if (error || !data) {
    return null
  }

  return data.signedUrl
}

/**
 * Resolves an array of stored family media references into signed URLs in a single batch Storage request.
 * Returns a Map keyed by the original input string, mapped to the resolved temporary signed URL.
 */
export async function resolveFamilyMediaUrls(
  pathsOrUrls: Array<string | null | undefined>,
  expiresIn = 3600
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!pathsOrUrls || pathsOrUrls.length === 0) return result

  const uniqueRelativePaths: string[] = []
  const relativeToOriginals = new Map<string, string[]>()

  for (const raw of pathsOrUrls) {
    if (!raw) continue
    const rel = extractFamilyMediaPath(raw)
    if (!rel) continue

    const existing = relativeToOriginals.get(rel)
    if (existing) {
      existing.push(raw)
    } else {
      relativeToOriginals.set(rel, [raw])
      uniqueRelativePaths.push(rel)
    }
  }

  if (uniqueRelativePaths.length === 0) return result

  const storageBucket = supabase.storage.from(FAMILY_MEDIA_BUCKET)
  if (typeof storageBucket.createSignedUrls === 'function') {
    const { data, error } = await storageBucket.createSignedUrls(uniqueRelativePaths, expiresIn)
    if (!error && Array.isArray(data)) {
      for (const item of data) {
        const signed = item.signedUrl || (item as { signedURL?: string | null }).signedURL
        if (item.path && signed) {
          const originals = relativeToOriginals.get(item.path) || []
          for (const orig of originals) {
            result.set(orig, signed)
          }
        }
      }
      return result
    }
  }

  // Graceful fallback for mock environments or when createSignedUrls is not provided
  await Promise.all(
    uniqueRelativePaths.map(async (rel) => {
      const { data } = await storageBucket.createSignedUrl(rel, expiresIn)
      if (data?.signedUrl) {
        const originals = relativeToOriginals.get(rel) || []
        for (const orig of originals) {
          result.set(orig, data.signedUrl)
        }
      }
    })
  )

  return result
}

/**
 * Validates a media file before upload.
 */
export function validateMediaFile(
  file: File | Blob,
  options?: MediaUploadOptions
): { valid: boolean; error?: string } {
  const maxSize = options?.maxSizeBytes ?? MAX_MEDIA_FILE_SIZE
  const allowedTypes = options?.allowedMimeTypes ?? ALLOWED_MEDIA_MIMES

  if (file.size > maxSize) {
    const sizeMb = (maxSize / (1024 * 1024)).toFixed(0)
    return { valid: false, error: `File size exceeds the maximum allowed limit (${sizeMb}MB).` }
  }

  if (file.type && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type (${file.type}). Allowed formats: JPEG, PNG, WebP, GIF, PDF.`,
    }
  }

  return { valid: true }
}

/**
 * Sanitize a filename to only alphanumeric characters, dashes, and dots.
 */
export function sanitizeFilename(filename: string): string {
  const parts = filename.split('.')
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() : ''
  const base = parts.join('_').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50)
  return ext ? `${base}.${ext}` : base || 'file'
}

/**
 * Fetch all albums for a family.
 */
export async function getFamilyAlbums(familyId: string): Promise<ApiResponse<FamilyAlbum[]>> {
  const { data, error } = await supabase
    .from('family_albums')
    .select('id, family_id, title, description, privacy_level, cover_media_id, created_by, created_at, updated_at')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return {
      data: null,
      error: {
        message: error.message || 'Failed to fetch family albums.',
        code: error.code,
      },
    }
  }

  return {
    data: (data || []) as FamilyAlbum[],
    error: null,
  }
}

/**
 * Create a new album for a family via RPC.
 */
export async function createFamilyAlbum(
  familyId: string,
  title: string,
  description?: string,
  privacyLevel: 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE' = 'FAMILY'
): Promise<ApiResponse<{ album_id: string }>> {
  const sanitizedTitle = sanitizeText(title)
  const sanitizedDescription = description ? sanitizeMultilineText(description) : null

  const { data, error } = await supabase.rpc('create_family_album', {
    p_family_id: familyId,
    p_title: sanitizedTitle,
    p_description: sanitizedDescription,
    p_privacy_level: privacyLevel,
  })

  if (error) {
    return {
      data: null,
      error: {
        message: mapMediaError(error.message, error.code, 'Failed to create album.'),
        code: error.code,
      },
    }
  }

  const result = data as { album_id: string }
  return {
    data: result,
    error: null,
  }
}

/**
 * Fetch media items for a family or specific album.
 */
export async function getFamilyMedia(
  familyId: string,
  albumId?: string | null
): Promise<ApiResponse<FamilyMediaItem[]>> {
  let query = supabase
    .from('family_media')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)

  if (albumId !== undefined) {
    if (albumId === null) {
      query = query.is('album_id', null)
    } else {
      query = query.eq('album_id', albumId)
    }
  }

  const { data, error } = await query.order('display_order', { ascending: true }).order('created_at', { ascending: false })

  if (error) {
    return {
      data: null,
      error: {
        message: mapMediaError(error.message, error.code, 'Failed to fetch family media.'),
        code: error.code,
      },
    }
  }

  // Batch resolve signed URLs for all media items in a single Storage request (eliminates N+1)
  const paths = (data || []).map((item) => item.storage_object_path)
  const resolvedMap = await resolveFamilyMediaUrls(paths)

  const items: FamilyMediaItem[] = (data || []).map((item) => ({
    ...(item as FamilyMediaItem),
    resolved_url: item.storage_object_path
      ? resolvedMap.get(item.storage_object_path) ?? null
      : null,
  }))

  return {
    data: items,
    error: null,
  }
}

/**
 * Upload a media file and register its metadata via RPC.
 */
export async function uploadFamilyMedia(
  familyId: string,
  file: File,
  options?: {
    albumId?: string | null
    caption?: string
    description?: string
    mediaType?: FamilyMediaType
  }
): Promise<ApiResponse<FamilyMediaItem>> {
  // 1. Validation
  const validation = validateMediaFile(file)
  if (!validation.valid) {
    return {
      data: null,
      error: {
        message: validation.error || 'Invalid file.',
        code: 'VALIDATION_ERROR',
      },
    }
  }

  // 2. Generate UUID for media item and storage path
  const mediaId = crypto.randomUUID()
  const cleanName = sanitizeFilename(file.name)
  const relativeStoragePath = `families/${familyId}/media/${mediaId}/${cleanName}`
  const canonicalPath = `${FAMILY_MEDIA_BUCKET}/${relativeStoragePath}`

  const mediaType: FamilyMediaType =
    options?.mediaType ?? (file.type === 'application/pdf' ? 'DOCUMENT' : 'PHOTO')

  const sanitizedCaption = options?.caption ? sanitizeText(options.caption) : null
  const sanitizedDescription = options?.description ? sanitizeMultilineText(options.description) : null

  // 3. Upload to storage
  const { error: storageError } = await supabase.storage
    .from(FAMILY_MEDIA_BUCKET)
    .upload(relativeStoragePath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (storageError) {
    return {
      data: null,
      error: {
        message: mapMediaError(storageError.message, (storageError as { statusCode?: string }).statusCode, 'Failed to upload media to storage.'),
        code: (storageError as { statusCode?: string }).statusCode ?? 'STORAGE_ERROR',
      },
    }
  }

  // 4. Register metadata via RPC
  const { error: rpcError } = await supabase.rpc('register_family_media', {
    p_family_id: familyId,
    p_album_id: options?.albumId ?? null,
    p_media_id: mediaId,
    p_storage_path: canonicalPath,
    p_media_type: mediaType,
    p_original_filename: file.name,
    p_mime_type: file.type,
    p_file_size: file.size,
    p_caption: sanitizedCaption,
    p_description: sanitizedDescription,
  })

  if (rpcError) {
    // Rollback storage upload to avoid orphan objects
    await supabase.storage.from(FAMILY_MEDIA_BUCKET).remove([relativeStoragePath]).catch(() => {})
    return {
      data: null,
      error: {
        message: mapMediaError(rpcError.message, rpcError.code, 'Failed to register media record in database.'),
        code: rpcError.code ?? 'RPC_ERROR',
      },
    }
  }

  const resolvedUrl = await resolveFamilyMediaUrl(canonicalPath)

  return {
    data: {
      id: mediaId,
      family_id: familyId,
      album_id: options?.albumId ?? null,
      storage_object_path: canonicalPath,
      media_type: mediaType,
      original_filename: file.name,
      mime_type: file.type,
      file_size: file.size,
      caption: sanitizedCaption,
      description: sanitizedDescription,
      display_order: 1,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      resolved_url: resolvedUrl,
    },
    error: null,
  }
}

/**
 * Soft delete a family media item via RPC.
 */
export async function deleteFamilyMedia(mediaId: string): Promise<ApiResponse<boolean>> {
  const { error } = await supabase.rpc('soft_delete_family_media', {
    p_media_id: mediaId,
  })

  if (error) {
    return {
      data: null,
      error: {
        message: mapMediaError(error.message, error.code, 'Failed to delete media record.'),
        code: error.code,
      },
    }
  }

  return {
    data: true,
    error: null,
  }
}

/**
 * Fetch all stories for a family.
 */
export async function getFamilyStories(familyId: string): Promise<ApiResponse<FamilyStory[]>> {
  const { data, error } = await supabase
    .from('family_stories')
    .select('*')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    return {
      data: null,
      error: {
        message: mapMediaError(error.message, error.code, 'Failed to fetch family stories.'),
        code: error.code,
      },
    }
  }

  return {
    data: (data || []) as FamilyStory[],
    error: null,
  }
}

/**
 * Create a new family story via RPC.
 */
export async function createFamilyStory(
  familyId: string,
  title: string,
  content: string,
  summary?: string,
  privacyLevel: 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE' = 'FAMILY',
  featuredMediaId?: string | null
): Promise<ApiResponse<{ story_id: string }>> {
  const sanitizedTitle = sanitizeText(title)
  const sanitizedContent = sanitizeMultilineText(content)
  const sanitizedSummary = summary ? sanitizeMultilineText(summary) : null

  const { data, error } = await supabase.rpc('create_family_story', {
    p_family_id: familyId,
    p_title: sanitizedTitle,
    p_content: sanitizedContent,
    p_summary: sanitizedSummary,
    p_privacy_level: privacyLevel,
    p_featured_media_id: featuredMediaId ?? null,
  })

  if (error) {
    return {
      data: null,
      error: {
        message: mapMediaError(error.message, error.code, 'Failed to create story.'),
        code: error.code,
      },
    }
  }

  const result = data as { story_id: string }
  return {
    data: result,
    error: null,
  }
}
