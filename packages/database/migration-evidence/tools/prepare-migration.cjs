const fs=require('fs');
const dir='prisma/schema/migrations/20261116090000_expand_preserve_legacy';
let sql=fs.readFileSync('migration-evidence/raw-diff-DO-NOT-EXECUTE.sql','utf8');
sql=sql.replace(/-- DropForeignKey\r?\nALTER TABLE [^;]+;\r?\n/g,'');
sql=sql.replace(/-- DropIndex\r?\nDROP INDEX [^;]+;\r?\n/g,'');
sql=sql.replace('ALTER TABLE "InventoryTransaction" DROP COLUMN "userId",','ALTER TABLE "InventoryTransaction"');
sql=sql.replace('ADD COLUMN     "legacyBatchId" TEXT,','ADD COLUMN     "batchId" TEXT,');
sql=sql.replace('DROP COLUMN "status",','');
sql=sql.replace('ALTER TABLE "Product" DROP COLUMN "unit",','ALTER TABLE "Product"');
// Existing constraints retained; renamed legacy batch FK already enforces old references.
sql=sql.replace(/ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_legacyBatchId_fkey"[^;]+;/,'');
for(const col of ['inventoryId','productId'])sql=sql.replace(new RegExp('ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_'+col+'_fkey"[^;]+;'),'');
const header=`-- EXPAND + BACKFILL + VERIFY only. No legacy column/table/value removed.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = public;
DO $$ BEGIN IF current_database() <> 'cafe-kltn' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;
LOCK TABLE "User", "Category", "Product", "Inventory", "InventoryBatch", "InventoryTransaction", "Supplier", "SupplierProduct", "PurchaseRequest", "PurchaseRequestItem", "Order", "OrderItem", "Payment", "AgentLog", "SystemSetting" IN ACCESS EXCLUSIVE MODE;
-- Populated business migration requires separate reviewed mapping; refuse concurrent new data.
DO $$ DECLARE t text; n bigint; BEGIN
FOREACH t IN ARRAY ARRAY['Category','Product','Inventory','InventoryBatch','InventoryTransaction','Supplier','SupplierProduct','PurchaseRequest','PurchaseRequestItem','Order','OrderItem','Payment','AgentLog','SystemSetting'] LOOP
EXECUTE format('SELECT count(*) FROM %I',t) INTO n;
IF n <> 0 THEN RAISE EXCEPTION 'Business data changed: %; re-review mappings',t; END IF;
END LOOP;
IF (SELECT count(*) FROM "User") <> 1 THEN RAISE EXCEPTION 'User baseline changed'; END IF;
IF (SELECT md5(coalesce(string_agg(rowhash,'' ORDER BY rowhash),'')) FROM (SELECT md5(row_to_json(user_row)::text) rowhash FROM "User" user_row) s) <> '583ca7530a8629209889e526a04449d6' THEN RAISE EXCEPTION 'User differs from verified backup'; END IF;
END $$;
CREATE TEMP TABLE user_preservation_before ON COMMIT DROP AS SELECT * FROM "User";
-- Keep original columns and values under explicit legacy names where current names change meaning.
ALTER TABLE "InventoryTransaction" RENAME COLUMN "batchId" TO "legacyBatchId";
ALTER TABLE "InventoryTransaction" RENAME CONSTRAINT "InventoryTransaction_batchId_fkey" TO "InventoryTransaction_legacyBatchId_fkey";
ALTER TABLE "InventoryTransaction" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Payment" RENAME COLUMN "status" TO "legacyStatus";
ALTER TABLE "Product" ALTER COLUMN "unit" DROP NOT NULL;
`;
const footer=`
-- Explicit label mapping; every PaymentStatus label exists identically in TransactionStatus.
UPDATE "Product" SET "servingUnit" = "unit" WHERE "unit" IS NOT NULL;
UPDATE "Payment" SET "status" = "legacyStatus"::text::"TransactionStatus";
UPDATE "InventoryTransaction" SET "performedBy" = "userId";
DO $$ BEGIN
IF EXISTS ((SELECT * FROM user_preservation_before EXCEPT SELECT * FROM "User") UNION ALL (SELECT * FROM "User" EXCEPT SELECT * FROM user_preservation_before)) THEN RAISE EXCEPTION 'User preservation failed'; END IF;
IF EXISTS (SELECT 1 FROM "Product" WHERE "unit" IS NOT NULL AND "servingUnit" IS DISTINCT FROM "unit") THEN RAISE EXCEPTION 'Product mapping failed'; END IF;
IF EXISTS (SELECT 1 FROM "Payment" WHERE "status"::text IS DISTINCT FROM "legacyStatus"::text) THEN RAISE EXCEPTION 'Payment mapping failed'; END IF;
IF EXISTS (SELECT 1 FROM "InventoryTransaction" WHERE "performedBy" IS DISTINCT FROM "userId") THEN RAISE EXCEPTION 'Actor mapping failed'; END IF;
END $$;
COMMIT;
`;
sql=header+sql+footer;
if(/DROP COLUMN|DROP TABLE|DROP TYPE|DROP INDEX|DROP CONSTRAINT|DELETE FROM|TRUNCATE/i.test(sql))throw Error('Destructive SQL detected');
fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/migration.sql',sql);
console.log(JSON.stringify({migration:dir,createTables:(sql.match(/CREATE TABLE /g)||[]).length,createEnums:(sql.match(/CREATE TYPE /g)||[]).length,bytes:sql.length}));

