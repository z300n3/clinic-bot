-- ============================================================
-- Clinic Bot — Supabase Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------
-- clinics
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
  id                          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                        TEXT        NOT NULL,
  doctor_name                 TEXT        NOT NULL,
  specialty                   TEXT        NOT NULL DEFAULT 'طب عام',
  address                     TEXT        NOT NULL,
  working_hours               JSONB       NOT NULL DEFAULT '{}',
  appointment_duration_minutes INTEGER     NOT NULL DEFAULT 30,
  whatsapp_phone_number_id    TEXT        UNIQUE NOT NULL,
  whatsapp_verify_token       TEXT        NOT NULL,
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------
-- patients
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  phone_number TEXT        NOT NULL,
  name         TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_phone ON patients (clinic_id, phone_number);

-- ----------------------------------------------------------------
-- appointments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id        UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id       UUID        NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER     NOT NULL DEFAULT 30,
  queue_number     INTEGER,
  status           TEXT        NOT NULL DEFAULT 'scheduled'
                               CHECK (status IN ('scheduled','confirmed','completed','cancelled','cancelled_by_clinic','no_show')),
  reason           TEXT,
  patient_name     TEXT,
  served_by        TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_scheduled ON appointments (clinic_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_day_queue ON appointments (clinic_id, scheduled_at, queue_number);
CREATE INDEX IF NOT EXISTS idx_appointments_patient         ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status          ON appointments (status);

-- ----------------------------------------------------------------
-- conversations
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id           UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id          UUID        REFERENCES patients(id) ON DELETE SET NULL,
  patient_phone       TEXT        NOT NULL,
  role                TEXT        NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content             TEXT,
  tool_calls          JSONB,
  whatsapp_message_id TEXT        UNIQUE,   -- nullable; multiple NULLs allowed
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_clinic_phone_ts
  ON conversations (clinic_id, patient_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_wa_message_id
  ON conversations (whatsapp_message_id)
  WHERE whatsapp_message_id IS NOT NULL;

-- ----------------------------------------------------------------
-- conversation_state
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversation_state (
  clinic_id       UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_phone   TEXT        NOT NULL,
  state           TEXT        NOT NULL DEFAULT 'active'
                              CHECK (state IN ('active','awaiting_human','resolved')),
  state_data      JSONB       NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinic_id, patient_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversation_state_clinic ON conversation_state (clinic_id);

-- ----------------------------------------------------------------
-- faqs
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faqs (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id  UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  question   TEXT        NOT NULL,
  answer     TEXT        NOT NULL,
  keywords   TEXT[]      NOT NULL DEFAULT '{}',
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faqs_clinic    ON faqs (clinic_id);
CREATE INDEX IF NOT EXISTS idx_faqs_keywords  ON faqs USING GIN (keywords);

-- ----------------------------------------------------------------
-- availability_schedules
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS availability_schedules (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id      UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week    INT,
  specific_date  DATE,
  is_working_day BOOLEAN     NOT NULL DEFAULT true,
  shifts         JSONB       NOT NULL DEFAULT '[]',
  daily_capacity INTEGER,    -- NULL = unlimited / open
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_schedule_type CHECK (
    (day_of_week IS NOT NULL AND specific_date IS NULL) OR
    (day_of_week IS NULL     AND specific_date IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_weekly
  ON availability_schedules (clinic_id, day_of_week)
  WHERE specific_date IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_avail_specific
  ON availability_schedules (clinic_id, specific_date)
  WHERE day_of_week IS NULL;

CREATE INDEX IF NOT EXISTS idx_avail_clinic ON availability_schedules (clinic_id);

-- ----------------------------------------------------------------
-- blocked_periods
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_periods (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id    UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  start_at     TIMESTAMPTZ NOT NULL,
  end_at       TIMESTAMPTZ NOT NULL,
  is_full_day  BOOLEAN     NOT NULL DEFAULT true,
  reason       TEXT,
  substitute_doctor_name TEXT,
  substitute_doctor_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_block_range CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_blocked_clinic_range
  ON blocked_periods (clinic_id, start_at, end_at);
