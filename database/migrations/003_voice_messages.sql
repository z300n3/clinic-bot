-- ============================================================
-- Migration 003 — Voice message support
-- ============================================================
-- Run this in Supabase SQL Editor → New Query

-- message_type: 'text' | 'voice' | 'image'  (default 'text')
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS message_type text DEFAULT 'text';

-- original_media_id: Meta media ID for voice notes (used for debugging / re-download)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS original_media_id text;
