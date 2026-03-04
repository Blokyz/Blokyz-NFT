-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('GTD', 'WL');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('READY', 'SUBMITTED', 'VERIFIED', 'SHIPPED');

-- CreateTable
CREATE TABLE "WalletEntry" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "maxAlloc" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimRecord" (
    "id" TEXT NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "wallet" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'READY',
    "name" TEXT,
    "email" TEXT,
    "shippingAddress" TEXT,
    "country" TEXT,
    "tracking" TEXT,
    "submittedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletEntry_address_key" ON "WalletEntry"("address");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimRecord_tokenId_key" ON "ClaimRecord"("tokenId");
