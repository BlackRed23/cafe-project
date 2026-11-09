# Database reverification — 05/11/2026 (Asia/Saigon)

## Current finding and evidence boundary

The user confirms that this project already contains 27 database tables. This is recorded as **USER-CONFIRMED**, not as independently queried PostgreSQL evidence. Migration necessity is **NOT ESTABLISHED**. Do not infer the current database from old migration files or replay any script to make it match those files.

Repository HEAD inspected: `33366f714b288310580d69247e47c58aa4ea062f`. Initial working tree: `?? docs/`. Only audit documentation is changed. No application, schema, migration, dependency or database objects are changed. No SQL, rollback, contract, seed, Prisma generate, db push or migration command was executed.

Live inspection is **PENDING INPUT**: target host/port/database/schema/environment and a dedicated read-only credential source have not been confirmed. Repository filename inspection found example environment files, not a confirmed read-only connection; the process environment exposed no variable names matching DATABASE/POSTGRES/PGHOST/PGUSER/PGDATABASE/READONLY. Historical credential-shaped log entries and application/default Docker credentials were not used. A confirmation request was sent to the user. This does not establish that credentials or a database are absent.

| Distinct assertion | Current evidence | Status |
|---|---|---|
| 27 tables declared in intended design | 31 Prisma models minus the four explicitly transitional legacy models; design target 27 tables / 16 ENUMs | VERIFIED declaration; approved authoritative DDL still unavailable |
| 27 business tables physically present in PostgreSQL | User confirmation; zero live catalog query results | USER-CONFIRMED / independently UNKNOWN |
| All 27 tables correctly integrated with application | Backend source still uses legacy structures and contradicts current Prisma fields | NOT VERIFIED; static incompatibilities VERIFIED |

## Reproduced source inventory

Read all nine `packages/database/prisma/schema/*.prisma` files. Anchored declarations `^model` and `^enum` count **31 models / 16 ENUMs**; no `@@map` was found. The 27 intended names are:

Category, User, Product, Recipe, RecipeIngredient, Topping, ToppingIngredient, Ingredient, IngredientBatch, InventoryTransaction, StockCount, StockCountItem, Order, OrderItem, OrderItemTopping, Payment, PaymentCallback, PaymentReconciliation, PurchaseRequest, PurchaseRequestItem, GoodsReceipt, Supplier, SupplierIngredient, AgentExecution, AgentToolCall, AgentEvaluation, SystemSetting.

The 16 declared ENUMs are CategoryKind, InventoryTransactionType, WasteReason, StockCountStatus, OrderStatus, ConsumptionStatus, PaymentStatus, PaymentMethod, TransactionStatus, CallbackStatus, ToppingType, PurchaseRequestStatus, GoodsReceiptStatus, ExecutionStatus, ToolCallStatus, UserRole. Physical type names, schemas and ordered labels are UNKNOWN.

| Legacy model | Declaration | Still used in application source | Physical existence |
|---|---|---|---|
| Inventory | `schema/inventory.prisma:162` | API `modules/inventory/inventory.repository.ts:72,84,98`; Agent `repositories/agent.repository.ts:125` | UNKNOWN |
| InventoryBatch | `schema/inventory.prisma:177` | API `modules/inventory/inventory.repository.ts:130,140,182,199`; purchase repository | UNKNOWN |
| SupplierProduct | `schema/supplier.prisma:42` | API `modules/supplier/supplier.repository.ts`; Agent `repositories/agent.repository.ts:299` | UNKNOWN |
| AgentLog | `schema/system.prisma:88` | Agent `repositories/agent.repository.ts:116,372,376,389,397`; API dashboard and failure-log services | UNKNOWN |

Source prefixes in the table are relative to `packages/database/prisma/`, `apps/api/src/`, or `apps/agent/src/` as stated. A physical count of 27 alone cannot establish that the correct 27 names exist, that these four legacy tables are absent, or that application calls succeed.

## Migration history: files versus application

| Repository artifact | Verified source content | Applied to target |
|---|---|---|
| `20260718025427_init_schema_and_unique_keys/migration.sql` | 15 CREATE TABLE / 6 CREATE TYPE declarations; SHA256 `D347622FE1DB9DEFCDA6AC84750088099749853F3DCE3CC5DFABA06FAFBE39B6` | UNKNOWN |
| `20260724120000_add_product_detail_fields/migration.sql` | Six Product columns; SHA256 `714B5B4A72FE39F2AD229322D5292F17759A2B5610B708A86EA98B6A0639F022` | UNKNOWN |
| `migration_27_tables/00` through `05` | Six standalone phase scripts outside Prisma migration history; expand declares 16 extra tables / 10 extra ENUMs | UNKNOWN; file placement does not prove executed or unexecuted |

Migration paths above are under `packages/database/prisma/schema/migrations/`. There is no target `_prisma_migrations` result, checksum comparison, successful completion record or deployment log in this reverification. A database could already have the intended objects through another deployment path. Do not classify this as pending migration, failed migration or unapplied migration based on source history alone.

