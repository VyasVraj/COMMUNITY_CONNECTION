# Community Feature Domain

> **Phase 10 — Community Features (Subtask 1: Groups, Subtask 2: Announcements & Subtask 3: Events & RSVP)**

---

## 1. Overview

The **Community** domain provides civic, regional, and committee coordination mechanisms that exist *beyond* individual family lineages:

1. **Community Groups & Associations (Subtask 1)**:
   - **Village Associations (Watan / Native place groups)**: Organizing members by ancestral origin.
   - **Committees**: Panchayat councils, executive bodies, organizing committees.
   - **Cultural Groups**: Literary circles, festival organizing groups.
   - **Youth Wings**: Youth sports, education, and career development bodies.
   - **Other Interest Groups**: General community interest groups.

2. **Community Notice Board & Announcements (Subtask 2)**:
   - **General Notices**: Official community notices and circulars.
   - **Urgent Alerts**: Time-sensitive announcements, health alerts, emergency notices.
   - **Events**: Gatherings, panchayat meetings, tournaments, community exhibitions.
   - **Obituaries / Bereavement**: Besnu, prayer meetings, condolence notices.
   - **Celebrations**: Community honors, felicitation, festival greetings.

3. **Community Events & RSVP (Subtask 3)**:
   - **Calendar & Gatherings**: Village festivals, general body meetings, sporting events, educational workshops, and seminars.
   - **Attendance Declaration**: 3-way attendance status (`GOING`, `MAYBE`, `NOT_GOING`) with guest count allocation (0–5 additional guests).
   - **Authoritative Capacity Management**: Concurrency-safe, row-locked seat reservations with immediate capacity rejection if limit is exceeded.
   - **Lifecycle & Cancellation**: Support for scheduling, concluding, rescheduling, cancelling (with mandatory reason), or archiving events.

4. **Community Dashboard & Final Hardening (Subtask 4)**:
   - **Unified Community Hub (`CommunityPage.tsx`)**: Integrates Groups, Notice Board, and Events into a cohesive, responsive experience.
   - **Real-Time Community Pulse Metric Cards**: Quick-glance counters for total groups, verified groups, notices, pinned notices, and upcoming scheduled events.
   - **Accessible WAI-ARIA Navigation**: Standard tablist with Arrow key (`ArrowLeft`, `ArrowRight`, `Home`, `End`) keyboard navigation and badge pills.
   - **URL Synchronization & Deep-Linking**: Query parameter synchronization (`?tab=groups|announcements|events`) with browser navigation support.
   - **Dialog Accessibility Hardening**: Comprehensive `Escape` key listeners, backdrop dismissal, and `role="dialog"` attributes across all 8 community modal dialogs.
   - **Strict Zero-Leakage Guarantee**: Backend RLS and authoritative RPCs remain sole source of truth; zero `service_role` usage, zero sensitive `localStorage` tokens, zero console logging.

---

## 2. Core Architectural Invariants

### 1. `PERSON != USER`
- Group memberships, announcement authors, event creators, and event RSVPs link to interactive user accounts (`public.profiles.id` / `auth.users.id`), **never** census `public.persons` records.
- Joining a group, posting a notice, or RSVPing to an event represents personal interactive participation.
- No census Person records are created, altered, or linked by community operations.

### 2. `FAMILY != GROUP`
- Families (`public.families`) represent genealogical lineages.
- Groups (`public.groups`), announcements (`public.announcements`), and events (`public.events`) represent civic or cultural associations.
- The domains remain strictly separate tables with independent lifecycles.

### 3. Authoritative RPC Mutation Model
- Direct client `INSERT`, `UPDATE`, and `DELETE` on `public.groups`, `public.group_members`, `public.announcements`, `public.events`, and `public.event_rsvps` are strictly blocked via explicit RLS deny policies and revoked table privileges.
- All mutations route strictly through `SECURITY DEFINER` RPCs with `SET search_path = public` and audit logging.

### 4. Announcements & Events Visibility & Destinations
- **Global Notices / Events** (`group_id IS NULL`): Discoverable by all authenticated members; creation/modification reserved for global community moderators (`is_community_moderator()`).
- **Group Notices / Events** (`group_id IS NOT NULL`): Visible to members permitted to view the underlying group; creation/modification reserved for group `ADMIN`, `MODERATOR`, or global moderator.

### 5. Concurrency-Safe RSVP Capacity Enforcement
- Attendance capacity is strictly enforced inside `set_event_rsvp(UUID, event_rsvp_status, INT, TEXT)`.
- When an attendee RSVPs `GOING`:
  - It row-locks the target event record via `SELECT ... FOR UPDATE`.
  - Seat consumption is calculated as `1 + guest_count`.
  - If `capacity` is defined and `current_going_seats + new_seats > capacity`, an authoritative exception `EVENT_CAPACITY_EXCEEDED` is thrown.
- Transitioning to `NOT_GOING` retains the RSVP record with status `NOT_GOING` and zero consumed seats, freeing capacity for other members.

---

## 3. Database Schema

