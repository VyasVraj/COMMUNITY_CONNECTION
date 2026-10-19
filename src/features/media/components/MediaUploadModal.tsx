/**
 * MediaUploadModal Component
 *
 * Accessible modal enabling authorized family managers to select,
 * validate, preview, and upload family photographs and historical documents.
 * Uploads to the private 'family-media' storage bucket and registers
 * metadata via the authoritative register_family_media RPC.
 */

import React, { useState, useRef, useEffect } from 'react'
import { X, Upload, FileText, AlertCircle } from 'lucide-react'
import type { FamilyAlbum, FamilyMediaItem, FamilyMediaType } from '../types'
import { formatFileSize } from '../utils/image.utils'
import { uploadFamilyMedia, validateMediaFile } from '../services/familyMedia.service'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface MediaUploadModalProps {
  isOpen: boolean
  onClose: () => void
  familyId: string
  albums: FamilyAlbum[]
  defaultAlbumId?: string | null
  onSuccess: (newItem: FamilyMediaItem) => void
}

export const MediaUploadModal: React.FC<MediaUploadModalProps> = ({
  isOpen,
  onClose,
  familyId,
  albums,
  defaultAlbumId,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [albumId, setAlbumId] = useState<string | null>(defaultAlbumId ?? null)
  const [mediaType, setMediaType] = useState<FamilyMediaType>('PHOTO')
  const [caption, setCaption] = useState('')
  const [description, setDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null)
      setPreviewUrl(null)
      setAlbumId(defaultAlbumId ?? null)
      setMediaType('PHOTO')
      setCaption('')
      setDescription('')
      setErrorMessage(null)
      setIsUploading(false)
    }
  }, [isOpen, defaultAlbumId])

  // Generate object preview URL for images and cleanup
  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }

    if (selectedFile.type.startsWith('image/')) {
      const objectUrl = URL.createObjectURL(selectedFile)
      setPreviewUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    } else {
      setPreviewUrl(null)
    }
  }, [selectedFile])

  // Esc key closes modal
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isUploading, onClose])

  if (!isOpen) return null

  function handleFileSelect(file: File) {
    setErrorMessage(null)
    const validation = validateMediaFile(file)
    if (!validation.valid) {
      setErrorMessage(validation.error ?? 'Invalid file selected.')
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    // Auto-select DOCUMENT for PDF files
    if (file.type === 'application/pdf') {
      setMediaType('DOCUMENT')
    } else {
      setMediaType('PHOTO')
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedFile) {
      setErrorMessage('Please select a file to upload.')
      return
    }

    setIsUploading(true)
    setErrorMessage(null)

    const res = await uploadFamilyMedia(familyId, selectedFile, {
      albumId: albumId || null,
      caption: caption.trim() || undefined,
      description: description.trim() || undefined,
      mediaType,
    })

    setIsUploading(false)

    if (res.data) {
      onSuccess(res.data)
      onClose()
    } else {
      setErrorMessage(res.error?.message || 'Failed to upload media. Please try again.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-media-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) onClose()
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4 bg-navy-50/50">
          <h3 id="upload-media-title" className="text-base font-semibold text-navy-900">
            Upload Family Photo or Document
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
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

          {/* Drag & Drop Upload Target */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={[
              'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer',
              isDragOver
                ? 'border-brand-500 bg-brand-50/50'
                : selectedFile
                  ? 'border-navy-300 bg-navy-50/40'
                  : 'border-navy-200 hover:border-brand-400 hover:bg-navy-50/50',
            ].join(' ')}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleFileSelect(e.target.files[0])
                }
              }}
            />

            {previewUrl ? (
              <div className="flex flex-col items-center space-y-2">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-28 w-28 rounded-lg object-cover shadow-xs border border-navy-200"
                />
                <span className="text-xs font-medium text-navy-700 max-w-[240px] truncate">
                  {selectedFile?.name} ({selectedFile && formatFileSize(selectedFile.size)})
                </span>
                <span className="text-[11px] text-brand-600 underline">Click to change file</span>
              </div>
            ) : selectedFile ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                  <FileText className="h-8 w-8" />
                </div>
                <span className="text-xs font-medium text-navy-800 max-w-[240px] truncate">
                  {selectedFile.name}
                </span>
                <span className="text-xs text-navy-500">
                  {formatFileSize(selectedFile.size)} • PDF Document
                </span>
                <span className="text-[11px] text-brand-600 underline">Click to change file</span>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-2">
                <div className="h-12 w-12 rounded-full bg-navy-100 flex items-center justify-center text-navy-600">
                  <Upload className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-navy-800">
                    Click to select or drag and drop file here
                  </p>
                  <p className="text-xs text-navy-500 mt-0.5">
                    JPEG, PNG, WEBP, GIF, or PDF (up to 20MB)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Album Selection */}
          <div>
            <label htmlFor="upload-album-select" className="block text-xs font-medium text-navy-700 mb-1">
              Assign to Album (Optional)
            </label>
            <select
              id="upload-album-select"
              value={albumId ?? ''}
              onChange={(e) => setAlbumId(e.target.value ? e.target.value : null)}
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            >
              <option value="">Unassigned (All Family Photos)</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.privacy_level})
                </option>
              ))}
            </select>
          </div>

          {/* Media Type */}
          <div>
            <label htmlFor="upload-media-type" className="block text-xs font-medium text-navy-700 mb-1">
              Media Type
            </label>
            <select
              id="upload-media-type"
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value as FamilyMediaType)}
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 bg-white focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            >
              <option value="PHOTO">Photograph</option>
              <option value="DOCUMENT">Document (Certificate / Letter / Record)</option>
              <option value="HISTORICAL_RECORD">Historical Archive Record</option>
            </select>
          </div>

          {/* Caption */}
          <Input
            label="Caption / Title"
            id="upload-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Family gathering at Diwali, 1982"
            maxLength={500}
            hint="Optional label displayed under thumbnail"
          />

          {/* Description */}
          <div>
            <label htmlFor="upload-description" className="block text-xs font-medium text-navy-700 mb-1">
              Description / Context (Optional)
            </label>
            <textarea
              id="upload-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add background story, identified members, or notes about this photo/document…"
              maxLength={2000}
              className="w-full rounded border border-navy-300 px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:outline-none focus:ring-1 focus:ring-brand-500 transition-colors"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-navy-100">
            <Button
              variant="secondary"
              type="button"
              onClick={onClose}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              isLoading={isUploading}
              disabled={!selectedFile || isUploading}
            >
              Upload Media
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
