-- Migration 011: expand conversation_state.state CHECK constraint
-- The old constraint only allowed: active | awaiting_human | resolved
-- The state machine uses new values that were being silently rejected.

-- 1. Drop the old constraint (name may vary — try both common names)
ALTER TABLE conversation_state
  DROP CONSTRAINT IF EXISTS conversation_state_state_check;

ALTER TABLE conversation_state
  DROP CONSTRAINT IF EXISTS conversation_state_state_fkey;

-- Some setups name it after the table+column with a _check suffix
DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'conversation_state'::regclass
      AND contype  = 'c'                      -- check constraint
      AND conname  LIKE '%state%'
  LOOP
    EXECUTE 'ALTER TABLE conversation_state DROP CONSTRAINT IF EXISTS ' || quote_ident(c);
  END LOOP;
END$$;

-- 2. Add the expanded constraint with all state-machine values
ALTER TABLE conversation_state
  ADD CONSTRAINT conversation_state_state_check
  CHECK (state IN (
    'idle',
    'active',                       -- legacy value (treated as idle by the agent)
    'collecting_info',
    'checking_slots',
    'awaiting_confirmation',
    'awaiting_cancel_confirm',
    'awaiting_duplicate_decision',
    'awaiting_human',
    'resolved'
  ));

-- 3. Migrate existing 'active' rows → 'idle' so the agent routes them correctly
UPDATE conversation_state SET state = 'idle' WHERE state = 'active';
