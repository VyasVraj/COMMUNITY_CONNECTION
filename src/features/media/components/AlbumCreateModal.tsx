/**
 * AlbumCreateModal Component
 *
 * Accessible modal allowing authorized family managers to create
 * new photo and document collections with privacy controls.
 */

import React, { useState, useEffect } from 'react'
import { X, FolderPlus, AlertCircle } from 'lucide-react'
import { createFamilyAlbum } from '../services/familyMedia.service'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface AlbumCreateModalProps {
  isOpen: boolean
  onClose: () => void
  familyId: string
  onSuccess: (albumId: string) => void
}

export const AlbumCreateModal: React.FC<AlbumCreateModalProps> = ({
  isOpen,
  onClose,
  familyId,
  onSuccess,
}) => {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [privacyLevel, setPrivacyLevel] = useState<'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE'>('FAMILY')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setDescription('')
      setPrivacyLevel('FAMILY')
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
      setErrorMessage('Album title is required.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const res = await createFamilyAlbum(
      familyId,
      title.trim(),
      description.trim() || undefined,
      privacyLevel
    )

    setIsSubmitting(false)

    if (res.data) {
      onSuccess(res.data.album_id)
      onClose()
    } else {
      setErrorMessage(res.error?.message || 'Failed to create album. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-album-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose()
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4 bg-navy-50/50">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-brand-600" />
            <h3 id="create-album-title" className="text-base font-semibold text-navy-900">
              Create Photo Album
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
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
            label="Album Title"
            id="album-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Ancestral Village & Heritage Homes"
            hint="A clear name to identify this collection"
          />

          <div>
            <label htmlFor="album-desc" className="block text-xs font-medium text-navy-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="album-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Context or history about this photo collection…"
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="album-privacy" className="block text-xs font-medium text-navy-700 mb-1">
              Album Visibility
            </label>
            <select
              id="album-privacy"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value as 'PUBLIC' | 'COMMUNITY' | 'FAMILY' | 'PRIVATE')}
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            >
              <option value="FAMILY">Family Only (Accessible to confirmed family members)</option>
              <option value="COMMUNITY">Community (Visible to verified community members)</option>
              <option value="PUBLIC">Public (Visible across the directory)</option>
              <option value="PRIVATE">Private (Restricted to family managers and admins)</option>
            </select>
            <p className="text-[11px] text-navy-500 mt-1">
              Governs who can view the photos inside this album.
            </p>
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
              disabled={!title.trim() || isSubmitting}
            >
              Create Album
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
