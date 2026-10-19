/**
 * AddMemberModal — Modal dialog to add an existing census person to a family.
 *
 * Requirements:
 * - PERSON != USER: uses person_id from public.persons.
 * - Sourced from usePersonList() to populate the person selector dropdown.
 * - Does not accept added_by (stamped by useAddFamilyMember with auth.uid()).
 * - Supports role selection, head-of-family toggle, and joined date.
 */

import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import { useAddFamilyMember } from '../hooks/useFamilyMemberMutations'
import { FAMILY_ROLE_LABELS, FAMILY_ROLES } from '@/constants/app'
import type { FamilyRole } from '@/types'
import { Button } from '@/components/forms/Button'
import { Input } from '@/components/forms/Input'

export interface AddMemberModalProps {
  familyId: string
  isOpen: boolean
  onClose: () => void
  hasActiveHead?: boolean
}

export function AddMemberModal({
  familyId,
  isOpen,
  onClose,
  hasActiveHead = false,
}: AddMemberModalProps) {
  const { data: persons = [], isLoading: isLoadingPersons } = usePersonList({ limit: 50 })
  const addMutation = useAddFamilyMember()

  const [personId, setPersonId] = useState('')
  const [role, setRole] = useState<FamilyRole>(FAMILY_ROLES.EXTENDED)
  const [isHead, setIsHead] = useState(false)
  const [joinedAt, setJoinedAt] = useState(() => new Date().toISOString().split('T')[0])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPersonId('')
      setRole(FAMILY_ROLES.EXTENDED)
      setIsHead(false)
      setJoinedAt(new Date().toISOString().split('T')[0])
      setErrorMessage(null)
    }
  }, [isOpen])

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage(null)

    if (!personId) {
      setErrorMessage('Please select a person to add.')
      return
    }

    try {
      await addMutation.mutateAsync({
        family_id: familyId,
        person_id: personId,
        role,
        is_head: isHead,
        joined_at: joinedAt ? new Date(joinedAt).toISOString() : undefined,
      })
      onClose()
    } catch (err) {
      setErrorMessage(
        (err as { message?: string }).message ??
          'Could not add person to this family. Please verify and try again.'
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-member-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-xl border border-navy-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-navy-100 pb-3">
          <h2 id="add-member-title" className="text-lg font-semibold text-navy-900">
            Add Family Member
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Error alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Person Selector */}
          <div className="space-y-1">
            <label htmlFor="member-person-select" className="block text-sm font-medium text-navy-700">
              Select Person <span className="text-red-500">*</span>
            </label>
            <select
              id="member-person-select"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              disabled={isLoadingPersons || addMutation.isPending}
              required
              className="w-full rounded border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">
                {isLoadingPersons ? 'Loading community census…' : '— Select a person —'}
              </option>
              {persons.map((person) => {
                const disambiguation = person.gotra || person.birth_place
                const label = `${person.first_name} ${person.last_name}${
                  disambiguation ? ` (${disambiguation})` : ''
                }`
                return (
                  <option key={person.id} value={person.id}>
                    {label}
                  </option>
                )
              })}
            </select>
            <p className="text-xs text-navy-500">
              Select an existing individual from the community census registry.
            </p>
          </div>

          {/* Role Selector */}
          <div className="space-y-1">
            <label htmlFor="member-role-select" className="block text-sm font-medium text-navy-700">
              Family Role <span className="text-red-500">*</span>
            </label>
            <select
              id="member-role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as FamilyRole)}
              disabled={addMutation.isPending}
              className="w-full rounded border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {Object.entries(FAMILY_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Joined Date */}
          <Input
            id="member-joined-at"
            label="Joined Date"
            type="date"
            value={joinedAt}
            onChange={(e) => setJoinedAt(e.target.value)}
            disabled={addMutation.isPending}
          />

          {/* Head of Family Checkbox */}
          <div className="rounded-lg border border-navy-200 bg-navy-50/50 p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHead}
                onChange={(e) => setIsHead(e.target.checked)}
                disabled={addMutation.isPending}
                className="h-4 w-4 rounded border-navy-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-navy-900">
                Designate as Head of Family
              </span>
            </label>
            {hasActiveHead && isHead && (
              <p className="mt-1 text-xs text-amber-700">
                Warning: This family already has an active head. The database permits only one active
                head per family; assigning another head will fail unless the current head is demoted.
              </p>
            )}
          </div>

          {/* Modal Actions */}
          <div className="mt-6 flex justify-end gap-2 border-t border-navy-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={addMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={addMutation.isPending}
              disabled={addMutation.isPending || !personId}
            >
              Add Member
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
