# Clinic Bot — Project Context for AI Handoff

This document captures the full current state of the project so another AI assistant can continue development without needing the original conversation history.

---

## Project Overview

A WhatsApp AI chatbot for medical clinics in Iraq. Patients send WhatsApp messages → Meta Cloud API webhooks → Express backend → Claude AI agent → WhatsApp reply. A Next.js dashboard lets clinic staff manage appointments, availability, FAQs, and blocked days.

**Monorepo layout:**
```
clinic-bot/
├── backend/          Node.js + Express  (port 3000)
│   └── src/
│       ├── agent/
│       │   ├── index.js      — Claude agent loop + system prompt
│       │   └── tools.js      — all tool implementations
│       ├── routes/
│       │   └── appointments.js
│       ├── services/
│       │   ├── supabase.js
│       │   ├── whatsapp.js
│       │   └── messageDebouncer.js
│       ├── utils/
│       │   └── logger.js
│       └── webhooks/
│           └── whatsapp.js
├── dashboard/        Next.js 15  (port 3001)
│   └── app/
│       ├── appointments/page.js
│       ├── availability/page.jsx
│       └── ...
├── database/
│   ├── schema.sql
│   ├── seed.sql
│   ├── RESET.md
│   └── migrations/
│       ├── 001_availability.sql
│       └── 002_capacity_booking.sql
├── dev-tunnel.ps1    — Cloudflare Tunnel helper (Windows)
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express (port 3000) |
| AI | Anthropic Claude `claude-sonnet-4-6` via `@anthropic-ai/sdk` |
| Database | Supabase (PostgreSQL) |
| Dashboard | Next.js 15, Tailwind CSS (port 3001) |
| WhatsApp | Meta Cloud API v22.0 |
| Timezone | `Asia/Baghdad` (UTC+3) throughout, using `dayjs` + `utc` + `timezone` plugins |
| Tunnel (dev) | Cloudflare Tunnel (`npx cloudflared tunnel --url http://localhost:3000`) — ngrok is blocked in Iraq |

---

## Environment Variables

### Backend (`backend/.env`)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
META_ACCESS_TOKEN=
META_PHONE_NUMBER_ID=
META_VERIFY_TOKEN=
PORT=3000
```

### Dashboard (`dashboard/.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_CLINIC_ID=
```

---

## Database Schema (key tables)

```sql
-- Working hours per weekday OR specific date override
availability_schedules (
  id, clinic_id,
  day_of_week INT,        -- 0=Sun … 6=Sat (NULL if specific_date is set)
  specific_date DATE,     -- NULL if weekly rule
  is_working_day BOOLEAN,
  shifts JSONB,           -- [{ "open": "09:00", "close": "17:00" }]
  daily_capacity INTEGER  -- NULL = unlimited
)

-- Appointments are DAY-based, not hour-based
appointments (
  id, clinic_id, patient_id,
  scheduled_at TIMESTAMPTZ,  -- stored at noon Baghdad (marker only, not real time)
  queue_number INTEGER,       -- auto-assigned order within the day
  status TEXT,               -- scheduled | confirmed | completed | cancelled | cancelled_by_clinic | no_show
  reason TEXT,
  duration_minutes INTEGER
)

-- Doctor absences / holidays
blocked_periods (
  id, clinic_id,
  start_at TIMESTAMPTZ,  -- saved with +03:00 Baghdad offset
  end_at   TIMESTAMPTZ,
  is_full_day BOOLEAN,
  reason TEXT
)

-- Chat history (user + assistant + tool messages)
conversations (
  id, clinic_id, patient_id, patient_phone,
  role TEXT,           -- user | assistant | tool | system
  content TEXT,
  tool_calls JSONB,
  whatsapp_message_id TEXT UNIQUE  -- for deduplication
)

-- Per-patient bot state
conversation_state (
  clinic_id, patient_phone,
  state TEXT,          -- active | awaiting_human | resolved
  state_data JSONB,
  last_message_at TIMESTAMPTZ
)
```

---

## Booking Model

- Booking is **per-day, not per-hour**. Patients pick a day only — no time slot.
- Each booking gets an auto `queue_number` (رقم بالدور) within that day.
- `scheduled_at` is stored at `noon Baghdad` as a fixed marker time (not meaningful).
- Each working day has a `daily_capacity` (or `NULL` = unlimited).
- When capacity is reached, that day is no longer offered.
- After booking, the bot tells the patient their **estimated arrival time** based on:
  `shift_open_time + (queue_number - 1) × appointment_duration_minutes`
- All times shown to patients use **12-hour Arabic format** (e.g. `9:00 ص`, `5:00 م`).

---

## Agent Tools (backend/src/agent/tools.js)

| Tool | Purpose |
|------|---------|
| `check_availability` | Returns available days (next 14 days from preference), with booked/capacity/remaining/working_hours |
| `book_appointment` | Inserts appointment, assigns queue_number, returns confirmation with estimated time |
| `get_day_bookings` | Returns booked count for a given day |
| `cancel_appointment` | Cancels next upcoming appointment for the patient |
| `get_faq_answer` | Keyword search against clinic FAQs |
| `escalate_to_human` | Sets conversation_state to `awaiting_human` |

### Availability resolution priority (inside getDayConfig):
```
specific_date override  >  weekly day_of_week rule  >  legacy clinic.working_hours JSONB
```

### Key validation rules in tools.js:
1. **checkAvailability**: today is excluded if `now >= shift.close` (shift already ended)
2. **bookAppointment**: same check — returns error if trying to book today after shift end
3. **bookAppointment**: rejects past dates, blocked days, non-working days, full days

---

## Webhook Flow (backend/src/webhooks/whatsapp.js)

Two-phase processing:

```
Incoming WhatsApp message
        │
        ▼
