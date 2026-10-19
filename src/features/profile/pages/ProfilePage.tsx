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
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LogOut, User, Shield, CheckCircle, AlertCircle, Camera, Bell, GitBranch, Search, PlusCircle, ArrowRight } from 'lucide-react'
import { profileUpdateSchema, type ProfileUpdateInput } from '@/features/auth/schemas/auth.schemas'
import { updateProfile } from '../services/profile.service'
import { signOut } from '@/features/auth/services/auth.service'
import { useAuthContext } from '@/features/auth/context/AuthContext'
import { usePersonByUserId } from '@/features/people'
import { ROUTES } from '@/constants/app'
import { Input } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'
import { AvatarImage, AvatarUploadDialog } from '@/features/media'

export function ProfilePage() {
  const { user, profile, isLoading } = useAuthContext()
  const { data: linkedPerson, isLoading: isLoadingPerson } = usePersonByUserId(user?.id)
  const navigate = useNavigate()
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(profile?.avatar_url ?? null)

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

      {/* Avatar + summary card */}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <AvatarImage
            src={currentAvatar}
            name={profile.display_name ?? profile.email}
            alt={profile.display_name ?? 'Profile avatar'}
            size="xl"
            shape="circle"
          />
          <div>
            <p className="text-lg font-semibold text-navy-900">
              {profile.display_name ?? '(No name set)'}
            </p>
            <p className="text-sm text-navy-500">{profile.email}</p>
            <div className="mt-1 flex items-center gap-2">
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

        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAvatarDialogOpen(true)}
            className="flex items-center gap-2"
          >
            <Camera className="h-4 w-4" />
            Change photo
          </Button>
        </div>
      </div>

      <AvatarUploadDialog
        isOpen={avatarDialogOpen}
        onClose={() => setAvatarDialogOpen(false)}
        target={{ type: 'profile', id: user.id }}
        currentAvatarUrl={currentAvatar}
        onSuccess={(newUrl) => {
          setCurrentAvatar(newUrl)
          setAvatarDialogOpen(false)
        }}
      />

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

      {/* Community Census Record (PERSON != USER) */}
      <div className="mt-6 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-navy-900">Community Census Record</h2>
            <p className="mt-1 text-sm text-navy-500">
              Your genealogical identity in the community census (separate from your login account).
            </p>
          </div>
          <span className="inline-flex items-center rounded-md bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-600 border border-navy-200">
            PERSON ≠ USER
          </span>
        </div>

        <div className="mt-4">
          {isLoadingPerson ? (
            <p className="text-xs text-navy-500">Loading linked census record…</p>
          ) : linkedPerson ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900">
                      {linkedPerson.first_name} {linkedPerson.last_name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                      <CheckCircle className="h-3 w-3" />
                      Linked to this account
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-navy-600">
                    {linkedPerson.gotra ? `Gotra: ${linkedPerson.gotra} • ` : ''}
                    {linkedPerson.birth_place ? `Birth Place: ${linkedPerson.birth_place} • ` : ''}
                    Privacy: {linkedPerson.profile_privacy}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={ROUTES.PERSON_DETAIL(linkedPerson.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-50 shadow-2xs"
                  >
                    View Record
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link
                    to={ROUTES.PERSON_TREE(linkedPerson.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 shadow-2xs"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    Family Tree
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-navy-200 bg-navy-50/40 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-navy-800">
                    No census record is currently linked to your user account
                  </p>
                  <p className="mt-0.5 text-xs text-navy-500">
                    You can search the community directory for your existing genealogical record or add a new record.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={ROUTES.DISCOVER}
                    className="inline-flex items-center gap-1 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 shadow-2xs"
                  >
                    <Search className="h-3.5 w-3.5 text-navy-500" />
                    Search Directory
                  </Link>
                  <Link
                    to={ROUTES.PERSON_CREATE}
                    className="inline-flex items-center gap-1 rounded-md bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800 shadow-2xs"
                  >
                    <PlusCircle className="h-3.5 w-3.5" />
                    Add My Record
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="mt-6 rounded-lg border border-navy-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-medium text-navy-900">Notification preferences</h2>
            <p className="mt-1 text-sm text-navy-500">
              Manage how and when you receive in-app and email updates for community activity.
            </p>
          </div>
          <Link
            to={ROUTES.NOTIFICATION_PREFERENCES}
            className="inline-flex items-center gap-1.5 rounded-md border border-navy-300 bg-white px-3 py-1.5 text-sm font-medium text-navy-700 shadow-sm hover:bg-navy-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            <Bell className="h-4 w-4 text-navy-500" />
            Manage
          </Link>
        </div>
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
