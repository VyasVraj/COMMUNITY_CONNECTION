/**
 * PersonDetailPage — read-only view of a single person record.
 *
 * Obtains personId from route params. Fetches via usePerson().
 * Displays PersonDetail. Provides navigation to edit and soft-delete.
 *
 * Soft-delete: only shown; the actual authorization is enforced by RLS.
 * If the current user is not the creator, the service call will be rejected
 * by the database and the UI will show the error. No client-side auth check.
 */

import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { usePerson } from '../hooks/usePerson'
import { useSoftDeletePerson } from '../hooks/usePersonMutations'
import { PersonDetail } from '../components/PersonDetail'
import { PersonRelationshipsList } from '@/features/relationships'
import { PersonFamiliesList } from '@/features/family-members'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export function PersonDetailPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: person, isLoading, error } = usePerson(personId)
  const softDelete = useSoftDeletePerson()

  const canEdit = Boolean(user && person && (person.created_by === user.id || person.user_id === user.id))

  async function handleSoftDelete() {
    if (!personId) return
    setDeleteError(null)
    try {
      await softDelete.mutateAsync(personId)
      navigate(ROUTES.PEOPLE)
    } catch (err) {
      setDeleteError(
        (err as { message?: string }).message ??
          'Could not delete this record. Please try again.'
      )
      setConfirmDelete(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading…</p>
      </div>
    )
  }

  if (error || !person) {
    const message =
      (error as { message?: string } | null)?.message ??
      'Person not found or you do not have permission to view this record.'
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Button
          variant="secondary"
          onClick={() => navigate(ROUTES.PEOPLE)}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to census
        </Button>
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Back navigation */}
      <Button
        variant="secondary"
        onClick={() => navigate(ROUTES.PEOPLE)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to census
      </Button>

      {/* Actions */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-navy-900">Person record</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => navigate(ROUTES.PERSON_EDIT(person.id))}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          {!confirmDelete ? (
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(true)}
              className="text-red-600 hover:bg-red-50 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-navy-600">Are you sure?</span>
              <Button
                variant="secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSoftDelete}
                isLoading={softDelete.isPending}
                disabled={softDelete.isPending}
                className="border-red-400 bg-red-600 text-white hover:bg-red-700"
              >
                Confirm delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {deleteError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {deleteError}
        </p>
      )}

      {/* Detail panel */}
      <div className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <PersonDetail person={person} canEdit={canEdit} />
      </div>


      {/* Interpersonal relationships */}
      <div className="mt-8">
        <PersonRelationshipsList personId={person.id} />
      </div>

      {/* Family memberships */}
      <div className="mt-8">
        <PersonFamiliesList personId={person.id} />
      </div>
    </div>
  )
}
