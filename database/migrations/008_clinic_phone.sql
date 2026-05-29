-- Migration 008: clinic phone number
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS phone_number text;
