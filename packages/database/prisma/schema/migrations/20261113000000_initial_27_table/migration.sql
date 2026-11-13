-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('PRODUCT', 'INGREDIENT');

-- CreateEnum
CREATE TYPE "InventoryTransactionType" AS ENUM ('IMPORT', 'CONSUME', 'WASTE', 'ADJUSTMENT', 'RETURN', 'RESERVE', 'RELEASE', 'CANCEL', 'SIMULATE_SALE');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('CUSTOMER_CANCELLED', 'STAFF_ERROR', 'EXPIRED', 'DAMAGED');

-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('DRAFT', 'PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ConsumptionStatus" AS ENUM ('PENDING', 'STARTED', 'COMMITTED', 'VOIDED_BEFORE_START', 'VOIDED_AFTER_START', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'VNPAY', 'MOMO');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'APPLIED', 'DUPLICATED', 'REJECTED_INVALID_SIGNATURE', 'FAILED');

-- CreateEnum
CREATE TYPE "ToppingType" AS ENUM ('ADD', 'REMOVE', 'SUBSTITUTE');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'SENT', 'RECEIVED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED_BY_PERMISSION', 'SKIPPED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL DEFAULT 'PRODUCT',
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "batchId" TEXT,
    "type" "InventoryTransactionType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(18,4),
    "totalCost" DECIMAL(14,2),
    "referenceType" TEXT,
    "referenceId" TEXT,
    "orderItemId" TEXT,
    "performedBy" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "wasteReason" "WasteReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryTransaction_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingZone" TEXT,
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "shippingAddress" TEXT,
    "note" TEXT,
    "paymentMethod" "PaymentMethod",
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeVersion" INTEGER,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "consumptionStatus" "ConsumptionStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "ingredientCost" DECIMAL(12,2),
    "toppingCost" DECIMAL(12,2),
    "totalCost" DECIMAL(12,2),
    "grossProfit" DECIMAL(12,2),
    "costBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "providerTxnId" TEXT,
    "merchantRef" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "attemptNo" INTEGER NOT NULL DEFAULT 1,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
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
    "businessDate" DATE NOT NULL,
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
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "servingUnit" TEXT NOT NULL DEFAULT 'ly',
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "pendingDeleteUntil" TIMESTAMP(3),
    "nutritionFacts" TEXT,
    "usageInstructions" TEXT,
    "storageInstructions" TEXT,
    "origin" TEXT,
    "certifications" TEXT,
    "expiryInfo" TEXT,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "supplierId" TEXT NOT NULL,
    "notes" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "emailSentAt" TIMESTAMP(3),
    "emailContent" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastEmailError" TEXT,
    "receivedAt" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "paymentNote" TEXT,
    "receivedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "agentExecutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "contact" TEXT,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "reliabilityScore" DECIMAL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "googleId" TEXT,
    "provider" TEXT,
    "resetToken" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_kind_key" ON "Category"("name", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_sku_key" ON "Ingredient"("sku");

-- CreateIndex
CREATE INDEX "Ingredient_categoryId_idx" ON "Ingredient"("categoryId");

-- CreateIndex
CREATE INDEX "IngredientBatch_ingredientId_idx" ON "IngredientBatch"("ingredientId");

-- CreateIndex
CREATE INDEX "IngredientBatch_expirationDate_idx" ON "IngredientBatch"("expirationDate");

-- CreateIndex
CREATE INDEX "IngredientBatch_supplierId_idx" ON "IngredientBatch"("supplierId");

-- CreateIndex
CREATE INDEX "IngredientBatch_goodsReceiptId_idx" ON "IngredientBatch"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "IngredientBatch_purchaseRequestItemId_idx" ON "IngredientBatch"("purchaseRequestItemId");

-- CreateIndex
CREATE INDEX "IngredientBatch_ingredientId_expirationDate_idx" ON "IngredientBatch"("ingredientId", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientBatch_ingredientId_batchCode_key" ON "IngredientBatch"("ingredientId", "batchCode");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientBatch_id_ingredientId_key" ON "IngredientBatch"("id", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryTransaction_idempotencyKey_key" ON "InventoryTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InventoryTransaction_ingredientId_createdAt_idx" ON "InventoryTransaction"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryTransaction_referenceType_referenceId_idx" ON "InventoryTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_orderItemId_idx" ON "InventoryTransaction"("orderItemId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_batchId_ingredientId_idx" ON "InventoryTransaction"("batchId", "ingredientId");

-- CreateIndex
CREATE INDEX "InventoryTransaction_type_createdAt_idx" ON "InventoryTransaction"("type", "createdAt");

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
CREATE UNIQUE INDEX "OrderItemTopping_orderItemId_toppingId_key" ON "OrderItemTopping"("orderItemId", "toppingId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnId_key" ON "Payment"("providerTxnId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_attemptNo_key" ON "Payment"("orderId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCallback_providerEventId_key" ON "PaymentCallback"("providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReconciliation_method_businessDate_key" ON "PaymentReconciliation"("method", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Recipe_productId_isActive_idx" ON "Recipe"("productId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_productId_version_key" ON "Recipe"("productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_id_productId_version_key" ON "Recipe"("id", "productId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "Topping_name_key" ON "Topping"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ToppingIngredient_toppingId_ingredientId_key" ON "ToppingIngredient"("toppingId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_requestNumber_key" ON "PurchaseRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "PurchaseRequest_agentExecutionId_idx" ON "PurchaseRequest"("agentExecutionId");

-- CreateIndex
CREATE INDEX "PurchaseRequestItem_ingredientId_idx" ON "PurchaseRequestItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequestItem_requestId_ingredientId_key" ON "PurchaseRequestItem"("requestId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequestItem_id_ingredientId_key" ON "PurchaseRequestItem"("id", "ingredientId");

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
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_purchaseRequestItemId_ingredientId_fkey" FOREIGN KEY ("purchaseRequestItemId", "ingredientId") REFERENCES "PurchaseRequestItem"("id", "ingredientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_batchId_ingredientId_fkey" FOREIGN KEY ("batchId", "ingredientId") REFERENCES "IngredientBatch"("id", "ingredientId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_recipeId_productId_recipeVersion_fkey" FOREIGN KEY ("recipeId", "productId", "recipeVersion") REFERENCES "Recipe"("id", "productId", "version") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemTopping" ADD CONSTRAINT "OrderItemTopping_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemTopping" ADD CONSTRAINT "OrderItemTopping_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCallback" ADD CONSTRAINT "PaymentCallback_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topping" ADD CONSTRAINT "Topping_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_toppingId_fkey" FOREIGN KEY ("toppingId") REFERENCES "Topping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_agentExecutionId_fkey" FOREIGN KEY ("agentExecutionId") REFERENCES "AgentExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIngredient" ADD CONSTRAINT "SupplierIngredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierIngredient" ADD CONSTRAINT "SupplierIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- PostgreSQL-only portion of the fresh 27-table baseline. Prisma cannot express
-- CHECKs, partial indexes, exclusion constraints or append-only triggers.
-- This file is appended to initial migration; never apply it to legacy cafedb.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Product" ADD CONSTRAINT "Product_money_check"
  CHECK (price >= 0 AND "costPrice" >= 0);
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_balance_check"
  CHECK (quantity >= 0 AND reserved >= 0 AND reserved <= quantity
    AND "minThreshold" >= 0 AND "costPerBaseUnit" >= 0 AND "rowVersion" >= 0);
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_unit_check"
  CHECK ("baseUnit" IN ('g', 'ml', 'cái') AND
    ("baseUnit" <> 'cái' OR (quantity = trunc(quantity) AND reserved = trunc(reserved)
      AND "minThreshold" = trunc("minThreshold"))));
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_shelfLife_check"
  CHECK ("shelfLifeDays" IS NULL OR "shelfLifeDays" > 0);
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_quantity_check"
  CHECK ("quantityInitial" > 0 AND "quantityRemaining" >= 0 AND "unitCost" >= 0);
-- Remaining may exceed initial after legitimate positive count adjustments.
ALTER TABLE "IngredientBatch" ADD CONSTRAINT "IngredientBatch_received_check"
  CHECK (("receivedQty" IS NULL AND "receivedUnit" IS NULL) OR
    ("receivedQty" > 0 AND "receivedUnit" IS NOT NULL AND btrim("receivedUnit") <> ''));

ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_values_check"
  CHECK (version > 0 AND "yieldQuantity" > 0 AND "laborCost" >= 0 AND "overheadCost" >= 0
    AND ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"));
CREATE UNIQUE INDEX "Recipe_one_active_per_product" ON "Recipe" ("productId") WHERE "isActive";
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_effective_period_excl"
  EXCLUDE USING gist ("productId" WITH =,
    tsrange("effectiveFrom", "effectiveTo", '[)') WITH &&);
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_quantity_check"
  CHECK (quantity > 0 AND "quantityBase" > 0 AND btrim(unit) <> '');
ALTER TABLE "Topping" ADD CONSTRAINT "Topping_price_check" CHECK (price >= 0);
-- Signed components permit SUBSTITUTE to remove original and add replacement.
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_quantity_check"
  CHECK ("quantityBase" <> 0);

ALTER TABLE "Order" ADD CONSTRAINT "Order_money_check"
  CHECK ("totalAmount" >= 0 AND "shippingFee" >= 0 AND "totalAmount" >= "shippingFee");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_values_check"
  CHECK (quantity > 0 AND price >= 0 AND "ingredientCost" >= 0 AND "toppingCost" >= 0 AND "totalCost" >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_recipe_pair_check"
  CHECK (("recipeId" IS NULL) = ("recipeVersion" IS NULL));
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_lifecycle_check" CHECK (
  ("consumptionStatus" <> 'STARTED' OR ("recipeId" IS NOT NULL AND "startedAt" IS NOT NULL)) AND
  ("consumptionStatus" <> 'COMMITTED' OR
    ("recipeId" IS NOT NULL AND "startedAt" IS NOT NULL AND "committedAt" IS NOT NULL)) AND
  ("consumptionStatus" <> 'VOIDED_AFTER_START' OR "startedAt" IS NOT NULL) AND
  ("consumptionStatus" NOT IN ('VOIDED_BEFORE_START', 'VOIDED_AFTER_START') OR "voidedAt" IS NOT NULL) AND
  ("consumptionStatus" <> 'VOIDED_BEFORE_START' OR ("startedAt" IS NULL AND "committedAt" IS NULL)) AND
  ("committedAt" IS NULL OR ("startedAt" IS NOT NULL AND "committedAt" >= "startedAt")) AND
  ("voidedAt" IS NULL OR "startedAt" IS NULL OR "voidedAt" >= "startedAt"));
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_costBreakdown_check"
  CHECK ("costBreakdown" IS NULL OR jsonb_typeof("costBreakdown") = 'object');
ALTER TABLE "OrderItemTopping" ADD CONSTRAINT "OrderItemTopping_values_check"
  CHECK (quantity > 0 AND price >= 0 AND "costSnapshot" >= 0);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_values_check"
  CHECK (amount >= 0 AND "attemptNo" > 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paidAt_check"
  CHECK (status NOT IN ('PAID', 'REFUNDED') OR "paidAt" IS NOT NULL);
CREATE UNIQUE INDEX "Payment_one_unresolved_per_order" ON "Payment" ("orderId")
  WHERE status IN ('INITIATED', 'PENDING', 'AUTHORIZED');
-- PAID-only uniqueness would permit second settlement after refund.
CREATE UNIQUE INDEX "Payment_one_settled_per_order" ON "Payment" ("orderId")
  WHERE status IN ('PAID', 'REFUNDED');
ALTER TABLE "PaymentCallback" ADD CONSTRAINT "PaymentCallback_retry_check" CHECK ("retryCount" >= 0);
ALTER TABLE "PaymentCallback" ADD CONSTRAINT "PaymentCallback_applied_check"
  CHECK (status <> 'APPLIED' OR ("signatureValid" AND "paymentId" IS NOT NULL AND "processedAt" IS NOT NULL));
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_values_check"
  CHECK ("expectedCount" >= 0 AND "actualCount" >= 0 AND "expectedAmount" >= 0 AND "actualAmount" >= 0
    AND "matchedCount" >= 0 AND "missingCount" >= 0 AND "orphanCount" >= 0);
ALTER TABLE "PaymentReconciliation" ADD CONSTRAINT "PaymentReconciliation_resolved_check"
  CHECK (("resolvedAt" IS NULL) = ("resolvedBy" IS NULL));

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_status_check" CHECK (status IN ('ACTIVE', 'INACTIVE'));
-- DOCX gives no scoring scale: leave reliabilityScore nullable, finite, unbounded.
ALTER TABLE "SupplierIngredient" ADD CONSTRAINT "SupplierIngredient_values_check"
  CHECK ("pricePerBaseUnit" >= 0 AND "conversionQuantity" > 0 AND "minOrderQuantity" > 0
    AND "leadTimeDays" >= 0 AND btrim("purchaseUnit") <> '');
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_values_check"
  CHECK ("totalAmount" >= 0 AND "receivedAmount" >= 0 AND "amountPaid" >= 0 AND "retryCount" >= 0);
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_approval_check"
  CHECK (("approvedBy" IS NULL) = ("approvedAt" IS NULL)
    AND ("approvedBy" IS NULL OR "approvedBy" <> "requestedBy"));
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_agent_origin_check"
  CHECK (NOT "aiGenerated" OR "agentExecutionId" IS NOT NULL);
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_quantity_check"
  CHECK (quantity > 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= quantity AND "unitPrice" >= 0);
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_confirmed_check"
  CHECK (status <> 'CONFIRMED' OR ("receivedBy" IS NOT NULL AND "idempotencyKey" IS NOT NULL));

ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_quantity_check"
  CHECK (quantity <> 0 AND "unitCost" >= 0 AND
    (type <> 'IMPORT' OR quantity > 0) AND
    (type NOT IN ('CONSUME', 'WASTE', 'SIMULATE_SALE') OR quantity < 0));
-- RETURN/CANCEL/RESERVE/RELEASE signs and valuation require resolved D05/D08
-- contract; do not guess their physical/reserved accounting policy here.
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_reason_check"
  CHECK (type NOT IN ('WASTE', 'ADJUSTMENT') OR
    ("performedBy" IS NOT NULL AND reason IS NOT NULL AND btrim(reason) <> ''));
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_waste_check"
  CHECK (type <> 'WASTE' OR "wasteReason" IS NOT NULL);
ALTER TABLE "InventoryTransaction" ADD CONSTRAINT "InventoryTransaction_reference_pair_check"
  CHECK (("referenceType" IS NULL) = ("referenceId" IS NULL));
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_variance_check"
  CHECK ("systemQty" >= 0 AND "actualQty" >= 0 AND "varianceQty" = "actualQty" - "systemQty"
    AND ("varianceQty" = 0 OR (reason IS NOT NULL AND btrim(reason) <> '')));
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_approval_check"
  CHECK (("approvedById" IS NULL) = ("approvedAt" IS NULL)
    AND (status <> 'COMPLETED' OR "approvedById" IS NOT NULL));
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_values_check"
  CHECK ("tokenIn" >= 0 AND "tokenOut" >= 0 AND "costUsd" >= 0
    AND ("endedAt" IS NULL OR "endedAt" >= "startedAt"));
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_values_check"
  CHECK ("stepNo" > 0 AND "latencyMs" >= 0
    AND ("completedAt" IS NULL OR "completedAt" >= "startedAt"));
ALTER TABLE "AgentEvaluation" ADD CONSTRAINT "AgentEvaluation_latency_check" CHECK ("latencyMs" >= 0);

-- PostgreSQL numeric NaN compares greater than finite values; sign CHECKs alone
-- do not reject it. Cover every numeric column, including signed grossProfit.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'numeric'
  LOOP
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%I NOT IN (''NaN''::numeric, ''Infinity''::numeric, ''-Infinity''::numeric))',
      c.table_name, c.table_name || '_' || c.column_name || '_finite', c.column_name);
  END LOOP;
END $$;

CREATE FUNCTION cafe_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'InventoryTransaction is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "InventoryTransaction_append_only"
  BEFORE UPDATE OR DELETE OR TRUNCATE ON "InventoryTransaction"
  FOR EACH STATEMENT EXECUTE FUNCTION cafe_reject_ledger_mutation();

CREATE FUNCTION cafe_guard_batch_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_id text; supplier_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND ROW(NEW."ingredientId", NEW."batchCode", NEW."quantityInitial", NEW."unitCost",
    NEW."receivedAt", NEW."supplierId", NEW."goodsReceiptId", NEW."purchaseRequestItemId", NEW."receivedQty", NEW."receivedUnit")
    IS DISTINCT FROM ROW(OLD."ingredientId", OLD."batchCode", OLD."quantityInitial", OLD."unitCost",
    OLD."receivedAt", OLD."supplierId", OLD."goodsReceiptId", OLD."purchaseRequestItemId", OLD."receivedQty", OLD."receivedUnit") THEN
    RAISE EXCEPTION 'Lot cost and origin are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."goodsReceiptId" IS NOT NULL THEN
    SELECT r."purchaseRequestId", p."supplierId" INTO request_id, supplier_id
      FROM "GoodsReceipt" r JOIN "PurchaseRequest" p ON p.id = r."purchaseRequestId"
      WHERE r.id = NEW."goodsReceiptId" FOR SHARE OF r, p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown goods receipt' USING ERRCODE = '23503'; END IF;
    IF NEW."purchaseRequestItemId" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "PurchaseRequestItem" i WHERE i.id = NEW."purchaseRequestItemId"
        AND i."requestId" = request_id AND i."ingredientId" = NEW."ingredientId")
      OR NEW."supplierId" IS DISTINCT FROM supplier_id THEN
      RAISE EXCEPTION 'Lot receipt, supplier and purchase line must agree' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "IngredientBatch_origin_guard" BEFORE INSERT OR UPDATE ON "IngredientBatch"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_batch_origin();

CREATE FUNCTION cafe_guard_sale_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."committedAt" IS NOT NULL AND ROW(NEW."orderId", NEW."productId", NEW."recipeId", NEW."recipeVersion",
    NEW.quantity, NEW.price, NEW."ingredientCost", NEW."toppingCost", NEW."totalCost", NEW."grossProfit", NEW."costBreakdown",
    NEW."startedAt", NEW."committedAt") IS DISTINCT FROM ROW(OLD."orderId", OLD."productId", OLD."recipeId", OLD."recipeVersion",
    OLD.quantity, OLD.price, OLD."ingredientCost", OLD."toppingCost", OLD."totalCost", OLD."grossProfit", OLD."costBreakdown",
    OLD."startedAt", OLD."committedAt") THEN
    RAISE EXCEPTION 'Committed sale snapshot is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "OrderItem_snapshot_guard" BEFORE UPDATE ON "OrderItem"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_sale_snapshot();

CREATE FUNCTION cafe_guard_payment_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.status = 'PAID' AND NEW.status NOT IN ('PAID', 'REFUNDED')) OR
    (OLD.status = 'REFUNDED' AND NEW.status <> 'REFUNDED') OR
    (OLD."paidAt" IS NOT NULL AND ROW(NEW."orderId", NEW.amount, NEW.currency, NEW.method,
      NEW."providerTxnId", NEW."paidAt") IS DISTINCT FROM
      ROW(OLD."orderId", OLD.amount, OLD.currency, OLD.method, OLD."providerTxnId", OLD."paidAt")) THEN
    RAISE EXCEPTION 'Settled payment cannot regress or change identity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Payment_state_guard" BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_payment_state();

-- Units are dimensional, never converted by an inferred material density.
CREATE FUNCTION cafe_guard_material_units() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base_unit text; converted numeric;
BEGIN
  IF NEW."ingredientId" IS NULL THEN
    RAISE EXCEPTION 'Ingredient is required' USING ERRCODE = '23502';
  END IF;
  SELECT "baseUnit" INTO base_unit FROM "Ingredient" WHERE id = NEW."ingredientId" FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown ingredient' USING ERRCODE = '23503'; END IF;
  IF TG_TABLE_NAME = 'RecipeIngredient' THEN
    converted := CASE
      WHEN NEW.unit = base_unit THEN NEW.quantity
      WHEN NEW.unit = 'kg' AND base_unit = 'g' THEN NEW.quantity * 1000
      WHEN NEW.unit IN ('l', 'L') AND base_unit = 'ml' THEN NEW.quantity * 1000
      ELSE NULL END;
    IF converted IS NULL OR converted <> NEW."quantityBase" THEN
      RAISE EXCEPTION 'Recipe quantity must match dimensional conversion' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'SupplierIngredient' THEN
    IF NEW."conversionTargetUnit" <> base_unit OR
      (base_unit = 'cái' AND NEW."conversionQuantity" <> trunc(NEW."conversionQuantity")) THEN
      RAISE EXCEPTION 'Supplier conversion must use ingredient base unit and whole pieces' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF base_unit = 'cái' THEN
    IF TG_TABLE_NAME IN ('RecipeIngredient', 'ToppingIngredient') THEN
      IF NEW."quantityBase" <> trunc(NEW."quantityBase") THEN
        RAISE EXCEPTION 'Fractional pieces are forbidden' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'IngredientBatch' THEN
      IF NEW."quantityInitial" <> trunc(NEW."quantityInitial") OR
        NEW."quantityRemaining" <> trunc(NEW."quantityRemaining") THEN
        RAISE EXCEPTION 'Fractional lot pieces are forbidden' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'InventoryTransaction' THEN
      IF NEW.quantity <> trunc(NEW.quantity) THEN
        RAISE EXCEPTION 'Fractional ledger pieces are forbidden' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'StockCountItem' THEN
      IF NEW."systemQty" <> trunc(NEW."systemQty") OR NEW."actualQty" <> trunc(NEW."actualQty") THEN
        RAISE EXCEPTION 'Fractional counted pieces are forbidden' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['RecipeIngredient', 'ToppingIngredient', 'SupplierIngredient',
    'IngredientBatch', 'InventoryTransaction', 'StockCountItem'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION cafe_guard_material_units()',
      t || '_unit_guard', t);
  END LOOP;
END $$;

CREATE FUNCTION cafe_guard_used_base_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."baseUnit" <> OLD."baseUnit" AND (
    OLD.quantity <> 0 OR OLD.reserved <> 0 OR
    EXISTS (SELECT 1 FROM "IngredientBatch" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "RecipeIngredient" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "ToppingIngredient" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "SupplierIngredient" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "PurchaseRequestItem" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "InventoryTransaction" WHERE "ingredientId" = OLD.id) OR
    EXISTS (SELECT 1 FROM "StockCountItem" WHERE "ingredientId" = OLD.id)) THEN
    RAISE EXCEPTION 'Used ingredient base unit is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Ingredient_used_unit_guard" BEFORE UPDATE ON "Ingredient"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_used_base_unit();

-- Freeze referenced recipe content, while allowing effectiveTo/isActive changes
-- needed to retire a version. New composition requires new Recipe.version.
CREATE FUNCTION cafe_guard_used_recipe() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipe_id text;
BEGIN
  IF TG_TABLE_NAME = 'Recipe' THEN recipe_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN recipe_id := NEW."recipeId";
  ELSE recipe_id := OLD."recipeId"; END IF;
  PERFORM 1 FROM "Recipe" WHERE id = recipe_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM "OrderItem" WHERE "recipeId" = recipe_id) THEN
    IF TG_TABLE_NAME <> 'Recipe' OR TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Used recipe composition is immutable' USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.id, NEW."productId", NEW.version, NEW."yieldQuantity", NEW."laborCost", NEW."overheadCost")
      IS DISTINCT FROM ROW(OLD.id, OLD."productId", OLD.version, OLD."yieldQuantity", OLD."laborCost", OLD."overheadCost") THEN
      RAISE EXCEPTION 'Used recipe cost basis is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'RecipeIngredient' AND TG_OP = 'UPDATE' THEN
    IF NEW."recipeId" <> OLD."recipeId" THEN
      PERFORM 1 FROM "Recipe" WHERE id = NEW."recipeId" FOR UPDATE;
      IF EXISTS (SELECT 1 FROM "OrderItem" WHERE "recipeId" = NEW."recipeId") THEN
        RAISE EXCEPTION 'Cannot move component into used recipe' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Recipe_used_guard" BEFORE UPDATE OR DELETE ON "Recipe"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_used_recipe();
CREATE TRIGGER "RecipeIngredient_used_guard" BEFORE INSERT OR UPDATE OR DELETE ON "RecipeIngredient"
  FOR EACH ROW EXECUTE FUNCTION cafe_guard_used_recipe();
