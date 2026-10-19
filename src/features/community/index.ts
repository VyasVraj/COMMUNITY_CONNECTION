/**
 * Community Feature Domain Public API (Phase 10 — Subtasks 1, 2 & 3)
 */

export * from './types'

// Groups (Subtask 1)
export * from './schemas/group.schemas'
export * from './services/groups.service'
export * from './hooks/useGroups'
export * from './components/GroupTypeBadge'
export * from './components/GroupCard'
export * from './components/GroupFiltersBar'
export * from './components/CreateGroupModal'
export * from './components/GroupsCatalog'

// Announcements (Subtask 2)
export * from './schemas/announcement.schemas'
export * from './services/announcements.service'
export * from './hooks/useAnnouncements'
export * from './components/AnnouncementTypeBadge'
export * from './components/AnnouncementCard'
export * from './components/AnnouncementFiltersBar'
export * from './components/AnnouncementDetailModal'
export * from './components/CreateAnnouncementModal'
export * from './components/EditAnnouncementModal'
export * from './components/AnnouncementsFeed'

// Events & RSVPs (Subtask 3)
export * from './schemas/event.schemas'
export * from './services/events.service'
export * from './hooks/useEvents'
export * from './components/EventTypeBadge'
export * from './components/EventStatusBadge'
export * from './components/RsvpButtonGroup'
export * from './components/EventCard'
export * from './components/EventFiltersBar'
export * from './components/EventDetailModal'
export * from './components/CreateEventModal'
export * from './components/EditEventModal'
export * from './components/CancelEventModal'
export * from './components/EventsFeed'

// Page
export * from './pages/CommunityPage'

