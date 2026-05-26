# Clinic Bot — WhatsApp AI Chatbot for Medical Clinics

A production-ready monorepo that wires a WhatsApp Business chatbot (via Meta Cloud API v22.0) to an AI agent (Anthropic Claude) backed by Supabase/PostgreSQL, with a Next.js management dashboard.

```
clinic-bot/
├── backend/    Node.js + Express  (port 3000)
└── dashboard/  Next.js            (port 3001)
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Supabase project | Free tier or higher |
| Anthropic API key | claude.ai/settings |
| Meta Developer App | With WhatsApp product added |

---

## 1 — Database Setup (Supabase)

1. Create a new Supabase project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run `database/schema.sql`.
3. Then run `database/seed.sql` — but first edit the two placeholder values:
   - `YOUR_PHONE_NUMBER_ID` → your Meta phone-number ID
   - `YOUR_VERIFY_TOKEN`    → any random string you choose

> **Existing installs**: if your database predates a feature, apply the incremental migrations in `database/migrations/` in order:
> - `001_availability.sql` — availability schedules, blocked periods, clinic-side cancellation status
> - `002_capacity_booking.sql` — daily-capacity booking + appointment queue numbers
>
> A fresh `schema.sql` already includes all of these, so new projects can skip the migration files.

> **Realtime**: Go to *Database → Replication → Tables* and enable realtime for the `appointments` and `conversations` tables so the dashboard live-updates.

> **Row Level Security**: RLS is not configured in this MVP. Enable it and add policies before going to production.

---

## 2 — Backend

```bash
cd backend
cp .env.example .env
# Fill in all values in .env
npm install
npm run dev          # development  (nodemon)
npm start            # production
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (never expose to browser) |
| `ANTHROPIC_API_KEY` | From console.anthropic.com |
| `META_ACCESS_TOKEN` | Permanent System User token (recommended) or temporary token |
| `META_PHONE_NUMBER_ID` | Phone Number ID from Meta → WhatsApp → API Setup |
| `META_VERIFY_TOKEN` | Random string; must match `whatsapp_verify_token` in DB |
| `PORT` | Default `3000` |

---

## 3 — Dashboard

```bash
cd dashboard
cp .env.example .env.local
# Fill in NEXT_PUBLIC_* values
npm install
npm run dev          # development
npm run build && npm start   # production
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Same Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon/public key (safe for browser) |
| `NEXT_PUBLIC_CLINIC_ID` | UUID from the `clinics` table (seed default: `11111111-1111-1111-1111-111111111111`) |

---

## 4 — Connect Meta Webhook (local dev with Cloudflare Tunnel)

> **Why Cloudflare Tunnel, not ngrok?** ngrok is blocked in Iraq. Cloudflare Tunnel works there, needs **no account or signup**, and is free.

### Option A — one-command helper script (recommended)

From the project root run:

```powershell
.\dev-tunnel.ps1
```

The script:
1. Starts `cloudflared` on port 3000 (first run auto-downloads `cloudflared` ~30 MB).
2. Detects the public `https://<random>.trycloudflare.com` URL.
3. Prints the ready-to-paste **Callback URL** (`<url>/webhook`) and Verify Token for the Meta console.

Keep the window open while testing; press **ENTER** to stop the tunnel.

### Option B — manual

```bash
npx cloudflared tunnel --url http://localhost:3000
# Copy the printed https URL, e.g. https://abc123.trycloudflare.com
```

### Wire it into Meta

