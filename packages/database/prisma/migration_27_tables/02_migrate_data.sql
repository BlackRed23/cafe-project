-- ============================================================================
-- 02_migrate_data.sql
-- Mục đích: Chuyển đổi và bảo toàn dữ liệu từ bảng cũ sang cấu trúc mới
-- Nguyên tắc: BẢO TOÀN DỮ LIỆU, IDEMPOTENT (Chạy lại không nhân bản dữ liệu)
-- Điều kiện chạy: Sau khi 01_expand.sql đã thực thi thành công
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- 0. TẠO BẢNG GHI NHẬN CÁC BẢN GHI CẦN XÁC NHẬN NGHIỆP VỤ
-- ============================================================================
CREATE TABLE IF NOT EXISTS migration_backup.unmapped_migration_records (
    id SERIAL PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_id TEXT NOT NULL,
    issue_type TEXT NOT NULL,
    details JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_USER_DECISION',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 1. CHUYỂN ĐỔI BẢNG CATEGORY
-- ============================================================================
-- Tất cả Category hiện có phục vụ hiển thị menu đồ uống -> gán kind = 'PRODUCT'
UPDATE public."Category"
SET 
    "kind" = 'PRODUCT',
    "sortOrder" = COALESCE("sortOrder", 0)
WHERE "kind" IS NULL OR "kind" != 'PRODUCT';

RAISE NOTICE '[DATA MIGRATE] Hoàn tất cập nhật Category: toàn bộ danh mục cũ được bảo toàn loại PRODUCT.';


-- ============================================================================
-- 2. BẢO TOÀN DỮ LIỆU PRODUCT VÀ THUỘC TÍNH CHI TIẾT
-- ============================================================================
-- Bảo toàn servingUnit mặc định từ unit cũ (ví dụ 'Hộp' -> 'ly' hoặc giữ nguyên 'Hộp')
-- Tuyệt đối bảo toàn: nutritionFacts, usageInstructions, storageInstructions, origin, certifications, expiryInfo
UPDATE public."Product"
SET 
    "servingUnit" = CASE 
        WHEN "unit" IS NOT NULL AND "unit" != '' THEN "unit"
        ELSE 'ly'
    END,
    "costPrice" = COALESCE("costPrice", 0)
WHERE "servingUnit" IS NULL;

RAISE NOTICE '[DATA MIGRATE] Hoàn toàn bảo toàn 100%% dữ liệu mô tả và chỉ số dinh dưỡng của Product.';


-- ============================================================================
-- 3. ĐỒNG BỘ TRẠNG THÁI THANH TOÁN CHO ORDER VÀ PAYMENT
-- ============================================================================
-- Nguyên tắc:
-- 1) Không dùng UPDATE...FROM tùy tiện khi một Order có nhiều Payment.
-- 2) Chọn Payment hợp lệ xác định theo thứ tự ưu tiên: PAID > mới nhất theo paidAt/updatedAt.
WITH ranked_payments AS (
    SELECT 
        p."orderId",
        p."method",
        p."status",
        p."paidAt",
        ROW_NUMBER() OVER (
            PARTITION BY p."orderId" 
            ORDER BY 
                CASE WHEN p."status" = 'PAID' THEN 1 ELSE 2 END,
                COALESCE(p."paidAt", p."updatedAt") DESC
        ) AS rank_no
    FROM public."Payment" p
)
UPDATE public."Order" o
SET 
    "paymentMethod" = rp."method",
    "paymentStatus" = rp."status",
    "paidAt" = rp."paidAt"
FROM ranked_payments rp
WHERE o.id = rp."orderId" AND rp.rank_no = 1
  AND (o."paymentStatus" IS DISTINCT FROM rp."status" 
       OR o."paymentMethod" IS DISTINCT FROM rp."method"
       OR o."paidAt" IS DISTINCT FROM rp."paidAt");

-- Cập nhật các cột mở rộng của Payment
UPDATE public."Payment"
SET 
    "transactionStatus" = CASE 
        WHEN "status" = 'PAID' THEN 'PAID'::"TransactionStatus"
        WHEN "status" = 'FAILED' THEN 'FAILED'::"TransactionStatus"
        WHEN "status" = 'REFUNDED' THEN 'REFUNDED'::"TransactionStatus"
        ELSE 'PENDING'::"TransactionStatus"
    END,
    "currency" = 'VND',
    "attemptNo" = COALESCE("attemptNo", 1)
WHERE "transactionStatus" IS NULL OR "transactionStatus" = 'INITIATED';

RAISE NOTICE '[DATA MIGRATE] Hoàn tất đồng bộ thanh toán Order và Payment.';


-- ============================================================================
-- 4. BẢO TOÀN DÒNG ĐƠN HÀNG (ORDERITEM)
-- ============================================================================
-- Khởi tạo consumptionStatus dựa trên trạng thái đơn hàng hiện tại
-- Không bịa đặt thời điểm pha chế (startedAt/committedAt) nếu không có log thực tế
UPDATE public."OrderItem"
SET 
    "consumptionStatus" = CASE 
        WHEN o.status = 'COMPLETED' THEN 'COMMITTED'::"ConsumptionStatus"
        WHEN o.status = 'CANCELLED' THEN 'VOIDED'::"ConsumptionStatus"
        ELSE 'PENDING'::"ConsumptionStatus"
    END,
    "ingredientCost" = COALESCE("ingredientCost", 0),
    "toppingCost" = COALESCE("toppingCost", 0),
    "totalCost" = COALESCE("totalCost", 0),
    "grossProfit" = COALESCE("price" * "quantity" - "totalCost", 0)