`03_verify.sql` is unsuitable for this read-only audit: despite its comment it CREATEs, TRUNCATEs and INSERTs persistent verification results. Neither it nor precheck was run. Contract and rollback scripts were only read; their previously identified destructive risks remain conditional execution hazards, not proof that the current database needs migration.

## Parity and relationships

Current PostgreSQL-to-Prisma and PostgreSQL-to-backend parity is **UNKNOWN**. Prisma-to-backend incompatibilities are evidenced directly:

- Payment repository imports PaymentStatus, calls `findUnique({where:{orderId}})` and writes that status (`apps/api/src/modules/payment/payment.repository.ts:1,12,19–22`). Current Prisma Payment uses TransactionStatus and an ordinary orderId index (`schema/order.prisma:114–137`).
- Inventory repository selects Product.unit and ledger product/user relations and writes userId (`inventory.repository.ts:38–40,60,149–157,208`). Prisma has Product.servingUnit and ledger performedBy with batchId pointing to IngredientBatch and legacyBatchId to InventoryBatch (`schema/product.prisma:14`, `schema/inventory.prisma:91–113`).
- Source search found no ingredient/recipe/goodsReceipt/stockCount/agentExecution references in API/Agent source. This is evidence of missing direct integration, not proof about dynamic integrations outside the inspected repository. No build, generated-client regeneration or runtime compatibility check was performed.

PK/FK/unique/index declarations were reviewed in Prisma, historical DDL and expand DDL. Existing DB02–DB08 remain **source differences**, not confirmed defects of the deployed database. In particular, candidate expand omits IngredientBatch receipt/request-item FKs, PurchaseRequestItem ingredient FK and the new ledger batch FK; old Category.name, OrderItem(orderId,productId), and Payment.orderId uniqueness may conflict with intended cardinality; GoodsReceipt and ledger indexes differ. Whether the target has already corrected any of these is UNKNOWN.

Key relationships to verify physically are Recipe→Product; RecipeIngredient→Recipe/Ingredient; ToppingIngredient→Topping/Ingredient; OrderItem→Order/Product/Recipe; OrderItemTopping→OrderItem/Topping; IngredientBatch→Ingredient/GoodsReceipt/PurchaseRequestItem; InventoryTransaction→Ingredient/IngredientBatch/User; GoodsReceipt→PurchaseRequest; SupplierIngredient→Supplier/Ingredient; StockCountItem→StockCount/Ingredient; AgentToolCall/AgentEvaluation→AgentExecution. Verify referenced columns, delete/update actions, validation state, unique semantics, index column order/predicates/validity, defaults, nullability and Decimal precision. Scalar-only fields such as supplierId/receivedBy require an approved FK policy; do not invent an enforced relationship.

## Pending read-only evidence collection

After target and read-only credentials are confirmed, verify identity and role attributes/privileges, including inherited role memberships; do not assume a role name means read-only. Use a bounded explicit READ ONLY transaction and a consistent snapshot. Record actual server/database/schema identity and transaction_read_only. Do not load application modules or call GET endpoints that can write.

Collect catalog evidence from pg_namespace/pg_class (ordinary and partitioned tables, excluding partition children from logical business counts), pg_type/pg_enum (ordered ENUM labels), pg_attribute/pg_attrdef (columns), pg_constraint (PK/FK/unique/CHECK, validated flag and actions) and pg_index (definitions and validity). Inventory all application schemas and classify business tables separately from `_prisma_migrations`, migration_backup, extension-owned and unrelated objects. Report expected-name matches, missing names, extra names and legacy presence separately from total counts.

If `_prisma_migrations` exists and SELECT is permitted, inspect migration_name/checksum/started_at/finished_at/rolled_back_at/applied_steps_count; compare to local hashes. Missing metadata does not imply absent schema, and successful metadata does not prove full parity. Inspect standalone deployment records only when available. Review constraints before bounded read-only orphan/invariant queries; counts and catalog declarations alone do not establish end-to-end application behavior.

No query results or database PASS are claimed in this report.

## Recalculated readiness and next action

Using the existing six-group rubric, evidence points remain **6 + 6 + 2.5 + 4.5 + 3 + 3 = 27/100**. User confirmation changes the recorded premise, but supplies no new independently verified catalog, parity, integration or restore criterion. Consequently no evidence points are added or deducted. This is evidence readiness, not a claim that only 27% of the application works. Deployment gate remains **NO-GO**; verification is **PENDING INPUT**, not PASS.

Retain security blockers SEC01 stale-token/principal checks, SEC02 credential handling, SEC03 receiving races and SEC04 duplicate purchase creation, plus restore/backup evidence, RPO/RTO and post-snapshot write recovery gaps. SQL script hazards remain relevant only if future execution is proposed. Remove any presumed requirement to replay migration or contract as a prerequisite to inspecting an already-existing database.

Next action: obtain confirmed target identity and read-only credential source, then collect the catalog and migration evidence above. Decide whether any change is necessary only after comparison. No implementation is authorized or performed by this task.