### `public.groups`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `name` | TEXT | Group name (1–150 chars) |
| `slug` | TEXT | URL-friendly unique identifier (3–100 chars, `^[a-z0-9-]+$`) |
| `description` | TEXT | Optional description (max 2000 chars) |
| `group_type` | `group_type` | Enum: `VILLAGE_ASSOCIATION`, `COMMITTEE`, `CULTURAL`, `YOUTH`, `OTHER` |
| `location` | TEXT | Optional location/region (max 200 chars) |
| `is_verified` | BOOLEAN | Moderator-verified status (default FALSE) |
| `is_private` | BOOLEAN | Private/invitation-only group indicator (default FALSE) |
| `created_by` | UUID | FK to `auth.users(id)` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.group_members`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `group_id` | UUID | FK to `groups(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK to `auth.users(id)` ON DELETE CASCADE |
| `role` | `group_role` | Enum: `ADMIN`, `MODERATOR`, `MEMBER` |
| `joined_at` | TIMESTAMPTZ | Timestamp joined |

### `public.announcements`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `title` | TEXT | Notice headline (1–200 chars) |
| `content` | TEXT | Notice content (1–10000 chars) |
| `announcement_type` | `announcement_type` | Enum: `GENERAL`, `URGENT`, `EVENT`, `BEREAVEMENT`, `CELEBRATION` |
| `status` | `announcement_status` | Enum: `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `group_id` | UUID | Nullable FK to `groups(id)`; NULL = Community-wide |
| `author_id` | UUID | FK to `auth.users(id)` |
| `is_pinned` | BOOLEAN | Pinned to top of board (default FALSE) |
| `published_at` | TIMESTAMPTZ | Publication timestamp |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.events`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `title` | TEXT | Event title (1–200 chars) |
| `description` | TEXT | Detailed description (max 10000 chars) |
| `event_type` | `event_type` | Enum: `GENERAL`, `FESTIVAL`, `MEETING`, `SPORTS`, `YOUTH`, `CULTURAL`, `WORKSHOP`, `OTHER` |
| `status` | `event_status` | Enum: `DRAFT`, `PUBLISHED`, `CANCELLED`, `COMPLETED`, `ARCHIVED` |
| `start_time` | TIMESTAMPTZ | Mandatory start timestamp |
| `end_time` | TIMESTAMPTZ | Optional end timestamp (`CHECK (end_time IS NULL OR end_time > start_time)`) |
| `location` | TEXT | Venue location or virtual platform name (max 300 chars) |
| `location_url` | TEXT | Map or meeting link (max 1000 chars) |
| `group_id` | UUID | Nullable FK to `groups(id)`; NULL = Community-wide |
| `creator_id` | UUID | FK to `auth.users(id)` |
| `is_pinned` | BOOLEAN | Pinned to calendar top (default FALSE) |
| `capacity` | INT | Optional attendee limit (`CHECK (capacity IS NULL OR capacity > 0)`) |
| `published_at` | TIMESTAMPTZ | Publication timestamp |
| `cancelled_at` | TIMESTAMPTZ | Cancellation timestamp |
| `cancellation_reason` | TEXT | Reason for cancellation (max 1000 chars) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `deleted_at` | TIMESTAMPTZ | Soft-deletion timestamp |

### `public.event_rsvps`
| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key (UUID v4) |
| `event_id` | UUID | FK to `events(id)` ON DELETE CASCADE |
| `user_id` | UUID | FK to `auth.users(id)` ON DELETE CASCADE |
| `status` | `event_rsvp_status` | Enum: `GOING`, `MAYBE`, `NOT_GOING` |
| `guest_count` | INT | Bounded additional guests (`CHECK (guest_count >= 0 AND guest_count <= 5)`) |
| `notes` | TEXT | Optional attendee notes (max 300 chars) |
| `created_at` | TIMESTAMPTZ | RSVP timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

---

## 4. Security & RLS Model

- **Table Privileges:**
  - `REVOKE ALL ON public.groups, public.group_members, public.announcements, public.events, public.event_rsvps FROM PUBLIC, anon;`
  - `GRANT SELECT ON public.groups, public.group_members, public.announcements, public.events, public.event_rsvps TO authenticated;`
- **RPC Privileges:**
  - `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;`
  - `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- **Event RPCs (`SECURITY DEFINER`, `search_path = public`):**
  - `create_community_event`: Validates scope, permissions, date constraints, and logs audit record.
  - `update_community_event`: Enforces organizer permissions and date constraints with audit logging.
  - `cancel_community_event`: Transitions status to `CANCELLED`, records cancellation timestamp and reason with audit logging.
  - `archive_community_event`: Transitions status to `ARCHIVED` with audit logging.
  - `delete_community_event`: Soft-deletes event (`deleted_at = NOW()`) with audit logging.
  - `set_event_rsvp`: Concurrency-safe attendance registration with `SELECT ... FOR UPDATE` capacity enforcement and audit logging.
  - `cancel_event_rsvp`: Removes RSVP record or transitions to `NOT_GOING` with audit logging.

