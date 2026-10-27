-- ============================================================================
-- 05_rollback_plan.sql
-- Mục đích: Kế hoạch và các câu lệnh phục hồi hệ thống khi có sự cố migration
-- Phạm vi: Khôi phục có kiểm soát, phân biệt phục hồi EXPAND, MIGRATE và CONTRACT
-- ============================================================================

\set ON_ERROR_STOP on

/*
================================================================================
NGUYÊN TẮC QUAN TRỌNG VỀ DỮ LIỆU PHÁT SINH KHI ROLLBACK:
1. NẾU SỬ DỤNG RESTORE TỪ FILE BACKUP (pg_restore):
   - Mọi dữ liệu khách hàng tạo đơn, thanh toán, hoặc agent phát sinh SAU THỜI ĐIỂM
     BACKUP SẼ BỊ MẤT HOÀN TOÀN nếu restore toàn phần.
   - Do đó, RESTORE BACKUP CHỈ DÙNG KHI CÓ SỰ CỐ PHÁ HỦY DATABASE NGHIÊM TRỌNG.
   
2. NẾU ROLLBACK THEO TỪNG GIAI ĐOẠN (Ưu tiên phương pháp này):
   - Vì áp dụng Expand-Migrate, bảng và cột cũ vẫn tồn tại song song,
     ứng dụng cũ vẫn có thể tiếp tục hoạt động mà không cần restore backup.
================================================================================
*/

-- ============================================================================
-- KỊCH BẢN 1: ROLLBACK BƯỚC 02 (MIGRATE DATA) - DỮ LIỆU MỚI BỊ SAI LỆCH
-- ============================================================================
-- Giữ nguyên cấu trúc bảng mới tạo, chỉ xóa dữ liệu đã chuyển đổi trong các bảng mới
-- và đưa dữ liệu các cột mở rộng về trạng thái ban đầu:

BEGIN;

-- 1. Xóa dữ liệu mới sinh ra từ migrate
DELETE FROM public."AgentToolCall";
DELETE FROM public."AgentExecution";
DELETE FROM public."OrderItemTopping";
DELETE FROM public."ToppingIngredient";
DELETE FROM public."Topping";
DELETE FROM public."RecipeIngredient";
DELETE FROM public."Recipe";
DELETE FROM public."StockCountItem";
DELETE FROM public."StockCount";
DELETE FROM public."GoodsReceipt";
DELETE FROM public."SupplierIngredient";
DELETE FROM public."IngredientBatch";
DELETE FROM public."Ingredient";

-- 2. Hoàn nguyên các cột mở rộng trên bảng gốc
UPDATE public."Order"
SET 
    "paymentMethod" = NULL,
    "paymentStatus" = 'PENDING',
    "paidAt" = NULL;

UPDATE public."OrderItem"
SET 
    "recipeId" = NULL,
    "recipeVersion" = NULL,
    "consumptionStatus" = 'PENDING',
    "startedAt" = NULL,
    "committedAt" = NULL,
    "voidedAt" = NULL,
    "ingredientCost" = 0,
    "toppingCost" = 0,
    "totalCost" = 0,
    "grossProfit" = 0;

UPDATE public."Payment"
SET 
    "transactionStatus" = 'INITIATED',
    "attemptNo" = 1,
    "currency" = 'VND';

COMMIT;

RAISE NOTICE '[ROLLBACK DATA PASS] Đã hoàn nguyên dữ liệu nghiệp vụ về trạng thái trước 02_migrate_data.sql.';


-- ============================================================================
-- KỊCH BẢN 2: ROLLBACK BƯỚC 01 (EXPAND) - GỠ BỎ HOÀN TOÀN CẤU TRÚC MỚI
-- ============================================================================
-- Chỉ thực hiện khi muốn gỡ bỏ sạch sẽ toàn bộ 12 bảng mới và các cột mở rộng
-- Đảm bảo KHÔNG chạm vào 15 bảng gốc:

/*
BEGIN;

-- 1. Xóa các bảng mới theo thứ tự ngược lại (để không vướng FK)
DROP TABLE IF EXISTS public."AgentEvaluation" CASCADE;
DROP TABLE IF EXISTS public."AgentToolCall" CASCADE;
DROP TABLE IF EXISTS public."AgentExecution" CASCADE;
DROP TABLE IF EXISTS public."StockCountItem" CASCADE;
DROP TABLE IF EXISTS public."StockCount" CASCADE;
DROP TABLE IF EXISTS public."GoodsReceipt" CASCADE;
DROP TABLE IF EXISTS public."SupplierIngredient" CASCADE;
DROP TABLE IF EXISTS public."PaymentReconciliation" CASCADE;
DROP TABLE IF EXISTS public."PaymentCallback" CASCADE;
DROP TABLE IF EXISTS public."OrderItemTopping" CASCADE;
DROP TABLE IF EXISTS public."ToppingIngredient" CASCADE;
DROP TABLE IF EXISTS public."Topping" CASCADE;
DROP TABLE IF EXISTS public."RecipeIngredient" CASCADE;
DROP TABLE IF EXISTS public."Recipe" CASCADE;
DROP TABLE IF EXISTS public."IngredientBatch" CASCADE;
DROP TABLE IF EXISTS public."Ingredient" CASCADE;

-- 2. Gỡ các cột mở rộng trên các bảng gốc
ALTER TABLE public."Category" DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "sortOrder";
ALTER TABLE public."Product" DROP COLUMN IF EXISTS "servingUnit", DROP COLUMN IF EXISTS "deletedAt", DROP COLUMN IF EXISTS "pendingDeleteUntil";
ALTER TABLE public."Order" DROP COLUMN IF EXISTS "paymentMethod", DROP COLUMN IF EXISTS "paymentStatus", DROP COLUMN IF EXISTS "paidAt";
ALTER TABLE public."OrderItem" 
    DROP COLUMN IF EXISTS "recipeId",
    DROP COLUMN IF EXISTS "recipeVersion",
    DROP COLUMN IF EXISTS "consumptionStatus",
    DROP COLUMN IF EXISTS "startedAt",
    DROP COLUMN IF EXISTS "committedAt",
    DROP COLUMN IF EXISTS "voidedAt",
    DROP COLUMN IF EXISTS "ingredientCost",
    DROP COLUMN IF EXISTS "toppingCost",
    DROP COLUMN IF EXISTS "totalCost",
    DROP COLUMN IF EXISTS "grossProfit";
ALTER TABLE public."Payment" 
    DROP COLUMN IF EXISTS "providerTxnId",
    DROP COLUMN IF EXISTS "merchantRef",
    DROP COLUMN IF EXISTS "currency",
    DROP COLUMN IF EXISTS "transactionStatus",
    DROP COLUMN IF EXISTS "attemptNo",
    DROP COLUMN IF EXISTS "requestPayload",
    DROP COLUMN IF EXISTS "responsePayload",
    DROP COLUMN IF EXISTS "failureCode",
    DROP COLUMN IF EXISTS "failureMessage",
    DROP COLUMN IF EXISTS "expiresAt";
ALTER TABLE public."PurchaseRequest" 
    DROP COLUMN IF EXISTS "paymentStatus",
    DROP COLUMN IF EXISTS "receivedAmount",
    DROP COLUMN IF EXISTS "amountPaid";
ALTER TABLE public."PurchaseRequestItem" DROP COLUMN IF EXISTS "ingredientId";
ALTER TABLE public."InventoryTransaction" 
    DROP COLUMN IF EXISTS "ingredientId",
    DROP COLUMN IF EXISTS "unitCost",
    DROP COLUMN IF EXISTS "totalCost",
    DROP COLUMN IF EXISTS "referenceType",
    DROP COLUMN IF EXISTS "referenceId",
    DROP COLUMN IF EXISTS "orderItemId",
    DROP COLUMN IF EXISTS "performedBy",
    DROP COLUMN IF EXISTS "idempotencyKey",
    DROP COLUMN IF EXISTS "wasteReason";

COMMIT;
*/
