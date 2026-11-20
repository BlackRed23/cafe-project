-- KT14: Additive append-only provenance for existing, INSERT-only event histories.
--
-- Compatibility reviewed against current Prisma models and HTTP lifecycle:
--  * PurchaseOrderEvent records CREATED / DISPATCH / CONFIRM / CANCEL / RECEIPT
--    as INSERTs. PurchaseOrder.status is mutable separately, and remains so.
--  * LotEvent records lot state transitions as INSERTs. IngredientBatch remains
--    mutable through approved quality/return operations.
--  * StocktakeEntryHistory records revision snapshots as INSERTs. The mutable
--    StocktakeEntry head and StockCount approval workflow remain untouched.
-- No existing rows are rewritten, no schemas/enums are changed, no table is
-- dropped, and legitimate lifecycle INSERTs are unaffected.
--
-- Deploy ONLY via reviewed forward migration after verifying that no external
-- reconciliation tool intentionally mutates these historical records.
-- Do not run this file as an ad-hoc command on a live shared database.

CREATE FUNCTION reject_kt14_event_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; append a new event or revision instead', TG_TABLE_NAME
        USING ERRCODE = '23514';
END;
$$;

-- @statement
CREATE TRIGGER "PurchaseOrderEvent_append_only"
BEFORE UPDATE OR DELETE ON "PurchaseOrderEvent"
FOR EACH ROW EXECUTE FUNCTION reject_kt14_event_history_mutation();

-- @statement
CREATE TRIGGER "LotEvent_append_only"
BEFORE UPDATE OR DELETE ON "LotEvent"
FOR EACH ROW EXECUTE FUNCTION reject_kt14_event_history_mutation();

-- @statement
CREATE TRIGGER "StocktakeEntryHistory_append_only"
BEFORE UPDATE OR DELETE ON "StocktakeEntryHistory"
FOR EACH ROW EXECUTE FUNCTION reject_kt14_event_history_mutation();
