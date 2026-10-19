/**
 * StoryCreateModal Component
 *
 * Accessible modal allowing authorized family managers to record
 * and preserve family history, oral narratives, and memoirs.
 */

import React, { useState, useEffect } from 'react'
import { X, BookOpen, AlertCircle } from 'lucide-react'
import type { FamilyMediaItem } from '../types'
import { createFamilyStory } from '../services/familyMedia.service'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface StoryCreateModalProps {
  isOpen: boolean
  onClose: () => void
  familyId: string
  availableMedia?: FamilyMediaItem[]
  onSuccess: (storyId: string) => void
}

export const StoryCreateModal: React.FC<StoryCreateModalProps> = ({
  isOpen,
  onClose,
  familyId,
  availableMedia = [],
  onSuccess,
}) => {
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [privacyLevel, setPrivacyLevel] = useState<'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE'>('FAMILY')
  const [featuredMediaId, setFeaturedMediaId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Filter image media for featured selection
  const photoItems = availableMedia.filter((m) => m.media_type === 'PHOTO' || m.mime_type.startsWith('image/'))

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setSummary('')
      setContent('')
      setPrivacyLevel('FAMILY')
      setFeaturedMediaId(null)
      setIsSubmitting(false)
      setErrorMessage(null)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSubmitting, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setErrorMessage('Story title is required.')
      return
    }
    if (!content.trim()) {
      setErrorMessage('Story content cannot be empty.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const res = await createFamilyStory(
      familyId,
      title.trim(),
      content.trim(),
      summary.trim() || undefined,
      privacyLevel,
      featuredMediaId || null
    )

    setIsSubmitting(false)

    if (res.data) {
      onSuccess(res.data.story_id)
      onClose()
    } else {
      setErrorMessage(res.error?.message || 'Failed to save family story. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-story-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4 bg-navy-50/50">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600" />
            <h3 id="create-story-title" className="text-base font-semibold text-navy-900">
              Record Family History or Story
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Input
            label="Story Title"
            id="story-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={300}
            placeholder="e.g. Migration from Bhuj to Mumbai, 1948"
            hint="A meaningful title for this historical narrative"
          />

          <Input
            label="Brief Summary (Optional)"
            id="story-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={1000}
            placeholder="A short one or two sentence summary shown on the story card"
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="story-content" className="block text-xs font-medium text-navy-700">
                Narrative Content <span className="text-red-500">*</span>
              </label>
              <span className="text-[11px] text-navy-400">
                {content.length.toLocaleString()} / 50,000 characters
              </span>
            </div>
            <textarea
              id="story-content"
              rows={8}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              maxLength={50000}
              placeholder="Record your family's oral history, ancestral origins, memoirs, and important milestones…"
              className="w-full rounded border border-navy-300 px-3.5 py-2.5 text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Featured Media Picker (if family has photos) */}
          {photoItems.length > 0 && (
            <div>
              <label htmlFor="story-featured-media" className="block text-xs font-medium text-navy-700 mb-1">
                Attach Featured Photo (Optional)
              </label>
              <select
                id="story-featured-media"
                value={featuredMediaId ?? ''}
                onChange={(e) => setFeaturedMediaId(e.target.value ? e.target.value : null)}
                className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
              >
                <option value="">None (Text only)</option>
                {photoItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.caption || m.original_filename}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="story-privacy" className="block text-xs font-medium text-navy-700 mb-1">
              Story Visibility
            </label>
            <select
              id="story-privacy"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value as 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE')}
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            >
              <option value="FAMILY">Family Only (Accessible to confirmed family members)</option>
              <option value="COMMUNITY">Community (Visible to verified community members)</option>
              <option value="PUBLIC">Public (Visible across the directory)</option>
              <option value="PRIVATE">Private (Restricted to family managers)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-navy-100">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={isSubmitting}
              disabled={!title.trim() || !content.trim() || isSubmitting}
            >
              Save Story
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
