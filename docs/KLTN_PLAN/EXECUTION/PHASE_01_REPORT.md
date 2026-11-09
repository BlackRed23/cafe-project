# Phase 01 execution report

2026-11-07, Asia/Saigon. Status: INDEPENDENT IMPLEMENTATION VERIFIED; persistence/integration BLOCKED.

## Evidence boundary and preserved baseline

SOURCE_OBSERVED means inspected local files or locally executed checks. DATABASE_UNVERIFIED means no authenticated database observation. No PostgreSQL connection/probe, application startup, provider call, migration, db push, seed, reset or rollback was performed. No table/ENUM/schema/client generation changes. Exactly 27 target business identities / 16 ENUMs and full D01–D11 remain mandatory. Agent tables remain exclusively Agent-owned; no generic operation journal or invented Agent rows were added.

The workspace already had modified auth, inventory, order, purchase and Agent files, untracked common helpers/tests and docs. Existing edits were preserved. This execution changes only inventory-core.ts, its unit tests and this report. ingredient-policy.ts was reviewed and retained. No AGENTS.md was found by repository filename search. The local execution skill was inspected for suitability but was not applied: its manager-only/no-discovery workflow does not match the user's explicit discovery and independent-implementation scope. No architecture redesign round was started.

## A. Environment readiness

- Node/npm are on PATH. Installed dependencies include TypeScript and Prisma; package manifest declares Prisma/client ^6.19.3, root TypeScript 5.9.2, npm@11.6.2 and Node >=18.
- PostgreSQL clients exist outside PATH: version-only commands returned psql 16.15 and 18.6 (exit 0). psql, pg_isready and Docker were not found on PATH; other installations/WSL are UNKNOWN. No pg_isready/server probe was run.
- Get-Service *postgres* failed: Service Control Manager permission denied. Get-NetTCPConnection with ErrorAction Stop failed: CIM resource unavailable. Get-Process produced no matching rows in this restricted context. Service/listener/runtime availability is UNKNOWN, never inferred STOPPED.
- Prisma datasource: packages/database/prisma/schema/main.prisma reads DATABASE_URL; packages/database/package.json selects prisma/schema. Database entrypoint constructs PrismaClient and re-exports generated types. It was read, not imported for discovery.
- Sanitized Compose candidates for API/Agent: postgres:5432/cafedb, default public schema; example candidate: localhost:5432/cafe_project?schema=public. Neither establishes the active runtime or non-production ownership. Compose was parsed locally for host/port/database/schema only; no raw configuration, userinfo or credentials were printed.
- Filename-only dotenv scan of root, apps/api, apps/agent and packages/database found only apps/api/.env.example. No real dotenv contents were read. Filtered inherited environment variable names yielded none matching DATABASE/POSTGRES/PG/COMPOSE/DOCKER/READ_ONLY; external credential sources remain UNKNOWN.
- Historical migrations: 20260718025427_init_schema_and_unique_keys and 20260724120000_add_product_detail_fields, with migration_lock.toml. Six candidate migration_27_tables SQL files are outside that history. Applied migrations/catalog/grants are DATABASE_UNVERIFIED.
- API Dockerfile CMD executes prisma migrate deploy before startup. Do not use image/Compose startup for readiness. No service was started.

Connection readiness: BLOCKED. Require separately authorized exact endpoint/database/schema, corroborated development ownership/runtime linkage and existing dedicated read-only credential source with verified effective grants/role memberships (no owner/superuser/write/escalation). No such authorization or verified role is present. Read-only catalog procedure already exists in WEEK_04_AUDIT/POSTGRES_ENVIRONMENT_READINESS.md; it is not executed here. No attempt to use application/Compose credentials. Database role permissions, live counts, data, constraints and history remain DATABASE_UNVERIFIED.

## B. Static schema parity — SOURCE_OBSERVED

Target identities (27): Category, Ingredient, IngredientBatch, InventoryTransaction, StockCount, StockCountItem, Order, OrderItem, OrderItemTopping, Payment, PaymentCallback, PaymentReconciliation, Product, Recipe, RecipeIngredient, Topping, ToppingIngredient, PurchaseRequest, PurchaseRequestItem, GoodsReceipt, Supplier, SupplierIngredient, AgentExecution, AgentToolCall, AgentEvaluation, SystemSetting, User.

Current source: 31 models / 16 ENUMs. Generated client snapshot node_modules/.prisma/client/schema.prisma: 15 models / 6 ENUMs. Its index.js/index.d.ts artifacts exist; successful API/Agent compilation uses this legacy client and does not validate source-schema parity. Client generation was deliberately not run.

Transitional extras: Inventory, InventoryBatch, SupplierProduct, AgentLog. All 27 target model names are declared; declarations alone are not the completed contract.

### Exact generated-client declaration delta

Each row lists complete source declarations absent/different in the generated snapshot; reverse-only entries expose obsolete generated fields/constraints. This compares Prisma declarations (including relation fields), not live columns.

