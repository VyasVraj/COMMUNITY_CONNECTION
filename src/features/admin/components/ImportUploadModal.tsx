/**
 * ImportUploadModal — Modal dialog for uploading and staging CSV, JSON, and Excel (.xlsx, .xls) files.
 *
 * Invariants:
 * - Strict Navy / Indigo / Teal solid design (NO gradients).
 * - Multi-format support: CSV, JSON, XLSX, EXCEL.
 * - Client-side parsing & preview before staging.
 * - Server-authoritative batch creation & staging record ingestion.
 * - Invariant: PERSON != USER.
 * - Invariant: DETECT != MERGE.
 */

import { useState, useRef } from 'react'
import {
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/forms/Button'
import { parseImportFile } from '../services/importParser.service'
import { ingestImport } from '../services/import.service'
import type { ParseImportResult } from '../types'

interface ImportUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ImportUploadModal({ isOpen, onClose, onSuccess }: ImportUploadModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setParseError(null)
    setParseResult(null)
    setUploadError(null)
    setParsing(true)

    try {
      const ext = selected.name.split('.').pop()?.toUpperCase()
      const format = ext === 'XLSX' || ext === 'XLS' ? 'XLSX' : ext === 'JSON' ? 'JSON' : 'CSV'

      let content: string | ArrayBuffer
      if (format === 'XLSX') {
        content = await selected.arrayBuffer()
      } else {
        content = await selected.text()
      }

      const res = await parseImportFile(selected.name, content, {
        format,
        notes: notes || undefined,
      })
      setParseResult(res)
    } catch (err) {
      setParseError((err as Error).message || 'Failed to parse file.')
    } finally {
      setParsing(false)
    }
  }

  const handleStageBatch = async () => {
    if (!file || !parseResult) return
    setUploading(true)
    setUploadError(null)

    try {
      const ext = file.name.split('.').pop()?.toUpperCase()
      const format = ext === 'XLSX' || ext === 'XLS' ? 'XLSX' : ext === 'JSON' ? 'JSON' : 'CSV'

      let content: string | ArrayBuffer
      if (format === 'XLSX') {
        content = await file.arrayBuffer()
      } else {
        content = await file.text()
      }

      await ingestImport({
        fileName: file.name,
        content,
        format,
        notes: notes || undefined,
      })

      onSuccess()
      onClose()
    } catch (err) {
      setUploadError((err as Error).message || 'Failed to stage import batch.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-navy-200 bg-white shadow-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-navy-900">Upload & Stage Import File</h2>
              <p className="text-xs text-navy-500">Supports Excel (.xlsx, .xls), CSV, and JSON</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-navy-400 hover:bg-navy-50 hover:text-navy-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1">
          {/* File Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-navy-600 mb-2">
              Select Dataset File
            </label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-navy-200 bg-navy-50/40 p-6 text-center cursor-pointer hover:border-brand-500 hover:bg-brand-50/20 transition-all"
            >
              <FileSpreadsheet className="h-8 w-8 text-navy-400 mb-2" />
              <p className="text-sm font-medium text-navy-800">
                {file ? file.name : 'Click to select or drop census file'}
              </p>
              <p className="text-xs text-navy-500 mt-1">
                {file
                  ? `${(file.size / 1024).toFixed(1)} KB`
                  : 'Excel (.xlsx), CSV (.csv), or JSON format up to 50MB'}
              </p>
            </div>
          </div>

          {/* Notes Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-navy-600 mb-1">
              Import Notes / Provenance (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Khatrisetu 2026 census batch or Community Directory"
              className="w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 placeholder:text-navy-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Parsing State */}
          {parsing && (
            <div className="flex items-center gap-2 rounded-lg border border-navy-200 bg-navy-50 p-4 text-xs font-medium text-navy-700">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              Inspecting, validating, and extracting records from {file?.name}...
            </div>
          )}

          {/* Parse Error */}
          {parseError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Parse or Validation Error</p>
                  <p className="mt-0.5">{parseError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Parse Result Summary */}
          {parseResult && !parsing && (
            <div className="rounded-xl border border-navy-200 bg-white p-4 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-navy-100 pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-navy-500">
                    File Inspection Summary
                  </span>
                  <p className="text-sm font-semibold text-navy-900 mt-0.5">
                    {parseResult.totalRows} Total Staged Records
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 border border-teal-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Format: {parseResult.fileFormat}
                </span>
              </div>

              {/* Entity Breakdown */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-navy-50 p-3 text-center border border-navy-100">
                  <p className="text-xs text-navy-500 font-medium">Families</p>
                  <p className="text-lg font-bold text-navy-900 mt-0.5">
                    {parseResult.rowCounts.families}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-50 p-3 text-center border border-navy-100">
                  <p className="text-xs text-navy-500 font-medium">Persons</p>
                  <p className="text-lg font-bold text-navy-900 mt-0.5">
                    {parseResult.rowCounts.persons}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-50 p-3 text-center border border-navy-100">
                  <p className="text-xs text-navy-500 font-medium">Relationships</p>
                  <p className="text-lg font-bold text-navy-900 mt-0.5">
                    {parseResult.rowCounts.relationships}
                  </p>
                </div>
              </div>

              {/* Validation Summary */}
              <div className="flex items-center gap-4 text-xs font-medium text-navy-700 pt-1">
                <span className="flex items-center gap-1 text-teal-700">
                  <CheckCircle2 className="h-4 w-4" />
                  {parseResult.validationSummary.valid} Valid
                </span>
                {parseResult.validationSummary.warnings > 0 && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    {parseResult.validationSummary.warnings} Warnings (Review only)
                  </span>
                )}
                {parseResult.validationSummary.duplicates > 0 && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <AlertTriangle className="h-4 w-4" />
                    {parseResult.validationSummary.duplicates} Duplicate Candidates
                  </span>
                )}
                {parseResult.validationSummary.errors > 0 && (
                  <span className="flex items-center gap-1 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    {parseResult.validationSummary.errors} Errors
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Upload Error */}
          {uploadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Staging Upload Failed</p>
                  <p className="mt-0.5">{uploadError}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-navy-100 px-6 py-4 bg-navy-50/50">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={uploading}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleStageBatch}
            disabled={!parseResult || uploading || parsing}
            isLoading={uploading}
          >
            {uploading ? 'Staging Records...' : 'Stage Dataset Batch'}
          </Button>
        </div>
      </div>
    </div>
  )
}
