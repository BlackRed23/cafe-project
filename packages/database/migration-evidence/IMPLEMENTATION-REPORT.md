# Database migration implementation report

Final status: **PARTIAL**. EXPAND / BACKFILL / VERIFY deployed directly to cafe-kltn. CONTRACT deferred. Preserved drift fully enumerated below. No populated business records available to establish end-to-end business compatibility; successful empty reads do not establish write or historical-data acceptance.

## Scope and prerequisites

- HEAD: 98355e4 (required merge commit is HEAD); initial Git status clean.
- Target independently queried: cafe-kltn, public, PostgreSQL 18.6, 127.0.0.1:5432.
- Current Prisma schema retained unchanged: 31 models, 16 enums. Two historical migrations unchanged; all three applied migration file SHA256 checksums match database history.
- No test database created, seed executed, reset, db push, original pending SQL execution, or old data/column/table/type deletion.
- Audit captured 2026-11-15T20:38:14.103Z. Only cafe-kltn connected for database SQL.

## Backup verification

Required archive: D:/KLTN/git-backup-cafe/cafe-kltn-before-migration.dump.
Initial archive: 37,816 bytes; SHA256 a2aa79939e1e0dc6605fc6384195e2b05fd63c5df9d4c1efe9decebc2a533b4a; created 2026-11-16 03:23:10 local (+07).
PostgreSQL 16 pg_restore rejected archive format 1.16; PostgreSQL 18 tool decoded entire archive successfully. Sorted COPY payload count and SHA256 matched live pg_dump for all 16 tables, including migration history. Comparison covers complete row values rather than timestamps alone.

Initial deployment failed in precondition DO block: PL/pgSQL variable t conflicted with SQL alias t. No business DDL reached. Transaction rolled back; failed migration marked rolled back using Prisma migrate resolve. Corrected SQL then executed successfully in transaction ending ROLLBACK on same target. No disposable database used.

Because migration history changed, fresh PostgreSQL 18 custom-format backup created before final deployment; old archive preserved as cafe-kltn-before-migration.dump.previous-2026-11-15T20-33-59-496Z. New archive decoded fully and its 16 COPY payloads matched live database immediately before deploy. Fresh backup: 37,792 bytes; SHA256 e82b552c4d7ba27654a7727625f30f0290c9a6865459b0e13042995bc32d4ef2. No business data changes detected between initial archive and deployment. Archive decoding and comparison performed; restore recovery not exercised.

## Migration and actual execution

New migration: packages/database/prisma/schema/migrations/20261116090000_expand_preserve_legacy/migration.sql.
Deployed via prisma migrate deploy. SQL SHA256: c5dbc1b09396b384da49a0302a665f299e5c7094aac003430257b424a0a5536d.
Exact successful SQL reproduced in appendix. Additional SQL: read-only catalog/count/fingerprint/Prisma queries; corrected transaction rehearsal ending ROLLBACK; Prisma migration tracking writes and rolled-back resolution. Initial failed attempt stopped before business DDL. Migration history now has three completed records plus one rolled-back attempt.

Transaction uses public search_path, lock_timeout 10s, statement_timeout 120s and ACCESS EXCLUSIVE locks on all 15 existing business tables. Guards require exact target, empty 14 non-User tables, exactly one User and verified User fingerprint. Any concurrent populated data causes exception and rollback. Full User row preserved and compared with EXCEPT in both directions before commit.

## EXPAND and mappings

16 added tables: AgentEvaluation, AgentExecution, AgentToolCall, GoodsReceipt, Ingredient, IngredientBatch, OrderItemTopping, PaymentCallback, PaymentReconciliation, Recipe, RecipeIngredient, StockCount, StockCountItem, SupplierIngredient, Topping, ToppingIngredient.

10 added enums:
- CallbackStatus: RECEIVED, VERIFIED, APPLIED, DUPLICATED, REJECTED_INVALID_SIGNATURE, FAILED
- CategoryKind: PRODUCT, INGREDIENT
- ConsumptionStatus: PENDING, COMMITTED, VOIDED
- ExecutionStatus: RUNNING, WAITING_APPROVAL, SUCCEEDED, FAILED, TIMEOUT, CANCELLED
- GoodsReceiptStatus: DRAFT, CONFIRMED, CANCELLED
- StockCountStatus: DRAFT, PENDING, COMPLETED, CANCELLED
- ToolCallStatus: PENDING, RUNNING, SUCCEEDED, FAILED, BLOCKED_BY_PERMISSION, SKIPPED
- ToppingType: ADD, REMOVE, SUBSTITUTE
- TransactionStatus: INITIATED, PENDING, AUTHORIZED, PAID, FAILED, CANCELLED, EXPIRED, REFUNDED
- WasteReason: CUSTOMER_CANCELLED, STAFF_ERROR, EXPIRED, DAMAGED

Existing enums expanded: InventoryTransactionType adds CONSUME, WASTE, RETURN, RESERVE, RELEASE; PaymentMethod adds MOMO, VNPAY. Existing labels retained.

- Product: preserve unit, relax its NOT NULL requirement for current client; add servingUnit, backfill exact unit text (no unit conversion); costPrice widens to decimal(18,4).
- Payment: original status retained as legacyStatus with PaymentStatus type and original PENDING default. New status uses TransactionStatus with INITIATED default. PENDING/PAID/FAILED/REFUNDED map identically through text cast; no label discarded. Legacy status is historical retained data, not automatically synchronized for future writes.
- InventoryTransaction: preserve userId and FK; performedBy backfilled exactly. Original batchId column/FK renamed legacyBatchId, still references InventoryBatch. New nullable batchId references IngredientBatch; no old batch ID copied into incompatible new relation. quantity integer to decimal(14,3) exactly contains full int32 range. ProductId optional but original product FK retained. New ingredient, cost, reference, actor, waste and idempotency fields added.
- PurchaseRequestItem: preserve inventoryId/productId values and restrictive legacy FKs; relax nullability and add nullable ingredientId FK. No ingredient inferred from product without evidence.
- OrderItem: add nullable recipeId/version and lifecycle/cost fields, plus topping relation. No fabricated recipes, ingredient quantities or consumption history.
- Ingredient, Recipe and Inventory coexist; legacy Inventory retained. No automatic product-to-ingredient conversion without mapping.
- All affected business tables empty under lock: mapping statements updated zero rows. This is verified lack of mapping need for current dataset, not proof for a future populated database. Migration intentionally refuses such a database.

