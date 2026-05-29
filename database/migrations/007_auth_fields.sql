-- Migration 007: auth fields + clinic_users table

-- Add auth columns to clinics
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS auth_user_id       uuid REFERENCES auth.users(id);
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS consultation_price integer;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS map_link           text;

-- Make WhatsApp fields nullable so new clinic registrations don't require them upfront
ALTER TABLE clinics ALTER COLUMN whatsapp_phone_number_id DROP NOT NULL;
ALTER TABLE clinics ALTER COLUMN whatsapp_verify_token    DROP NOT NULL;

-- clinic_users: links auth users to clinics with a role
CREATE TABLE IF NOT EXISTS clinic_users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id     UUID        NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  auth_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','staff')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_users_auth ON clinic_users (auth_user_id);

-- Allow 'doctor' role in conversations (added by doctor-messaging feature)
ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_role_check;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_role_check
  CHECK (role IN ('user','assistant','tool','system','doctor'));
