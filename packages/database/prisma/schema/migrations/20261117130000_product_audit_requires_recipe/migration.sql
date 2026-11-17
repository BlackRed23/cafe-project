-- Preserve all existing products as unreviewed. No inferred recipe exemption.
ALTER TABLE "Product" ADD COLUMN "requiresRecipe" BOOLEAN;

CREATE TABLE "ProductAuditLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "changedFields" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductAuditLog_productId_fkey" FOREIGN KEY ("productId")
        REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductAuditLog_productId_createdAt_idx" ON "ProductAuditLog"("productId", "createdAt");
