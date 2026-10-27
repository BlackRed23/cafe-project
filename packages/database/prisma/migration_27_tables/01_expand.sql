-- ============================================================================
-- 01_expand.sql
-- Mục đích: Tạo mới các ENUM, bảng và cột của mô hình 27 bảng đích
-- Nguyên tắc: EXPAND (Chỉ thêm, không xóa, không sửa cấu trúc cũ đang chạy)
-- Điều kiện chạy: Sau khi 00_precheck.sql hoàn tất thành công
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- 1. TẠO VÀ BỔ SUNG CÁC ENUM (Tổng cộng đủ 16 ENUM)
-- ============================================================================

-- 1. UserRole (Đã có: 'ADMIN', 'STAFF', 'CUSTOMER')

-- 2. CategoryKind
DO $$ BEGIN
    CREATE TYPE "CategoryKind" AS ENUM ('PRODUCT', 'INGREDIENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. OrderStatus (Đã có: 'PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED')

-- 4. ConsumptionStatus
DO $$ BEGIN
    CREATE TYPE "ConsumptionStatus" AS ENUM ('PENDING', 'COMMITTED', 'VOIDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. PaymentMethod (Bổ sung MOMO, VNPAY nếu chưa có)
DO $$ BEGIN
    ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VIET_QR';
    ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'MOMO';
    ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'VNPAY';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. PaymentStatus (Đã có: 'PENDING', 'PAID', 'FAILED', 'REFUNDED')

-- 7. TransactionStatus
DO $$ BEGIN
    CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 8. CallbackStatus
DO $$ BEGIN
    CREATE TYPE "CallbackStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'APPLIED', 'DUPLICATED', 'REJECTED_INVALID_SIGNATURE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 9. PurchaseRequestStatus (Đã có)

-- 10. GoodsReceiptStatus
DO $$ BEGIN
    CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 11. InventoryTransactionType (Bổ sung các loại mới cho quản lý pha chế)
DO $$ BEGIN
    ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'CONSUME';
    ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'WASTE';
    ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'RETURN';
    ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'RESERVE';
    ALTER TYPE "InventoryTransactionType" ADD VALUE IF NOT EXISTS 'RELEASE';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 12. StockCountStatus
DO $$ BEGIN
    CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 13. ToppingType
DO $$ BEGIN
    CREATE TYPE "ToppingType" AS ENUM ('ADD', 'REMOVE', 'SUBSTITUTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 14. ExecutionStatus
DO $$ BEGIN
    CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 15. WasteReason
DO $$ BEGIN
    CREATE TYPE "WasteReason" AS ENUM ('CUSTOMER_CANCELLED', 'STAFF_ERROR', 'EXPIRED', 'DAMAGED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 16. ToolCallStatus
DO $$ BEGIN
    CREATE TYPE "ToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED_BY_PERMISSION', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- 2. MỞ RỘNG CÁC BẢNG HIỆN CÓ (Thêm cột mới, giữ nguyên cột cũ)
-- ============================================================================

-- Bảng Category: thêm kind và sortOrder
ALTER TABLE public."Category"
    ADD COLUMN IF NOT EXISTS "kind" "CategoryKind" NOT NULL DEFAULT 'PRODUCT',
    ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Bảng Product: thêm servingUnit, deletedAt, pendingDeleteUntil
ALTER TABLE public."Product"
    ADD COLUMN IF NOT EXISTS "servingUnit" TEXT DEFAULT 'ly',
    ALTER COLUMN "costPrice" TYPE DECIMAL(18, 4),
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pendingDeleteUntil" TIMESTAMP(3);

-- Bảng Order: thêm paymentMethod, paymentStatus, paidAt tổng hợp
ALTER TABLE public."Order"
    ADD COLUMN IF NOT EXISTS "paymentMethod" "PaymentMethod",
    ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);

-- Bảng OrderItem: thêm các cột snapshot công thức, vòng đời tiêu hao, chi phí giá vốn
ALTER TABLE public."OrderItem"
    ADD COLUMN IF NOT EXISTS "recipeId" TEXT,
    ADD COLUMN IF NOT EXISTS "recipeVersion" INTEGER,
    ADD COLUMN IF NOT EXISTS "consumptionStatus" "ConsumptionStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "committedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "ingredientCost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "toppingCost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "grossProfit" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Bảng Payment: mở rộng lưu chi tiết từng lần thử thanh toán
ALTER TABLE public."Payment"
    ADD COLUMN IF NOT EXISTS "providerTxnId" TEXT,
    ADD COLUMN IF NOT EXISTS "merchantRef" TEXT,
    ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'VND',
    ADD COLUMN IF NOT EXISTS "transactionStatus" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    ADD COLUMN IF NOT EXISTS "attemptNo" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "requestPayload" JSONB,
    ADD COLUMN IF NOT EXISTS "responsePayload" JSONB,
    ADD COLUMN IF NOT EXISTS "failureCode" TEXT,
    ADD COLUMN IF NOT EXISTS "failureMessage" TEXT,
    ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);

-- Bảng PurchaseRequest: mở rộng công nợ và số tiền
ALTER TABLE public."PurchaseRequest"
    ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    ADD COLUMN IF NOT EXISTS "receivedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "amountPaid" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Bảng PurchaseRequestItem: thêm ingredientId tham chiếu nguyên liệu mới
ALTER TABLE public."PurchaseRequestItem"
    ADD COLUMN IF NOT EXISTS "ingredientId" TEXT;

-- Bảng InventoryTransaction: thêm các trường sổ cái kho nâng cao
ALTER TABLE public."InventoryTransaction"
    ADD COLUMN IF NOT EXISTS "ingredientId" TEXT,
    ALTER COLUMN "quantity" TYPE DECIMAL(14, 3),
    ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "referenceType" TEXT,
    ADD COLUMN IF NOT EXISTS "referenceId" TEXT,
    ADD COLUMN IF NOT EXISTS "orderItemId" TEXT,
    ADD COLUMN IF NOT EXISTS "performedBy" TEXT,
    ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
    ADD COLUMN IF NOT EXISTS "wasteReason" "WasteReason";


-- ============================================================================
-- 3. TẠO CÁC BẢNG MỚI THEO THIẾT KẾ ĐÍCH
-- ============================================================================

-- B.1. Ingredient: nguyên liệu cốt lõi chịu trách nhiệm trừ tồn khi pha chế
CREATE TABLE IF NOT EXISTS public."Ingredient" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT,
    "baseUnit" TEXT NOT NULL DEFAULT 'g',
    "costPerBaseUnit" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "minThreshold" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "origin" TEXT,
    "storageInstructions" TEXT,
    "expiryInfo" TEXT,
    "shelfLifeDays" INTEGER,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "rowVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- B.2. IngredientBatch: lô nguyên liệu nhập
CREATE TABLE IF NOT EXISTS public."IngredientBatch" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "quantityInitial" DECIMAL(14, 3) NOT NULL,
    "quantityRemaining" DECIMAL(14, 3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18, 4) NOT NULL DEFAULT 0,
    "expirationDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplierId" TEXT,
    "goodsReceiptId" TEXT,
    "purchaseRequestItemId" TEXT,
    "receivedQty" DECIMAL(14, 3),
    "receivedUnit" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientBatch_pkey" PRIMARY KEY ("id")
);

-- C.1. Recipe: công thức pha chế của từng món
CREATE TABLE IF NOT EXISTS public."Recipe" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "yieldQuantity" DECIMAL(10, 2) NOT NULL DEFAULT 1.0,
    "laborCost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- C.2. RecipeIngredient: định lượng nguyên liệu cho công thức
CREATE TABLE IF NOT EXISTS public."RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(14, 3) NOT NULL,
    "unit" TEXT NOT NULL,
    "quantityBase" DECIMAL(14, 3) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "allowSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- D.1. Topping: danh mục topping / tuỳ chọn
CREATE TABLE IF NOT EXISTS public."Topping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "toppingType" "ToppingType" NOT NULL DEFAULT 'ADD',
    "price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "productId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Topping_pkey" PRIMARY KEY ("id")
);

