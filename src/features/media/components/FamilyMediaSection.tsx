/**
 * FamilyMediaSection Component
 *
 * Integrated UI for family photo albums, media archives, and oral history.
 * Respects backend RLS, dynamically resolves private signed URLs without
 * persisting them, and orchestrates mutations through authoritative RPCs.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderPlus,
  Image as ImageIcon,
  BookOpen,
  Plus,
  Calendar,
  FileText,
  Lock,
  Globe,
  Users,
  Shield,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import type { FamilyAlbum, FamilyMediaItem, FamilyStory } from '../types'
import {
  getFamilyAlbums,
  getFamilyMedia,
  getFamilyStories,
} from '../services/familyMedia.service'
import { formatFileSize, formatMediaDate } from '../utils/image.utils'
import { MediaViewerModal } from './MediaViewerModal'
import { MediaUploadModal } from './MediaUploadModal'
import { AlbumCreateModal } from './AlbumCreateModal'
import { StoryViewerModal } from './StoryViewerModal'
import { StoryCreateModal } from './StoryCreateModal'

interface FamilyMediaSectionProps {
  familyId: string
  canManage?: boolean
  initialTab?: 'albums' | 'stories'
}

type FilterSelection = 'all' | 'unassigned' | string // 'all', 'unassigned', or album.id

const PRIVACY_ICONS = {
  PUBLIC: Globe,
  COMMUNITY: Users,
  FAMILY: Shield,
  PRIVATE: Lock,
}

export function FamilyMediaSection({
  familyId,
  canManage = false,
  initialTab = 'albums',
}: FamilyMediaSectionProps) {
  const [activeTab, setActiveTab] = useState<'albums' | 'stories'>(initialTab)
  const [albums, setAlbums] = useState<FamilyAlbum[]>([])
  const [allFamilyMedia, setAllFamilyMedia] = useState<FamilyMediaItem[]>([])
  const [displayedMedia, setDisplayedMedia] = useState<FamilyMediaItem[]>([])
  const [stories, setStories] = useState<FamilyStory[]>([])
  const [selectedFilter, setSelectedFilter] = useState<FilterSelection>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isMediaLoading, setIsMediaLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Modals state
  const [viewingMedia, setViewingMedia] = useState<FamilyMediaItem | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [isNewAlbumOpen, setIsNewAlbumOpen] = useState(false)
  const [viewingStory, setViewingStory] = useState<FamilyStory | null>(null)
  const [isNewStoryOpen, setIsNewStoryOpen] = useState(false)

  // Load albums, all media, and stories
  const loadInitialData = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const [albumRes, storyRes, mediaRes] = await Promise.all([
      getFamilyAlbums(familyId),
      getFamilyStories(familyId),
      getFamilyMedia(familyId, undefined), // Fetch all media for accurate counts & initial view
    ])

    if (albumRes.data) setAlbums(albumRes.data)
    if (storyRes.data) setStories(storyRes.data)
    if (mediaRes.data) {
      setAllFamilyMedia(mediaRes.data)
      setDisplayedMedia(mediaRes.data)
    }

    if (albumRes.error || storyRes.error || mediaRes.error) {
      setErrorMessage(
        albumRes.error?.message ||
          storyRes.error?.message ||
          mediaRes.error?.message ||
          'Failed to load family media archives.'
      )
    }

    setIsLoading(false)
  }, [familyId])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  // Filter media when selection changes
  const handleFilterChange = useCallback(
    async (filter: FilterSelection) => {
      setSelectedFilter(filter)
      setIsMediaLoading(true)

      let targetAlbumId: string | null | undefined
      if (filter === 'all') {
        targetAlbumId = undefined
      } else if (filter === 'unassigned') {
        targetAlbumId = null
      } else {
        targetAlbumId = filter
      }

      const res = await getFamilyMedia(familyId, targetAlbumId)
      if (res.data) {
        setDisplayedMedia(res.data)
        // If we fetched all, update allFamilyMedia cache as well
        if (filter === 'all') {
          setAllFamilyMedia(res.data)
        }
      } else if (res.error) {
        setErrorMessage(res.error.message || 'Failed to load media items.')
      }

      setIsMediaLoading(false)
    },
    [familyId]
  )

  // Compute item count per album from cached allFamilyMedia
  const albumCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: allFamilyMedia.length,
      unassigned: 0,
    }

    for (const item of allFamilyMedia) {
      if (!item.album_id) {
        counts.unassigned += 1
      } else {
        counts[item.album_id] = (counts[item.album_id] || 0) + 1
      }
    }

    return counts
  }, [allFamilyMedia])

  // Selected album object (if an album is selected)
  const currentAlbum = useMemo(() => {
    if (selectedFilter === 'all' || selectedFilter === 'unassigned') return null
    return albums.find((a) => a.id === selectedFilter) || null
  }, [albums, selectedFilter])

  // Attach featured media to stories
  const enrichedStories = useMemo(() => {
    const mediaMap = new Map<string, FamilyMediaItem>()
    for (const m of allFamilyMedia) {
      mediaMap.set(m.id, m)
    }

    return stories.map((s) => ({
      ...s,
      featured_media: s.featured_media_id ? mediaMap.get(s.featured_media_id) || null : null,
    }))
  }, [stories, allFamilyMedia])

  return (
    <section aria-labelledby="family-media-heading" className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-navy-100 pb-4">
        <div>
          <h3 id="family-media-heading" className="text-lg font-semibold text-navy-900">
            Family Media & History
          </h3>
          <p className="text-sm text-navy-500">
            Cherished family albums, historical documents, and preserved stories.
          </p>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex rounded-lg bg-navy-100/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('albums')}
            className={[
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-500',
              activeTab === 'albums'
                ? 'bg-white text-navy-900 shadow-xs font-semibold'
                : 'text-navy-600 hover:text-navy-900',
            ].join(' ')}
          >
            <ImageIcon className="h-4 w-4 text-brand-600" />
            <span>Albums & Photos</span>
            {allFamilyMedia.length > 0 && (
              <span className="rounded-full bg-navy-100 px-1.5 py-0.2 text-[10px] font-semibold text-navy-600">
                {allFamilyMedia.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stories')}
            className={[
              'flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-brand-500',
              activeTab === 'stories'
                ? 'bg-white text-navy-900 shadow-xs font-semibold'
                : 'text-navy-600 hover:text-navy-900',
            ].join(' ')}
          >
            <BookOpen className="h-4 w-4 text-brand-600" />
            <span>Family History & Stories</span>
            {stories.length > 0 && (
              <span className="rounded-full bg-navy-100 px-1.5 py-0.2 text-[10px] font-semibold text-navy-600">
                {stories.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs text-red-700"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-500 hover:text-red-800 ml-2 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-navy-500">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mb-2" />
          <p>Loading family archives…</p>
        </div>
      ) : activeTab === 'albums' ? (
        /* Albums & Media Tab */
        <div className="space-y-5">
          {/* Action and Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Album Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
              <button
                type="button"
                onClick={() => handleFilterChange('all')}
                className={[
                  'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-500',
                  selectedFilter === 'all'
                    ? 'bg-brand-600 text-white'
                    : 'bg-navy-100 text-navy-700 hover:bg-navy-200',
                ].join(' ')}
              >
                <span>All Photos</span>
                <span
                  className={[
                    'rounded-full px-1.5 py-0.2 text-[10px]',
                    selectedFilter === 'all'
                      ? 'bg-brand-700 text-white'
                      : 'bg-navy-200 text-navy-600',
                  ].join(' ')}
                >
                  {albumCounts.all ?? 0}
                </span>
              </button>

              {albumCounts.unassigned > 0 && (
                <button
                  type="button"
                  onClick={() => handleFilterChange('unassigned')}
                  className={[
                    'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-500',
                    selectedFilter === 'unassigned'
                      ? 'bg-brand-600 text-white'
                      : 'bg-navy-100 text-navy-700 hover:bg-navy-200',
                  ].join(' ')}
                >
                  <span>Unassigned</span>
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.2 text-[10px]',
                      selectedFilter === 'unassigned'
                        ? 'bg-brand-700 text-white'
                        : 'bg-navy-200 text-navy-600',
                    ].join(' ')}
                  >
                    {albumCounts.unassigned}
                  </span>
                </button>
              )}

              {albums.map((album) => {
                const count = albumCounts[album.id] ?? 0
                const isSelected = selectedFilter === album.id
                return (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => handleFilterChange(album.id)}
                    className={[
                      'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-brand-500',
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : 'bg-navy-100 text-navy-700 hover:bg-navy-200',
                    ].join(' ')}
                  >
                    <span>{album.title}</span>
                    <span
                      className={[
                        'rounded-full px-1.5 py-0.2 text-[10px]',
                        isSelected
                          ? 'bg-brand-700 text-white'
                          : 'bg-navy-200 text-navy-600',
                      ].join(' ')}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Manager Actions */}
            {canManage && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsNewAlbumOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <FolderPlus className="h-4 w-4" />
                  <span>New Album</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsUploadOpen(true)}
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Upload Photo/Doc</span>
                </Button>
              </div>
            )}
          </div>

          {/* Album Info Banner (if a specific album is selected) */}
          {currentAlbum && (
            <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-navy-900">{currentAlbum.title}</h4>
                  {currentAlbum.description && (
                    <p className="mt-0.5 text-xs text-navy-600">{currentAlbum.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white border border-navy-200 px-2 py-0.5 text-[11px] font-medium text-navy-600 shadow-2xs">
                    <Shield className="h-3 w-3 text-navy-400" />
                    <span>{currentAlbum.privacy_level}</span>
                  </span>
                  <span className="text-xs text-navy-500">
                    {displayedMedia.length} {displayedMedia.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Media Grid */}
          {isMediaLoading ? (
            <div className="py-12 text-center text-xs text-navy-400">Updating photos…</div>
          ) : displayedMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
              <ImageIcon className="h-10 w-10 text-navy-300 mb-2" />
              <h4 className="text-sm font-semibold text-navy-800">
                {currentAlbum ? 'This album has no items yet' : 'No photos or documents yet'}
              </h4>
              <p className="mt-1 max-w-sm text-xs text-navy-500">
                {currentAlbum
                  ? 'Add pictures, letters, or certificates directly to this collection.'
                  : 'Preserve family moments by uploading photographs and historical documents.'}
              </p>
              {canManage && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsUploadOpen(true)}
                  className="mt-4"
                >
                  <Plus className="h-4 w-4" />
                  <span>Upload First Photo</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {displayedMedia.map((item) => {
                const isPdf = item.mime_type === 'application/pdf'
                return (
                  <div
                    key={item.id}
                    onClick={() => setViewingMedia(item)}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-navy-200 bg-white shadow-2xs hover:shadow-md transition-all cursor-pointer focus-within:ring-2 focus-within:ring-brand-500"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${item.caption || item.original_filename}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setViewingMedia(item)
                      }
                    }}
                  >
                    {/* Media Thumbnail */}
                    <div className="relative aspect-square w-full bg-navy-100 overflow-hidden flex items-center justify-center">
                      {isPdf ? (
                        <div className="flex flex-col items-center justify-center p-3 text-center">
                          <div className="h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 mb-1">
                            <FileText className="h-6 w-6" />
                          </div>
                          <span className="text-[11px] font-semibold text-navy-700 line-clamp-1 max-w-full px-1">
                            PDF Document
                          </span>
                        </div>
                      ) : item.resolved_url ? (
                        <img
                          src={item.resolved_url}
                          alt={item.caption || item.original_filename}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-navy-300">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}

                      {/* PDF Overlay badge */}
                      {isPdf && (
                        <span className="absolute top-2 left-2 rounded bg-navy-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white tracking-wider">
                          PDF
                        </span>
                      )}
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-col justify-between p-2.5 flex-1 bg-white">
                      <p className="text-xs font-semibold text-navy-900 truncate" title={item.caption || item.original_filename}>
                        {item.caption || item.original_filename}
                      </p>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-navy-400">
                        <span>{formatMediaDate(item.created_at)}</span>
                        <span>{formatFileSize(item.file_size)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Stories Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-navy-400">
              Family Oral Histories & Memoirs ({stories.length})
            </h4>
            {canManage && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsNewStoryOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Write Family Story</span>
              </Button>
            )}
          </div>

          {enrichedStories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-navy-200 bg-navy-50/40 p-10 text-center">
              <BookOpen className="h-10 w-10 text-navy-300 mb-2" />
              <h4 className="text-sm font-semibold text-navy-800">
                No family stories recorded yet
              </h4>
              <p className="mt-1 max-w-sm text-xs text-navy-500">
                Record your family’s ancestral origins, memoirs, journeys, and memorable achievements.
              </p>
              {canManage && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsNewStoryOpen(true)}
                  className="mt-4"
                >
                  <Plus className="h-4 w-4" />
                  <span>Write First Story</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {enrichedStories.map((story) => {
                const PrivacyIcon = PRIVACY_ICONS[story.privacy_level] ?? Shield
                return (
                  <article
                    key={story.id}
                    className="flex flex-col justify-between rounded-xl border border-navy-200 bg-white p-5 shadow-2xs hover:shadow-sm transition-shadow"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <h5 className="text-base font-bold text-navy-900 leading-snug">
                          {story.title}
                        </h5>
                        <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[10px] font-medium text-navy-600 flex-shrink-0">
                          <PrivacyIcon className="h-3 w-3" />
                          <span>{story.privacy_level}</span>
                        </span>
                      </div>

                      {/* Featured media thumbnail if present */}
                      {story.featured_media?.resolved_url && (
                        <div className="h-32 w-full rounded-lg overflow-hidden bg-navy-100">
                          <img
                            src={story.featured_media.resolved_url}
                            alt={story.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      )}

                      {/* Summary */}
                      {story.summary && (
                        <p className="rounded-lg bg-brand-50/80 p-2.5 text-xs font-medium text-brand-800 leading-relaxed">
                          {story.summary}
                        </p>
                      )}

                      {/* Content snippet (pure text) */}
                      <p className="text-xs text-navy-600 line-clamp-3 leading-relaxed">
                        {story.content}
                      </p>
                    </div>

                    <div className="mt-4 flex items-center justify-between pt-3 border-t border-navy-100">
                      <span className="flex items-center gap-1 text-[11px] text-navy-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatMediaDate(story.created_at)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setViewingStory(story)}
                        className="text-xs font-semibold flex items-center gap-1"
                      >
                        <span>Read Story</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {viewingMedia && (
        <MediaViewerModal
          isOpen={!!viewingMedia}
          onClose={() => setViewingMedia(null)}
          mediaItem={viewingMedia}
          canManage={canManage}
          onDeleted={(deletedId) => {
            setAllFamilyMedia((prev) => prev.filter((m) => m.id !== deletedId))
            setDisplayedMedia((prev) => prev.filter((m) => m.id !== deletedId))
          }}
        />
      )}

      {isUploadOpen && (
        <MediaUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          familyId={familyId}
          albums={albums}
          defaultAlbumId={currentAlbum?.id ?? null}
          onSuccess={(newItem) => {
            // Update media lists
            setAllFamilyMedia((prev) => [newItem, ...prev])
            if (
              selectedFilter === 'all' ||
              selectedFilter === newItem.album_id ||
              (selectedFilter === 'unassigned' && !newItem.album_id)
            ) {
              setDisplayedMedia((prev) => [newItem, ...prev])
            }
          }}
        />
      )}

      {isNewAlbumOpen && (
        <AlbumCreateModal
          isOpen={isNewAlbumOpen}
          onClose={() => setIsNewAlbumOpen(false)}
          familyId={familyId}
          onSuccess={(newAlbumId) => {
            // Reload albums and select the new album
            getFamilyAlbums(familyId).then((res) => {
              if (res.data) {
                setAlbums(res.data)
                handleFilterChange(newAlbumId)
              }
            })
          }}
        />
      )}

      {viewingStory && (
        <StoryViewerModal
          isOpen={!!viewingStory}
          onClose={() => setViewingStory(null)}
          story={viewingStory}
        />
      )}

      {isNewStoryOpen && (
        <StoryCreateModal
          isOpen={isNewStoryOpen}
          onClose={() => setIsNewStoryOpen(false)}
          familyId={familyId}
          availableMedia={allFamilyMedia}
          onSuccess={() => {
            getFamilyStories(familyId).then((res) => {
              if (res.data) setStories(res.data)
            })
          }}
        />
      )}
    </section>
  )
}
