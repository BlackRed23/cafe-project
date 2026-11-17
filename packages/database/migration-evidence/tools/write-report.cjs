const fs=require('fs'),crypto=require('crypto');
const load=n=>JSON.parse(fs.readFileSync('migration-evidence/'+n+'.json','utf8'));
const before=load('before'),after=load('after'),backup=load('backup-comparison'),queries=load('query-verification');
const migration='20261116090000_expand_preserve_legacy';const sql=fs.readFileSync('prisma/schema/migrations/'+migration+'/migration.sql','utf8');
const oldTables=new Set(before.tables.map(t=>t.table));const newTables=after.tables.filter(t=>!oldTables.has(t.table));
const oldEnums=new Set(before.enums.map(t=>t.typname));const enumNames=[...new Set(after.enums.map(t=>t.typname))];
const columnKey=c=>c.table_name+'.'+c.column_name;const oldCols=new Map(before.columns.map(c=>[columnKey(c),c]));
const added=after.columns.filter(c=>!oldCols.has(columnKey(c)));
const changed=after.columns.filter(c=>oldCols.has(columnKey(c))&&JSON.stringify(c)!==JSON.stringify(oldCols.get(columnKey(c))));
const constraintNames=new Set(before.constraints.map(c=>c.conname));
const constraints=after.constraints.filter(c=>!constraintNames.has(c.conname));
const testBytes=fs.readFileSync('migration-evidence/full-test.log');
const test=testBytes.toString(testBytes[0]===255&&testBytes[1]===254?'utf16le':'utf8');
const summary=test.split(/\r?\n/).filter(l=>/^ℹ (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)/.test(l)||/^# (tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)/.test(l)).join('\n');
let report=`# Database migration implementation report

Final status: **PARTIAL**. EXPAND / BACKFILL / VERIFY deployed directly to cafe-kltn. CONTRACT deferred. Preserved drift fully enumerated below. No populated business records available to establish end-to-end business compatibility; successful empty reads do not establish write or historical-data acceptance.

## Scope and prerequisites

- HEAD: 98355e4 (required merge commit is HEAD); initial Git status clean.
- Target independently queried: cafe-kltn, public, PostgreSQL 18.6, 127.0.0.1:5432.
- Current Prisma schema retained unchanged: 31 models, 16 enums. Two historical migrations unchanged; all three applied migration file SHA256 checksums match database history.
- No test database created, seed executed, reset, db push, original pending SQL execution, or old data/column/table/type deletion.
- Audit captured ${new Date().toISOString()}. Only cafe-kltn connected for database SQL.

## Backup verification

Required archive: D:/KLTN/git-backup-cafe/cafe-kltn-before-migration.dump.
Initial archive: 37,816 bytes; SHA256 a2aa79939e1e0dc6605fc6384195e2b05fd63c5df9d4c1efe9decebc2a533b4a; created 2026-11-16 03:23:10 local (+07).
PostgreSQL 16 pg_restore rejected archive format 1.16; PostgreSQL 18 tool decoded entire archive successfully. Sorted COPY payload count and SHA256 matched live pg_dump for all 16 tables, including migration history. Comparison covers complete row values rather than timestamps alone.

Initial deployment failed in precondition DO block: PL/pgSQL variable t conflicted with SQL alias t. No business DDL reached. Transaction rolled back; failed migration marked rolled back using Prisma migrate resolve. Corrected SQL then executed successfully in transaction ending ROLLBACK on same target. No disposable database used.

Because migration history changed, fresh PostgreSQL 18 custom-format backup created before final deployment; old archive preserved as cafe-kltn-before-migration.dump.previous-2026-11-15T20-33-59-496Z. New archive decoded fully and its 16 COPY payloads matched live database immediately before deploy. Fresh backup: 37,792 bytes; SHA256 ${backup.backupSHA256}. No business data changes detected between initial archive and deployment. Archive decoding and comparison performed; restore recovery not exercised.

## Migration and actual execution

New migration: packages/database/prisma/schema/migrations/${migration}/migration.sql.
Deployed via prisma migrate deploy. SQL SHA256: ${crypto.createHash('sha256').update(sql).digest('hex')}.
Exact successful SQL reproduced in appendix. Additional SQL: read-only catalog/count/fingerprint/Prisma queries; corrected transaction rehearsal ending ROLLBACK; Prisma migration tracking writes and rolled-back resolution. Initial failed attempt stopped before business DDL. Migration history now has three completed records plus one rolled-back attempt.

Transaction uses public search_path, lock_timeout 10s, statement_timeout 120s and ACCESS EXCLUSIVE locks on all 15 existing business tables. Guards require exact target, empty 14 non-User tables, exactly one User and verified User fingerprint. Any concurrent populated data causes exception and rollback. Full User row preserved and compared with EXCEPT in both directions before commit.

## EXPAND and mappings

16 added tables: ${newTables.map(t=>t.table).join(', ')}.

10 added enums:\n${enumNames.filter(n=>!oldEnums.has(n)).map(n=>'- '+n+': '+after.enums.filter(e=>e.typname===n).map(e=>e.enumlabel).join(', ')).join('\n')}

Existing enums expanded: InventoryTransactionType adds CONSUME, WASTE, RETURN, RESERVE, RELEASE; PaymentMethod adds MOMO, VNPAY. Existing labels retained.

- Product: preserve unit, relax its NOT NULL requirement for current client; add servingUnit, backfill exact unit text (no unit conversion); costPrice widens to decimal(18,4).
- Payment: original status retained as legacyStatus with PaymentStatus type and original PENDING default. New status uses TransactionStatus with INITIATED default. PENDING/PAID/FAILED/REFUNDED map identically through text cast; no label discarded. Legacy status is historical retained data, not automatically synchronized for future writes.
- InventoryTransaction: preserve userId and FK; performedBy backfilled exactly. Original batchId column/FK renamed legacyBatchId, still references InventoryBatch. New nullable batchId references IngredientBatch; no old batch ID copied into incompatible new relation. quantity integer to decimal(14,3) exactly contains full int32 range. ProductId optional but original product FK retained. New ingredient, cost, reference, actor, waste and idempotency fields added.
- PurchaseRequestItem: preserve inventoryId/productId values and restrictive legacy FKs; relax nullability and add nullable ingredientId FK. No ingredient inferred from product without evidence.
- OrderItem: add nullable recipeId/version and lifecycle/cost fields, plus topping relation. No fabricated recipes, ingredient quantities or consumption history.
- Ingredient, Recipe and Inventory coexist; legacy Inventory retained. No automatic product-to-ingredient conversion without mapping.
- All affected business tables empty under lock: mapping statements updated zero rows. This is verified lack of mapping need for current dataset, not proof for a future populated database. Migration intentionally refuses such a database.

### Added columns (includes columns of new tables)

${added.map(c=>'- '+columnKey(c)+': '+c.udt_name+(c.numeric_precision?'('+c.numeric_precision+','+c.numeric_scale+')':'')+', '+(c.is_nullable==='YES'?'nullable':'required')+(c.column_default?', default '+c.column_default:'')).join('\n')}

### Changed existing column definitions

${changed.map(c=>'- '+columnKey(c)+': '+JSON.stringify(oldCols.get(columnKey(c)))+' -> '+JSON.stringify(c)).join('\n')}

### Added or renamed constraints

${constraints.map(c=>'- '+c.table_name+'.'+c.conname+': '+c.definition+'; validated='+c.convalidated).join('\n')}

## Before / after preservation

| Existing table | Before | After | Preservation |
|---|---:|---:|---|
${queries.preservation.map(t=>'| '+t.table+' | '+t.countBefore+' | '+t.countAfter+' | '+(t.preserved?'PASS':'FAIL')+' |').join('\n')}

All 16 new tables contain zero rows. User fingerprint unchanged: 583ca7530a8629209889e526a04449d6. Payment status groups and InventoryTransaction type groups empty before and after. No monetary/stock/history records existed to reconcile. _prisma_migrations count 2 -> 4 reflects one rolled-back attempt and one successful deployment; not business-row loss.

## Verification results

| Check | Result | Boundary |
|---|---|---|
| Git required HEAD | PASS | 98355e4 |
| Backup | PASS | Full archive decode + COPY comparison; refreshed after failed attempt |
| Prisma validate before/after | PASS | Schema unchanged |
| Prisma generate before/after | PASS | Prisma 6.19.3; sandbox EPERM retried with granted access |
| Prisma migrate deploy | PASS on final attempt | Initial precondition failure rolled back |
| Prisma migrate status | PASS | All three migrations applied |
| Migration checksums | PASS | All completed migration checksums match files |
| Prisma migrate diff | Expected drift, exit 2 | Every delta explained below; SQL artifact NOT EXECUTED |
| API build | PASS | npm run build --workspace @cafe-project/api |
| Agent build | PASS | npm run build --workspace @cafe-project/agent |
| Product query + recipe/inventory includes | PASS, empty | Read-only Prisma transaction |
| Ingredient/Recipe/Inventory relations | PASS, empty | Includes batch, recipeItems, ingredient |
| Payment and callbacks/order | PASS, empty | No historical labels available |
| InventoryTransaction history relations | PASS, empty | IngredientBatch, legacyBatch, actor |
| PurchaseRequestItem / OrderItem relations | PASS, empty | Current relation queries compile and execute |
| Invalid constraints | PASS | Zero unvalidated constraints |
| Full project test suite | ${summary?'See exact summary below':'PENDING'} | Mock tests only; no real business writes |
| Populated core business flows | NOT VERIFIED | Empty tables; real writes prohibited |

\
\
${summary}

## Entire remaining drift / deferred CONTRACT

1. Product.unit remains (nullable); target schema omits it.
2. Payment.legacyStatus remains, preserving original PaymentStatus column.
3. InventoryTransaction.userId and its original FK remain.
4. InventoryTransaction.productId original FK retained; target declares scalar without relation.
5. Category_name_key unique(name) retained in addition to target unique(name,kind). Restricts same name across kinds.
6. OrderItem_orderId_productId_key retained. Restricts repeated product lines per order.
7. Payment_orderId_key retained. Restricts multiple attempts per order.
8. PurchaseRequestItem_requestId_productId_key retained. Restricts repeated product lines per request.
9. PurchaseRequestItem.inventoryId and productId FKs retain ON DELETE RESTRICT; target wants SET NULL. Changing deletion policy deferred.

No missing target tables, target columns, enum values, indexes or new target relations remain. Full diff stored in packages/database/migration-evidence/after-drift.sql and drift-summary.log; do not execute these contract suggestions. Drift not silently accepted as zero. Extra legacy uniqueness may reject otherwise valid current-app writes. Old app instances expecting original Payment.status enum or old batchId meaning require separate compatibility review. No dual-write triggers installed. Generated migration targets reviewed empty database baseline; not claimed replayable against other databases because exact-target and fingerprint guards intentionally reject them.

## Remaining work

- Validate populated Product, ingredient recipe, inventory, order, payment retry and inventory history behavior in separately authorized phase; no seed/live test writes used here.
- Confirm application rollout and dual-write policy for retained unit/userId/legacyStatus; no current proof of old-client compatibility.
- Review and authorize separate CONTRACT: legacy column retirement, obsolete unique indexes, obsolete FKs and PurchaseRequestItem deletion policy. Require preservation evidence and application compatibility before execution.
- Resolve any full-suite failure recorded below before final acceptance. No unexplained drift allowed.
- Fresh backup restore recovery remains untested; archive full decode is narrower evidence.

## Exact deployed SQL

\
\
`;
if(summary) report=report.replace(summary,'```text\n'+summary+'\n```');
report=report.replace(/\n\\\n\\\n$/,'\n');
report+='```sql\n'+sql+'\n```\n';
fs.writeFileSync('migration-evidence/IMPLEMENTATION-REPORT.md',report);
console.log(JSON.stringify({report:'migration-evidence/IMPLEMENTATION-REPORT.md',bytes:Buffer.byteLength(report),status:'PARTIAL',testSummary:summary}));
