# PostgreSQL local readiness and catalog audit

Audit date: 2026-11-07 (Asia/Saigon). Scope: local Windows discovery and static repository comparison. **Stopped before connection at the authorization gate.** No physical schema claim is made from source files.

```text
STATUS: BLOCKED_BEFORE_CONNECTION
CONNECTION_AUTHORIZED: NO — prerequisites incomplete
POSTGRESQL_RUNNING: UNKNOWN
ACTUAL_BUSINESS_TABLES: UNKNOWN — catalog not queried
ACTUAL_ENUM_TYPES: UNKNOWN — catalog not queried
PRISMA_SOURCE_PARITY: UNKNOWN against database; source declares 31 models / 16 ENUMs
GENERATED_CLIENT_PARITY: UNKNOWN against database; FAIL against source (15 models / 6 ENUMs)
MIGRATION_HISTORY: Applied history UNKNOWN; two historical migration files inspected statically
DATABASE_CHANGES: NONE
BLOCKERS: Exact runtime target, non-production ownership, target-specific owner authorization, dedicated read-only credentials and effective privilege evidence missing; service/CIM discovery denied
NEXT_ACTION: Obtain the missing gate evidence through a secure channel, then perform only the authorized read-only catalog audit
```

## Environment evidence

- Installed binaries found under `C:\Program Files\PostgreSQL\16\bin` (file product version 16.15) and `C:\Program Files\PostgreSQL\18\bin` (18.6): psql, pg_isready, postgres and pg_ctl. Presence proves installation artifacts, not a running cluster or its version.
- None of those commands resolved through the current PATH. No binaries were invoked to connect, probe, start or manage a server.
- Get-Service could not open Service Control Manager; Win32_Process CIM access was denied. No elevated retry was attempted. This is an observation-permission limitation, not evidence that PostgreSQL is absent.
- Get-Process found no visible postgres process. Get-NetTCPConnection produced no matching listener output for 5432/5433 with errors suppressed, so it is inconclusive. A separate netstat listing showed no LISTENING rows on those ports. These are candidate ports only; no active endpoint was inferred and no network probe was sent.
- Process environment presence checks found DATABASE_URL, DIRECT_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGSERVICE and NODE_ENV absent. Values were not printed.
- No `.env*` files were found at repository root, packages/database or apps/agent; apps/api had only `.env.example`. Example configuration was not used as runtime authority. Other launch contexts and external secret stores remain unverified.
- `apps/api/src/common/env.ts` and `apps/agent/src/config/env.ts` use default dotenv loading. `packages/database/prisma/schema/main.prisma` reads DATABASE_URL. `packages/database/src/index.ts` constructs PrismaClient. These files were read, never imported or executed. Default development behavior in source does not establish ownership or the environment of an actual server.
- No applicable AGENTS.md was found in checked ancestors or repository inventory. Existing working-tree changes were left untouched.

## Authorization gate

| Required evidence | Result before connection |
|---|---|
| Exact endpoint, database and schema | MISSING; no trusted active DATABASE_URL or owner-confirmed target |
| Development/non-production ownership | MISSING; local installation does not establish this |
| Explicit owner permission for this target and read-only catalog audit | Request authorizes conditional discovery/audit work; target-specific owner confirmation is not established |
| Existing dedicated read-only credentials | MISSING; no account was identified or tested |
| Effective privileges without writes or escalation | UNKNOWN; no trusted privilege evidence supplied |

The user's gate requires every condition before connection. No connection was attempted to discover permissions. Owner-supplied or administrator-exported privilege evidence must establish no effective write/DDL rights, object ownership, inherited/settable privileged memberships, superuser/role/database creation powers, or executable privileged write paths. Transaction read-only settings alone do not prove the account lacks write rights. No account or grants were created or changed.

## Static architecture comparison

Sources: all nine `packages/database/prisma/schema/*.prisma` files, `node_modules/.prisma/client/schema.prisma`, the two files under `packages/database/prisma/schema/migrations`, and `docs/KLTN_PLAN/ARCHITECTURE_FINAL/27_TABLE_CONTRACT.md`. The generated schema was inspected as text; no client or application was started. Counts are declarations, not observed catalog counts. No @map/@@map directives were found in either schema artifact.

| Artifact | Business model/table declarations | ENUM declarations | Interpretation |
|---|---:|---:|---|
| Required architecture | 27 | 16 | Required final target |
| Current Prisma source | 31 | 16 | Four transitional models exceed table target |
| Installed generated-client schema | 15 | 6 | Stale relative to source and target |
| Historical migration chain, static declarations | 15 | 6 | Application status unknown |
| Actual PostgreSQL catalog | UNKNOWN | UNKNOWN | Gate blocked |

