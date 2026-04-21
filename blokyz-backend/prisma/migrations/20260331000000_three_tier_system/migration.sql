-- Migration: three-tier system (GTD_FREE, GTD_MINT, WL)
-- Recreate enum in one step to avoid PostgreSQL "unsafe use of new value" errors.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'GTD'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Tier')
  ) THEN
    CREATE TYPE "Tier_new" AS ENUM ('GTD_FREE', 'GTD_MINT', 'WL');

    ALTER TABLE "WalletEntry"
      ALTER COLUMN "tier" TYPE "Tier_new"
      USING (
        CASE
          WHEN "tier"::text = 'GTD' THEN 'GTD_FREE'
          ELSE "tier"::text
        END
      )::"Tier_new";

    DROP TYPE "Tier";
    ALTER TYPE "Tier_new" RENAME TO "Tier";
  END IF;
END $$;
