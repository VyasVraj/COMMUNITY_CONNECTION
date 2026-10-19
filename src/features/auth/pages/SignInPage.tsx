/**
 * Sign In page
 *
 * Features:
 * - Email + password form (React Hook Form + Zod)
 * - Error display with user-friendly messages
 * - "Forgot password" link
 * - "Don't have an account? Sign up" link
 * - Redirects to previous page (or home) on success
 */

import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, KeyRound, CheckCircle, RefreshCw } from 'lucide-react'
import {
  signInSchema,
  magicLinkSchema,
  type SignInInput,
  type MagicLinkInput,
} from '../schemas/auth.schemas'
import { signIn, signInWithOtp, resendConfirmationEmail } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { Input, PasswordInput } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'

export function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [authMode, setAuthMode] = useState<'password' | 'magic_link'>('password')
  const [serverError, setServerError] = useState<string | null>(null)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [magicLinkEmail, setMagicLinkEmail] = useState('')

  // Redirect destination: either where user came from, or home
  const from =
    (location.state as { from?: string } | null)?.from ?? ROUTES.HOME

  // Password form
  const {
    register: registerPassword,
    handleSubmit: handleSubmitPassword,
    formState: { errors: passwordErrors, isSubmitting: isSubmittingPassword },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
  })

  // Magic Link form
  const {
    register: registerMagicLink,
    handleSubmit: handleSubmitMagicLink,
    formState: { errors: magicLinkErrors, isSubmitting: isSubmittingMagicLink },
  } = useForm<MagicLinkInput>({
    resolver: zodResolver(magicLinkSchema),
  })

  async function onPasswordSubmit(data: SignInInput) {
    setServerError(null)
    setUnconfirmedEmail(null)
    setResendStatus('idle')
    setResendMessage(null)

    const result = await signIn(data)

    if (result.error) {
      setServerError(result.error.message)
      if (
        result.error.code === 'email_not_confirmed' ||
        result.error.message.toLowerCase().includes('confirm your email')
      ) {
        setUnconfirmedEmail(data.email)
      }
      return
    }

    navigate(from, { replace: true })
  }

  async function onMagicLinkSubmit(data: MagicLinkInput) {
    setServerError(null)
    const result = await signInWithOtp(data.email)

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    setMagicLinkEmail(data.email)
    setMagicLinkSent(true)
  }

  async function handleResendConfirmation() {
    if (!unconfirmedEmail) return
    setResendStatus('sending')
    setResendMessage(null)

    const result = await resendConfirmationEmail(unconfirmedEmail)
    if (result.error) {
      setResendStatus('error')
      setResendMessage(result.error.message)
    } else {
      setResendStatus('sent')
      setResendMessage(`Confirmation email sent to ${unconfirmedEmail}. Please check your inbox and spam folder.`)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-8">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 text-center">
          <Link to={ROUTES.HOME} className="inline-block">
            <span className="text-2xl font-bold text-brand-600">Community Roots</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">
            Sign in to your account
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Welcome back to your community
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-navy-200 bg-white p-8 shadow-sm">
          {/* Mode Switch Tabs */}
          <div className="mb-6 flex rounded-md bg-navy-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('password')
                setServerError(null)
                setMagicLinkSent(false)
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded py-2 text-xs font-medium transition-colors ${
                authMode === 'password'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('magic_link')
                setServerError(null)
                setMagicLinkSent(false)
              }}
              className={`flex-1 flex items-center justify-center gap-2 rounded py-2 text-xs font-medium transition-colors ${
                authMode === 'magic_link'
                  ? 'bg-white text-navy-900 shadow-sm'
                  : 'text-navy-600 hover:text-navy-900'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Email Link (Magic Link)
            </button>
          </div>

          {/* Server error banner */}
          {serverError && (
            <div
              role="alert"
              className="mb-6 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <p>{serverError}</p>

              {/* Unconfirmed email resend action */}
              {unconfirmedEmail && (
                <div className="mt-3 border-t border-red-200 pt-3">
                  <p className="text-xs text-red-800 mb-2">
                    Didn&apos;t get the confirmation email?
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleResendConfirmation}
                    disabled={resendStatus === 'sending'}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${resendStatus === 'sending' ? 'animate-spin' : ''}`} />
                    {resendStatus === 'sending' ? 'Sending...' : 'Resend Confirmation Email'}
                  </Button>

                  <div className="mt-3 rounded bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-200 text-left">
                    <p className="font-semibold mb-1">Why is email not arriving?</p>
                    <p className="text-navy-700">Supabase free-tier limits projects to 3 emails/hour. To bypass email confirmation completely:</p>
                    <ul className="list-disc pl-4 mt-1 space-y-0.5 text-navy-600">
                      <li>In <strong>Supabase Dashboard &gt; Authentication &gt; Providers &gt; Email</strong>, toggle <strong>OFF &ldquo;Confirm email&rdquo;</strong> to allow immediate login.</li>
                      <li>Or in <strong>Authentication &gt; Users</strong>, click &ldquo;...&rdquo; on your email and click <strong>&ldquo;Confirm email&rdquo;</strong>.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resend confirmation notification */}
          {resendMessage && (
            <div
              role="status"
              className={`mb-6 rounded p-4 text-sm ${
                resendStatus === 'sent'
                  ? 'border border-teal-200 bg-teal-50 text-teal-800'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {resendMessage}
            </div>
          )}

          {/* Mode 1: Password Login */}
          {authMode === 'password' && (
            <form onSubmit={handleSubmitPassword(onPasswordSubmit)} noValidate className="space-y-5">
              <Input
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                error={passwordErrors.email?.message}
                {...registerPassword('email')}
              />

              <div>
                <PasswordInput
                  label="Password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  error={passwordErrors.password?.message}
                  {...registerPassword('password')}
                />
                <div className="mt-1 text-right">
                  <Link
                    to={ROUTES.FORGOT_PASSWORD}
                    className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                fullWidth
                isLoading={isSubmittingPassword}
                disabled={isSubmittingPassword}
              >
                {isSubmittingPassword ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          )}

          {/* Mode 2: Magic Link Login */}
          {authMode === 'magic_link' && (
            <div>
              {magicLinkSent ? (
                <div className="text-center py-4">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
                    <CheckCircle className="h-6 w-6 text-teal-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-navy-900">Check your inbox</h2>
                  <p className="mt-2 text-sm text-navy-600">
                    We sent a sign-in link to{' '}
                    <strong className="font-medium text-navy-900">{magicLinkEmail}</strong>.
                    Click the link in the email to log in instantly.
                  </p>
                  <p className="mt-4 text-xs text-navy-400">
                    Didn&apos;t receive it? Check spam folder or{' '}
                    <button
                      type="button"
                      onClick={() => setMagicLinkSent(false)}
                      className="text-brand-600 hover:underline"
                    >
                      try again
                    </button>
                    .
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitMagicLink(onMagicLinkSubmit)} noValidate className="space-y-5">
                  <p className="text-xs text-navy-600">
                    Enter your email and we&apos;ll send you a passwordless sign-in link.
                  </p>
                  <Input
                    label="Email address"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    error={magicLinkErrors.email?.message}
                    {...registerMagicLink('email')}
                  />

                  <Button
                    type="submit"
                    fullWidth
                    isLoading={isSubmittingMagicLink}
                    disabled={isSubmittingMagicLink}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {isSubmittingMagicLink ? 'Sending login link…' : 'Send login link to email'}
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-navy-500">
          Don&apos;t have an account?{' '}
          <Link
            to={ROUTES.SIGN_UP}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
