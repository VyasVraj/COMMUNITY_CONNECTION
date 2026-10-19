/**
 * Home Page
 *
 * The landing page of Community Roots.
 * In Phase 0 this is an informational shell.
 * Full implementation follows in later phases as features are built.
 *
 * Design: Professional, community-oriented. No gradients.
 */

import { Link } from 'react-router-dom'
import { Users, Search, TreePine, Shield } from 'lucide-react'
import { ROUTES } from '@/constants/app'

const FEATURES = [
  {
    icon: Users,
    title: 'Family Census',
    description:
      'Register your family, add members, and build a comprehensive record of your household within the community.',
  },
  {
    icon: TreePine,
    title: 'Family Tree',
    description:
      'Visualize your family history with an interactive tree spanning multiple generations and branches.',
  },
  {
    icon: Search,
    title: 'Discover',
    description:
      'Find families and community members. Connect with relatives and discover shared heritage.',
  },
  {
    icon: Shield,
    title: 'Verified Records',
    description:
      'Community-verified family records ensure authenticity and trust across the entire platform.',
  },
] as const

export function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="bg-navy-900 py-20 text-white" aria-labelledby="hero-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-brand-700 p-4">
                <Users className="h-12 w-12 text-brand-200" aria-hidden="true" />
              </div>
            </div>
            <h1
              id="hero-heading"
              className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl"
            >
              Preserve Your Family Legacy
            </h1>
            <p className="mb-8 text-lg text-navy-300">
              Community Roots is a trusted platform for your community&apos;s family census, family
              trees, directories, and connections. Register your family, discover relatives, and
              keep your heritage alive for future generations.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to={ROUTES.SIGN_UP}
                className="w-full rounded bg-brand-600 px-8 py-3 text-center font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 sm:w-auto"
              >
                Register Your Family
              </Link>
              <Link
                to={ROUTES.DISCOVER}
                className="w-full rounded border border-navy-500 px-8 py-3 text-center font-semibold text-navy-200 transition-colors hover:border-navy-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-900 sm:w-auto"
              >
                Find My Family
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16" aria-labelledby="features-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2
              id="features-heading"
              className="mb-3 text-3xl font-bold tracking-tight text-navy-900"
            >
              Everything Your Community Needs
            </h2>
            <p className="text-navy-500">
              A comprehensive platform built for community connection and family heritage.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-lg border border-navy-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50">
                  <Icon className="h-6 w-6 text-brand-600" aria-hidden="true" />
                </div>
                <h3 className="mb-2 font-semibold text-navy-900">{title}</h3>
                <p className="text-sm text-navy-500">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-navy-200 bg-navy-50 py-16" aria-labelledby="cta-heading">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="cta-heading"
              className="mb-4 text-2xl font-bold tracking-tight text-navy-900"
            >
              Ready to Connect With Your Community?
            </h2>
            <p className="mb-6 text-navy-500">
              Join thousands of families who have already registered on Community Roots.
            </p>
            <Link
              to={ROUTES.SIGN_UP}
              className="inline-block rounded bg-brand-600 px-8 py-3 font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              Get Started — It&apos;s Free
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
