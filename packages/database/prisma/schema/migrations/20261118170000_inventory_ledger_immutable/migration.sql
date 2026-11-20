-- TK-15: Stock movements are an append-only financial/inventory audit ledger.
-- All corrections must insert a separate, linked, authorized transaction.
CREATE FUNCTION reject_inventory_transaction_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'InventoryTransaction is append-only; create a compensating transaction instead'
        USING ERRCODE = '23514';
END;
$$;

-- @statement
CREATE TRIGGER "InventoryTransaction_append_only"
BEFORE UPDATE OR DELETE ON "InventoryTransaction"
FOR EACH ROW EXECUTE FUNCTION reject_inventory_transaction_mutation();
