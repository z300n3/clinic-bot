-- ============================================================
-- Migration 002 — Capacity-based booking (daily quota + queue number)
-- ============================================================
-- Switches the booking model from time-slots to a daily capacity:
--   * availability_schedules.daily_capacity = how many patients/day
--       NULL  → unlimited / open (the natural default)
--       N     → accepts at most N patients that day
--   * appointments.queue_number = auto-assigned order number per day
-- ------------------------------------------------------------

ALTER TABLE availability_schedules
  ADD COLUMN IF NOT EXISTS daily_capacity INTEGER;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS queue_number INTEGER;

-- Helps count/sort same-day bookings quickly
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_day_queue
  ON appointments (clinic_id, scheduled_at, queue_number);
