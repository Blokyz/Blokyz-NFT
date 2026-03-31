-- Migration: three-tier system (GTD_FREE, GTD_MINT, WL)
-- Replaces the old two-value enum (GTD, WL) with three distinct tiers.
-- Existing GTD wallets are promoted to GTD_FREE (highest access tier).

-- Step 1: add new values to the existing enum
ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'GTD_FREE';
ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'GTD_MINT';

-- Step 2: migrate existing GTD wallets → GTD_FREE
UPDATE "WalletEntry" SET "tier" = 'GTD_FREE' WHERE "tier" = 'GTD';

-- Step 3: swap to a clean enum without the old GTD value
--   PostgreSQL cannot DROP a value from an enum directly, so we recreate it.
CREATE TYPE "Tier_new" AS ENUM ('GTD_FREE', 'GTD_MINT', 'WL');

ALTER TABLE "WalletEntry"
  ALTER COLUMN "tier" TYPE "Tier_new"
  USING "tier"::text::"Tier_new";

DROP TYPE "Tier";
ALTER TYPE "Tier_new" RENAME TO "Tier";
