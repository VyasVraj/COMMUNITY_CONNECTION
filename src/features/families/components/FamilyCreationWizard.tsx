/**
 * FamilyCreationWizard — Multi-step wizard for creating a new family unit.
 *
 * Implements Phase 4 — Subtask 3:
 * Step 1: Family Identity & Details (Name, Description, Location, Heritage)
 * Step 2: Privacy Controls (Profile Privacy, Members Privacy)
 * Step 3: Initial Members (Optional staging of existing census Persons)
 * Step 4: Review & Create (Summary, Sequential Orchestration & Partial Failure Recovery)
 *
 * GOVERNANCE & SECURITY RULES:
 * - PERSON != USER: The authenticated creator is an auth.users identity, NOT a public.persons record.
 *   Initial members must strictly reference existing public.persons records.
 * - Server/DB-controlled fields (id, created_by, status, verification_status, deleted_at, timestamps)
 *   are NEVER accepted from form input.
 * - created_by and added_by are stamped by the service layer using the authenticated session (auth.uid()).
 * - Deployed RLS reality: family_members_select_community evaluates family.profile_privacy IN ('COMMUNITY', 'PUBLIC').
 *   Both profile_privacy and members_privacy are collected and stored, but profile_privacy governs RLS visibility.
 * - Sequential orchestration: Family is created first. If member attachment fails, member processing stops
 *   immediately, the successfully created family is preserved, and the user is guided to manage members
 *   from FamilyDetail / MemberList.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  AlertCircle,
  Crown,
  Trash2,
  UserPlus,
  MapPin,
} from 'lucide-react'

import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { useCreateFamily } from '../hooks/useFamilyMutations'
import { addFamilyMember } from '@/features/family-members/services/family-members.service'
import { usePersonList } from '@/features/people/hooks/usePersonList'
import {
  FAMILY_ROLES,
  FAMILY_ROLE_LABELS,
  ROUTES,
} from '@/constants/app'
import type { FamilyRole } from '@/types'
import type { CreateFamilyInput } from '../schemas/families.schemas'

// ---------------------------------------------------------------------------
// Step 1 & 2 Form Validation Schema
// ---------------------------------------------------------------------------

const PRIVACY_ENUM = z.enum(['PRIVATE', 'FAMILY', 'CONNECTIONS', 'COMMUNITY', 'PUBLIC'])

const wizardFormSchema = z.object({
  family_name: z
    .string({ required_error: 'Family name is required' })
    .min(1, 'Family name is required')
    .max(200, 'Family name must not exceed 200 characters'),
  description: z.string().max(2000, 'Description must not exceed 2000 characters').optional(),
  city: z.string().max(100, 'City must not exceed 100 characters').optional(),
  state: z.string().max(100, 'State must not exceed 100 characters').optional(),
  country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
  gotra: z.string().max(100, 'Gotra must not exceed 100 characters').optional(),
  kul: z.string().max(100, 'Kul must not exceed 100 characters').optional(),
  nukh: z.string().max(100, 'Nukh must not exceed 100 characters').optional(),
  profile_privacy: PRIVACY_ENUM.default('COMMUNITY'),
  members_privacy: PRIVACY_ENUM.default('COMMUNITY'),
})

type WizardFormValues = z.infer<typeof wizardFormSchema>

// ---------------------------------------------------------------------------
// Staged Member Type (Step 3)
// ---------------------------------------------------------------------------

export interface StagedMember {
  person_id: string
  person_name: string
  role: FamilyRole
  is_head: boolean
}

// ---------------------------------------------------------------------------
// Partial Failure Report Type (Step 4 Recovery)
// ---------------------------------------------------------------------------

interface PartialFailureReport {
  familyId: string
  familyName: string
  succeededMembers: string[]
  failedMember: {
    name: string
    error: string
  }
  unprocessedMembers: string[]
}

// ---------------------------------------------------------------------------
// Sanitization Helper
// ---------------------------------------------------------------------------

function sanitizeOptional(v: string | undefined): string | undefined {
  if (v === '' || v === undefined) return undefined
  const trimmed = v.trim()
  return trimmed === '' ? undefined : trimmed
}

export function FamilyCreationWizard() {
  const navigate = useNavigate()
  const { user } = useAuthContext()
  const createFamilyMutation = useCreateFamily()

  // Wizard step state (1 to 3)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)

  // Staged members for Step 3
  const [stagedMembers, setStagedMembers] = useState<StagedMember[]>([])

  // Step 3 Member staging sub-form states
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [selectedRole, setSelectedRole] = useState<FamilyRole>('EXTENDED')
  const [isHead, setIsHead] = useState(false)
  const [memberError, setMemberError] = useState<string | null>(null)

  // Head replacement confirmation modal state
  const [pendingHeadReplacement, setPendingHeadReplacement] = useState<{
    newPersonId: string
    newPersonName: string
    newRole: FamilyRole
  } | null>(null)

  // Orchestration & submission states
  const [isCreating, setIsCreating] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [partialFailure, setPartialFailure] = useState<PartialFailureReport | null>(null)

  // Fetch community census for member staging (limit: 50)
  const { data: persons = [], isLoading: isLoadingPersons } = usePersonList({ limit: 50 })

  // Unified React Hook Form instance
  const {
    register,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<WizardFormValues>({
    resolver: zodResolver(wizardFormSchema),
    mode: 'onTouched',
    defaultValues: {
      family_name: '',
      description: '',
      city: '',
      state: '',
      country: '',
      gotra: '',
      kul: '',
      nukh: '',
      profile_privacy: 'COMMUNITY',
      members_privacy: 'COMMUNITY',
    },
  })

  // -------------------------------------------------------------------------
  // Step Navigation Handlers
  // -------------------------------------------------------------------------

  async function handleNextFromStep1() {
    const isValid = await trigger([
      'family_name',
      'description',
      'city',
      'state',
      'country',
      'gotra',
      'kul',
      'nukh',
    ])
    if (isValid) {
      setCurrentStep(2)
    }
  }

  function handleNextFromStep2() {
    setMemberError(null)
    setCurrentStep(3)
  }

  // -------------------------------------------------------------------------
  // Step 3 Member Staging Handlers
  // -------------------------------------------------------------------------

  const currentHead = stagedMembers.find((m) => m.is_head)

  function handleStageMember() {
    setMemberError(null)

    if (!selectedPersonId) {
      setMemberError('Please select a person from the community census.')
      return
    }

    // Duplicate person check
    const isAlreadyStaged = stagedMembers.some((m) => m.person_id === selectedPersonId)
    if (isAlreadyStaged) {
      setMemberError('This person is already in the staged member list.')
      return
    }

    const personObj = persons.find((p) => p.id === selectedPersonId)
    const personName = personObj
      ? `${personObj.first_name} ${personObj.last_name}`
      : 'Selected Person'

    // One-head check: if this member is designated as head and a head is already staged
    if (isHead && currentHead) {
      setPendingHeadReplacement({
        newPersonId: selectedPersonId,
        newPersonName: personName,
        newRole: selectedRole,
      })
      return
    }

    // Add member
    setStagedMembers((prev) => [
      ...prev,
      {
        person_id: selectedPersonId,
        person_name: personName,
        role: selectedRole,
        is_head: isHead,
      },
    ])

    // Reset member sub-form
    setSelectedPersonId('')
    setSelectedRole('EXTENDED')
    setIsHead(false)
  }

  function confirmHeadReplacement() {
    if (!pendingHeadReplacement) return

    setStagedMembers((prev) => {
      // Demote current head
      const updated = prev.map((m) => (m.is_head ? { ...m, is_head: false } : m))
      // Add new member as head
      return [
        ...updated,
        {
          person_id: pendingHeadReplacement.newPersonId,
          person_name: pendingHeadReplacement.newPersonName,
          role: pendingHeadReplacement.newRole,
          is_head: true,
        },
      ]
    })

    setPendingHeadReplacement(null)
    setSelectedPersonId('')
    setSelectedRole('EXTENDED')
    setIsHead(false)
    setMemberError(null)
  }

  function cancelHeadReplacement() {
    setPendingHeadReplacement(null)
  }

  function handleRemoveStagedMember(personId: string) {
    setStagedMembers((prev) => prev.filter((m) => m.person_id !== personId))
  }

  // -------------------------------------------------------------------------
  // Step 4 Final Submission & Sequential Orchestration
  // -------------------------------------------------------------------------

  async function handleCreateFamily() {
    if (!user) {
      setSubmissionError('You must be signed in to create a family.')
      return
    }

    setIsCreating(true)
    setSubmissionError(null)
    setPartialFailure(null)

    const values = getValues()

    const sanitizedFamilyInput: CreateFamilyInput = {
      family_name: values.family_name.trim(),
      description: sanitizeOptional(values.description),
      city: sanitizeOptional(values.city),
      state: sanitizeOptional(values.state),
      country: sanitizeOptional(values.country),
      gotra: sanitizeOptional(values.gotra),
      kul: sanitizeOptional(values.kul),
      nukh: sanitizeOptional(values.nukh),
      profile_privacy: values.profile_privacy,
      members_privacy: values.members_privacy,
    }

    let createdFamilyId: string

    try {
      // 1. Create family record
      const family = await createFamilyMutation.mutateAsync(sanitizedFamilyInput)
      createdFamilyId = family.id
    } catch (err) {
      setIsCreating(false)
      setSubmissionError(
        (err as { message?: string }).message ??
          'Could not create family. Please review details and try again.'
      )
      return
    }

    // 2. If no initial members staged, navigate directly to family detail
    if (stagedMembers.length === 0) {
      setIsCreating(false)
      navigate(ROUTES.FAMILY_DETAIL(createdFamilyId))
      return
    }

    // 3. Sequentially attach initial members
    const succeededMembers: string[] = []
    let failedMemberInfo: { name: string; error: string } | null = null
    const unprocessedMembers: string[] = []

    for (let i = 0; i < stagedMembers.length; i++) {
      const m = stagedMembers[i]

      if (failedMemberInfo) {
        unprocessedMembers.push(m.person_name)
        continue
      }

      try {
        const res = await addFamilyMember(
          {
            family_id: createdFamilyId,
            person_id: m.person_id,
            role: m.role,
            is_head: m.is_head,
          },
          user.id
        )

        if (res.error) {
          failedMemberInfo = {
            name: m.person_name,
            error: res.error.message,
          }
        } else {
          succeededMembers.push(m.person_name)
        }
      } catch (err) {
        failedMemberInfo = {
          name: m.person_name,
          error:
            (err as { message?: string }).message ??
            'Could not add member to the newly created family.',
        }
      }
    }

    setIsCreating(false)

    // 4. Handle sequential attachment outcome
    if (!failedMemberInfo) {
      // Complete success
      navigate(ROUTES.FAMILY_DETAIL(createdFamilyId))
    } else {
      // Partial failure: family exists, but member addition halted
      setPartialFailure({
        familyId: createdFamilyId,
        familyName: values.family_name.trim(),
        succeededMembers,
        failedMember: failedMemberInfo,
        unprocessedMembers,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Partial Failure Screen (Rendered if member attachment halted)
  // -------------------------------------------------------------------------

  if (partialFailure) {
    return (
      <div className="rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-amber-100 pb-4">
          <div className="rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-navy-900">
              Family Created with Partial Membership
            </h2>
            <p className="text-xs text-navy-500">
              Family unit was successfully registered, but initial member staging encountered an issue.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4 text-sm">
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800 border border-emerald-200">
            <p className="font-medium">
              Family &ldquo;{partialFailure.familyName}&rdquo; created successfully.
            </p>
          </div>

          {partialFailure.succeededMembers.length > 0 && (
            <div>
              <p className="font-medium text-navy-800">Successfully attached members:</p>
              <ul className="mt-1 list-disc pl-5 text-navy-700 space-y-0.5">
                {partialFailure.succeededMembers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-lg bg-red-50 p-3 text-red-800 border border-red-200">
            <p className="font-medium">
              Failed to attach member: {partialFailure.failedMember.name}
            </p>
            <p className="mt-1 text-xs">{partialFailure.failedMember.error}</p>
          </div>

          {partialFailure.unprocessedMembers.length > 0 && (
            <div>
              <p className="font-medium text-navy-600">
                Unprocessed members (halted due to previous failure):
              </p>
              <ul className="mt-1 list-disc pl-5 text-navy-500 space-y-0.5">
                {partialFailure.unprocessedMembers.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-navy-600 pt-2 border-t border-navy-100">
            You can view your family record and manage or add remaining members at any time using the live member roster.
          </p>

          <Button
            type="button"
            onClick={() => navigate(ROUTES.FAMILY_DETAIL(partialFailure.familyId))}
            className="w-full mt-2"
          >
            Go to Family Record
          </Button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Main Wizard Render
  // -------------------------------------------------------------------------

  const formValues = getValues()

  return (
    <div className="space-y-6">
      {/* Wizard Step Stepper */}
      <nav aria-label="Creation Wizard Progress" className="border-b border-navy-200 pb-4">
        <ol className="flex items-center justify-between text-xs sm:text-sm font-medium">
          {[
            { step: 1, label: 'Identity & Details' },
            { step: 2, label: 'Members' },
            { step: 3, label: 'Review' },
          ].map(({ step, label }) => {
            const isCompleted = currentStep > step
            const isActive = currentStep === step

            return (
              <li key={step} className="flex items-center gap-2">
                <span
                  className={[
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                    isActive
                      ? 'bg-brand-600 text-white ring-2 ring-brand-300'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-navy-100 text-navy-500',
                  ].join(' ')}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step}
                </span>
                <span
                  className={
                    isActive
                      ? 'font-semibold text-navy-900'
                      : isCompleted
                      ? 'text-navy-700'
                      : 'text-navy-400 hidden sm:inline'
                  }
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* STEP 1: Family Identity & Details */}
      {currentStep === 1 && (
        <section aria-labelledby="step1-title" className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 id="step1-title" className="text-xl font-semibold text-navy-900">
              Family Identity & Details
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Provide the family name, heritage origins, and location information.
            </p>
          </div>

          <div className="space-y-4">
            <Input
              label="Family name"
              required
              hint="e.g. Sharma Family, Patel Household"
              error={errors.family_name?.message}
              {...register('family_name')}
            />

            <div className="space-y-1">
              <label htmlFor="description" className="block text-sm font-medium text-navy-700">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={2000}
                placeholder="Brief introduction or background about this family..."
                className={[
                  'w-full rounded border px-3 py-2 text-sm text-navy-900 bg-white placeholder:text-navy-400',
                  'transition-colors focus:outline-none focus:ring-1',
                  errors.description
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-400'
                    : 'border-navy-300 focus:border-brand-500 focus:ring-brand-400',
                ].join(' ')}
                {...register('description')}
              />
              {errors.description && (
                <p role="alert" className="text-xs text-red-600">
                  {errors.description.message}
                </p>
              )}
            </div>

            <fieldset className="pt-2">
              <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-navy-500 mb-3">
                <MapPin className="h-3.5 w-3.5" />
                Location
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="City" error={errors.city?.message} {...register('city')} />
                <Input label="State / Province" error={errors.state?.message} {...register('state')} />
                <Input label="Country" error={errors.country?.message} {...register('country')} />
              </div>
            </fieldset>

            <fieldset className="pt-2">
              <legend className="text-xs font-semibold uppercase tracking-wider text-navy-500 mb-3">
                Community Heritage
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="Gotra" error={errors.gotra?.message} {...register('gotra')} />
                <Input label="Kul" error={errors.kul?.message} {...register('kul')} />
                <Input label="Nukh" error={errors.nukh?.message} {...register('nukh')} />
              </div>
            </fieldset>
          </div>

          <div className="flex justify-end pt-4 border-t border-navy-100">
            <Button type="button" onClick={handleNextFromStep1} className="gap-2">
              Next: Members
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* STEP 2: Initial Members (Optional) */}
      {currentStep === 2 && (
        <section aria-labelledby="step2-title" className="space-y-6 animate-in fade-in duration-150">
          <div>
            <div className="flex items-center justify-between">
              <h2 id="step3-title" className="text-xl font-semibold text-navy-900">
                Initial Members
              </h2>
              <span className="rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                Optional
              </span>
            </div>
            <p className="mt-1 text-sm text-navy-500">
              Optionally stage initial members from the community census to attach upon creation.
            </p>
          </div>

          {/* Member sub-form */}
          <div className="rounded-xl border border-navy-200 bg-navy-50/50 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-1.5">
              <UserPlus className="h-4 w-4 text-brand-600" />
              Stage a Family Member
            </h3>

            {memberError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{memberError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Person Select */}
              <div className="space-y-1">
                <label htmlFor="wizard-person-select" className="block text-xs font-medium text-navy-700">
                  Select Person <span className="text-red-500">*</span>
                </label>
                <select
                  id="wizard-person-select"
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  disabled={isLoadingPersons}
                  className="w-full rounded border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
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
              </div>

              {/* Role Select */}
              <div className="space-y-1">
                <label htmlFor="wizard-role-select" className="block text-xs font-medium text-navy-700">
                  Family Role <span className="text-red-500">*</span>
                </label>
                <select
                  id="wizard-role-select"
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as FamilyRole)}
                  className="w-full rounded border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-400"
                >
                  {Object.entries(FAMILY_ROLES).map(([key, value]) => (
                    <option key={key} value={value}>
                      {FAMILY_ROLE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Head Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                id="wizard-is-head"
                type="checkbox"
                checked={isHead}
                onChange={(e) => setIsHead(e.target.checked)}
                className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="wizard-is-head" className="text-xs font-medium text-navy-700 cursor-pointer">
                Designate as Head of Family
              </label>
            </div>

            <Button type="button" variant="secondary" onClick={handleStageMember} className="w-full sm:w-auto text-xs">
              Add Member to Roster
            </Button>
          </div>

          {/* Staged Members List */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-navy-500">
              Staged Members ({stagedMembers.length})
            </h3>

            {stagedMembers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-navy-200 p-4 text-center text-xs text-navy-400">
                No initial members staged. You can skip this step and add members later.
              </p>
            ) : (
              <ul className="divide-y divide-navy-100 rounded-lg border border-navy-200 bg-white">
                {stagedMembers.map((member) => (
                  <li key={member.person_id} className="flex items-center justify-between p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-navy-900">{member.person_name}</span>
                      <span className="rounded bg-navy-100 px-2 py-0.5 text-xs text-navy-700">
                        {FAMILY_ROLE_LABELS[member.role]}
                      </span>
                      {member.is_head && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                          <Crown className="h-3 w-3 text-amber-600" />
                          Head
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedMember(member.person_id)}
                      className="rounded p-1 text-navy-400 hover:bg-navy-100 hover:text-red-600"
                      aria-label={`Remove ${member.person_name} from list`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Explicit Head Replacement Dialog */}
          {pendingHeadReplacement && (
            <div
              role="alertdialog"
              aria-labelledby="head-conflict-title"
              aria-describedby="head-conflict-desc"
              className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 p-4 backdrop-blur-sm"
            >
              <div className="w-full max-w-md rounded-xl border border-navy-200 bg-white p-6 shadow-xl space-y-4">
                <div className="flex items-center gap-2 text-amber-600">
                  <Crown className="h-5 w-5" />
                  <h4 id="head-conflict-title" className="text-base font-semibold text-navy-900">
                    Replace Existing Head of Family?
                  </h4>
                </div>

                <p id="head-conflict-desc" className="text-xs text-navy-600">
                  <strong>{currentHead?.person_name}</strong> is currently designated as the head of family. A family can
                  only have one active head.
                </p>

                <p className="text-xs text-navy-600">
                  Designating <strong>{pendingHeadReplacement.newPersonName}</strong> as head will demote{' '}
                  <strong>{currentHead?.person_name}</strong> from head status.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="secondary" onClick={cancelHeadReplacement} className="text-xs">
                    Cancel
                  </Button>
                  <Button type="button" onClick={confirmHeadReplacement} className="text-xs">
                    Confirm & Replace Head
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-navy-100">
            <Button type="button" variant="secondary" onClick={() => setCurrentStep(1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" onClick={handleNextFromStep2} className="gap-2">
              {stagedMembers.length === 0 ? 'Skip to Review' : 'Next: Review'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* STEP 3: Review & Create */}
      {currentStep === 3 && (
        <section aria-labelledby="step3-title" className="space-y-6 animate-in fade-in duration-150">
          <div>
            <h2 id="step3-title" className="text-xl font-semibold text-navy-900">
              Review & Create
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Verify family details and initial members before final registration.
            </p>
          </div>

          {submissionError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <p>{submissionError}</p>
            </div>
          )}

          {/* Review Details Card */}
          <div className="rounded-xl border border-navy-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-navy-900">{formValues.family_name}</h3>
              {formValues.description ? (
                <p className="mt-1 text-xs text-navy-600">{formValues.description}</p>
              ) : (
                <p className="mt-1 text-xs italic text-navy-400">No description provided</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-navy-100 pt-3 text-xs">
              <div>
                <span className="font-semibold text-navy-500 uppercase tracking-wider block mb-1">
                  Location
                </span>
                <p className="text-navy-800">
                  {[formValues.city, formValues.state, formValues.country].filter(Boolean).join(', ') || 'Not specified'}
                </p>
              </div>

              <div>
                <span className="font-semibold text-navy-500 uppercase tracking-wider block mb-1">
                  Community Heritage
                </span>
                <p className="text-navy-800">
                  Gotra: {formValues.gotra || '—'} | Kul: {formValues.kul || '—'} | Nukh: {formValues.nukh || '—'}
                </p>
              </div>
            </div>

            <div className="border-t border-navy-100 pt-3 text-xs">
              <span className="font-semibold text-navy-500 uppercase tracking-wider block mb-1">
                Initial Members ({stagedMembers.length})
              </span>
              {stagedMembers.length === 0 ? (
                <p className="text-navy-400 italic">No initial members staged. Members can be added later.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {stagedMembers.map((m) => (
                    <li key={m.person_id} className="flex items-center gap-2 text-navy-800">
                      <span>• {m.person_name}</span>
                      <span className="text-navy-500">({FAMILY_ROLE_LABELS[m.role]})</span>
                      {m.is_head && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                          <Crown className="h-3 w-3" /> Head
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-navy-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCurrentStep(2)}
              disabled={isCreating}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            <Button
              type="button"
              onClick={handleCreateFamily}
              isLoading={isCreating}
              disabled={isCreating}
              className="gap-2"
            >
              <Check className="h-4 w-4" />
              {isCreating ? 'Creating Family…' : 'Create Family'}
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}
