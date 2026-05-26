-- ============================================================
-- Migration 001 — Availability & Clinic-Initiated Cancellation
-- Run this on any existing install ONCE.
-- ============================================================

-- ── 1. Extend appointments.status to include cancelled_by_clinic ──────────────
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled','confirmed','completed','cancelled','cancelled_by_clinic','no_show'));

-- ── 2. availability_schedules ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_schedules (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id      UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week    INT,          -- 0=Sun … 6=Sat. NULL when specific_date is set
  specific_date  DATE,         -- NULL when day_of_week is set (recurring rule)
  is_working_day BOOLEAN     NOT NULL DEFAULT true,
  shifts         JSONB       NOT NULL DEFAULT '[]',  -- [{"open":"09:00","close":"17:00"}]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Exactly one of day_of_week / specific_date must be provided
  CONSTRAINT chk_schedule_type CHECK (
    (day_of_week IS NOT NULL AND specific_date IS NULL) OR
    (day_of_week IS NULL     AND specific_date IS NOT NULL)
  )
);

-- Partial unique indexes (one weekly rule per day, one override per date)
CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_weekly
  ON availability_schedules (clinic_id, day_of_week)
  WHERE specific_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_specific
  ON availability_schedules (clinic_id, specific_date)
  WHERE day_of_week IS NULL;

CREATE INDEX IF NOT EXISTS idx_avail_clinic ON availability_schedules (clinic_id);

-- ── 3. blocked_periods ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blocked_periods (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  reason       TEXT,           -- "سفر", "إجازة", "مؤتمر", …
  is_full_day  BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_block_range CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_blocked_clinic_range
  ON blocked_periods (clinic_id, start_at, end_at);