### Added columns (includes columns of new tables)

- AgentEvaluation.id: text, required
- AgentEvaluation.executionId: text, nullable
- AgentEvaluation.testCode: text, required
- AgentEvaluation.category: text, required
- AgentEvaluation.prompt: text, required
- AgentEvaluation.expectedTools: _text, nullable
- AgentEvaluation.actualTools: _text, nullable
- AgentEvaluation.toolMatched: bool, required
- AgentEvaluation.hallucinated: bool, required, default false
- AgentEvaluation.latencyMs: int4(32,0), nullable
- AgentEvaluation.passed: bool, required
- AgentEvaluation.failureNote: text, nullable
- AgentEvaluation.batchLabel: text, required
- AgentEvaluation.evaluatedAt: timestamp, required, default CURRENT_TIMESTAMP
- AgentExecution.id: text, required
- AgentExecution.goal: text, required
- AgentExecution.intent: text, nullable
- AgentExecution.status: ExecutionStatus, required, default 'RUNNING'::"ExecutionStatus"
- AgentExecution.tokenIn: int4(32,0), required, default 0
- AgentExecution.tokenOut: int4(32,0), required, default 0
- AgentExecution.costUsd: numeric(10,6), required, default 0
- AgentExecution.fallbackUsed: bool, required, default false
- AgentExecution.triggeredBy: text, nullable
- AgentExecution.startedAt: timestamp, required, default CURRENT_TIMESTAMP
- AgentExecution.endedAt: timestamp, nullable
- AgentExecution.errorMessage: text, nullable
- AgentExecution.idempotencyKey: text, nullable
- AgentExecution.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- AgentExecution.updatedAt: timestamp, required
- AgentToolCall.id: text, required
- AgentToolCall.executionId: text, required
- AgentToolCall.stepNo: int4(32,0), required
- AgentToolCall.toolName: text, required
- AgentToolCall.arguments: jsonb, required
- AgentToolCall.result: jsonb, nullable
- AgentToolCall.status: ToolCallStatus, required, default 'PENDING'::"ToolCallStatus"
- AgentToolCall.errorMessage: text, nullable
- AgentToolCall.latencyMs: int4(32,0), nullable
- AgentToolCall.startedAt: timestamp, required, default CURRENT_TIMESTAMP
- AgentToolCall.completedAt: timestamp, nullable
- Category.kind: CategoryKind, required, default 'PRODUCT'::"CategoryKind"
- Category.sortOrder: int4(32,0), required, default 0
- GoodsReceipt.id: text, required
- GoodsReceipt.receiptNumber: text, required
- GoodsReceipt.status: GoodsReceiptStatus, required, default 'DRAFT'::"GoodsReceiptStatus"
- GoodsReceipt.purchaseRequestId: text, required
- GoodsReceipt.receivedAt: timestamp, required, default CURRENT_TIMESTAMP
- GoodsReceipt.receivedBy: text, nullable
- GoodsReceipt.supplierInvoiceNo: text, nullable
- GoodsReceipt.note: text, nullable
- GoodsReceipt.idempotencyKey: text, nullable
- GoodsReceipt.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- GoodsReceipt.updatedAt: timestamp, required
- Ingredient.id: text, required
- Ingredient.sku: text, required
- Ingredient.name: text, required
- Ingredient.categoryId: text, nullable
- Ingredient.baseUnit: text, required, default 'g'::text
- Ingredient.costPerBaseUnit: numeric(18,4), required, default 0
- Ingredient.quantity: numeric(14,3), required, default 0
- Ingredient.reserved: numeric(14,3), required, default 0
- Ingredient.minThreshold: numeric(14,3), required, default 0
- Ingredient.origin: text, nullable
- Ingredient.storageInstructions: text, nullable
- Ingredient.expiryInfo: text, nullable
- Ingredient.shelfLifeDays: int4(32,0), nullable
- Ingredient.imageUrl: text, nullable
- Ingredient.isActive: bool, required, default true
- Ingredient.deletedAt: timestamp, nullable
- Ingredient.rowVersion: int4(32,0), required, default 0
- Ingredient.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- Ingredient.updatedAt: timestamp, required
- IngredientBatch.id: text, required
- IngredientBatch.ingredientId: text, required
- IngredientBatch.batchCode: text, required
- IngredientBatch.quantityInitial: numeric(14,3), required
- IngredientBatch.quantityRemaining: numeric(14,3), required, default 0
- IngredientBatch.unitCost: numeric(18,4), required, default 0
- IngredientBatch.expirationDate: timestamp, nullable
- IngredientBatch.receivedAt: timestamp, required, default CURRENT_TIMESTAMP
- IngredientBatch.supplierId: text, nullable
- IngredientBatch.goodsReceiptId: text, nullable
- IngredientBatch.purchaseRequestItemId: text, nullable
- IngredientBatch.receivedQty: numeric(14,3), nullable
- IngredientBatch.receivedUnit: text, nullable
- IngredientBatch.note: text, nullable
- IngredientBatch.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- IngredientBatch.updatedAt: timestamp, required
- InventoryTransaction.legacyBatchId: text, nullable
- InventoryTransaction.idempotencyKey: text, nullable
- InventoryTransaction.ingredientId: text, nullable
- InventoryTransaction.orderItemId: text, nullable
- InventoryTransaction.performedBy: text, nullable
- InventoryTransaction.referenceId: text, nullable
- InventoryTransaction.referenceType: text, nullable
- InventoryTransaction.totalCost: numeric(14,2), required, default 0
- InventoryTransaction.unitCost: numeric(18,4), required, default 0
- InventoryTransaction.wasteReason: WasteReason, nullable
- Order.paidAt: timestamp, nullable
- Order.paymentMethod: PaymentMethod, nullable
- Order.paymentStatus: PaymentStatus, required, default 'PENDING'::"PaymentStatus"
- OrderItem.committedAt: timestamp, nullable
- OrderItem.consumptionStatus: ConsumptionStatus, required, default 'PENDING'::"ConsumptionStatus"
- OrderItem.grossProfit: numeric(12,2), required, default 0
- OrderItem.ingredientCost: numeric(12,2), required, default 0
- OrderItem.recipeId: text, nullable
- OrderItem.recipeVersion: int4(32,0), nullable
- OrderItem.startedAt: timestamp, nullable
- OrderItem.toppingCost: numeric(12,2), required, default 0
- OrderItem.totalCost: numeric(12,2), required, default 0
- OrderItem.voidedAt: timestamp, nullable
- OrderItemTopping.id: text, required
- OrderItemTopping.orderItemId: text, required
- OrderItemTopping.toppingId: text, required
- OrderItemTopping.quantity: int4(32,0), required, default 1
- OrderItemTopping.price: numeric(12,2), required, default 0
- OrderItemTopping.costSnapshot: numeric(12,2), required, default 0
- OrderItemTopping.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- Payment.legacyStatus: PaymentStatus, required, default 'PENDING'::"PaymentStatus"
- Payment.attemptNo: int4(32,0), required, default 1
- Payment.currency: text, required, default 'VND'::text
- Payment.expiresAt: timestamp, nullable
- Payment.failureCode: text, nullable
- Payment.failureMessage: text, nullable
- Payment.merchantRef: text, nullable
- Payment.providerTxnId: text, nullable
- Payment.requestPayload: jsonb, nullable
- Payment.responsePayload: jsonb, nullable
- PaymentCallback.id: text, required
- PaymentCallback.method: PaymentMethod, required
- PaymentCallback.providerEventId: text, nullable
- PaymentCallback.eventType: text, nullable
- PaymentCallback.paymentId: text, nullable
- PaymentCallback.signatureValid: bool, required, default false
- PaymentCallback.rawPayload: jsonb, required
- PaymentCallback.headers: jsonb, nullable
- PaymentCallback.receivedAt: timestamp, required, default CURRENT_TIMESTAMP
- PaymentCallback.processedAt: timestamp, nullable
- PaymentCallback.status: CallbackStatus, required, default 'RECEIVED'::"CallbackStatus"
- PaymentCallback.errorMessage: text, nullable
- PaymentCallback.retryCount: int4(32,0), required, default 0
- PaymentReconciliation.id: text, required
- PaymentReconciliation.method: PaymentMethod, required
- PaymentReconciliation.businessDate: timestamp, required
- PaymentReconciliation.expectedCount: int4(32,0), required, default 0
- PaymentReconciliation.expectedAmount: numeric(14,2), required, default 0
- PaymentReconciliation.actualCount: int4(32,0), required, default 0
- PaymentReconciliation.actualAmount: numeric(14,2), required, default 0
- PaymentReconciliation.matchedCount: int4(32,0), required, default 0
- PaymentReconciliation.missingCount: int4(32,0), required, default 0
- PaymentReconciliation.orphanCount: int4(32,0), required, default 0
- PaymentReconciliation.resolvedAt: timestamp, nullable
- PaymentReconciliation.resolvedBy: text, nullable
- PaymentReconciliation.note: text, nullable
- PaymentReconciliation.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- Product.servingUnit: text, required, default 'ly'::text
- PurchaseRequestItem.ingredientId: text, nullable
- Recipe.id: text, required
- Recipe.productId: text, required
- Recipe.version: int4(32,0), required, default 1
- Recipe.isActive: bool, required, default true
- Recipe.effectiveFrom: timestamp, required, default CURRENT_TIMESTAMP
- Recipe.effectiveTo: timestamp, nullable
- Recipe.yieldQuantity: numeric(10,2), required, default 1.0
- Recipe.laborCost: numeric(12,2), required, default 0
- Recipe.overheadCost: numeric(12,2), required, default 0
- Recipe.note: text, nullable
- Recipe.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- Recipe.updatedAt: timestamp, required
- RecipeIngredient.id: text, required
- RecipeIngredient.recipeId: text, required
- RecipeIngredient.ingredientId: text, required
- RecipeIngredient.quantity: numeric(14,3), required
- RecipeIngredient.unit: text, required
- RecipeIngredient.quantityBase: numeric(14,3), required
- RecipeIngredient.isOptional: bool, required, default false
- RecipeIngredient.allowSubstitute: bool, required, default false
- RecipeIngredient.note: text, nullable
- RecipeIngredient.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- RecipeIngredient.updatedAt: timestamp, required
- StockCount.id: text, required
- StockCount.code: text, required
- StockCount.status: StockCountStatus, required, default 'DRAFT'::"StockCountStatus"
- StockCount.createdById: text, required
- StockCount.approvedById: text, nullable
- StockCount.approvedAt: timestamp, nullable
- StockCount.note: text, nullable
- StockCount.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- StockCount.updatedAt: timestamp, required
- StockCountItem.id: text, required
- StockCountItem.stockCountId: text, required
- StockCountItem.ingredientId: text, required
- StockCountItem.systemQty: numeric(14,3), required
- StockCountItem.actualQty: numeric(14,3), required
- StockCountItem.varianceQty: numeric(14,3), required
- StockCountItem.reason: text, nullable
- StockCountItem.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- SupplierIngredient.id: text, required
- SupplierIngredient.supplierId: text, required
- SupplierIngredient.ingredientId: text, required
- SupplierIngredient.pricePerBaseUnit: numeric(18,4), required
- SupplierIngredient.supplierSku: text, nullable
- SupplierIngredient.purchaseUnit: text, required
- SupplierIngredient.conversionQuantity: numeric(14,3), required
- SupplierIngredient.conversionTargetUnit: text, required, default 'g'::text
- SupplierIngredient.minOrderQuantity: int4(32,0), required, default 1
- SupplierIngredient.leadTimeDays: int4(32,0), required, default 3
- SupplierIngredient.isPreferred: bool, required, default false
- SupplierIngredient.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- SupplierIngredient.updatedAt: timestamp, required
- Topping.id: text, required
- Topping.name: text, required
- Topping.toppingType: ToppingType, required, default 'ADD'::"ToppingType"
- Topping.price: numeric(12,2), required, default 0
- Topping.productId: text, nullable
- Topping.isActive: bool, required, default true
- Topping.sortOrder: int4(32,0), required, default 0
- Topping.createdAt: timestamp, required, default CURRENT_TIMESTAMP
- Topping.updatedAt: timestamp, required
- ToppingIngredient.id: text, required
- ToppingIngredient.toppingId: text, required
- ToppingIngredient.ingredientId: text, required
- ToppingIngredient.quantityBase: numeric(14,3), required
- ToppingIngredient.note: text, nullable
- ToppingIngredient.createdAt: timestamp, required, default CURRENT_TIMESTAMP

