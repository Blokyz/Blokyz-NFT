-- CreateTable
CREATE TABLE "PublishedToken" (
    "id" TEXT NOT NULL,
    "tokenId" INTEGER NOT NULL,
    "publisher" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishedToken_tokenId_key" ON "PublishedToken"("tokenId");

-- CreateIndex
CREATE INDEX "PublishedToken_publisher_idx" ON "PublishedToken"("publisher");
