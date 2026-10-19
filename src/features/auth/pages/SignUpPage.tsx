/**
 * Sign Up page
 *
 * Features:
 * - Display name, email, password, confirm password
 * - React Hook Form + Zod validation
 * - Email confirmation message after successful registration
 * - Friendly error display
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, RefreshCw } from 'lucide-react'
import { signUpSchema, type SignUpInput } from '../schemas/auth.schemas'
import { signUp, resendConfirmationEmail } from '../services/auth.service'
import { ROUTES } from '@/constants/app'
import { Input, PasswordInput } from '@/components/forms/Input'
import { Button } from '@/components/forms/Button'

export function SignUpPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  })

  async function onSubmit(data: SignUpInput) {
    setServerError(null)
    const result = await signUp(data)

    if (result.error) {
      setServerError(result.error.message)
      return
    }

    setRegisteredEmail(data.email)
    setEmailSent(true)
  }

  async function handleResend() {
    if (!registeredEmail) return
    setResendStatus('sending')
    setResendMessage(null)

    const result = await resendConfirmationEmail(registeredEmail)
    if (result.error) {
      setResendStatus('error')
      setResendMessage(result.error.message)
    } else {
      setResendStatus('sent')
      setResendMessage(`Confirmation email resent to ${registeredEmail}. Please check your inbox and spam folder.`)
    }
  }

  // Success state — email confirmation required
  if (emailSent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-8">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-teal-100">
            <CheckCircle className="h-8 w-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-semibold text-navy-900">Check your inbox</h1>
          <p className="mt-3 text-sm text-navy-600">
            We sent a confirmation link to{' '}
            <strong className="font-medium text-navy-900">{registeredEmail}</strong>.
            <br />
            Click the link to activate your account.
          </p>

          {/* Resend notification */}
          {resendMessage && (
            <div
              role="status"
              className={`my-4 rounded p-3 text-xs text-left ${
                resendStatus === 'sent'
                  ? 'border border-teal-200 bg-teal-50 text-teal-800'
                  : 'border border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {resendMessage}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 items-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleResend}
              disabled={resendStatus === 'sending'}
              className="text-xs"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${resendStatus === 'sending' ? 'animate-spin' : ''}`} />
              {resendStatus === 'sending' ? 'Resending...' : 'Resend confirmation email'}
            </Button>

            <button
              onClick={() => {
                setEmailSent(false)
                setResendMessage(null)
                setResendStatus('idle')
              }}
              className="text-xs text-brand-600 hover:underline"
            >
              Use a different email address
            </button>
          </div>

          <div className="mt-5 rounded bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200 text-left">
            <p className="font-semibold mb-1">Backend Tip (Supabase):</p>
            <p className="text-navy-700">Supabase free-tier limits projects to 3 emails/hour. To log in immediately without waiting for emails:</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-navy-600">
              <li>In <strong>Supabase Dashboard &gt; Authentication &gt; Providers &gt; Email</strong>, toggle <strong>OFF &ldquo;Confirm email&rdquo;</strong> to allow instant registration.</li>
              <li>Or in <strong>Authentication &gt; Users</strong>, find your email and click <strong>&ldquo;Confirm email&rdquo;</strong>.</li>
            </ul>
          </div>

          <div className="mt-8 border-t border-navy-200 pt-6">
            <Link
              to={ROUTES.SIGN_IN}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <Link to={ROUTES.HOME} className="inline-block">
            <span className="text-2xl font-bold text-brand-600">Community Roots</span>
          </Link>
          <h1 className="mt-4 text-2xl font-semibold text-navy-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Join your community family directory
          </p>
        </div>

        {/* Card */}
        <div className="rounded-lg border border-navy-200 bg-white p-8 shadow-sm">
          {serverError && (
            <div
              role="alert"
              className="mb-6 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Input
              label="Your name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Rahul Sharma"
              required
              hint="This is how you'll appear in the community"
              error={errors.displayName?.message}
              {...register('displayName')}
            />

            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              error={errors.email?.message}
              {...register('email')}
            />

            <PasswordInput
              label="Password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              required
              hint="Must contain an uppercase letter and a number"
              error={errors.password?.message}
              {...register('password')}
            />

            <PasswordInput
              label="Confirm password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              required
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              fullWidth
              isLoading={isSubmitting}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-navy-500">
          Already have an account?{' '}
          <Link
            to={ROUTES.SIGN_IN}
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