### Changed existing column definitions

- InventoryTransaction.productId: {"table_name":"InventoryTransaction","column_name":"productId","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null,"numeric_precision":null,"numeric_scale":null} -> {"table_name":"InventoryTransaction","column_name":"productId","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"numeric_precision":null,"numeric_scale":null}
- InventoryTransaction.quantity: {"table_name":"InventoryTransaction","column_name":"quantity","data_type":"integer","udt_name":"int4","is_nullable":"NO","column_default":null,"numeric_precision":32,"numeric_scale":0} -> {"table_name":"InventoryTransaction","column_name":"quantity","data_type":"numeric","udt_name":"numeric","is_nullable":"NO","column_default":null,"numeric_precision":14,"numeric_scale":3}
- Payment.status: {"table_name":"Payment","column_name":"status","data_type":"USER-DEFINED","udt_name":"PaymentStatus","is_nullable":"NO","column_default":"'PENDING'::\"PaymentStatus\"","numeric_precision":null,"numeric_scale":null} -> {"table_name":"Payment","column_name":"status","data_type":"USER-DEFINED","udt_name":"TransactionStatus","is_nullable":"NO","column_default":"'INITIATED'::\"TransactionStatus\"","numeric_precision":null,"numeric_scale":null}
- Product.costPrice: {"table_name":"Product","column_name":"costPrice","data_type":"numeric","udt_name":"numeric","is_nullable":"NO","column_default":"0","numeric_precision":65,"numeric_scale":30} -> {"table_name":"Product","column_name":"costPrice","data_type":"numeric","udt_name":"numeric","is_nullable":"NO","column_default":"0","numeric_precision":18,"numeric_scale":4}
- Product.unit: {"table_name":"Product","column_name":"unit","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":"'Hộp'::text","numeric_precision":null,"numeric_scale":null} -> {"table_name":"Product","column_name":"unit","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":"'Hộp'::text","numeric_precision":null,"numeric_scale":null}
- PurchaseRequestItem.inventoryId: {"table_name":"PurchaseRequestItem","column_name":"inventoryId","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null,"numeric_precision":null,"numeric_scale":null} -> {"table_name":"PurchaseRequestItem","column_name":"inventoryId","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"numeric_precision":null,"numeric_scale":null}
- PurchaseRequestItem.productId: {"table_name":"PurchaseRequestItem","column_name":"productId","data_type":"text","udt_name":"text","is_nullable":"NO","column_default":null,"numeric_precision":null,"numeric_scale":null} -> {"table_name":"PurchaseRequestItem","column_name":"productId","data_type":"text","udt_name":"text","is_nullable":"YES","column_default":null,"numeric_precision":null,"numeric_scale":null}