-- D.2. ToppingIngredient: định lượng nguyên liệu của topping
CREATE TABLE IF NOT EXISTS public."ToppingIngredient" (
    "id" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityBase" DECIMAL(14, 3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToppingIngredient_pkey" PRIMARY KEY ("id")
);

-- D.5. OrderItemTopping: topping khách đã chọn trên từng dòng đơn
CREATE TABLE IF NOT EXISTS public."OrderItemTopping" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "toppingId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "costSnapshot" DECIMAL(12, 2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItemTopping_pkey" PRIMARY KEY ("id")
);

-- E.2. PaymentCallback: log thô webhook / IPN cổng thanh toán
CREATE TABLE IF NOT EXISTS public."PaymentCallback" (
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

-- E.3. PaymentReconciliation: kết quả đối soát cổng thanh toán theo ngày
CREATE TABLE IF NOT EXISTS public."PaymentReconciliation" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "expectedAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "actualCount" INTEGER NOT NULL DEFAULT 0,
    "actualAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "orphanCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReconciliation_pkey" PRIMARY KEY ("id")
);

-- F.2. SupplierIngredient: NCC bán nguyên liệu gì, quy đổi thế nào
CREATE TABLE IF NOT EXISTS public."SupplierIngredient" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "pricePerBaseUnit" DECIMAL(18, 4) NOT NULL,
    "supplierSku" TEXT,
    "purchaseUnit" TEXT NOT NULL,
    "conversionQuantity" DECIMAL(14, 3) NOT NULL,
    "conversionTargetUnit" TEXT NOT NULL DEFAULT 'g',
    "minOrderQuantity" INTEGER NOT NULL DEFAULT 1,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 3,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierIngredient_pkey" PRIMARY KEY ("id")
);