The 27 target identities are User, Category, Product, Ingredient, IngredientBatch, InventoryTransaction, StockCount, StockCountItem, Recipe, RecipeIngredient, Topping, ToppingIngredient, Order, OrderItem, OrderItemTopping, Supplier, SupplierIngredient, PurchaseRequest, PurchaseRequestItem, GoodsReceipt, Payment, PaymentCallback, PaymentReconciliation, AgentExecution, AgentToolCall, AgentEvaluation and SystemSetting.

Source retains four transitional identities outside that target: **Inventory, InventoryBatch, SupplierProduct, AgentLog**. They also occur in the installed generated schema and initial migration. They are known legacy declarations, not proven physical legacy objects. Whether additional unmapped objects exist is UNKNOWN. `_prisma_migrations`, if present, is infrastructure and must not count toward the 27 business tables.

Source-only models absent from the generated schema: Ingredient, IngredientBatch, StockCount, StockCountItem, Recipe, RecipeIngredient, Topping, ToppingIngredient, OrderItemTopping, SupplierIngredient, GoodsReceipt, PaymentCallback, PaymentReconciliation, AgentExecution, AgentToolCall and AgentEvaluation (16).

Source-only ENUMs absent from the generated schema: CategoryKind, WasteReason, StockCountStatus, ConsumptionStatus, TransactionStatus, CallbackStatus, ToppingType, GoodsReceiptStatus, ExecutionStatus and ToolCallStatus (10).

Shared blocks with differing whitespace-normalized text: Category, InventoryBatch, InventoryTransaction, Order, OrderItem, Payment, Product, PurchaseRequest, PurchaseRequestItem, Supplier, User; ENUMs InventoryTransactionType and PaymentMethod. This is textual declaration drift, not proof of physical drift. No generated-only model or ENUM was found. The architecture contract itself is marked blocked/not implementation-ready; its target count is not deployment evidence.

## Historical migration evidence

Only file text and SHA-256 were read; no SQL script or migration tool was executed.

| Migration | Static effect | SHA-256 of local file |
|---|---|---|
| 20260718025427_init_schema_and_unique_keys | Declares 15 tables, 6 ENUMs, indexes and foreign keys | D347622FE1DB9DEFCDA6AC84750088099749853F3DCE3CC5DFABA06FAFBE39B6 |
| 20260724120000_add_product_detail_fields | Adds Product nutritionFacts, usageInstructions, storageInstructions, origin, certifications, expiryInfo as TEXT; no new table or ENUM | 714B5B4A72FE39F2AD229322D5292F17759A2B5610B708A86EA98B6A0639F022 |

Initial table names: Category, Inventory, InventoryBatch, InventoryTransaction, Order, OrderItem, Payment, Product, PurchaseRequest, PurchaseRequestItem, Supplier, SupplierProduct, AgentLog, SystemSetting, User. Initial ENUM names: InventoryTransactionType, OrderStatus, PaymentStatus, PaymentMethod, PurchaseRequestStatus, UserRole.

The separate `packages/database/prisma/migration_27_tables` directory exists; its scripts were not executed and its presence does not establish applied migration history. Applied migration rows, checksums, failures and completion status remain UNKNOWN. Local checksums above have not been compared to database migration records.

## Deferred physical audit and next action

Provide the exact host/port/database/schema, confirm ownership and non-production use and explicitly authorize that target. Identify an existing dedicated read-only account via a secure credential mechanism; do not paste passwords or connection strings into the report/chat. Supply trusted effective-privilege evidence before connection, as required by this gate. Resolve service visibility through an owner-provided status snapshot if needed; this audit will not escalate privileges.

Only once all conditions pass, inspect pg_catalog and information_schema for schema-scoped ordinary/partitioned business tables (count partition children separately as physical objects, not extra logical business identities), ENUM identities/ordered labels, columns/defaults/nullability/native types, foreign keys, indexes, constraints and unmapped legacy objects. Inspect only necessary `_prisma_migrations` metadata if present, without running migration tools; compare its checksums/status to local files. Report table/ENUM names as well as counts so 27/16 cannot hide substituted objects. Current column, FK, index, constraint, migration-history and exact physical-drift results are all **NOT AUDITED**.

No CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, TRUNCATE, migrations, generation, push, reset, seed, rollback, application/worker/cron startup, service startup, privilege changes or database modifications were performed. The only new artifact is this Markdown report.
