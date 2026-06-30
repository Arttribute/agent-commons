ALTER TABLE "agent"
  ADD COLUMN IF NOT EXISTS "greeting" text,
  ADD COLUMN IF NOT EXISTS "conversation_starters" jsonb;
