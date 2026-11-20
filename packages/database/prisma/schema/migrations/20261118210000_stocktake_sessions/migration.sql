-- Additive: extend existing StockCount rather than replacing legacy incidents.
-- Original stock and historical ledger are never rewritten.
ALTER TYPE "StockCountStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "StockCountStatus" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "StockCountStatus" ADD VALUE IF NOT EXISTS 'NEEDS_INVESTIGATION';

ALTER TABLE "Ingredient" ADD COLUMN IF NOT EXISTS "movementCursor" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "InventoryTransaction" ADD COLUMN IF NOT EXISTS "movementSeq" BIGINT;
CREATE INDEX IF NOT EXISTS "InventoryTransaction_ingredientId_movementSeq_idx"
  ON "InventoryTransaction" ("ingredientId", "movementSeq");

ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "scope" JSONB;
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "assignedCounterId" TEXT;
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "rejectedById" TEXT;
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "rejectedReason" TEXT;
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);
ALTER TABLE "StockCount" ADD COLUMN IF NOT EXISTS "investigationReason" TEXT;

CREATE TABLE "StocktakeEntry" (
  "id" TEXT PRIMARY KEY,
  "stockCountId" TEXT NOT NULL REFERENCES "StockCount"("id") ON DELETE RESTRICT,
  "ingredientId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "openingQty" DECIMAL(14,3) NOT NULL,
  "openingCursor" BIGINT NOT NULL,
  "openingQualityStatus" TEXT NOT NULL,
  "openingExpirationDate" TIMESTAMP(3),
  "presentAtOpen" BOOLEAN NOT NULL DEFAULT true,
  "expectedAtCount" DECIMAL(14,3),
  "observedQty" DECIMAL(14,3),
  "varianceQty" DECIMAL(14,3),
  "observedCursor" BIGINT,
  "countedAt" TIMESTAMP(3),
  "countedById" TEXT,
  "reason" TEXT,
  "reasonCategory" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StocktakeEntry_stockCountId_batchId_key" ON "StocktakeEntry"("stockCountId","batchId");
CREATE INDEX "StocktakeEntry_stockCountId_ingredientId_idx" ON "StocktakeEntry"("stockCountId","ingredientId");

CREATE TABLE "StocktakeEntryHistory" (
  "id" TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL REFERENCES "StocktakeEntry"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL,
  "previousQty" DECIMAL(14,3),
  "newQty" DECIMAL(14,3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "StocktakeEntryHistory_entryId_revision_key" ON "StocktakeEntryHistory"("entryId","revision");

CREATE TABLE "StocktakeRequest" (
  "requestId" TEXT PRIMARY KEY,
  "stockCountId" TEXT NOT NULL REFERENCES "StockCount"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "StocktakeRequest_stockCountId_action_idx" ON "StocktakeRequest"("stockCountId","action");

-- Assign transaction-local, per-ingredient monotone movement positions.
-- The counter is updated under the same Ingredient row lock as physical stock.
-- Rolled-back writes also roll back their cursor increment. Commit ordering is
-- therefore safe per ingredient; historical rows remain NULL/unknown.
CREATE FUNCTION stocktake_stamp_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_cursor BIGINT;
BEGIN
  IF NEW."ingredientId" IS NOT NULL THEN
    UPDATE "Ingredient" SET "movementCursor" = "movementCursor" + 1
      WHERE "id" = NEW."ingredientId"
      RETURNING "movementCursor" INTO next_cursor;
    IF next_cursor IS NULL THEN
      RAISE EXCEPTION 'InventoryTransaction ingredient does not exist' USING ERRCODE = '23503';
    END IF;
    NEW."movementSeq" := next_cursor;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "InventoryTransaction_stocktake_cursor"
  BEFORE INSERT ON "InventoryTransaction"
  FOR EACH ROW EXECUTE FUNCTION stocktake_stamp_movement();
