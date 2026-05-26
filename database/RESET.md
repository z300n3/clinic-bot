# Database Reset Guide

Quick reference for wiping data from the Clinic Bot database without destroying the schema or clinic configuration.

---

## Option 1 — Clear Patient Activity Only (recommended)

Deletes patients, appointments, conversations, conversation state, and blocked periods.  
**Keeps:** clinics, availability schedules (weekly + special days), FAQs.

```sql
TRUNCATE TABLE
  blocked_periods,
  conversation_state,
  conversations,
  appointments,
  patients
RESTART IDENTITY CASCADE;
```

**Use this when:**
- Testing and you want a clean slate of patients/bookings
- You want to reset between demo runs
- You need to clear old data without reconfiguring the clinic

---

## Option 2 — Full Reset (wipe everything)

Deletes all data from all tables. You will need to re-run `seed.sql` and reconfigure everything from scratch.

```sql
TRUNCATE TABLE
  blocked_periods,
  conversation_state,
  conversations,
  appointments,
  faqs,
  availability_schedules,
  patients,
  clinics
RESTART IDENTITY CASCADE;
```

> ⚠️ After a full reset, re-run `database/seed.sql` to restore the clinic row, then reconfigure working hours, FAQs, and availability from the dashboard.

---

## How to Run

1. Open [Supabase Dashboard](https://supabase.com) → your project
2. Go to **SQL Editor → New Query**
3. Paste the SQL block you need
4. Click **Run**

---

## What Each Table Contains

| Table | Contents |
|-------|----------|
| `clinics` | Clinic name, doctor, specialty, WhatsApp phone number ID |
| `patients` | Patient records (phone numbers, names) |
| `appointments` | Bookings with queue numbers and statuses |
| `conversations` | Full chat history (user + assistant + tool messages) |
| `conversation_state` | Per-patient state (`active`, `awaiting_human`, `resolved`) |
| `faqs` | Clinic FAQ entries |
| `availability_schedules` | Weekly working days + specific-date overrides |
| `blocked_periods` | Doctor absence / holiday blocks |

---

## After Resetting

If you ran **Option 1**, everything is ready — just start sending WhatsApp messages and new patients will be created automatically.

If you ran **Option 2**, you must:

1. Re-run `database/seed.sql` in the SQL Editor
2. Open the dashboard → **Availability** and re-enter working hours and capacity
3. Open the dashboard → **FAQs** and re-add any FAQ entries
