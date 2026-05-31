-- Rollback for migration 011
-- Reverts the conversation_state.state CHECK constraint to its original form.

-- 1. Drop the expanded constraint added in 011
ALTER TABLE conversation_state
  DROP CONSTRAINT IF EXISTS conversation_state_state_check;

-- 2. Move any rows with new state values back to 'idle'
--    so they don't violate the old constraint
UPDATE conversation_state
  SET state = 'idle'
  WHERE state NOT IN ('active', 'awaiting_human', 'resolved', 'idle');

-- 3. Restore the original constraint
ALTER TABLE conversation_state
  ADD CONSTRAINT conversation_state_state_check
  CHECK (state IN ('idle', 'active', 'awaiting_human', 'resolved'));
