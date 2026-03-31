-- Migration: three-tier system (GTD_FREE, GTD_MINT, WL)
-- Idempotent — safe to run even if previous attempt partially succeeded.

-- Step 1: add GTD_FREE to enum if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'GTD_FREE'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Tier')
  ) THEN
    ALTER TYPE "Tier" ADD VALUE 'GTD_FREE';
  END IF;
END $$;

-- Step 2: add GTD_MINT to enum if it doesn't already exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'GTD_MINT'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Tier')
  ) THEN
    ALTER TYPE "Tier" ADD VALUE 'GTD_MINT';
  END IF;
END $$;

-- Step 3: migrate existing GTD wallets → GTD_FREE (only if GTD value still exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'GTD'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Tier')
  ) THEN
    UPDATE "WalletEntry" SET "tier" = 'GTD_FREE' WHERE "tier"::text = 'GTD';
  END IF;
END $$;

-- Step 4: recreate the enum without GTD (only if GTD still exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'GTD'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Tier')
  ) THEN
    CREATE TYPE "Tier_new" AS ENUM ('GTD_FREE', 'GTD_MINT', 'WL');

    ALTER TABLE "WalletEntry"
      ALTER COLUMN "tier" TYPE "Tier_new"
      USING "tier"::text::"Tier_new";

    DROP TYPE "Tier";
    ALTER TYPE "Tier_new" RENAME TO "Tier";
  END IF;
END $$;
