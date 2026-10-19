/**
 * StoryViewerModal Component
 *
 * Accessible modal enabling community members to read family oral histories,
 * memoirs, and narratives without unsafe HTML rendering.
 */

import React, { useEffect, useState } from 'react'
import { X, BookOpen, Calendar, Lock, Globe, Users, Shield } from 'lucide-react'
import type { FamilyStory } from '../types'
import { formatMediaDate } from '../utils/image.utils'
import { Button } from '@/components/forms/Button'

export interface StoryViewerModalProps {
  isOpen: boolean
  onClose: () => void
  story: FamilyStory | null
}

const PRIVACY_ICONS = {
  PUBLIC: Globe,
  COMMUNITY: Users,
  FAMILY: Shield,
  PRIVATE: Lock,
}

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  onClose,
  story,
}) => {
  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [story, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !story) return null

  const PrivacyIcon = PRIVACY_ICONS[story.privacy_level] ?? Shield

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-viewer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4 bg-navy-50/50">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-600 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
              Family History Record
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-navy-400 hover:bg-navy-100 hover:text-navy-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-5">
          <div>
            <h2 id="story-viewer-title" className="text-xl sm:text-2xl font-bold text-navy-900 leading-tight">
              {story.title}
            </h2>

            <div className="mt-2.5 flex items-center gap-3 text-xs text-navy-500">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatMediaDate(story.created_at)}
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-medium text-navy-700">
                <PrivacyIcon className="h-3 w-3" />
                <span>{story.privacy_level}</span>
              </span>
            </div>
          </div>

          {/* Featured Media Preview if available */}
          {story.featured_media?.resolved_url && !imageError && (
            <div className="rounded-xl overflow-hidden border border-navy-200 bg-navy-50">
              <img
                src={story.featured_media.resolved_url}
                alt={story.featured_media.caption || story.title}
                onError={() => setImageError(true)}
                className="w-full max-h-72 object-cover"
              />
              {story.featured_media.caption && (
                <p className="p-2.5 text-xs text-navy-600 bg-white border-t border-navy-100 text-center font-medium">
                  {story.featured_media.caption}
                </p>
              )}
            </div>
          )}

          {/* Summary Callout */}
          {story.summary && (
            <div className="rounded-xl border-l-4 border-brand-500 bg-brand-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-800 mb-1">
                Executive Summary
              </p>
              <p className="text-sm font-medium text-brand-900 leading-relaxed">
                {story.summary}
              </p>
            </div>
          )}

          {/* Story Narrative Content (Safe pure text rendering with line breaks) */}
          <div className="text-sm sm:text-base text-navy-800 whitespace-pre-line leading-relaxed font-serif">
            {story.content}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-navy-100 px-6 py-3.5 bg-navy-50/30">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
