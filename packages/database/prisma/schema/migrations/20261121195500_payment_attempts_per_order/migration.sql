-- Payment attempts are one-to-many. Keep the non-unique Payment_orderId_idx.
DROP INDEX IF EXISTS "Payment_orderId_key";
