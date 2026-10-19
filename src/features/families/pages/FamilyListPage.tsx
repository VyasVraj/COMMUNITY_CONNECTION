/**
 * FamilyListPage — browse family records visible to the current session.
 *
 * Fetches families via useFamilyList(). Visibility is governed by RLS.
 * Displays families as FamilyCard components.
 * Provides navigation to FamilyDetailPage and FamilyCreatePage.
 */

import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useFamilyList } from '../hooks/useFamilyList'
import { FamilyCard } from '../components/FamilyCard'
import { Button } from '@/components/forms/Button'
import { ROUTES } from '@/constants/app'

export function FamilyListPage() {
  const navigate = useNavigate()
  const { data: families, isLoading, error } = useFamilyList()

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-navy-500">Loading family records…</p>
      </div>
    )
  }

  if (error) {
    const message =
      (error as { message?: string }).message ??
      'Could not load family records. Please try again.'
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-brand-600" aria-hidden="true" />
          <h1 className="text-2xl font-semibold text-navy-900">Community Families</h1>
        </div>
        <Button onClick={() => navigate(ROUTES.FAMILY_CREATE)}>Add family</Button>
      </div>
      <p className="mt-1 text-sm text-navy-500">
        Registered family units in the community. Visibility is governed by each
        record's privacy settings.
      </p>

      {/* List or empty state */}
      {families && families.length > 0 ? (
        <ul className="mt-8 space-y-3" aria-label="Family records">
          {families.map((family) => (
            <li key={family.id}>
              <FamilyCard
                family={family}
                onClick={() => navigate(ROUTES.FAMILY_DETAIL(family.id))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-16 flex flex-col items-center text-center">
          <Users className="h-12 w-12 text-navy-300" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-medium text-navy-700">No family records yet</h2>
          <p className="mt-1 text-sm text-navy-500">
            Start building the community directory by creating the first family record.
          </p>
          <Button className="mt-6" onClick={() => navigate(ROUTES.FAMILY_CREATE)}>
            Add first family
          </Button>
        </div>
      )}
    </div>
  )
}
