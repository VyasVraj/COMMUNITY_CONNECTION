/**
 * useFamilyList — TanStack Query hook for fetching a list of family records.
 *
 * Wraps the listFamilies service function. Returns records visible to the
 * current session based on the deployed RLS privacy policies.
 *
 * Query key: ['families', 'list', params]
 * Data: FamilyRow[] (empty array when no records match)
 */

import { useQuery } from '@tanstack/react-query'
import { listFamilies, type ListFamiliesParams } from '../services/families.service'

/**
 * Fetch family records visible to the current session.
 *
 * Visibility is determined by RLS — unauthenticated sessions receive only
 * PUBLIC records; authenticated sessions receive COMMUNITY and above.
 *
 * @param params - Optional list parameters (limit).
 */
export function useFamilyList(params?: ListFamiliesParams) {
  return useQuery({
    queryKey: ['families', 'list', params] as const,
    queryFn: async () => {
      const result = await listFamilies(params)
      if (result.error) throw result.error
      return result.data!
    },
  })
}