### Added or renamed constraints

- "AgentEvaluation".AgentEvaluation_batchLabel_not_null: NOT NULL "batchLabel"; validated=true
- "AgentEvaluation".AgentEvaluation_category_not_null: NOT NULL category; validated=true
- "AgentEvaluation".AgentEvaluation_evaluatedAt_not_null: NOT NULL "evaluatedAt"; validated=true
- "AgentEvaluation".AgentEvaluation_executionId_fkey: FOREIGN KEY ("executionId") REFERENCES "AgentExecution"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "AgentEvaluation".AgentEvaluation_hallucinated_not_null: NOT NULL hallucinated; validated=true
- "AgentEvaluation".AgentEvaluation_id_not_null: NOT NULL id; validated=true
- "AgentEvaluation".AgentEvaluation_passed_not_null: NOT NULL passed; validated=true
- "AgentEvaluation".AgentEvaluation_pkey: PRIMARY KEY (id); validated=true
- "AgentEvaluation".AgentEvaluation_prompt_not_null: NOT NULL prompt; validated=true
- "AgentEvaluation".AgentEvaluation_testCode_not_null: NOT NULL "testCode"; validated=true
- "AgentEvaluation".AgentEvaluation_toolMatched_not_null: NOT NULL "toolMatched"; validated=true
- "AgentExecution".AgentExecution_costUsd_not_null: NOT NULL "costUsd"; validated=true
- "AgentExecution".AgentExecution_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "AgentExecution".AgentExecution_fallbackUsed_not_null: NOT NULL "fallbackUsed"; validated=true
- "AgentExecution".AgentExecution_goal_not_null: NOT NULL goal; validated=true
- "AgentExecution".AgentExecution_id_not_null: NOT NULL id; validated=true
- "AgentExecution".AgentExecution_pkey: PRIMARY KEY (id); validated=true
- "AgentExecution".AgentExecution_startedAt_not_null: NOT NULL "startedAt"; validated=true
- "AgentExecution".AgentExecution_status_not_null: NOT NULL status; validated=true
- "AgentExecution".AgentExecution_tokenIn_not_null: NOT NULL "tokenIn"; validated=true
- "AgentExecution".AgentExecution_tokenOut_not_null: NOT NULL "tokenOut"; validated=true
- "AgentExecution".AgentExecution_triggeredBy_fkey: FOREIGN KEY ("triggeredBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "AgentExecution".AgentExecution_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "AgentToolCall".AgentToolCall_arguments_not_null: NOT NULL arguments; validated=true
- "AgentToolCall".AgentToolCall_executionId_fkey: FOREIGN KEY ("executionId") REFERENCES "AgentExecution"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "AgentToolCall".AgentToolCall_executionId_not_null: NOT NULL "executionId"; validated=true
- "AgentToolCall".AgentToolCall_id_not_null: NOT NULL id; validated=true
- "AgentToolCall".AgentToolCall_pkey: PRIMARY KEY (id); validated=true
- "AgentToolCall".AgentToolCall_startedAt_not_null: NOT NULL "startedAt"; validated=true
- "AgentToolCall".AgentToolCall_status_not_null: NOT NULL status; validated=true
- "AgentToolCall".AgentToolCall_stepNo_not_null: NOT NULL "stepNo"; validated=true
- "AgentToolCall".AgentToolCall_toolName_not_null: NOT NULL "toolName"; validated=true
- "Category".Category_kind_not_null: NOT NULL kind; validated=true
- "Category".Category_sortOrder_not_null: NOT NULL "sortOrder"; validated=true
- "GoodsReceipt".GoodsReceipt_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "GoodsReceipt".GoodsReceipt_id_not_null: NOT NULL id; validated=true
- "GoodsReceipt".GoodsReceipt_pkey: PRIMARY KEY (id); validated=true
- "GoodsReceipt".GoodsReceipt_purchaseRequestId_fkey: FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "GoodsReceipt".GoodsReceipt_purchaseRequestId_not_null: NOT NULL "purchaseRequestId"; validated=true
- "GoodsReceipt".GoodsReceipt_receiptNumber_not_null: NOT NULL "receiptNumber"; validated=true
- "GoodsReceipt".GoodsReceipt_receivedAt_not_null: NOT NULL "receivedAt"; validated=true
- "GoodsReceipt".GoodsReceipt_status_not_null: NOT NULL status; validated=true
- "GoodsReceipt".GoodsReceipt_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "IngredientBatch".IngredientBatch_batchCode_not_null: NOT NULL "batchCode"; validated=true
- "IngredientBatch".IngredientBatch_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "IngredientBatch".IngredientBatch_goodsReceiptId_fkey: FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "IngredientBatch".IngredientBatch_id_not_null: NOT NULL id; validated=true
- "IngredientBatch".IngredientBatch_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "IngredientBatch".IngredientBatch_ingredientId_not_null: NOT NULL "ingredientId"; validated=true
- "IngredientBatch".IngredientBatch_pkey: PRIMARY KEY (id); validated=true
- "IngredientBatch".IngredientBatch_purchaseRequestItemId_fkey: FOREIGN KEY ("purchaseRequestItemId") REFERENCES "PurchaseRequestItem"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "IngredientBatch".IngredientBatch_quantityInitial_not_null: NOT NULL "quantityInitial"; validated=true
- "IngredientBatch".IngredientBatch_quantityRemaining_not_null: NOT NULL "quantityRemaining"; validated=true
- "IngredientBatch".IngredientBatch_receivedAt_not_null: NOT NULL "receivedAt"; validated=true
- "IngredientBatch".IngredientBatch_unitCost_not_null: NOT NULL "unitCost"; validated=true
- "IngredientBatch".IngredientBatch_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "Ingredient".Ingredient_baseUnit_not_null: NOT NULL "baseUnit"; validated=true
- "Ingredient".Ingredient_categoryId_fkey: FOREIGN KEY ("categoryId") REFERENCES "Category"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "Ingredient".Ingredient_costPerBaseUnit_not_null: NOT NULL "costPerBaseUnit"; validated=true
- "Ingredient".Ingredient_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "Ingredient".Ingredient_id_not_null: NOT NULL id; validated=true
- "Ingredient".Ingredient_isActive_not_null: NOT NULL "isActive"; validated=true
- "Ingredient".Ingredient_minThreshold_not_null: NOT NULL "minThreshold"; validated=true
- "Ingredient".Ingredient_name_not_null: NOT NULL name; validated=true
- "Ingredient".Ingredient_pkey: PRIMARY KEY (id); validated=true
- "Ingredient".Ingredient_quantity_not_null: NOT NULL quantity; validated=true
- "Ingredient".Ingredient_reserved_not_null: NOT NULL reserved; validated=true
- "Ingredient".Ingredient_rowVersion_not_null: NOT NULL "rowVersion"; validated=true
- "Ingredient".Ingredient_sku_not_null: NOT NULL sku; validated=true
- "Ingredient".Ingredient_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "InventoryTransaction".InventoryTransaction_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "InventoryTransaction".InventoryTransaction_legacyBatchId_fkey: FOREIGN KEY ("legacyBatchId") REFERENCES "InventoryBatch"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "InventoryTransaction".InventoryTransaction_performedBy_fkey: FOREIGN KEY ("performedBy") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "InventoryTransaction".InventoryTransaction_totalCost_not_null: NOT NULL "totalCost"; validated=true
- "InventoryTransaction".InventoryTransaction_unitCost_not_null: NOT NULL "unitCost"; validated=true
- "OrderItemTopping".OrderItemTopping_costSnapshot_not_null: NOT NULL "costSnapshot"; validated=true
- "OrderItemTopping".OrderItemTopping_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "OrderItemTopping".OrderItemTopping_id_not_null: NOT NULL id; validated=true
- "OrderItemTopping".OrderItemTopping_orderItemId_fkey: FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "OrderItemTopping".OrderItemTopping_orderItemId_not_null: NOT NULL "orderItemId"; validated=true
- "OrderItemTopping".OrderItemTopping_pkey: PRIMARY KEY (id); validated=true
- "OrderItemTopping".OrderItemTopping_price_not_null: NOT NULL price; validated=true
- "OrderItemTopping".OrderItemTopping_quantity_not_null: NOT NULL quantity; validated=true
- "OrderItemTopping".OrderItemTopping_toppingId_fkey: FOREIGN KEY ("toppingId") REFERENCES "Topping"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "OrderItemTopping".OrderItemTopping_toppingId_not_null: NOT NULL "toppingId"; validated=true
- "OrderItem".OrderItem_consumptionStatus_not_null: NOT NULL "consumptionStatus"; validated=true
- "OrderItem".OrderItem_grossProfit_not_null: NOT NULL "grossProfit"; validated=true
- "OrderItem".OrderItem_ingredientCost_not_null: NOT NULL "ingredientCost"; validated=true
- "OrderItem".OrderItem_recipeId_fkey: FOREIGN KEY ("recipeId") REFERENCES "Recipe"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "OrderItem".OrderItem_toppingCost_not_null: NOT NULL "toppingCost"; validated=true
- "OrderItem".OrderItem_totalCost_not_null: NOT NULL "totalCost"; validated=true
- "Order".Order_paymentStatus_not_null: NOT NULL "paymentStatus"; validated=true
- "PaymentCallback".PaymentCallback_id_not_null: NOT NULL id; validated=true
- "PaymentCallback".PaymentCallback_method_not_null: NOT NULL method; validated=true
- "PaymentCallback".PaymentCallback_paymentId_fkey: FOREIGN KEY ("paymentId") REFERENCES "Payment"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "PaymentCallback".PaymentCallback_pkey: PRIMARY KEY (id); validated=true
- "PaymentCallback".PaymentCallback_rawPayload_not_null: NOT NULL "rawPayload"; validated=true
- "PaymentCallback".PaymentCallback_receivedAt_not_null: NOT NULL "receivedAt"; validated=true
- "PaymentCallback".PaymentCallback_retryCount_not_null: NOT NULL "retryCount"; validated=true
- "PaymentCallback".PaymentCallback_signatureValid_not_null: NOT NULL "signatureValid"; validated=true
- "PaymentCallback".PaymentCallback_status_not_null: NOT NULL status; validated=true
- "PaymentReconciliation".PaymentReconciliation_actualAmount_not_null: NOT NULL "actualAmount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_actualCount_not_null: NOT NULL "actualCount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_businessDate_not_null: NOT NULL "businessDate"; validated=true
- "PaymentReconciliation".PaymentReconciliation_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "PaymentReconciliation".PaymentReconciliation_expectedAmount_not_null: NOT NULL "expectedAmount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_expectedCount_not_null: NOT NULL "expectedCount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_id_not_null: NOT NULL id; validated=true
- "PaymentReconciliation".PaymentReconciliation_matchedCount_not_null: NOT NULL "matchedCount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_method_not_null: NOT NULL method; validated=true
- "PaymentReconciliation".PaymentReconciliation_missingCount_not_null: NOT NULL "missingCount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_orphanCount_not_null: NOT NULL "orphanCount"; validated=true
- "PaymentReconciliation".PaymentReconciliation_pkey: PRIMARY KEY (id); validated=true
- "Payment".Payment_attemptNo_not_null: NOT NULL "attemptNo"; validated=true
- "Payment".Payment_currency_not_null: NOT NULL currency; validated=true
- "Payment".Payment_status_not_null1: NOT NULL status; validated=true
- "Product".Product_servingUnit_not_null: NOT NULL "servingUnit"; validated=true
- "PurchaseRequestItem".PurchaseRequestItem_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "RecipeIngredient".RecipeIngredient_allowSubstitute_not_null: NOT NULL "allowSubstitute"; validated=true
- "RecipeIngredient".RecipeIngredient_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "RecipeIngredient".RecipeIngredient_id_not_null: NOT NULL id; validated=true
- "RecipeIngredient".RecipeIngredient_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "RecipeIngredient".RecipeIngredient_ingredientId_not_null: NOT NULL "ingredientId"; validated=true
- "RecipeIngredient".RecipeIngredient_isOptional_not_null: NOT NULL "isOptional"; validated=true
- "RecipeIngredient".RecipeIngredient_pkey: PRIMARY KEY (id); validated=true
- "RecipeIngredient".RecipeIngredient_quantityBase_not_null: NOT NULL "quantityBase"; validated=true
- "RecipeIngredient".RecipeIngredient_quantity_not_null: NOT NULL quantity; validated=true
- "RecipeIngredient".RecipeIngredient_recipeId_fkey: FOREIGN KEY ("recipeId") REFERENCES "Recipe"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "RecipeIngredient".RecipeIngredient_recipeId_not_null: NOT NULL "recipeId"; validated=true
- "RecipeIngredient".RecipeIngredient_unit_not_null: NOT NULL unit; validated=true
- "RecipeIngredient".RecipeIngredient_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "Recipe".Recipe_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "Recipe".Recipe_effectiveFrom_not_null: NOT NULL "effectiveFrom"; validated=true
- "Recipe".Recipe_id_not_null: NOT NULL id; validated=true
- "Recipe".Recipe_isActive_not_null: NOT NULL "isActive"; validated=true
- "Recipe".Recipe_laborCost_not_null: NOT NULL "laborCost"; validated=true
- "Recipe".Recipe_overheadCost_not_null: NOT NULL "overheadCost"; validated=true
- "Recipe".Recipe_pkey: PRIMARY KEY (id); validated=true
- "Recipe".Recipe_productId_fkey: FOREIGN KEY ("productId") REFERENCES "Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "Recipe".Recipe_productId_not_null: NOT NULL "productId"; validated=true
- "Recipe".Recipe_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "Recipe".Recipe_version_not_null: NOT NULL version; validated=true
- "Recipe".Recipe_yieldQuantity_not_null: NOT NULL "yieldQuantity"; validated=true
- "StockCountItem".StockCountItem_actualQty_not_null: NOT NULL "actualQty"; validated=true
- "StockCountItem".StockCountItem_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "StockCountItem".StockCountItem_id_not_null: NOT NULL id; validated=true
- "StockCountItem".StockCountItem_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "StockCountItem".StockCountItem_ingredientId_not_null: NOT NULL "ingredientId"; validated=true
- "StockCountItem".StockCountItem_pkey: PRIMARY KEY (id); validated=true
- "StockCountItem".StockCountItem_stockCountId_fkey: FOREIGN KEY ("stockCountId") REFERENCES "StockCount"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "StockCountItem".StockCountItem_stockCountId_not_null: NOT NULL "stockCountId"; validated=true
- "StockCountItem".StockCountItem_systemQty_not_null: NOT NULL "systemQty"; validated=true
- "StockCountItem".StockCountItem_varianceQty_not_null: NOT NULL "varianceQty"; validated=true
- "StockCount".StockCount_approvedById_fkey: FOREIGN KEY ("approvedById") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "StockCount".StockCount_code_not_null: NOT NULL code; validated=true
- "StockCount".StockCount_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "StockCount".StockCount_createdById_fkey: FOREIGN KEY ("createdById") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "StockCount".StockCount_createdById_not_null: NOT NULL "createdById"; validated=true
- "StockCount".StockCount_id_not_null: NOT NULL id; validated=true
- "StockCount".StockCount_pkey: PRIMARY KEY (id); validated=true
- "StockCount".StockCount_status_not_null: NOT NULL status; validated=true
- "StockCount".StockCount_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "SupplierIngredient".SupplierIngredient_conversionQuantity_not_null: NOT NULL "conversionQuantity"; validated=true
- "SupplierIngredient".SupplierIngredient_conversionTargetUnit_not_null: NOT NULL "conversionTargetUnit"; validated=true
- "SupplierIngredient".SupplierIngredient_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "SupplierIngredient".SupplierIngredient_id_not_null: NOT NULL id; validated=true
- "SupplierIngredient".SupplierIngredient_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "SupplierIngredient".SupplierIngredient_ingredientId_not_null: NOT NULL "ingredientId"; validated=true
- "SupplierIngredient".SupplierIngredient_isPreferred_not_null: NOT NULL "isPreferred"; validated=true
- "SupplierIngredient".SupplierIngredient_leadTimeDays_not_null: NOT NULL "leadTimeDays"; validated=true
- "SupplierIngredient".SupplierIngredient_minOrderQuantity_not_null: NOT NULL "minOrderQuantity"; validated=true
- "SupplierIngredient".SupplierIngredient_pkey: PRIMARY KEY (id); validated=true
- "SupplierIngredient".SupplierIngredient_pricePerBaseUnit_not_null: NOT NULL "pricePerBaseUnit"; validated=true
- "SupplierIngredient".SupplierIngredient_purchaseUnit_not_null: NOT NULL "purchaseUnit"; validated=true
- "SupplierIngredient".SupplierIngredient_supplierId_fkey: FOREIGN KEY ("supplierId") REFERENCES "Supplier"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "SupplierIngredient".SupplierIngredient_supplierId_not_null: NOT NULL "supplierId"; validated=true
- "SupplierIngredient".SupplierIngredient_updatedAt_not_null: NOT NULL "updatedAt"; validated=true
- "ToppingIngredient".ToppingIngredient_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "ToppingIngredient".ToppingIngredient_id_not_null: NOT NULL id; validated=true
- "ToppingIngredient".ToppingIngredient_ingredientId_fkey: FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"(id) ON UPDATE CASCADE ON DELETE RESTRICT; validated=true
- "ToppingIngredient".ToppingIngredient_ingredientId_not_null: NOT NULL "ingredientId"; validated=true
- "ToppingIngredient".ToppingIngredient_pkey: PRIMARY KEY (id); validated=true
- "ToppingIngredient".ToppingIngredient_quantityBase_not_null: NOT NULL "quantityBase"; validated=true
- "ToppingIngredient".ToppingIngredient_toppingId_fkey: FOREIGN KEY ("toppingId") REFERENCES "Topping"(id) ON UPDATE CASCADE ON DELETE CASCADE; validated=true
- "ToppingIngredient".ToppingIngredient_toppingId_not_null: NOT NULL "toppingId"; validated=true
- "Topping".Topping_createdAt_not_null: NOT NULL "createdAt"; validated=true
- "Topping".Topping_id_not_null: NOT NULL id; validated=true
- "Topping".Topping_isActive_not_null: NOT NULL "isActive"; validated=true
- "Topping".Topping_name_not_null: NOT NULL name; validated=true
- "Topping".Topping_pkey: PRIMARY KEY (id); validated=true
- "Topping".Topping_price_not_null: NOT NULL price; validated=true
- "Topping".Topping_productId_fkey: FOREIGN KEY ("productId") REFERENCES "Product"(id) ON UPDATE CASCADE ON DELETE SET NULL; validated=true
- "Topping".Topping_sortOrder_not_null: NOT NULL "sortOrder"; validated=true
- "Topping".Topping_toppingType_not_null: NOT NULL "toppingType"; validated=true
- "Topping".Topping_updatedAt_not_null: NOT NULL "updatedAt"; validated=true

## Before / after preservation

| Existing table | Before | After | Preservation |
|---|---:|---:|---|
| AgentLog | 0 | 0 | PASS |
| Category | 0 | 0 | PASS |
| Inventory | 0 | 0 | PASS |
| InventoryBatch | 0 | 0 | PASS |
| InventoryTransaction | 0 | 0 | PASS |
| Order | 0 | 0 | PASS |
| OrderItem | 0 | 0 | PASS |
| Payment | 0 | 0 | PASS |
| Product | 0 | 0 | PASS |
| PurchaseRequest | 0 | 0 | PASS |
| PurchaseRequestItem | 0 | 0 | PASS |
| Supplier | 0 | 0 | PASS |
| SupplierProduct | 0 | 0 | PASS |
| SystemSetting | 0 | 0 | PASS |
| User | 1 | 1 | PASS |

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
| Full project test suite | See exact summary below | Mock tests only; no real business writes |
| Populated core business flows | NOT VERIFIED | Empty tables; real writes prohibited |

```text
ℹ tests 236
ℹ suites 0
ℹ pass 236
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 101481.6664
```

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

```sql
-- EXPAND + BACKFILL + VERIFY only. No legacy column/table/value removed.
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
-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('PRODUCT', 'INGREDIENT');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('CUSTOMER_CANCELLED', 'STAFF_ERROR', 'EXPIRED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsumptionStatus" AS ENUM ('PENDING', 'COMMITTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'APPLIED', 'DUPLICATED', 'REJECTED_INVALID_SIGNATURE', 'FAILED');

-- CreateEnum
CREATE TYPE "ToppingType" AS ENUM ('ADD', 'REMOVE', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED_BY_PERMISSION', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryTransactionType" ADD VALUE 'CONSUME';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'WASTE';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'RETURN';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'RESERVE';
ALTER TYPE "InventoryTransactionType" ADD VALUE 'RELEASE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'MOMO';
ALTER TYPE "PaymentMethod" ADD VALUE 'VNPAY';










-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "kind" "CategoryKind" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InventoryTransaction"
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "ingredientId" TEXT,
ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "orderItemId" TEXT,
ADD COLUMN     "performedBy" TEXT,
ADD COLUMN     "referenceId" TEXT,
ADD COLUMN     "referenceType" TEXT,
ADD COLUMN     "totalCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "wasteReason" "WasteReason",
ALTER COLUMN "productId" DROP NOT NULL,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "committedAt" TIMESTAMP(3),
ADD COLUMN     "consumptionStatus" "ConsumptionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "grossProfit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ingredientCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "recipeId" TEXT,
ADD COLUMN     "recipeVersion" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "toppingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "attemptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'VND',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "failureMessage" TEXT,
ADD COLUMN     "merchantRef" TEXT,
ADD COLUMN     "providerTxnId" TEXT,
ADD COLUMN     "requestPayload" JSONB,
ADD COLUMN     "responsePayload" JSONB,

ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED';

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN     "servingUnit" TEXT NOT NULL DEFAULT 'ly',
ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "PurchaseRequestItem" ADD COLUMN     "ingredientId" TEXT,
ALTER COLUMN "inventoryId" DROP NOT NULL,
ALTER COLUMN "productId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "baseUnit" TEXT NOT NULL DEFAULT 'g',
    "costPerBaseUnit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "minThreshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "origin" TEXT,
    "storageInstructions" TEXT,
    "expiryInfo" TEXT,
    "shelfLifeDays" INTEGER,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientBatch" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "quantityInitial" DECIMAL(14,3) NOT NULL,
    "quantityRemaining" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "expirationDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierId" TEXT,
    "goodsReceiptId" TEXT,
    "purchaseRequestItemId" TEXT,
    "receivedQty" DECIMAL(14,3),
    "receivedUnit" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "systemQty" DECIMAL(14,3) NOT NULL,
    "actualQty" DECIMAL(14,3) NOT NULL,
    "varianceQty" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemTopping" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costSnapshot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemTopping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCallback" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "providerEventId" TEXT,
    "eventType" TEXT,
    "paymentId" TEXT,
    "signatureValid" BOOLEAN NOT NULL DEFAULT false,
    "rawPayload" JSONB NOT NULL,
    "headers" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "CallbackStatus" NOT NULL DEFAULT 'RECEIVED',
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentCallback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "expectedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "orphanCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "yieldQuantity" DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityBase" DECIMAL(14,3) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "allowSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "toppingType" "ToppingType" NOT NULL DEFAULT 'ADD',
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "productId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToppingIngredient" (
    "id" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityBase" DECIMAL(14,3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToppingIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "purchaseRequestId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedBy" TEXT,
    "supplierInvoiceNo" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierIngredient" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "pricePerBaseUnit" DECIMAL(18,4) NOT NULL,
    "supplierSku" TEXT,
    "purchaseUnit" TEXT NOT NULL,
    "conversionQuantity" DECIMAL(14,3) NOT NULL,
    "conversionTargetUnit" TEXT NOT NULL DEFAULT 'g',
    "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 3,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "intent" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "tokenIn" INTEGER NOT NULL DEFAULT 0,
    "tokenOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepNo" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL,
    "result" JSONB,
    "status" "ToolCallStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvaluation" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "testCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "expectedTools" TEXT[],
    "actualTools" TEXT[],
    "toolMatched" BOOLEAN NOT NULL,
    "hallucinated" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "passed" BOOLEAN NOT NULL,
    "failureNote" TEXT,
    "batchLabel" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_sku_key" ON "Ingredient"("sku");

-- CreateIndex
CREATE INDEX "Ingredient_categoryId_idx" ON "Ingredient"("categoryId");

-- CreateIndex
CREATE INDEX "IngredientBatch_ingredientId_idx" ON "IngredientBatch"("ingredientId");

-- CreateIndex
CREATE INDEX "IngredientBatch_expirationDate_idx" ON "IngredientBatch"("expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_code_key" ON "StockCount"("code");

-- CreateIndex
CREATE INDEX "StockCount_status_idx" ON "StockCount"("status");

-- CreateIndex
CREATE INDEX "StockCountItem_ingredientId_idx" ON "StockCountItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_stockCountId_ingredientId_key" ON "StockCountItem"("stockCountId", "ingredientId");

-- CreateIndex
CREATE INDEX "OrderItemTopping_orderItemId_idx" ON "OrderItemTopping"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCallback_providerEventId_key" ON "PaymentCallback"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_method_businessDate_key" ON "PaymentReconciliation"("method", "businessDate");

-- CreateIndex
CREATE INDEX "Recipe_productId_isActive_idx" ON "Recipe"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_productId_version_key" ON "Recipe"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ToppingIngredient_toppingId_ingredientId_key" ON "ToppingIngredient"("toppingId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_receiptNumber_key" ON "GoodsReceipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GoodsReceipt_idempotencyKey_key" ON "GoodsReceipt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "GoodsReceipt_purchaseRequestId_receivedAt_idx" ON "GoodsReceipt"("purchaseRequestId", "receivedAt");

-- CreateIndex
CREATE INDEX "GoodsReceipt_status_idx" ON "GoodsReceipt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierIngredient_supplierId_ingredientId_key" ON "SupplierIngredient"("supplierId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentExecution_idempotencyKey_key" ON "AgentExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentExecution_status_idx" ON "AgentExecution"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentToolCall_executionId_stepNo_key" ON "AgentToolCall"("executionId", "stepNo");

-- CreateIndex
CREATE INDEX "AgentEvaluation_batchLabel_idx" ON "AgentEvaluation"("batchLabel");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_kind_key" ON "Category"("name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_ingredientId_createdAt_idx" ON "InventoryTransaction"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_orderItemId_idx" ON "InventoryTransaction"("orderItemId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_createdAt_idx" ON "InventoryTransaction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnId_key" ON "Payment"("providerTxnId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_purchaseRequestItemId_fkey" FOREIGN KEY ("purchaseRequestItemId") REFERENCES "PurchaseRequestItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "IngredientBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey


-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemTopping" ADD CONSTRAINT "OrderItemTopping_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemTopping" ADD CONSTRAINT "OrderItemTopping_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCallback" ADD CONSTRAINT "PaymentCallback_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topping" ADD CONSTRAINT "Topping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey


-- AddForeignKey


-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIngredient" ADD CONSTRAINT "SupplierIngredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIngredient" ADD CONSTRAINT "SupplierIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

```
