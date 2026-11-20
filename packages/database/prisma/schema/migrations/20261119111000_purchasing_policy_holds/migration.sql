-- Additive controls: no historical PO, stock movement or approval is changed.
CREATE TABLE "PurchaseDispatchAttempt" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "attemptNumber" INTEGER NOT NULL CHECK ("attemptNumber" > 0),
  "dispatchIdentity" TEXT NOT NULL,
  "recipientSnapshot" TEXT,
  "mode" TEXT NOT NULL,
  "providerReference" TEXT,
  "providerStatus" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("purchaseOrderId", "attemptNumber")
);
CREATE INDEX "PurchaseDispatchAttempt_purchaseOrderId_createdAt_idx"
  ON "PurchaseDispatchAttempt"("purchaseOrderId", "createdAt");

CREATE TABLE "PurchaseSupplierEvidence" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "evidenceFingerprint" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "decision" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "sourceIdentity" TEXT NOT NULL,
  "evidenceReference" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "verificationStatus" TEXT NOT NULL DEFAULT 'NOT_VERIFIED_EXTERNAL',
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseSupplierEvidence_purchaseOrderId_recordedAt_idx"
  ON "PurchaseSupplierEvidence"("purchaseOrderId", "recordedAt");

CREATE TABLE "PurchaseOverdeliveryAmendment" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "discrepancyId" TEXT NOT NULL UNIQUE REFERENCES "PurchaseDeliveryDiscrepancy"("id") ON DELETE RESTRICT,
  "requestedExtraQuantity" DECIMAL(14,3) NOT NULL CHECK ("requestedExtraQuantity" > 0),
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_POLICY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseOverdeliveryAmendment_purchaseOrderId_createdAt_idx"
  ON "PurchaseOverdeliveryAmendment"("purchaseOrderId", "createdAt");

CREATE TABLE "PurchaseShelfLifeRule" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "ingredientId" TEXT REFERENCES "Ingredient"("id") ON DELETE RESTRICT,
  "categoryId" TEXT REFERENCES "Category"("id") ON DELETE RESTRICT,
  "minRemainingDays" INTEGER NOT NULL CHECK ("minRemainingDays" >= 0),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reason" TEXT NOT NULL,
  "configuredById" TEXT NOT NULL,
  "configuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseShelfLifeRule_one_scope" CHECK (
    ("ingredientId" IS NOT NULL AND "categoryId" IS NULL) OR
    ("ingredientId" IS NULL AND "categoryId" IS NOT NULL)
  )
);
CREATE INDEX "PurchaseShelfLifeRule_ingredientId_categoryId_idx"
  ON "PurchaseShelfLifeRule"("ingredientId", "categoryId");

CREATE TABLE "PurchaseDemandAggregation" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "sourceHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'ADMIN_GROUPING_APPROVED_PENDING_POLICY'
);
CREATE TABLE "PurchaseDemandAggregationMember" (
  "id" TEXT PRIMARY KEY,
  "aggregationId" TEXT NOT NULL REFERENCES "PurchaseDemandAggregation"("id") ON DELETE RESTRICT,
  "purchaseRequestId" TEXT NOT NULL UNIQUE REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT,
  "sourceKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL
);
CREATE INDEX "PurchaseDemandAggregationMember_aggregationId_idx"
  ON "PurchaseDemandAggregationMember"("aggregationId");
