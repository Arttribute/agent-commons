-- Add image column to space table
ALTER TABLE "space" ADD COLUMN IF NOT EXISTS "image" text;