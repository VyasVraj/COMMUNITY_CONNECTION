/**
 * MediaViewerModal Component
 *
 * Accessible modal enabling authorized viewers to inspect full-size
 * family photos, documents, and historical records with metadata.
 * Dynamically generated signed URLs are utilized for rendering/downloading
 * and are never persisted in client storage.
 */

import React, { useEffect, useState } from 'react'
import { X, Download, Trash2, FileText, Image as ImageIcon, ExternalLink, ShieldAlert } from 'lucide-react'
import type { FamilyMediaItem } from '../types'
import { formatFileSize, formatMediaDate } from '../utils/image.utils'
import { deleteFamilyMedia } from '../services/familyMedia.service'
import { Button } from '@/components/forms/Button'

export interface MediaViewerModalProps {
  isOpen: boolean
  onClose: () => void
  mediaItem: FamilyMediaItem | null
  canManage?: boolean
  onDeleted?: (mediaId: string) => void
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  isOpen,
  onClose,
  mediaItem,
  canManage = false,
  onDeleted,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [imageError, setImageError] = useState(false)

  // Reset delete confirmation on open/media change
  useEffect(() => {
    setConfirmDelete(false)
    setErrorMessage(null)
    setImageError(false)
  }, [mediaItem, isOpen])

  // Keyboard accessibility: Escape key closes modal
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

  if (!isOpen || !mediaItem) return null

  const isPdf = mediaItem.mime_type === 'application/pdf'
  const isImage = mediaItem.mime_type.startsWith('image/')

  async function handleDelete() {
    if (!mediaItem) return
    setIsDeleting(true)
    setErrorMessage(null)

    const res = await deleteFamilyMedia(mediaItem.id)
    setIsDeleting(false)

    if (res.data) {
      onDeleted?.(mediaItem.id)
      onClose()
    } else {
      setErrorMessage(res.error?.message || 'Failed to remove media item. Please try again.')
      setConfirmDelete(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-viewer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-3.5 bg-navy-50/50">
          <div className="flex items-center gap-2.5 min-w-0 pr-4">
            {isPdf ? (
              <FileText className="h-5 w-5 text-brand-600 flex-shrink-0" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-5 w-5 text-brand-600 flex-shrink-0" aria-hidden="true" />
            )}
            <h3
              id="media-viewer-title"
              className="truncate text-sm sm:text-base font-semibold text-navy-900"
            >
              {mediaItem.caption || mediaItem.original_filename}
            </h3>
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

        {/* Error notification */}
        {errorMessage && (
          <div
            role="alert"
            className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Media Content Display */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-center rounded-xl bg-navy-900/5 p-2 sm:p-4 min-h-[220px]">
            {isImage ? (
              mediaItem.resolved_url && !imageError ? (
                <img
                  src={mediaItem.resolved_url}
                  alt={mediaItem.caption || mediaItem.original_filename}
                  onError={() => setImageError(true)}
                  className="max-h-[50vh] w-auto max-w-full rounded-lg object-contain shadow-sm"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-navy-400">
                  <ImageIcon className="h-12 w-12 mb-2 text-navy-300" />
                  <p className="text-sm font-medium">Image preview unavailable or link expired.</p>
                </div>
              )
            ) : isPdf ? (
              <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 bg-white rounded-xl border border-navy-200 shadow-xs max-w-sm w-full">
                <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                  <FileText className="h-8 w-8" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-navy-900 break-all">
                    {mediaItem.original_filename}
                  </h4>
                  <p className="text-xs text-navy-500 mt-0.5">
                    PDF Document • {formatFileSize(mediaItem.file_size)}
                  </p>
                </div>
                {mediaItem.resolved_url && (
                  <a
                    href={mediaItem.resolved_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 px-4 py-2 rounded-lg transition-colors shadow-xs"
                  >
                    <span>Open / Download PDF</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            ) : null}
          </div>

          {/* Description & Caption */}
          {mediaItem.description && (
            <div className="rounded-lg bg-navy-50/70 p-3.5 text-xs sm:text-sm text-navy-700 whitespace-pre-line leading-relaxed">
              {mediaItem.description}
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-navy-100 text-xs">
            <div className="bg-navy-50/50 p-2.5 rounded-lg border border-navy-100">
              <span className="block text-navy-400 font-medium">File Name</span>
              <span className="font-semibold text-navy-800 truncate block mt-0.5" title={mediaItem.original_filename}>
                {mediaItem.original_filename}
              </span>
            </div>

            <div className="bg-navy-50/50 p-2.5 rounded-lg border border-navy-100">
              <span className="block text-navy-400 font-medium">File Size</span>
              <span className="font-semibold text-navy-800 block mt-0.5">
                {formatFileSize(mediaItem.file_size)}
              </span>
            </div>

            <div className="bg-navy-50/50 p-2.5 rounded-lg border border-navy-100">
              <span className="block text-navy-400 font-medium">Type</span>
              <span className="font-semibold text-navy-800 block mt-0.5">
                {mediaItem.media_type}
              </span>
            </div>

            <div className="bg-navy-50/50 p-2.5 rounded-lg border border-navy-100">
              <span className="block text-navy-400 font-medium">Date Added</span>
              <span className="font-semibold text-navy-800 block mt-0.5">
                {formatMediaDate(mediaItem.created_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-navy-100 px-5 py-3 bg-navy-50/30">
          <div>
            {canManage && (
              !confirmDelete ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-red-600">Delete this item?</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    isLoading={isDeleting}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                </div>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            {mediaItem.resolved_url && (
              <a
                href={mediaItem.resolved_url}
                target="_blank"
                rel="noopener noreferrer"
                download={mediaItem.original_filename}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-navy-700 bg-white border border-navy-200 rounded hover:bg-navy-50 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-xs transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            )}
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
