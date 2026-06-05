-- 1. إضافة عمود media_url لحفظ روابط الصور
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS media_url TEXT;

-- 2. تحديث الحالات المسموحة في conversation_state
ALTER TABLE conversation_state DROP CONSTRAINT IF EXISTS conversation_state_state_check;
ALTER TABLE conversation_state ADD CONSTRAINT conversation_state_state_check
  CHECK (state IN (
    'idle', 'active', 'collecting_info', 'checking_slots',
    'awaiting_confirmation', 'awaiting_cancel_confirm',
    'awaiting_duplicate_decision',
    'gate_collecting', 'doctor_pending', 'doctor_active',
    'resolved'
  ));

-- 3. تحويل awaiting_human الحالية إلى doctor_pending
UPDATE conversation_state SET state = 'doctor_pending' WHERE state = 'awaiting_human';
