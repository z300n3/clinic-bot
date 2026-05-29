-- Migration 009: columns needed by the admin activation panel
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS meta_access_token    text;
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS whatsapp_setup_status text NOT NULL DEFAULT 'pending'
  CHECK (whatsapp_setup_status IN ('pending','completed'));