-- F.5. GoodsReceipt: phiếu nhận hàng từng đợt
CREATE TABLE IF NOT EXISTS public."GoodsReceipt" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- G.2. StockCount: phiếu kiểm kê
CREATE TABLE IF NOT EXISTS public."StockCount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- G.3. StockCountItem: dòng chi tiết kiểm kê
CREATE TABLE IF NOT EXISTS public."StockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "systemQty" DECIMAL(14, 3) NOT NULL,
    "actualQty" DECIMAL(14, 3) NOT NULL,
    "varianceQty" DECIMAL(14, 3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- H.1. AgentExecution: một lần Agent chạy
CREATE TABLE IF NOT EXISTS public."AgentExecution" (
    "id" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "intent" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "tokenIn" INTEGER NOT NULL DEFAULT 0,
    "tokenOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10, 6) NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- H.2. AgentToolCall: từng bước gọi tool của Agent
CREATE TABLE IF NOT EXISTS public."AgentToolCall" (
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

-- H.3. AgentEvaluation: kết quả đánh giá theo kịch bản kiểm thử
CREATE TABLE IF NOT EXISTS public."AgentEvaluation" (
    "id" TEXT NOT NULL,
    "executionId" TEXT,
    "testCode" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "expectedTools" TEXT[] NOT NULL,
    "actualTools" TEXT[] NOT NULL,
    "toolMatched" BOOLEAN NOT NULL,
    "hallucinated" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "passed" BOOLEAN NOT NULL,
    "failureNote" TEXT,
    "batchLabel" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvaluation_pkey" PRIMARY KEY ("id")
);


-- ============================================================================
-- 4. TẠO INDEX VÀ RÀNG BUỘC UNIQUE
-- ============================================================================

-- Unique keys
CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_kind_key" ON public."Category"("name", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "Ingredient_sku_key" ON public."Ingredient"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "Recipe_productId_version_key" ON public."Recipe"("productId", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "RecipeIngredient_recipeId_ingredientId_key" ON public."RecipeIngredient"("recipeId", "ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "ToppingIngredient_toppingId_ingredientId_key" ON public."ToppingIngredient"("toppingId", "ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierIngredient_supplierId_ingredientId_key" ON public."SupplierIngredient"("supplierId", "ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceipt_receiptNumber_key" ON public."GoodsReceipt"("receiptNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "GoodsReceipt_idempotencyKey_key" ON public."GoodsReceipt"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "StockCount_code_key" ON public."StockCount"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "StockCountItem_stockCountId_ingredientId_key" ON public."StockCountItem"("stockCountId", "ingredientId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentCallback_providerEventId_key" ON public."PaymentCallback"("providerEventId") WHERE "providerEventId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentReconciliation_method_businessDate_key" ON public."PaymentReconciliation"("method", "businessDate");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentExecution_idempotencyKey_key" ON public."AgentExecution"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "AgentToolCall_executionId_stepNo_key" ON public."AgentToolCall"("executionId", "stepNo");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryTransaction_idempotencyKey_key" ON public."InventoryTransaction"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- Indexes phục vụ truy vấn và hiệu năng
CREATE INDEX IF NOT EXISTS "Ingredient_categoryId_idx" ON public."Ingredient"("categoryId");
CREATE INDEX IF NOT EXISTS "IngredientBatch_ingredientId_idx" ON public."IngredientBatch"("ingredientId");
CREATE INDEX IF NOT EXISTS "IngredientBatch_expirationDate_idx" ON public."IngredientBatch"("expirationDate");
CREATE INDEX IF NOT EXISTS "Recipe_productId_isActive_idx" ON public."Recipe"("productId", "isActive");
CREATE INDEX IF NOT EXISTS "OrderItemTopping_orderItemId_idx" ON public."OrderItemTopping"("orderItemId");
CREATE INDEX IF NOT EXISTS "GoodsReceipt_purchaseRequestId_idx" ON public."GoodsReceipt"("purchaseRequestId");
CREATE INDEX IF NOT EXISTS "StockCount_status_idx" ON public."StockCount"("status");
CREATE INDEX IF NOT EXISTS "StockCountItem_ingredientId_idx" ON public."StockCountItem"("ingredientId");
CREATE INDEX IF NOT EXISTS "InventoryTransaction_ingredientId_createdAt_idx" ON public."InventoryTransaction"("ingredientId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentExecution_status_idx" ON public."AgentExecution"("status");
CREATE INDEX IF NOT EXISTS "AgentEvaluation_batchLabel_idx" ON public."AgentEvaluation"("batchLabel");


-- ============================================================================
-- 5. BỔ SUNG FOREIGN KEYS THEO THỨ TỰ PHỤ THUỘC (Topological Order)
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE public."Ingredient"
        ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."IngredientBatch"
        ADD CONSTRAINT "IngredientBatch_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."Recipe"
        ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."RecipeIngredient"
        ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES public."Recipe"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."Topping"
        ADD CONSTRAINT "Topping_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."ToppingIngredient"
        ADD CONSTRAINT "ToppingIngredient_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES public."Topping"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "ToppingIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."OrderItem"
        ADD CONSTRAINT "OrderItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES public."Recipe"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."OrderItemTopping"
        ADD CONSTRAINT "OrderItemTopping_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES public."OrderItem"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "OrderItemTopping_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES public."Topping"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."PaymentCallback"
        ADD CONSTRAINT "PaymentCallback_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."Payment"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."SupplierIngredient"
        ADD CONSTRAINT "SupplierIngredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "SupplierIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."GoodsReceipt"
        ADD CONSTRAINT "GoodsReceipt_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES public."PurchaseRequest"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."StockCount"
        ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public."User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."StockCountItem"
        ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES public."StockCount"("id") ON DELETE CASCADE,
        ADD CONSTRAINT "StockCountItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."AgentExecution"
        ADD CONSTRAINT "AgentExecution_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES public."User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."AgentToolCall"
        ADD CONSTRAINT "AgentToolCall_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES public."AgentExecution"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."AgentEvaluation"
        ADD CONSTRAINT "AgentEvaluation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES public."AgentExecution"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."InventoryTransaction"
        ADD CONSTRAINT "InventoryTransaction_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES public."Ingredient"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "InventoryTransaction_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES public."User"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

RAISE NOTICE '[EXPAND COMPLETED] Toàn bộ 27 bảng và 16 ENUM đã được tạo và cấu trúc sẵn sàng.';
