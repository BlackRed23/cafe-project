-- An approved remake creates another item for the same order and product.
BEGIN;
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_productId_idx" ON "OrderItem"("orderId", "productId");
DROP INDEX IF EXISTS "OrderItem_orderId_productId_key";
COMMIT;
