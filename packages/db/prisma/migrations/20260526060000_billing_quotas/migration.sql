-- User quota fields
ALTER TABLE "User"
  ADD COLUMN "quotaTotal" INTEGER NOT NULL DEFAULT 35,
  ADD COLUMN "quotaUsed" INTEGER NOT NULL DEFAULT 0;

-- UsageEvent: one row per (user, chatId, periodKey).
CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "agentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UsageEvent_userId_chatId_periodKey_key" ON "UsageEvent"("userId", "chatId", "periodKey");
CREATE INDEX "UsageEvent_userId_periodKey_idx" ON "UsageEvent"("userId", "periodKey");
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Purchase: stub for now (no real payment integration).
CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "conversations" INTEGER NOT NULL,
  "pricePerOne" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'KZT',
  "status" TEXT NOT NULL DEFAULT 'paid',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
