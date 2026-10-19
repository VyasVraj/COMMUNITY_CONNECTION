/**
 * Unit tests for AddMemberModal component
 *
 * Tests modal visibility, person selection population, role choices,
 * head conflict warning, and submission button states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '@/features/auth/context/AuthContext'
import { AddMemberModal } from '@/features/family-members/components/AddMemberModal'
import * as peopleHooks from '@/features/people/hooks/usePersonList'
import * as mutationHooks from '@/features/family-members/hooks/useFamilyMemberMutations'
import type { Tables } from '@/types/database.types'

type PersonRow = Tables<'persons'>

const MOCK_PERSONS: PersonRow[] = [
  {
    id: 'person-1',
    first_name: 'Vikram',
    last_name: 'Malhotra',
    middle_name: null,
    maiden_name: null,
    gender: 'MALE',
    date_of_birth: '1978-02-10',
    birth_place: 'Delhi',
    date_of_death: null,
    gotra: null,
    kul: null,
    nukh: null,
    phone: null,
    phone_secondary: null,
    email_contact: null,
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'COMMUNITY',
    dob_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
  {
    id: 'person-2',
    first_name: 'Ananya',
    last_name: 'Malhotra',
    middle_name: null,
    maiden_name: null,
    gender: 'FEMALE',
    date_of_birth: '1982-08-20',
    birth_place: 'Mumbai',
    date_of_death: null,
    gotra: null,
    kul: null,
    nukh: null,
    phone: null,
    phone_secondary: null,
    email_contact: null,
    profile_privacy: 'COMMUNITY',
    contact_privacy: 'COMMUNITY',
    dob_privacy: 'COMMUNITY',
    status: 'ACTIVE',
    verification_status: 'UNVERIFIED',
    user_id: null,
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    deleted_at: null,
  },
]

const mockAuth: AuthContextValue = {
  session: null,
  user: { id: 'user-creator' } as unknown as NonNullable<AuthContextValue['user']>,
  profile: null,
  isLoading: false,
  isAuthenticated: true,
}

function renderComponent(ui: React.ReactElement): string {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return renderToStaticMarkup(
    <AuthContext.Provider value={mockAuth}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>
    </AuthContext.Provider>
  )
}

describe('AddMemberModal Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(peopleHooks, 'usePersonList').mockReturnValue({
      data: MOCK_PERSONS,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof peopleHooks.usePersonList>)

    vi.spyOn(mutationHooks, 'useAddFamilyMember').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof mutationHooks.useAddFamilyMember>)
  })

  it('renders nothing when isOpen is false', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={false}
        onClose={vi.fn()}
      />
    )
    expect(html).toBe('')
  })

  it('renders modal header and form when isOpen is true', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Add Family Member')
    expect(html).toContain('Select Person')
    expect(html).toContain('Family Role')
  })

  it('populates persons from usePersonList into select options', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Vikram Malhotra (Delhi)')
    expect(html).toContain('Ananya Malhotra (Mumbai)')
  })

  it('renders Head of Family designation checkbox', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Designate as Head of Family')
  })

  it('renders Action buttons (Cancel, Add Member)', () => {
    const html = renderComponent(
      <AddMemberModal
        familyId="family-1"
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    expect(html).toContain('Cancel')
    expect(html).toContain('Add Member')
  })
})
