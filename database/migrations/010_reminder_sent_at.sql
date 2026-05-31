-- Migration 010: add reminder_sent_at to appointments
-- Used by the hourly reminder cron job to avoid sending duplicate reminders.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Index so the cron query (IS NULL + status + scheduled_at range) is fast
CREATE INDEX IF NOT EXISTS idx_appointments_reminder
  ON appointments (scheduled_at, status, reminder_sent_at)
  WHERE reminder_sent_at IS NULL;
