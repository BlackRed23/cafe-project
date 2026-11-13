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