processMessage()          ← runs immediately on every message
  1. Resolve clinic by phoneNumberId
  2. Upsert patient
  3. Save message (dedup by whatsapp_message_id — returns null if duplicate)
  4. markMessageRead (best-effort)
  5. debounceMessage() → waits 2500ms for burst to settle
        │
        ▼ (after 2500ms silence)
processDebounced()        ← runs once per burst, with combined text
  1. Check conversation state (skip agent if awaiting_human)
  2. Update state to active
  3. sendTypingIndicator (best-effort)
  4. handleIncomingMessage() → Claude agent
  5. sendWhatsAppMessage() → reply to patient
```

### Message Debouncing (backend/src/services/messageDebouncer.js)
- 2500ms debounce window
- In-memory Map: `${clinicId}:${phoneNumber}` → `{ timer, parts[] }`
- Rapid message fragments joined with a space before passing to agent
- Handles patients who type one word per message

---

## Agent Loop (backend/src/agent/index.js)

- Model: `claude-sonnet-4-6`
- Max tokens: `1024`
- Max tool rounds: `5`
- On each call:
  1. Loads last 10 conversation messages from DB
  2. Loads weekly schedule from `availability_schedules` (fresh every call)
  3. Loads upcoming blocked periods (next 30 days)
  4. Builds system prompt with clinic info, schedule, blocks
  5. Runs agentic loop until `end_turn` or max rounds
  6. Saves assistant reply + all tool calls/results to `conversations` table

### System prompt language:
Iraqi Arabic dialect (`اللهجة العراقية العامية`). Bot is warm and professional. Times in 12-hour format.

---

## Dashboard Pages

### /appointments
- Lists all appointments with day + queue number (رقم الدور) as blue badge
- Staff can cancel with a reason → sets `cancelled_by_clinic`, sends WhatsApp notification to patient

### /availability
Three tabs:
1. **أيام الدوام والعدد** — weekly schedule: toggle working days, set open/close times, set capacity (or unlimited)
2. **فترات الغياب** — blocked periods (dates saved with `+03:00` Baghdad offset)
3. **أيام خاصة** — specific-date overrides (one-off capacity/closure changes)

---

## WhatsApp Service (backend/src/services/whatsapp.js)

Three functions:
- `sendWhatsAppMessage(phoneNumberId, to, text)` — plain text message
- `sendTypingIndicator(phoneNumberId, to)` — shows "typing…" bubble, best-effort
- `markMessageRead(phoneNumberId, messageId)` — double blue tick, best-effort

All use Meta Graph API v22.0. Version constant: `GRAPH_API_VERSION = 'v22.0'` (update as Meta releases new versions).

---

## Dev Tunnel (Windows)

Cloudflare Tunnel is used instead of ngrok (ngrok is blocked in Iraq).

```powershell
# From project root:
.\dev-tunnel.ps1
```

Or manually:
```bash
npx cloudflared tunnel --url http://localhost:3000
```

The printed URL changes on every restart — re-paste it in the Meta Developer Console each time.

---

## Database Reset (Quick Reference)

To clear patient activity while keeping clinic config/schedules/FAQs:

```sql
TRUNCATE TABLE
  blocked_periods,
  conversation_state,
  conversations,
  appointments,
  patients
RESTART IDENTITY CASCADE;
```

Full guide: `database/RESET.md`

---

## Known Decisions & Design Notes

1. **No hour-based booking** — the system was intentionally redesigned from time-slot booking to day-capacity booking. Do not re-add hour selection.
2. **BOOKING_HOUR = 12** — `scheduled_at` stores noon Baghdad as a marker. The actual order within a day is determined by `queue_number`, not timestamp.
3. **Timezone safety** — all date/time operations use `dayjs.tz(..., 'Asia/Baghdad')`. Blocked period dates must be saved with `+03:00` suffix in the dashboard.
4. **Supabase keys** — backend uses `SERVICE_ROLE_KEY` (bypasses RLS). Dashboard uses `ANON_KEY`.
5. **RLS** — not configured in this MVP. Must be enabled before production.
6. **Multi-clinic** — schema supports it. Each clinic has its own `whatsapp_phone_number_id`. The webhook resolves the clinic from that ID on every request.
7. **Estimated arrival time** — calculated as `shift_open + (queue_number - 1) × duration`. Shown with a disclaimer that it's approximate.
8. **Shift-end validation** — both `checkAvailability` and `bookAppointment` reject today if `now >= shift.close`.

---

## What's Implemented & Working

- [x] WhatsApp webhook (verification + message handling)
- [x] Patient deduplication and upsert
- [x] Message deduplication (by `whatsapp_message_id`)
- [x] Message debouncing (2500ms burst window)
- [x] Typing indicator before agent responds
- [x] Claude agentic loop with all 6 tools
- [x] Day-based booking with queue numbers
- [x] Daily capacity limits (or unlimited)
- [x] Estimated arrival time after booking
- [x] 12-hour Arabic time format throughout
- [x] Shift-end validation (no booking today after clinic closes)
- [x] Blocked periods (doctor absence/holidays)
- [x] Specific-date schedule overrides
- [x] FAQ search
- [x] Human escalation state
- [x] Dashboard: appointments list with queue numbers
- [x] Dashboard: staff-initiated cancellation with WhatsApp notification
- [x] Dashboard: availability management (weekly + special days + blocked periods)
- [x] Cloudflare Tunnel dev script