| Model | Source-only/different declarations | Generated-only/different declarations |
|---|---|---|
| Category | `name String`<br>`kind CategoryKind @default(PRODUCT)`<br>`sortOrder Int @default(0)`<br>`ingredients Ingredient[]`<br>`@@unique([name, kind])` | `name String @unique` |
| Ingredient (entire model missing) | `id String @id @default(cuid())`<br>`sku String @unique`<br>`name String`<br>`categoryId String?`<br>`category Category? @relation(fields: [categoryId], references: [id])`<br>`baseUnit String @default("g")`<br>`costPerBaseUnit Decimal @default(0) @db.Decimal(18, 4)`<br>`quantity Decimal @default(0) @db.Decimal(14, 3)`<br>`reserved Decimal @default(0) @db.Decimal(14, 3)`<br>`minThreshold Decimal @default(0) @db.Decimal(14, 3)`<br>`origin String?`<br>`storageInstructions String?`<br>`expiryInfo String?`<br>`shelfLifeDays Int?`<br>`imageUrl String?`<br>`isActive Boolean @default(true)`<br>`deletedAt DateTime?`<br>`rowVersion Int @default(0)`<br>`batches IngredientBatch[]`<br>`recipeItems RecipeIngredient[]`<br>`toppingItems ToppingIngredient[]`<br>`transactions InventoryTransaction[]`<br>`supplierLinks SupplierIngredient[]`<br>`purchaseItems PurchaseRequestItem[]`<br>`stockCountItems StockCountItem[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@index([categoryId])` | — |
| IngredientBatch (entire model missing) | `id String @id @default(cuid())`<br>`ingredientId String`<br>`ingredient Ingredient @relation(fields: [ingredientId], references: [id])`<br>`batchCode String`<br>`quantityInitial Decimal @db.Decimal(14, 3)`<br>`quantityRemaining Decimal @default(0) @db.Decimal(14, 3)`<br>`unitCost Decimal @default(0) @db.Decimal(18, 4)`<br>`expirationDate DateTime?`<br>`receivedAt DateTime @default(now())`<br>`supplierId String?`<br>`goodsReceiptId String?`<br>`goodsReceipt GoodsReceipt? @relation(fields: [goodsReceiptId], references: [id])`<br>`purchaseRequestItemId String?`<br>`purchaseRequestItem PurchaseRequestItem? @relation(fields: [purchaseRequestItemId], references: [id])`<br>`receivedQty Decimal? @db.Decimal(14, 3)`<br>`receivedUnit String?`<br>`note String?`<br>`transactions InventoryTransaction[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@index([ingredientId])`<br>`@@index([expirationDate])` | — |
| InventoryTransaction | `ingredientId String?`<br>`ingredient Ingredient? @relation(fields: [ingredientId], references: [id])`<br>`batch IngredientBatch? @relation(fields: [batchId], references: [id])`<br>`quantity Decimal @db.Decimal(14, 3)`<br>`unitCost Decimal @default(0) @db.Decimal(18, 4)`<br>`totalCost Decimal @default(0) @db.Decimal(14, 2)`<br>`referenceType String?`<br>`referenceId String?`<br>`orderItemId String?`<br>`performedBy String?`<br>`performedByUser User? @relation("InventoryTransactionPerformedBy", fields: [performedBy], references: [id])`<br>`idempotencyKey String? @unique`<br>`wasteReason WasteReason?`<br>`productId String?`<br>`legacyBatchId String?`<br>`legacyBatch InventoryBatch? @relation(fields: [legacyBatchId], references: [id])`<br>`@@index([ingredientId, createdAt])`<br>`@@index([referenceType, referenceId])`<br>`@@index([orderItemId])`<br>`@@index([type, createdAt])` | `productId String`<br>`product Product @relation(fields: [productId], references: [id])`<br>`batch InventoryBatch? @relation(fields: [batchId], references: [id])`<br>`userId String?`<br>`user User? @relation(fields: [userId], references: [id])`<br>`quantity Int` |
| StockCount (entire model missing) | `id String @id @default(cuid())`<br>`code String @unique`<br>`status StockCountStatus @default(DRAFT)`<br>`createdById String`<br>`createdBy User @relation("StockCountCreatedBy", fields: [createdById], references: [id])`<br>`approvedById String?`<br>`approvedBy User? @relation("StockCountApprovedBy", fields: [approvedById], references: [id])`<br>`approvedAt DateTime?`<br>`note String?`<br>`items StockCountItem[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@index([status])` | — |
| StockCountItem (entire model missing) | `id String @id @default(cuid())`<br>`stockCountId String`<br>`stockCount StockCount @relation(fields: [stockCountId], references: [id], onDelete: Cascade)`<br>`ingredientId String`<br>`ingredient Ingredient @relation(fields: [ingredientId], references: [id])`<br>`systemQty Decimal @db.Decimal(14, 3)`<br>`actualQty Decimal @db.Decimal(14, 3)`<br>`varianceQty Decimal @db.Decimal(14, 3)`<br>`reason String?`<br>`createdAt DateTime @default(now())`<br>`@@unique([stockCountId, ingredientId])`<br>`@@index([ingredientId])` | — |
| InventoryBatch | `transactions InventoryTransaction[]` | `inventoryTransactions InventoryTransaction[]` |
| Order | `paymentMethod PaymentMethod?`<br>`paymentStatus PaymentStatus @default(PENDING)`<br>`paidAt DateTime?`<br>`payments Payment[]` | `payment Payment?` |
| OrderItem | `recipeId String?`<br>`recipe Recipe? @relation(fields: [recipeId], references: [id])`<br>`recipeVersion Int?`<br>`consumptionStatus ConsumptionStatus @default(PENDING)`<br>`startedAt DateTime?`<br>`committedAt DateTime?`<br>`voidedAt DateTime?`<br>`ingredientCost Decimal @default(0) @db.Decimal(12, 2)`<br>`toppingCost Decimal @default(0) @db.Decimal(12, 2)`<br>`totalCost Decimal @default(0) @db.Decimal(12, 2)`<br>`grossProfit Decimal @default(0) @db.Decimal(12, 2)`<br>`toppings OrderItemTopping[]` | `@@unique([orderId, productId])` |
| OrderItemTopping (entire model missing) | `id String @id @default(cuid())`<br>`orderItemId String`<br>`orderItem OrderItem @relation(fields: [orderItemId], references: [id], onDelete: Cascade)`<br>`toppingId String`<br>`topping Topping @relation(fields: [toppingId], references: [id])`<br>`quantity Int @default(1)`<br>`price Decimal @default(0) @db.Decimal(12, 2)`<br>`costSnapshot Decimal @default(0) @db.Decimal(12, 2)`<br>`createdAt DateTime @default(now())`<br>`@@index([orderItemId])` | — |
| Payment | `orderId String`<br>`providerTxnId String? @unique`<br>`merchantRef String?`<br>`currency String @default("VND")`<br>`status TransactionStatus @default(INITIATED)`<br>`attemptNo Int @default(1)`<br>`requestPayload Json?`<br>`responsePayload Json?`<br>`failureCode String?`<br>`failureMessage String?`<br>`expiresAt DateTime?`<br>`callbacks PaymentCallback[]`<br>`@@index([orderId])` | `orderId String @unique`<br>`status PaymentStatus @default(PENDING)` |
| PaymentCallback (entire model missing) | `id String @id @default(cuid())`<br>`method PaymentMethod`<br>`providerEventId String? @unique`<br>`eventType String?`<br>`paymentId String?`<br>`payment Payment? @relation(fields: [paymentId], references: [id])`<br>`signatureValid Boolean @default(false)`<br>`rawPayload Json`<br>`headers Json?`<br>`receivedAt DateTime @default(now())`<br>`processedAt DateTime?`<br>`status CallbackStatus @default(RECEIVED)`<br>`errorMessage String?`<br>`retryCount Int @default(0)` | — |
| PaymentReconciliation (entire model missing) | `id String @id @default(cuid())`<br>`method PaymentMethod`<br>`businessDate DateTime`<br>`expectedCount Int @default(0)`<br>`expectedAmount Decimal @default(0) @db.Decimal(14, 2)`<br>`actualCount Int @default(0)`<br>`actualAmount Decimal @default(0) @db.Decimal(14, 2)`<br>`matchedCount Int @default(0)`<br>`missingCount Int @default(0)`<br>`orphanCount Int @default(0)`<br>`resolvedAt DateTime?`<br>`resolvedBy String?`<br>`note String?`<br>`createdAt DateTime @default(now())`<br>`@@unique([method, businessDate])` | — |
| Product | `costPrice Decimal @default(0) @db.Decimal(18, 4)`<br>`servingUnit String @default("ly")`<br>`recipes Recipe[]`<br>`toppings Topping[]` | `costPrice Decimal @default(0)`<br>`unit String @default("Hộp")`<br>`inventoryTransactions InventoryTransaction[]` |
| Recipe (entire model missing) | `id String @id @default(cuid())`<br>`productId String`<br>`product Product @relation(fields: [productId], references: [id])`<br>`version Int @default(1)`<br>`isActive Boolean @default(true)`<br>`effectiveFrom DateTime @default(now())`<br>`effectiveTo DateTime?`<br>`yieldQuantity Decimal @default(1.0) @db.Decimal(10, 2)`<br>`laborCost Decimal @default(0) @db.Decimal(12, 2)`<br>`overheadCost Decimal @default(0) @db.Decimal(12, 2)`<br>`note String?`<br>`ingredients RecipeIngredient[]`<br>`orderItems OrderItem[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@unique([productId, version])`<br>`@@index([productId, isActive])` | — |
| RecipeIngredient (entire model missing) | `id String @id @default(cuid())`<br>`recipeId String`<br>`recipe Recipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)`<br>`ingredientId String`<br>`ingredient Ingredient @relation(fields: [ingredientId], references: [id])`<br>`quantity Decimal @db.Decimal(14, 3)`<br>`unit String`<br>`quantityBase Decimal @db.Decimal(14, 3)`<br>`isOptional Boolean @default(false)`<br>`allowSubstitute Boolean @default(false)`<br>`note String?`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@unique([recipeId, ingredientId])` | — |
| Topping (entire model missing) | `id String @id @default(cuid())`<br>`name String`<br>`toppingType ToppingType @default(ADD)`<br>`price Decimal @default(0) @db.Decimal(12, 2)`<br>`productId String?`<br>`product Product? @relation(fields: [productId], references: [id])`<br>`isActive Boolean @default(true)`<br>`sortOrder Int @default(0)`<br>`ingredients ToppingIngredient[]`<br>`orderItems OrderItemTopping[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt` | — |
| ToppingIngredient (entire model missing) | `id String @id @default(cuid())`<br>`toppingId String`<br>`topping Topping @relation(fields: [toppingId], references: [id], onDelete: Cascade)`<br>`ingredientId String`<br>`ingredient Ingredient @relation(fields: [ingredientId], references: [id])`<br>`quantityBase Decimal @db.Decimal(14, 3)`<br>`note String?`<br>`createdAt DateTime @default(now())`<br>`@@unique([toppingId, ingredientId])` | — |
| PurchaseRequest | `requester User @relation("PurchaseRequestRequestedBy", fields: [requestedBy], references: [id])`<br>`approver User? @relation("PurchaseRequestApprovedBy", fields: [approvedBy], references: [id])`<br>`receipts GoodsReceipt[]` | `requester User @relation("RequestedBy", fields: [requestedBy], references: [id])`<br>`approver User? @relation("ApprovedBy", fields: [approvedBy], references: [id])` |
| PurchaseRequestItem | `ingredientId String?`<br>`ingredient Ingredient? @relation(fields: [ingredientId], references: [id])`<br>`receivedBatches IngredientBatch[]`<br>`inventoryId String?`<br>`inventory Inventory? @relation(fields: [inventoryId], references: [id])`<br>`productId String?`<br>`product Product? @relation(fields: [productId], references: [id])` | `inventoryId String`<br>`inventory Inventory @relation(fields: [inventoryId], references: [id])`<br>`productId String`<br>`product Product @relation(fields: [productId], references: [id])`<br>`@@unique([requestId, productId])` |
| GoodsReceipt (entire model missing) | `id String @id @default(cuid())`<br>`receiptNumber String @unique`<br>`status GoodsReceiptStatus @default(DRAFT)`<br>`purchaseRequestId String`<br>`purchaseRequest PurchaseRequest @relation(fields: [purchaseRequestId], references: [id])`<br>`receivedAt DateTime @default(now())`<br>`receivedBy String?`<br>`supplierInvoiceNo String?`<br>`note String?`<br>`idempotencyKey String? @unique`<br>`batches IngredientBatch[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@index([purchaseRequestId, receivedAt])`<br>`@@index([status])` | — |
| Supplier | `ingredients SupplierIngredient[]` | — |
| SupplierIngredient (entire model missing) | `id String @id @default(cuid())`<br>`supplierId String`<br>`supplier Supplier @relation(fields: [supplierId], references: [id], onDelete: Cascade)`<br>`ingredientId String`<br>`ingredient Ingredient @relation(fields: [ingredientId], references: [id])`<br>`pricePerBaseUnit Decimal @db.Decimal(18, 4)`<br>`supplierSku String?`<br>`purchaseUnit String`<br>`conversionQuantity Decimal @db.Decimal(14, 3)`<br>`conversionTargetUnit String @default("g")`<br>`minOrderQuantity Int @default(1)`<br>`leadTimeDays Int @default(3)`<br>`isPreferred Boolean @default(false)`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@unique([supplierId, ingredientId])` | — |
| AgentExecution (entire model missing) | `id String @id @default(cuid())`<br>`goal String`<br>`intent String?`<br>`status ExecutionStatus @default(RUNNING)`<br>`tokenIn Int @default(0)`<br>`tokenOut Int @default(0)`<br>`costUsd Decimal @default(0) @db.Decimal(10, 6)`<br>`fallbackUsed Boolean @default(false)`<br>`triggeredBy String?`<br>`triggeredByUser User? @relation("AgentExecutionTriggeredBy", fields: [triggeredBy], references: [id])`<br>`startedAt DateTime @default(now())`<br>`endedAt DateTime?`<br>`errorMessage String?`<br>`idempotencyKey String? @unique`<br>`toolCalls AgentToolCall[]`<br>`evaluations AgentEvaluation[]`<br>`createdAt DateTime @default(now())`<br>`updatedAt DateTime @updatedAt`<br>`@@index([status])` | — |
| AgentToolCall (entire model missing) | `id String @id @default(cuid())`<br>`executionId String`<br>`execution AgentExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)`<br>`stepNo Int`<br>`toolName String`<br>`arguments Json`<br>`result Json?`<br>`status ToolCallStatus @default(PENDING)`<br>`errorMessage String?`<br>`latencyMs Int?`<br>`startedAt DateTime @default(now())`<br>`completedAt DateTime?`<br>`@@unique([executionId, stepNo])` | — |
| AgentEvaluation (entire model missing) | `id String @id @default(cuid())`<br>`executionId String?`<br>`execution AgentExecution? @relation(fields: [executionId], references: [id])`<br>`testCode String`<br>`category String`<br>`prompt String`<br>`expectedTools String[]`<br>`actualTools String[]`<br>`toolMatched Boolean`<br>`hallucinated Boolean @default(false)`<br>`latencyMs Int?`<br>`passed Boolean`<br>`failureNote String?`<br>`batchLabel String`<br>`evaluatedAt DateTime @default(now())`<br>`@@index([batchLabel])` | — |
| User | `inventoryTransactions InventoryTransaction[] @relation("InventoryTransactionPerformedBy")`<br>`requestedPurchaseRequests PurchaseRequest[] @relation("PurchaseRequestRequestedBy")`<br>`approvedPurchaseRequests PurchaseRequest[] @relation("PurchaseRequestApprovedBy")`<br>`createdStockCounts StockCount[] @relation("StockCountCreatedBy")`<br>`approvedStockCounts StockCount[] @relation("StockCountApprovedBy")`<br>`agentExecutions AgentExecution[] @relation("AgentExecutionTriggeredBy")`<br>`legacyAgentLogs AgentLog[] @relation("AgentLogCreatedBy")` | `inventoryTransactions InventoryTransaction[]`<br>`requestedPurchaseRequests PurchaseRequest[] @relation("RequestedBy")`<br>`approvedPurchaseRequests PurchaseRequest[] @relation("ApprovedBy")`<br>`agentLogs AgentLog[] @relation("AgentLogCreatedBy")` |

| ENUM | Source labels | Generated labels |
|---|---|---|
| CategoryKind | PRODUCT, INGREDIENT | MISSING |
| InventoryTransactionType | IMPORT, ORDER, CANCEL, DAMAGE, ADJUSTMENT, SIMULATE_SALE, CONSUME, WASTE, RETURN, RESERVE, RELEASE | IMPORT, ORDER, CANCEL, DAMAGE, ADJUSTMENT, SIMULATE_SALE |
| WasteReason | CUSTOMER_CANCELLED, STAFF_ERROR, EXPIRED, DAMAGED | MISSING |
| StockCountStatus | DRAFT, PENDING, COMPLETED, CANCELLED | MISSING |
| OrderStatus | PENDING, PROCESSING, COMPLETED, CANCELLED | PENDING, PROCESSING, COMPLETED, CANCELLED |
| ConsumptionStatus | PENDING, COMMITTED, VOIDED | MISSING |
| PaymentStatus | PENDING, PAID, FAILED, REFUNDED | PENDING, PAID, FAILED, REFUNDED |
| PaymentMethod | CASH, BANK_TRANSFER, VIET_QR, MOMO, VNPAY | CASH, BANK_TRANSFER |
| TransactionStatus | INITIATED, PENDING, AUTHORIZED, PAID, FAILED, CANCELLED, EXPIRED, REFUNDED | MISSING |
| CallbackStatus | RECEIVED, VERIFIED, APPLIED, DUPLICATED, REJECTED_INVALID_SIGNATURE, FAILED | MISSING |
| ToppingType | ADD, REMOVE, SUBSTITUTE | MISSING |
| PurchaseRequestStatus | PENDING, APPROVED, SENT, RECEIVED, COMPLETED, REJECTED | PENDING, APPROVED, SENT, RECEIVED, COMPLETED, REJECTED |
| GoodsReceiptStatus | DRAFT, CONFIRMED, CANCELLED | MISSING |
| ExecutionStatus | RUNNING, WAITING_APPROVAL, SUCCEEDED, FAILED, TIMEOUT, CANCELLED | MISSING |
| ToolCallStatus | PENDING, RUNNING, SUCCEEDED, FAILED, BLOCKED_BY_PERMISSION, SKIPPED | MISSING |
| UserRole | ADMIN, STAFF, CUSTOMER | ADMIN, STAFF, CUSTOMER |

Historical initial SQL creates 15 tables / 6 ENUMs: Category, Inventory, InventoryBatch, InventoryTransaction, Order, OrderItem, Payment, Product, PurchaseRequest, PurchaseRequestItem, Supplier, SupplierProduct, AgentLog, SystemSetting, User. Second migration adds Product detail fields, not the 16 new target models. Target models missing from historical CREATE TABLE history: Ingredient, IngredientBatch, StockCount, StockCountItem, OrderItemTopping, PaymentCallback, PaymentReconciliation, Recipe, RecipeIngredient, Topping, ToppingIngredient, GoodsReceipt, SupplierIngredient, AgentExecution, AgentToolCall, AgentEvaluation.

### Missing contract fields, incompatible relationships and enforcement

These are observed gaps against ARCHITECTURE_FINAL/27_TABLE_CONTRACT.md and INVARIANT_TEST_PLAN.md; proposed field directions in that document remain evaluated fragments, not approved DDL.

| Area | Exact missing/incompatible source representation |
|---|---|
| D01/U2 | Recipe lacks purpose, sourceRecipeId, sealedAt, contentHash, calculationVersion, servings, publishedAt. RecipeIngredient lacks sourceLineId, omitted and rational numerator/denominator/delta history; quantityBase exists. OrderItem lacks rowVersion/source-yield and unique variant ownership/product-bound composite FK. Recipe product/version unique exists but no publication-interval exclusion/seal/immutability enforcement. Topping lacks version/effective publication history; OrderItemTopping lacks unique(item,topping). Optional omissions in the pure helper omit rows and are not a durable complete snapshot. |
| D02/D03 | Ingredient baseUnit is unchecked String; costPerBaseUnit, IngredientBatch.unitCost and InventoryTransaction.unitCost/totalCost default zero and are nonnullable, so unknown costs cannot remain unknown. OrderItem costs/profit use Decimal(12,2), whereas draft contract money is (14,2); pure cost helper is not a schema adapter. Missing per-component/per-lot attribution and exact rounding provenance. |
| D04/D05/D08 | Ingredient has aggregate reserved but IngredientBatch has no reserved field. InventoryTransaction.orderItemId is scalar without OrderItem FK; referenceId/type are strings; no typed reservation-root/terminal relationship, owner-bound allocation, matching terminal uniqueness or protected sole-write boundary. Expiration DateTime lacks explicit TIMESTAMPTZ(3). |
| D06/U4 | PurchaseRequestItem lacks supplierIngredientId, frozen purchaseUnit/baseUnit/basePerPack, orderedWholePacks and rowVersion; ingredientId nullable; legacy productId/inventoryId remain. GoodsReceipt lacks rowVersion, confirmedAt, receivedBy User relation and legitimate multi-item pack/price/draft revision/correction-line owner. IngredientBatch has separate optional goodsReceiptId/purchaseRequestItemId FKs, no composite receipt/item/ingredient binding, supplierId is unbound string, and no correction-origin chain. Fractional lot quantities cannot replace whole-pack receipt lines. |
| D07 | StockCountItem only has ingredientId plus aggregate quantities, no counted batch FK/identity, reservation/version snapshot or count approval replay receipt. Unique(count,ingredient) does not represent arbitrary per-batch evidence. |
| D09/U1 | InventoryTransaction, GoodsReceipt and AgentExecution have isolated nullable idempotencyKey uniqueness only; absent requestHash, actor/version binding, immutable original status/body and arbitrary terminal success/rejection history owner. Agent/SystemSetting/fake movements cannot fill this gap. |
| D10/U3 | AgentExecution lacks proposalHash/version, approverId, expiry/decisionAt, authority version, resultingPR FK/usage envelope; PurchaseRequest lacks originatingExecutionId. AgentToolCall stores actual arguments/result JSON and unique(execution,stepNo), but lacks typed arbitrary proposal-line/revision/approval-attempt representation. AgentEvaluation is genuine evaluation evidence only. |
| D11/U5 | Payment lacks unique(orderId,attemptNo), accountKey, appliedAt, disposition and unresolved/applied partial uniqueness. providerTxnId globally unique, merchantRef not account-scoped unique. Callback providerEventId globally unique/nullable, paymentId optional and no account binding. Reconciliation unique(method,businessDate), not account/date; resolvedBy lacks User FK. Unlimited refund/dispatch outcomes remain missing. |

### SQL/source and query contradictions

- Candidate 01_expand.sql adds Payment.transactionStatus while retaining old Payment.status:PaymentStatus and historical unique orderId. Current Prisma declares status:TransactionStatus, no transactionStatus, and nonunique orderId. The existing API calls payment.findUnique({where:{orderId}}), uses PaymentStatus and singular Order.payment; source declares Order.payments. Legacy generated client permits these calls to compile.
- Current InventoryTransaction declares batchId → IngredientBatch and legacyBatchId → InventoryBatch. Historical SQL batchId targets InventoryBatch; candidate expansion must not be treated as matching this relink merely because new tables exist. Existing legacy writers use batchId with InventoryBatch identities.
- Order repository reserves Inventory/product units, converts Decimal prices with Number and deducts on COMPLETED. Purchase receipt repository still writes Inventory/InventoryBatch and derives receipt totals from outer request-item state. Inventory, simulation, product, supplier, dashboard/reporting paths retain legacy dependencies. These are not the ingredient-only D01–D11 boundary.
- Agent repository uses Inventory, SupplierProduct and AgentLog; conversion receives logId/userId and recommendation JSON, not a hash/version-bound multi-line approval history. Existing Agent tables are not commandeered by this execution.
- Candidate SQL lacks the evaluated publication exclusion, sealed snapshot guards, typed reservation/terminal links, account-scoped settlement guards and runtime GRANT/REVOKE sole-write policy. Prisma declarations alone cannot encode all required invariants. No live enforcement is claimed.

### Unsafe migration findings (read only)

| File | Concrete problem |
|---|---|
| 00_precheck.sql | Creates persistent migration_backup schema/tables, TRUNCATEs and INSERTs baseline data. Despite its temporary/read-like description it is mutating and destroys previous baselines. |
| 01_expand.sql | 16 new table definitions plus original 15 form a 31-table expansion, not completed 27-table retirement. IF NOT EXISTS does not reconcile incompatible existing objects. Payment dual-status/unique-order and old batch FK differ from current source. Cascade relations can erase history. Missing business checks/triggers/permission boundary. |
| 02_migrate_data.sql | Bare top-level RAISE NOTICE statements outside DO/function blocks are invalid SQL. COALESCE cost/profit to zero invents known cost; completed orders mapped COMMITTED without recipe/allocation evidence. AgentLog → AgentToolCall one-per-log fabricates actual tool evidence; unknown executions mapped WAITING_APPROVAL and zero usage are not proven facts. Legacy ingredient/lot/conversion mapping unresolved. |
| 03_verify.sql | Writes/TRUNCATEs migration_backup.verification_results. Counts/totals alone cannot prove preservation or D01–D11; not a read-only inspection. |
| 04_contract_DO_NOT_RUN_YET.sql | Drops Product.unit, PurchaseRequestItem.inventoryId/productId and InventoryTransaction.productId; drops InventoryBatch/Inventory/SupplierProduct/AgentLog CASCADE while runtime dependencies and unmapped history persist. Unsafe data loss. |
| 05_rollback_plan.sql | Drops 16 new target tables CASCADE and new history columns; updates payment/order state from old representation. Cannot preserve subsequent business writes/replay identities. Not a safe rollback rehearsal. |

No SQL script was run. Live catalog/physical field parity, migration application and effective privileges are DATABASE_UNVERIFIED.

## C. Independent source changes

- inventory-core.ts: reduce rational addition by GCD to prevent denominator multiplication growth across repeated exact cost/ingredient extensions; preserve exact BigInt values and round-once policy.
- Validate every recipe ingredient identity before optional omission; zero ADD cannot hide a dimension conflict with an accumulated ingredient.
- Canonicalization now inspects own descriptors, rejects hidden/symbol/decorated properties, rejects getters without invoking them, explicitly rejects cycles, and permits repeated shared acyclic objects. Existing ordinary JSON key/array order and r6 identity format remain unchanged.
- Added three substantive tests: unsafe canonical values/shared references, omission/zero-effect validation, repeated exact small cost extensions/capacity and FEFO permutation/fractional allocation conservation. Existing expiry/FEFO/Decimal tests retained.
- ingredient-policy.ts reviewed: strict decimal string conversion, whole pieces, overflow, UTC+07 next-midnight and expiry boundary/FEFO tie-break already covered; no change needed.

Helpers remain detached from database/legacy stock writers. No durable idempotency, full topping provenance or database concurrency guarantee is inferred from these changes.

## D. U1/U3/U4 executable specifications — BLOCKED / NOT RUN

No legitimate persistent representation exists in the inspected source for all required histories. The following executable JavaScript assertion specifications are a future real-harness contract, included here instead of mock implementations. There is no approved adapter yet; therefore they were NOT RUN and cannot pass by skip/mock. Save the block as a test module only after a reviewed adapter implements the listed operations on an independently authorized disposable PostgreSQL database. Read-only catalog permission alone does not authorize these write tests. Adapter restart must recreate service/client processes and reuse the same database, never replay an in-memory fixture. Each response is the persisted original HTTP status/body, each evidence query returns real rows and typed FK ownership.

```js
const assert = require('node:assert/strict');
exports.U1 = async function U1(h, n) {
  assert.ok(Number.isSafeInteger(n) && n >= 3);
  await h.assertApprovedPersistentHarness({ tables: 27, enums: 16, mocks: false });
  const item = await h.createEditableItem({ value: 'Z', version: '1' });
  const outcomes = [];
  for (let i = 1; i <= n; i++) {
    const input = { itemId: item.id, key: 'K' + i, expectedVersion: String(i), value: 'V' + i };
    const result = await h.edit(input); outcomes.push({ input, result });
    const stale = { ...input, key: 'stale-' + i, expectedVersion: '0' };
    const rejected = await h.edit(stale); assert.equal(rejected.status, 409);
    outcomes.push({ input: stale, result: rejected });
  }
  const current = await h.item(item.id);
  await h.restart();
  for (const { input, result } of outcomes) assert.deepEqual(await h.edit(input), result);
  assert.deepEqual(await h.item(item.id), current);
  assert.equal((await h.edit({ ...outcomes[0].input, value: 'changed' })).status, 409);
  await h.assertRealOperationReceipts(outcomes);
  await h.assertAppendOwnershipProof(); // arbitrary history; N-slot designs require n=N+1
};
exports.U3 = async function U3(h) {
  await h.assertApprovedPersistentHarness({ tables: 27, enums: 16, mocks: false });
  const run = await h.genuineAgentProposal({ lineCount: 8 });
  assert.equal(await h.actualToolDispatchCount(run.id), 1);
  const r1 = await h.proposal(run.id);
  const r2 = await h.reviseProposal(run.id, r1.version);
  const r3 = await h.reviseProposal(run.id, r2.version);
  await h.assertTypedProposalLinesAndHistory(run.id, [r1, r2, r3], 8);
  const old = await h.approve({ runId: run.id, proposalHash: r1.hash });
  assert.equal(old.status, 409);
  const approval = await h.approve({ runId: run.id, proposalHash: r3.hash });
  const consumed = await h.consumeApproval(approval);
  await h.restart();
  assert.deepEqual(await h.consumeApproval(approval), consumed);
  assert.equal(await h.originatingPurchaseRequestCount(run.id), 1);
  await h.assertRetainedApprovalResults(run.id, [old, approval, consumed]);
  await h.assertNoFabricatedToolRows(run.id);
  await h.assertApprovalBoundaryCases(run.id, { expiryMinutes: 15, staleQuote: true, demotedActor: true, revokeConsumeBarrier: true });
};
exports.U4 = async function U4(h) {
  await h.assertApprovedPersistentHarness({ tables: 27, enums: 16, mocks: false });
  const receipt = await h.createMultiItemReceipt({
    A: { wholePacks: 4, basePerPack: '250', lots: ['350', '650'] },
    B: { wholePacks: 2, basePerPack: '100', lots: ['75', '125'] }
  });
  const original = await h.receipt(receipt.id);
  await h.assertDraftHasNoStock(receipt.id);
  const edit = await h.editReceiptTwiceAndCancelOneDraftLine(receipt.id);
  await h.restart();
  await h.assertFirstEditReplay(edit);
  await h.restoreValidDraftWithNewCommand(receipt.id, original);
  const confirmation = await h.confirmReceipt(receipt.id);
  await h.assertWholePackLinesAndLotOrigins(receipt.id, { A: '1000', B: '200', lots: 4 });
  await h.restart();
  assert.deepEqual(await h.confirmReceipt(receipt.id), confirmation);
  for (const state of ['free', 'reserved', 'partly-consumed']) {
    await h.assertCorrectionFixture({ state, wholePacks: 4, correctionPacks: 1, interveningReceipt: true,
      immutableOriginal: true, conservePacksPayablesReopening: true, realReversalsOnly: true });
  }
  await h.assertArbitraryLotPartitionsAndConcurrentOverreceipt();
};
```

U1 BLOCKED: no responsibility-preserving append owner for arbitrary successful/rejected command results. K1/K2/replay-K1 requires original V1/v2 response after current state V2/v3; a current row or finite slot cannot satisfy arbitrary n. Also require same-key barriers, hash conflict, revoked access and unknown-commit resolution as T18–24.

U3 BLOCKED: scalar execution envelope and real tool-call JSON do not establish typed multi-line/revision/approval-attempt ownership. A one-line restriction or fake tool dispatch is disallowed. Required persisted assertions additionally include proposal source versions, immutable decisions and one PENDING PR after concurrent consume/revoke.

U4 BLOCKED: header plus physical lots lacks per-item whole-pack/price/draft/correction history. Do not force whole packs per lot or one item per receipt. Consumed/reserved-origin correction disposition is unresolved; assertCorrectionFixture must fail its readiness gate until a legitimate contract supplies it. No adapter may merely assert success. Existing acceptance T11–14/T25–28 remain unwaived.

## E. Validation


Commands executed from D:\KLTN\source\cafe-project. Exit codes refer to the actual Node process completion (including resumed sessions).

| Exact command | Exit | Result |
|---|---:|---|
| `node --test --test-reporter=tap apps/api/tests/ingredient-policy.test.cjs apps/api/tests/inventory-core.test.cjs` | 0 | 17 passed, 0 failed, 0 skipped |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/api/tsconfig.json` | 0 | PASS, no diagnostics |
| `node node_modules/typescript/bin/tsc --noEmit -p apps/agent/tsconfig.json` | 0 | PASS, no diagnostics |
| Regression command below | 0 | 94 passed, 0 failed, 0 skipped |

```powershell
$env:TEST_IN_PROCESS='1'
$env:TEST_REAL_HTTP='0'
node --test --test-reporter=tap apps/api/tests/auth-registration.test.cjs apps/api/tests/inventory-consistency.test.cjs apps/api/tests/inventory-ui-contract.test.cjs apps/api/tests/order-after-commit.test.cjs apps/api/tests/purchase-receipt-validation.test.cjs apps/api/tests/test-db-security.test.cjs apps/agent/tests/gemini-output.test.cjs apps/agent/tests/internal-auth.test.cjs apps/agent/tests/principal-guards.test.cjs apps/agent/tests/rule-based-regression.test.cjs
```

Total executed: **111 tests passed**. Regression uses real application modules/Express middleware with mocked persistence/transport/provider dependencies and the existing in-process HTTP harness. It establishes local behavior only, not PostgreSQL transactions, rollback, locks, live catalog parity, provider behavior or U1/U3/U4 completion. No DB acceptance cases were disguised as passing mock tests. PostgreSQL tests: **NOT RUN**, no separate connection authorization or verified read-only role. Persistent write acceptance also needs separate disposable-environment authorization.

Environment commands: `Get-Service *postgres* -ErrorAction SilentlyContinue` reported permission error (its multi-command wrapper exit was not a service success); `Get-NetTCPConnection -State Listen -ErrorAction Stop` produced CIM permission failure, wrapper exit 1. Both psql absolute-path `--version` checks succeeded, exit 0. Filename/config-target extraction exit 0. An initial edit attempt via `python -` exited 1 because Python was not on PATH and changed no files; edits were then applied using patch/Node. Two initial rg commands used unsupported Windows wildcard arguments and reported path errors; directory-based `rg -g '*.sql'` / `rg -g '*.cjs'` retries supplied the inspected evidence. These tooling failures do not imply database availability.

## Exact next implementation actions

1. Keep all schema/migration/runtime write integration on hold. Resolve U1 legitimate append ownership, U3 typed proposal/revision/approval ownership and U4 typed receipt-line/correction ownership within exactly 27 tables/16 existing ENUMs and unchanged business responsibilities. Reuse existing blocker witnesses; no redesign cycle or scope reduction is authorized by this report.
2. Before any catalog connection, obtain explicit endpoint/scope authorization and verify a separately managed read-only role. Collect live table/ENUM names, field/FK/index/check/trigger/grant parity and applied migration history in the approved read-only snapshot. Do not execute repository verification SQL.
3. After a complete approved persistence contract, prepare an additive, data-preserving migration mapping with explicit unknown legacy data and history retention; repair dual Payment status, order uniqueness and legacy batch FK discrepancies. Preserve all later writes during recovery rehearsals.
4. Only then regenerate Prisma Client in a controlled review and rerun API/Agent typechecks against it; reconcile singular payment, legacy inventory/supplier/log queries and every stock writer before retirement.
5. Implement a real persistent acceptance adapter for the specifications above, including restart and two-session barriers; keep cases BLOCKED until the actual representation and authorized disposable database exist.
6. Inventory Core remains a pure calculation/planning dependency until the protected stock boundary, transaction protocol and persistence contract are approved. Full D01–D11, Agent isolation and data preservation remain acceptance gates.

Remaining limitations: runtime endpoint/service privileges UNKNOWN; live 27/16 parity DATABASE_UNVERIFIED; generated client stale; candidate SQL unsafe; U1/U3/U4 BLOCKED; U2/U5 and full D01–D11 persistence/enforcement incomplete. No deployment or database action is implied by passing local tests.

Final verification: `git diff --check` exited 0 (existing CRLF conversion warnings only). Because execution-owned helper/test/report are untracked in the inherited workspace, an additional Node whitespace check explicitly inspected all three files and passed (exit 0). A source import search found only inventory-core → ingredient-policy; no production caller imports inventory-core. Existing tracked diffs belong to the inherited baseline and were not attributed to this execution.
