/**
 * Community Page (Phase 10 — Subtask 4 Dashboard & Final Hardening)
 *
 * Unified Community Hub Dashboard:
 * - Community Groups & Associations (Subtask 1)
 * - Notice Board / Community Announcements (Subtask 2)
 * - Events & Calendar with RSVP (Subtask 3)
 *
 * Features:
 * - Real-time Community Pulse metric cards
 * - Accessible WAI-ARIA tab navigation with Arrow key keyboard controls
 * - Deep-linking and URL query param synchronization (?tab=groups|announcements|events)
 * - Domain separation preserved: PERSON != USER, FAMILY != GROUP
 * - RLS and authoritative RPC security enforced on all underlying mutations
 */

import React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Users,
  Bell,
  Calendar,
  ArrowRight,
  Pin,
  CheckCircle,
  Clock,
} from 'lucide-react'
import { useGroups } from '../hooks/useGroups'
import { useAnnouncements } from '../hooks/useAnnouncements'
import { useEvents } from '../hooks/useEvents'
import { GroupsCatalog } from '../components/GroupsCatalog'
import { AnnouncementsFeed } from '../components/AnnouncementsFeed'
import { EventsFeed } from '../components/EventsFeed'

export type CommunityTab = 'groups' | 'announcements' | 'events'

export function CommunityPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawTab = searchParams.get('tab')
  const activeTab: CommunityTab =
    rawTab === 'announcements' || rawTab === 'events' ? rawTab : 'groups'

  const handleTabChange = (newTab: CommunityTab) => {
    setSearchParams({ tab: newTab }, { replace: true })
  }

  // Fetch summary counts for overview cards
  const { data: groups, isLoading: groupsLoading } = useGroups()
  const { data: announcements, isLoading: announcementsLoading } =
    useAnnouncements()
  const { data: events, isLoading: eventsLoading } = useEvents()

  const groupsCount = groups?.length ?? 0
  const verifiedGroupsCount = groups?.filter((g) => g.is_verified).length ?? 0

  const announcementsCount = announcements?.length ?? 0
  const pinnedAnnouncementsCount =
    announcements?.filter((a) => a.is_pinned).length ?? 0

  const eventsCount = events?.length ?? 0
  const upcomingEventsCount =
    events?.filter((e) => new Date(e.start_time).getTime() > Date.now())
      .length ?? 0

  // Keyboard navigation for WAI-ARIA tablist
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const tabs: CommunityTab[] = ['groups', 'announcements', 'events']
    const currentIndex = tabs.indexOf(activeTab)

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const nextTab = tabs[(currentIndex + 1) % tabs.length]
      handleTabChange(nextTab)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prevTab = tabs[(currentIndex - 1 + tabs.length) % tabs.length]
      handleTabChange(prevTab)
    } else if (e.key === 'Home') {
      e.preventDefault()
      handleTabChange('groups')
    } else if (e.key === 'End') {
      e.preventDefault()
      handleTabChange('events')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Community Hub
        </h1>
        <p className="mt-1 text-sm text-slate-500 max-w-3xl">
          Connect with local village associations, stay informed with official
          notices, and participate in community gatherings and celebrations.
        </p>
      </div>

      {/* Community Pulse Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Groups Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('groups')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'groups'
              ? 'border-blue-600 bg-blue-50/40 shadow-sm ring-1 ring-blue-600'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Groups: ${groupsCount} registered`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Users className="h-5 w-5" />
              </span>
              {verifiedGroupsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                  <CheckCircle className="h-3 w-3" />
                  {verifiedGroupsCount} verified
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {groupsLoading ? '...' : groupsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                Groups & Associations
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                Village wings, cultural associations & committees.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-blue-600">
            <span>Browse catalog</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Notices Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('announcements')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'announcements'
              ? 'border-amber-600 bg-amber-50/40 shadow-sm ring-1 ring-amber-600'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Notice Board: ${announcementsCount} notices`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <Bell className="h-5 w-5" />
              </span>
              {pinnedAnnouncementsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                  <Pin className="h-3 w-3 fill-amber-600" />
                  {pinnedAnnouncementsCount} pinned
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {announcementsLoading ? '...' : announcementsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                Notice Board
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                Official notices, news & community announcements.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-700">
            <span>View notice board</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>

        {/* Events Metric Card */}
        <button
          type="button"
          onClick={() => handleTabChange('events')}
          className={`flex flex-col justify-between rounded-xl border p-5 text-left transition-all hover:shadow-md ${
            activeTab === 'events'
              ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-600'
              : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
          aria-label={`View Events: ${eventsCount} events`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                <Calendar className="h-5 w-5" />
              </span>
              {upcomingEventsCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 border border-indigo-200">
                  <Clock className="h-3 w-3" />
                  {upcomingEventsCount} upcoming
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-slate-900">
                {eventsLoading ? '...' : eventsCount}
              </div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">
                Events & Calendar
              </div>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                Gatherings, meetings, celebrations & RSVP registrations.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-indigo-600">
            <span>Explore events</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </button>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-b border-slate-200">
        <nav
          className="-mb-px flex space-x-6 overflow-x-auto"
          aria-label="Community Hub Tabs"
          role="tablist"
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            id="tab-groups"
            aria-selected={activeTab === 'groups'}
            aria-controls="panel-groups"
            tabIndex={activeTab === 'groups' ? 0 : -1}
            onClick={() => handleTabChange('groups')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'groups'
                ? 'border-blue-600 text-blue-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            <span>Groups & Associations</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'groups'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {groupsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-announcements"
            aria-selected={activeTab === 'announcements'}
            aria-controls="panel-announcements"
            tabIndex={activeTab === 'announcements' ? 0 : -1}
            onClick={() => handleTabChange('announcements')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'announcements'
                ? 'border-amber-600 text-amber-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Bell className="h-4 w-4" aria-hidden="true" />
            <span>Notice Board</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'announcements'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {announcementsCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-events"
            aria-selected={activeTab === 'events'}
            aria-controls="panel-events"
            tabIndex={activeTab === 'events' ? 0 : -1}
            onClick={() => handleTabChange('events')}
            className={[
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors focus:outline-none whitespace-nowrap',
              activeTab === 'events'
                ? 'border-indigo-600 text-indigo-700 font-semibold'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            ].join(' ')}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            <span>Events & Calendar</span>
            <span
              className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'events'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {eventsCount}
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'groups' && (
        <div
          id="panel-groups"
          role="tabpanel"
          aria-labelledby="tab-groups"
          tabIndex={0}
        >
          <GroupsCatalog />
        </div>
      )}

      {activeTab === 'announcements' && (
        <div
          id="panel-announcements"
          role="tabpanel"
          aria-labelledby="tab-announcements"
          tabIndex={0}
        >
          <AnnouncementsFeed />
        </div>
      )}

      {activeTab === 'events' && (
        <div
          id="panel-events"
          role="tabpanel"
          aria-labelledby="tab-events"
          tabIndex={0}
        >
          <EventsFeed />
        </div>
      )}
    </div>
  )
}
