/**
 * Profile page
 *
 * Shows the current user's profile and allows updating their display name.
 *
 * DOMAIN RULE: This page shows PROFILE data (auth identity + display prefs).
 * It does NOT show the person census record (that's in public.persons).
 * The "My Person Record" link (Phase 3) will connect to the persons feature.
 *
 * Phase 2 scope:
 * - View profile: display name, email, role, join date
 * - Edit display name
 * - Sign out
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LogOut, User, Shield, CheckCircle, AlertCircle } from 'lucide-react'
import { profileUpdateSchema, type ProfileUpdateInput } from '@/features/auth/schemas/auth.schemas'
import { updateProfile } from '../services/profile.service'
import { signOut } from '@/features/auth/services/auth.service'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { ROUTES } from '@/constants/app'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'

export function ProfilePage() {
  const { user, profile, isLoading } = useAuthContext()
  const navigate = useNavigate()
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    values: {
      display_name: profile?.display_name ?? '',
    },
  })

  async function onUpdateProfile(data: ProfileUpdateInput) {
    if (!user) return
    setUpdateError(null)
    setUpdateSuccess(false)

    const result = await updateProfile(user.id, { display_name: data.display_name })

    if (result.error) {
      setUpdateError(result.error.message)
      return
    }

    setUpdateSuccess(true)
    setTimeout(() => setUpdateSuccess(false), 3000)
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    await signOut()
    navigate(ROUTES.HOME, { replace: true })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-navy-500">Loading profile…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-navy-600">Profile not found.</p>
        <Button variant="secondary" onClick={() => navigate(ROUTES.SIGN_IN)}>
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-navy-900">My Profile</h1>
      <p className="mt-1 text-sm text-navy-500">
        Manage your account settings and display preferences.
      </p>

      {/* Profile summary card */}
      <div className="mt-6 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-lg font-semibold text-navy-900">
            {profile.display_name ?? '(No name set)'}
          </p>
          <p className="text-sm text-navy-500">{profile.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-navy-100 px-2.5 py-0.5 text-xs font-medium text-navy-700">
              <Shield className="h-3 w-3" />
              {profile.role.replace(/_/g, ' ')}
            </span>
            {profile.email_verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-700">
                <CheckCircle className="h-3 w-3" />
                Verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                <AlertCircle className="h-3 w-3" />
                Email unverified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="mt-6 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-medium text-navy-900">
          <User className="h-4 w-4" />
          Display settings
        </h2>
        <p className="mt-1 text-sm text-navy-500">
          How your name appears in the community directory.
        </p>

        <form
          onSubmit={handleSubmit(onUpdateProfile)}
          noValidate
          className="mt-4 space-y-4"
        >
          <Input
            label="Display name"
            type="text"
            autoComplete="name"
            required
            error={errors.display_name?.message}
            {...register('display_name')}
          />

          {updateSuccess && (
            <p role="status" className="text-sm text-teal-600">
              ✓ Profile updated successfully
            </p>
          )}
          {updateError && (
            <p role="alert" className="text-sm text-red-600">
              {updateError}
            </p>
          )}

          <Button
            type="submit"
            isLoading={isSubmitting}
            disabled={isSubmitting || !isDirty}
          >
            Save changes
          </Button>
        </form>
      </div>

      {/* Account info (read-only) */}
      <div className="mt-6 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-medium text-navy-900">Account details</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-navy-100 pb-3">
            <dt className="text-navy-500">Email</dt>
            <dd className="font-medium text-navy-800">{profile.email}</dd>
          </div>
          <div className="flex justify-between border-b border-navy-100 pb-3">
            <dt className="text-navy-500">Role</dt>
            <dd className="font-medium text-navy-800">
              {profile.role.replace(/_/g, ' ')}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-navy-500">Member since</dt>
            <dd className="font-medium text-navy-800">
              {new Date(profile.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
        </dl>
      </div>


      {/* Sign out */}
      <div className="mt-6">
        <Button
          variant="secondary"
          onClick={handleSignOut}
          isLoading={isSigningOut}
          disabled={isSigningOut}
        >
          <LogOut className="h-4 w-4" />
          {isSigningOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </div>
  )
}
