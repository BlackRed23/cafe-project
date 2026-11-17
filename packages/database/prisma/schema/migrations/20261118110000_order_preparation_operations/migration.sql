ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PREPARING';
ALTER TABLE "Order" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "adjustmentTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "originalItemId" TEXT, ADD COLUMN "attemptType" TEXT NOT NULL DEFAULT 'SALE', ADD COLUMN "replacedAt" TIMESTAMP(3);
CREATE TABLE "OrderOperation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT NOT NULL REFERENCES "Order"("id"),
  "requestId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED', "actorId" TEXT NOT NULL, "approvedBy" TEXT,
  "reason" TEXT NOT NULL, "originalItemId" TEXT, "replacementItemId" TEXT,
  "payload" JSONB NOT NULL, "amountDelta" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "approvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "OrderOperation_orderId_requestId_key" ON "OrderOperation"("orderId", "requestId");
CREATE INDEX "OrderOperation_orderId_createdAt_idx" ON "OrderOperation"("orderId", "createdAt");
