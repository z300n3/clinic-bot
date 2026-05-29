-- Migration 004: add no_show_count to patients
ALTER TABLE patients ADD COLUMN IF NOT EXISTS no_show_count int NOT NULL DEFAULT 0;
