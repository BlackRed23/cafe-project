-- ============================================================================
-- 04_contract_DO_NOT_RUN_YET.sql
-- CẢNH BÁO: TỆP NÀY CHƯA ĐƯỢC PHÉP CHẠY!
-- Chỉ thực thi khi:
-- 1. Toàn bộ mã nguồn backend (apps/api, apps/agent) đã chuyển sang dùng schema 27 bảng đích.
-- 2. Đã đối soát 03_verify.sql đạt 100% PASS trên tất cả các tiêu chí quan trọng.
-- 3. Có sự xác nhận bằng văn bản của người phụ trách hệ thống (User confirmation).
-- 4. Thực hiện trong Maintenance Window (Downtime định sẵn) để tránh ghi đè dữ liệu mới.
-- ============================================================================

\set ON_ERROR_STOP on

-- Khóa an toàn: Bắt buộc người chạy phải chủ động gỡ cờ an toàn bên dưới trước khi chạy
DO $$
DECLARE
    safety_lock_enabled BOOLEAN := true; -- ĐỔI THÀNH FALSE KHI ĐƯỢC PHÉP THỰC THI
BEGIN
    IF safety_lock_enabled THEN
        RAISE EXCEPTION 'KHÓA BẢO VỆ ĐANG BẬT! File 04_contract_DO_NOT_RUN_YET.sql không được tự ý thực thi.';
    END IF;
END $$;

BEGIN;

-- 1. KIỂM TRA LẠI KẾT QUẢ ĐỐI SOÁT TRƯỚC KHI THỰC HIỆN CONTRACT
DO $$
DECLARE
    failed_checks INT;
BEGIN
    SELECT COUNT(*) INTO failed_checks
    FROM migration_backup.verification_results
    WHERE status = 'FAIL';

    IF failed_checks > 0 THEN
        RAISE EXCEPTION 'Có % bước kiểm tra thất bại trong verification_results. Hủy bỏ Contract để bảo vệ dữ liệu.', failed_checks;
    END IF;
END $$;

-- 2. XÓA CÁC CỘT CŨ ĐÃ ĐƯỢC THAY THẾ (Sau khi ứng dụng không còn đọc/ghi)
-- Xóa cột unit trên Product (đã chuyển thành servingUnit cho món và baseUnit cho nguyên liệu)
ALTER TABLE public."Product" DROP COLUMN IF EXISTS "unit";

-- Xóa cột productId và inventoryId trên PurchaseRequestItem (đã chuyển sang ingredientId)
ALTER TABLE public."PurchaseRequestItem" DROP COLUMN IF EXISTS "inventoryId";
ALTER TABLE public."PurchaseRequestItem" DROP COLUMN IF EXISTS "productId";

-- Xóa cột productId và batchId cũ trên InventoryTransaction (đã chuyển sang ingredientId và batchId của IngredientBatch)
-- (Lưu ý: batchId trỏ tới IngredientBatch mới)
ALTER TABLE public."InventoryTransaction" DROP COLUMN IF EXISTS "productId";

-- 3. XÓA CÁC BẢNG TRUNG GIAN / BẢNG CŨ CỦA TLCN
-- Xóa bảng InventoryBatch cũ
DROP TABLE IF EXISTS public."InventoryBatch" CASCADE;

-- Xóa bảng Inventory cũ (tồn kho nay lưu trực tiếp tại Ingredient)
DROP TABLE IF EXISTS public."Inventory" CASCADE;

-- Xóa bảng SupplierProduct cũ (đã thay bằng SupplierIngredient)
DROP TABLE IF EXISTS public."SupplierProduct" CASCADE;

-- Xóa bảng AgentLog cũ (đã thay bằng AgentExecution và AgentToolCall)
DROP TABLE IF EXISTS public."AgentLog" CASCADE;

COMMIT;

RAISE NOTICE '[CONTRACT COMPLETED] Toàn bộ cấu trúc thừa đã được thu hồi sạch sẽ. Hệ thống hoạt động 100%% trên 27 bảng đích.';