FROM public."Order" o
WHERE public."OrderItem"."orderId" = o.id
  AND (public."OrderItem"."consumptionStatus" IS NULL OR public."OrderItem"."consumptionStatus" = 'PENDING');

RAISE NOTICE '[DATA MIGRATE] Hoàn tất cập nhật OrderItem: giữ nguyên giá bán lịch sử, không tính khống COGS.';


-- ============================================================================
-- 5. CHUYỂN ĐỔI AGENTLOG SANG AGENTEXECUTION VÀ AGENTTOOLCALL
-- ============================================================================
-- Nguyên tắc: 
-- 1) Giữ nguyên ID từ AgentLog làm id của AgentExecution.
-- 2) Tuyệt đối KHÔNG gán bừa trạng thái chưa biết thành SUCCEEDED.
-- 3) Tách thông tin action/tool thành AgentToolCall bước 1.

-- 5.1. Chuyển sang AgentExecution
INSERT INTO public."AgentExecution" (
    "id",
    "goal",
    "intent",
    "status",
    "tokenIn",
    "tokenOut",
    "costUsd",
    "fallbackUsed",
    "triggeredBy",
    "startedAt",
    "endedAt",
    "errorMessage",
    "createdAt",
    "updatedAt"
)
SELECT 
    al.id,
    COALESCE(al.action, 'Unknown Agent Request') AS "goal",
    al.action AS "intent",
    CASE 
        WHEN al.error_message IS NOT NULL AND al.error_message != '' THEN 'FAILED'::"ExecutionStatus"
        WHEN al.result = 'SUCCESS' THEN 'SUCCEEDED'::"ExecutionStatus"
        WHEN al.result = 'FAILED' THEN 'FAILED'::"ExecutionStatus"
        ELSE 'WAITING_APPROVAL'::"ExecutionStatus" -- Trạng thái an toàn, không giả lập SUCCEEDED
    END AS "status",
    0 AS "tokenIn",
    0 AS "tokenOut",
    0 AS "costUsd",
    COALESCE(al.fallback_used, false) AS "fallbackUsed",
    al."createdBy" AS "triggeredBy",
    al.triggered_at AS "startedAt",
    al.triggered_at AS "endedAt",
    al.error_message AS "errorMessage",
    al.triggered_at AS "createdAt",
    al.triggered_at AS "updatedAt"
FROM public."AgentLog" al
ON CONFLICT ("id") DO NOTHING;

-- 5.2. Chuyển sang AgentToolCall (Bước 1 của lần chạy)
INSERT INTO public."AgentToolCall" (
    "id",
    "executionId",
    "stepNo",
    "toolName",
    "arguments",
    "result",
    "status",
    "errorMessage",
    "latencyMs",
    "startedAt",
    "completedAt"
)
SELECT 
    'tool_' || al.id AS "id",
    al.id AS "executionId",
    1 AS "stepNo",
    COALESCE(al.action, 'unspecified_tool') AS "toolName",
    jsonb_build_object(
        'input', al.input,
        'reasoning', al.reasoning,
        'reference_type', al.reference_type,
        'reference_id', al.reference_id
    ) AS "arguments",
    jsonb_build_object(
        'output', al.output,
        'result', al.result
    ) AS "result",
    CASE 
        WHEN al.error_message IS NOT NULL AND al.error_message != '' THEN 'FAILED'::"ToolCallStatus"
        WHEN al.result = 'SUCCESS' THEN 'SUCCEEDED'::"ToolCallStatus"
        ELSE 'PENDING'::"ToolCallStatus"
    END AS "status",
    al.error_message AS "errorMessage",
    NULL::INT AS "latencyMs",
    al.triggered_at AS "startedAt",
    al.triggered_at AS "completedAt"
FROM public."AgentLog" al
ON CONFLICT ("executionId", "stepNo") DO NOTHING;

RAISE NOTICE '[DATA MIGRATE] Hoàn tất chuyển đổi AgentLog -> AgentExecution & AgentToolCall.';


-- ============================================================================
-- 6. GHI NHẬN TỒN TẠI VÀ CHỜ QUYẾT ĐỊNH VỀ TÁCH NGUYÊN LIỆU / CÔNG THỨC
-- ============================================================================
-- Ghi nhận các bản ghi Inventory / SupplierProduct cũ để người dùng quyết định cấu hình tách
INSERT INTO migration_backup.unmapped_migration_records (source_table, source_id, issue_type, details)
SELECT 
    'Inventory' AS source_table,
    i.id AS source_id,
    'NEED_INGREDIENT_RECIPE_MAPPING' AS issue_type,
    jsonb_build_object(
        'productId', i."productId",
        'quantity', i.quantity,
        'unit', i.unit,
        'productName', p.name,
        'note', 'Cần user cung cấp định lượng công thức hoặc xác nhận tách Product -> Ingredient tương ứng'
    ) AS details
FROM public."Inventory" i
JOIN public."Product" p ON i."productId" = p.id
WHERE NOT EXISTS (
    SELECT 1 FROM migration_backup.unmapped_migration_records um 
    WHERE um.source_table = 'Inventory' AND um.source_id = i.id
);

COMMIT;

RAISE NOTICE '[DATA MIGRATE COMPLETED] Hoàn thành chuyển đổi dữ liệu an toàn. Các mục chờ định lượng đã được ghi vào migration_backup.unmapped_migration_records.';
