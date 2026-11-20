-- Additive purchasing provenance. Existing PurchaseRequest / GoodsReceipt data
-- and immutable InventoryTransaction rows are preserved.
ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'RETURN_OUT';
ALTER TABLE "PurchaseRequest"
  ADD COLUMN IF NOT EXISTS "demandSourceKey" TEXT,
  ADD COLUMN IF NOT EXISTS "demandHash" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedById" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierHoldReason" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierAssignedById" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierAssignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "supplierAssignmentRequestId" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierAssignmentHash" TEXT;
-- Relaxing this FK nullability preserves every existing linked Supplier.
-- A PENDING supplier-sourcing hold is a real PurchaseRequest, not a fake Supplier.
ALTER TABLE "PurchaseRequest" ALTER COLUMN "supplierId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequest_demandSourceKey_key" ON "PurchaseRequest"("demandSourceKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequest_supplierAssignmentRequestId_key"
  ON "PurchaseRequest"("supplierAssignmentRequestId");

CREATE TABLE "PurchaseOrder" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "purchaseRequestId" TEXT NOT NULL REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT,
  "supplierId" TEXT NOT NULL REFERENCES "Supplier"("id") ON DELETE RESTRICT,
  "supplierName" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  "confirmationSource" TEXT,
  "confirmationReference" TEXT,
  "rejectionAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancellationReason" TEXT
);
CREATE INDEX "PurchaseOrder_purchaseRequestId_status_idx" ON "PurchaseOrder"("purchaseRequestId","status");
CREATE INDEX "PurchaseOrder_supplierId_createdAt_idx" ON "PurchaseOrder"("supplierId","createdAt");

CREATE TABLE "PurchaseOrderItem" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "purchaseRequestItemId" TEXT NOT NULL REFERENCES "PurchaseRequestItem"("id") ON DELETE RESTRICT,
  "ingredientId" TEXT,
  "quantityOrdered" INTEGER NOT NULL,
  "quantityReceived" INTEGER NOT NULL DEFAULT 0,
  "unit" TEXT NOT NULL,
  "conversionToBase" DECIMAL(14,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'VND',
  CONSTRAINT "PurchaseOrderItem_quantity_nonnegative" CHECK (
    "quantityOrdered" > 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= "quantityOrdered")
);
CREATE UNIQUE INDEX "PurchaseOrderItem_purchaseOrderId_purchaseRequestItemId_key"
  ON "PurchaseOrderItem"("purchaseOrderId","purchaseRequestItemId");

CREATE TABLE "PurchaseOrderEvent" (
  "id" TEXT PRIMARY KEY,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "requestId" TEXT NOT NULL UNIQUE,
  "type" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseOrderEvent_purchaseOrderId_createdAt_idx"
  ON "PurchaseOrderEvent"("purchaseOrderId","createdAt");

CREATE TABLE "PurchaseDeliveryDiscrepancy" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "purchaseOrderItemId" TEXT NOT NULL,
  "expectedIngredientId" TEXT,
  "observedIngredientId" TEXT,
  "observedQuantity" DECIMAL(14,3) NOT NULL,
  "acceptedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "rejectedQuantity" DECIMAL(14,3) NOT NULL,
  "category" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'HELD',
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseDeliveryDiscrepancy_positive" CHECK (
    "observedQuantity" >= 0 AND "acceptedQuantity" >= 0 AND "rejectedQuantity" >= 0 AND
    "observedQuantity" = "acceptedQuantity" + "rejectedQuantity")
);
CREATE INDEX "PurchaseDeliveryDiscrepancy_purchaseOrderId_createdAt_idx"
  ON "PurchaseDeliveryDiscrepancy"("purchaseOrderId","createdAt");

CREATE TABLE "PurchaseSupplierReturn" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "goodsReceiptId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL CHECK("quantity" > 0),
  "ledgerId" TEXT NOT NULL UNIQUE,
  "reason" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "creditStatus" TEXT NOT NULL DEFAULT 'UNSETTLED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseSupplierReturn_goodsReceiptId_batchId_idx"
  ON "PurchaseSupplierReturn"("goodsReceiptId","batchId");

CREATE TABLE "PurchaseInvoiceReconciliation" (
  "id" TEXT PRIMARY KEY,
  "requestId" TEXT NOT NULL UNIQUE,
  "purchaseOrderId" TEXT NOT NULL REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT,
  "invoiceNumber" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "invoiceItems" JSONB NOT NULL,
  "differences" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PurchaseInvoiceReconciliation_purchaseOrderId_createdAt_idx"
  ON "PurchaseInvoiceReconciliation"("purchaseOrderId","createdAt");

ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "requestHash" TEXT;
ALTER TABLE "GoodsReceipt" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey"
 FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL;
CREATE INDEX "GoodsReceipt_purchaseOrderId_idx" ON "GoodsReceipt"("purchaseOrderId");
