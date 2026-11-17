-- Additive only. Existing classifications remain NULL; existing ingredient receipt path preserved.
ALTER TABLE "Ingredient" ADD COLUMN "expiryClassification" TEXT;
ALTER TABLE "Ingredient" ADD COLUMN "expiryClassificationRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Ingredient" ALTER COLUMN "expiryClassificationRequired" SET DEFAULT true;
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_expiryClassification_check" CHECK ("expiryClassification" IS NULL OR "expiryClassification" IN ('PERISHABLE', 'NON_PERISHABLE'));
ALTER TABLE "IngredientBatch" ADD COLUMN "qualityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_qualityStatus_check" CHECK ("qualityStatus" IN ('AVAILABLE', 'QUARANTINED', 'RECALLED', 'UNKNOWN'));
CREATE TABLE "LotEvent" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "IngredientBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "requestId" TEXT NOT NULL UNIQUE,
  "action" TEXT NOT NULL,
  "previousStatus" TEXT NOT NULL,
  "newStatus" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LotEvent_batchId_createdAt_idx" ON "LotEvent"("batchId", "createdAt");
CREATE TABLE "LotReturn" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "sourceTransactionId" TEXT NOT NULL REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceBatchId" TEXT NOT NULL REFERENCES "IngredientBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "targetBatchId" TEXT NOT NULL UNIQUE REFERENCES "IngredientBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "transactionId" TEXT NOT NULL UNIQUE REFERENCES "InventoryTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "quantity" DECIMAL(14,3) NOT NULL CHECK ("quantity" > 0),
  "quality" TEXT NOT NULL CHECK ("quality" IN ('UNKNOWN', 'UNSAFE', 'SAFE')),
  "disposition" TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK ("disposition" = 'QUARANTINED'),
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LotReturn_sourceTransactionId_idx" ON "LotReturn"("sourceTransactionId");