1. Go to [Meta Developer Console](https://developers.facebook.com) → your app → **WhatsApp → Configuration**.
2. Set **Webhook URL** to `https://abc123.trycloudflare.com/webhook`.
3. Set **Verify Token** to the same value as `META_VERIFY_TOKEN` in your `.env` (the seed/default is `elias`).
4. Subscribe to the **messages** field under webhook fields.
5. Send a WhatsApp message to your test number — the bot should reply.

> **Note:** the free `trycloudflare.com` URL changes every time you restart the tunnel, so you must re-paste the new Callback URL in the Meta console after each restart.

> For production, deploy the backend to any Node.js host (Railway, Render, Fly.io, AWS) and use a stable webhook URL.

---

## 5 — Testing the Bot

Once the webhook is wired:

| Say | Expected |
|-----|----------|
| `مرحبا` | Greeting in Iraqi Arabic |
| `أريد حجز موعد` | Bot lists **available days** (not hours) and books by day, returning a queue number |
| `كم حجز اليوم؟` | Bot replies with the number of bookings for that day |
| `متى مواعيد العيادة؟` | FAQ lookup — returns working days / capacity |
| `أريد إلغاء موعدي` | Cancels next upcoming appointment |

---

## Booking Model — Daily Capacity + Queue Numbers

Booking is **per-day, not per-hour**. Patients do not pick a time slot; they pick a day, and each booking is assigned an automatic **queue number** (الرقم بالدور) for that day.

- Each working day has a **daily capacity** — the number of patients accepted that day.
- Capacity can be left **open / unlimited** (the default), or set to a fixed number.
- When the day's capacity is reached, the bot stops offering that day.
- When a patient asks how many bookings exist for a day, the bot answers with the **booked count** (via the `get_day_bookings` tool).

Relevant columns:

| Table | Column | Meaning |
|-------|--------|---------|
| `availability_schedules` | `daily_capacity` | Patients accepted that day. `NULL` = unlimited / open. |
| `appointments` | `queue_number` | Auto-assigned order number within the day. |

> Appointments are stored at a fixed marker time (noon Baghdad) since the model is day-based; ordering within a day is by `queue_number`.

---

## Availability Management (Dashboard → جدول الدوام)

The **Availability** page has three tabs:

1. **أيام الدوام والعدد** — for each weekday: toggle working on/off, and set the daily capacity (or mark it "open / unlimited").
2. **فترات الغياب** — blocked periods (travel, leave, conferences). A blocked day is fully unavailable and overrides the weekly schedule. Dates are saved in Baghdad time (`+03:00`).
3. **أيام خاصة** — specific-date overrides that take priority over the weekly rule (e.g. a one-off closure or a different capacity for a single date).

Availability resolution priority (in `backend/src/agent/tools.js`):

```
specific_date override  >  weekly day_of_week rule  >  legacy clinic.working_hours
```

All times use the `Asia/Baghdad` timezone (UTC+3).

---

## Doctor-Initiated Cancellation

From the **Appointments** page, staff can cancel a booking with a reason. This sets the status to `cancelled_by_clinic` and sends the patient an automatic WhatsApp notification (day + queue number + reason). The DB update always happens first; WhatsApp delivery is best-effort.

---

## Architecture

```
WhatsApp user
    │  HTTPS POST
    ▼
Meta Cloud API (v22.0)
    │  webhook POST /webhook
    ▼
Express backend
    ├─ Dedup (whatsapp_message_id)
    ├─ Patient upsert
    ├─ Conversation state check
    │
    ▼
Claude Agent (claude-sonnet-4-6)
    ├─ check_availability  ──► available DAYS (schedules + blocks + capacity)
    ├─ book_appointment    ──► appointments INSERT (assigns queue_number)
    ├─ get_day_bookings    ──► count of bookings for a given day
    ├─ cancel_appointment  ──► appointments UPDATE
    ├─ get_faq_answer      ──► Supabase faqs
    └─ escalate_to_human   ──► Supabase conversation_state
    │
    ▼
WhatsApp reply via Meta Cloud API
    │
    ▼
Next.js Dashboard (reads Supabase directly)
```

---

## Multi-Clinic Support

The schema supports multiple clinics. Each clinic has its own `whatsapp_phone_number_id`. To add a second clinic:

1. Insert a new row in `clinics` with its phone number ID and verify token.
2. Point a second Meta phone number's webhook at the same backend URL.
3. The `META_VERIFY_TOKEN` env var is matched against `clinics.whatsapp_verify_token` — if you need different tokens per clinic the verify endpoint needs to be updated to look up the token from DB.

---

## Updating the Meta Graph API Version

The Graph API version is set in `backend/src/services/whatsapp.js`:

```js
const GRAPH_API_VERSION = 'v22.0';
```

Check [https://developers.facebook.com/docs/graph-api/changelog](https://developers.facebook.com/docs/graph-api/changelog) for the latest stable version and update this constant. Meta deprecates old versions ~2 years after release.

---

## Scripts cheat sheet

```bash
# Backend
npm run dev     # nodemon watch
npm start       # production

# Dashboard
npm run dev     # Next.js dev server (port 3001)
npm run build   # production build
npm start       # serve production build
```
