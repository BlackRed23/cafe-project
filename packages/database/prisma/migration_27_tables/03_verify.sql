-- ============================================================================
-- 03_verify.sql
-- Mục đích: Đối chiếu toàn diện trước/sau migration, phát hiện sai lệch dữ liệu
-- Nguyên tắc: VERIFY (Chỉ đọc, đối chiếu số liệu theo từng đơn vị, không chỉ COUNT)
-- Điều kiện chạy: Sau khi 02_migrate_data.sql đã chạy xong
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TABLE IF NOT EXISTS migration_backup.verification_results (
    check_code TEXT PRIMARY KEY,
    check_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'PASS', 'FAIL', 'NOT_EXECUTED'
    details JSONB NOT NULL,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE migration_backup.verification_results;

-- 1. KIỂM TRA BẢO TOÀN SỐ LƯỢNG BẢN GHI SO VỚI BASELINE
INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
SELECT 
    'CHK_01_RECORD_COUNT' AS check_code,
    'Bảo toàn số lượng bản ghi các bảng gốc' AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE diff != 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    jsonb_agg(jsonb_build_object(
        'table', b.table_name,
        'baseline', b.record_count,
        'current', c.current_count,
        'diff', diff
    )) AS details
FROM (
    SELECT 
        b.table_name,
        b.record_count,
        CASE b.table_name
            WHEN 'User' THEN (SELECT COUNT(*) FROM public."User")
            WHEN 'Category' THEN (SELECT COUNT(*) FROM public."Category")
            WHEN 'Product' THEN (SELECT COUNT(*) FROM public."Product")
            WHEN 'Inventory' THEN (SELECT COUNT(*) FROM public."Inventory")
            WHEN 'InventoryBatch' THEN (SELECT COUNT(*) FROM public."InventoryBatch")
            WHEN 'InventoryTransaction' THEN (SELECT COUNT(*) FROM public."InventoryTransaction")
            WHEN 'Supplier' THEN (SELECT COUNT(*) FROM public."Supplier")
            WHEN 'SupplierProduct' THEN (SELECT COUNT(*) FROM public."SupplierProduct")
            WHEN 'PurchaseRequest' THEN (SELECT COUNT(*) FROM public."PurchaseRequest")
            WHEN 'PurchaseRequestItem' THEN (SELECT COUNT(*) FROM public."PurchaseRequestItem")
            WHEN 'Order' THEN (SELECT COUNT(*) FROM public."Order")
            WHEN 'OrderItem' THEN (SELECT COUNT(*) FROM public."OrderItem")
            WHEN 'Payment' THEN (SELECT COUNT(*) FROM public."Payment")
            WHEN 'AgentLog' THEN (SELECT COUNT(*) FROM public."AgentLog")
            WHEN 'SystemSetting' THEN (SELECT COUNT(*) FROM public."SystemSetting")
        END AS current_count,
        (
            CASE b.table_name
                WHEN 'User' THEN (SELECT COUNT(*) FROM public."User")
                WHEN 'Category' THEN (SELECT COUNT(*) FROM public."Category")
                WHEN 'Product' THEN (SELECT COUNT(*) FROM public."Product")
                WHEN 'Inventory' THEN (SELECT COUNT(*) FROM public."Inventory")
                WHEN 'InventoryBatch' THEN (SELECT COUNT(*) FROM public."InventoryBatch")
                WHEN 'InventoryTransaction' THEN (SELECT COUNT(*) FROM public."InventoryTransaction")
                WHEN 'Supplier' THEN (SELECT COUNT(*) FROM public."Supplier")
                WHEN 'SupplierProduct' THEN (SELECT COUNT(*) FROM public."SupplierProduct")
                WHEN 'PurchaseRequest' THEN (SELECT COUNT(*) FROM public."PurchaseRequest")
                WHEN 'PurchaseRequestItem' THEN (SELECT COUNT(*) FROM public."PurchaseRequestItem")
                WHEN 'Order' THEN (SELECT COUNT(*) FROM public."Order")
                WHEN 'OrderItem' THEN (SELECT COUNT(*) FROM public."OrderItem")
                WHEN 'Payment' THEN (SELECT COUNT(*) FROM public."Payment")
                WHEN 'AgentLog' THEN (SELECT COUNT(*) FROM public."AgentLog")
                WHEN 'SystemSetting' THEN (SELECT COUNT(*) FROM public."SystemSetting")
            END - b.record_count
        ) AS diff
    FROM migration_backup.baseline_table_counts b
) c
JOIN migration_backup.baseline_table_counts b ON c.table_name = b.table_name;


-- 2. ĐỐI SOÁT TỔN KHO THEO ĐƠN VỊ (KHÔNG GỘP GAM, ML, CÁI)
INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
SELECT 
    'CHK_02_INVENTORY_BY_UNIT' AS check_code,
    'Đối soát tồn kho theo từng đơn vị gốc' AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE diff_qty != 0 OR diff_res != 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    jsonb_agg(jsonb_build_object(
        'unit', b.unit,
        'baseline_qty', b.total_quantity,
        'current_qty', COALESCE(curr.curr_qty, 0),
        'diff_qty', COALESCE(curr.curr_qty, 0) - b.total_quantity,
        'diff_res', COALESCE(curr.curr_res, 0) - b.total_reserved
    )) AS details
FROM migration_backup.baseline_inventory_summary b
FULL OUTER JOIN (
    SELECT unit, SUM(quantity) AS curr_qty, SUM("reservedStock") AS curr_res
    FROM public."Inventory"
    GROUP BY unit
) curr ON b.unit = curr.unit;


-- 3. ĐỐI SOÁT TÀI CHÍNH ĐƠN HÀNG (TRÁNH NHÂN ĐÔI DO JOIN PAYMENT)
INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
SELECT 
    'CHK_03_ORDER_FINANCIALS' AS check_code,
    'Đối soát tổng tiền doanh thu đơn hàng theo từng trạng thái' AS check_name,
    CASE WHEN COUNT(*) FILTER (WHERE diff_amount != 0 OR diff_count != 0) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    jsonb_agg(jsonb_build_object(
        'status', b.status,
        'baseline_count', b.order_count,
        'current_count', COALESCE(curr.curr_count, 0),
        'baseline_amount', b.total_amount,
        'current_amount', COALESCE(curr.curr_amount, 0),
        'diff_amount', COALESCE(curr.curr_amount, 0) - b.total_amount
    )) AS details
FROM migration_backup.baseline_order_summary b
FULL OUTER JOIN (
    SELECT status::TEXT, COUNT(*) AS curr_count, SUM("totalAmount") AS curr_amount
    FROM public."Order"
    GROUP BY status
) curr ON b.status = curr.status;


-- 4. KIỂM TRA ĐỐI CHIẾU AGENTLOG -> AGENTEXECUTION
INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
SELECT 
    'CHK_04_AGENT_MIGRATION' AS check_code,
    'Đối chiếu chuyển đổi AgentLog -> AgentExecution & ToolCalls' AS check_name,
    CASE 
        WHEN (SELECT COUNT(*) FROM public."AgentLog") = (SELECT COUNT(*) FROM public."AgentExecution") 
             AND (SELECT COUNT(*) FROM public."AgentExecution" WHERE "status" = 'SUCCEEDED' AND "errorMessage" IS NOT NULL) = 0
        THEN 'PASS' 
        ELSE 'FAIL' 
    END AS status,
    jsonb_build_object(
        'legacy_agent_logs', (SELECT COUNT(*) FROM public."AgentLog"),
        'migrated_agent_executions', (SELECT COUNT(*) FROM public."AgentExecution"),
        'migrated_tool_calls', (SELECT COUNT(*) FROM public."AgentToolCall"),
        'invalid_succeeded_status_count', (SELECT COUNT(*) FROM public."AgentExecution" WHERE "status" = 'SUCCEEDED' AND "errorMessage" IS NOT NULL)
    ) AS details;


-- 5. KIỂM TRA KHÓA NGOẠI MỒ CÔI (ORPHAN FOREIGN KEYS)
DO $$
DECLARE
    orphan_ri INT;
    orphan_oitopping INT;
    orphan_toolcalls INT;
    orphan_gr_pr INT;
BEGIN
    SELECT COUNT(*) INTO orphan_ri
    FROM public."RecipeIngredient" ri
    LEFT JOIN public."Recipe" r ON ri."recipeId" = r.id
    WHERE r.id IS NULL;

    SELECT COUNT(*) INTO orphan_oitopping
    FROM public."OrderItemTopping" oit
    LEFT JOIN public."OrderItem" oi ON oit."orderItemId" = oi.id
    WHERE oi.id IS NULL;

    SELECT COUNT(*) INTO orphan_toolcalls
    FROM public."AgentToolCall" tc
    LEFT JOIN public."AgentExecution" ex ON tc."executionId" = ex.id
    WHERE ex.id IS NULL;

    SELECT COUNT(*) INTO orphan_gr_pr
    FROM public."GoodsReceipt" gr
    LEFT JOIN public."PurchaseRequest" pr ON gr."purchaseRequestId" = pr.id
    WHERE pr.id IS NULL;

    INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
    VALUES (
        'CHK_05_ORPHAN_KEYS',
        'Kiểm tra toàn vẹn tham chiếu khóa ngoại của các bảng mới',
        CASE WHEN (orphan_ri + orphan_oitopping + orphan_toolcalls + orphan_gr_pr) = 0 THEN 'PASS' ELSE 'FAIL' END,
        jsonb_build_object(
            'orphan_recipe_ingredients', orphan_ri,
            'orphan_order_item_toppings', orphan_oitopping,
            'orphan_agent_tool_calls', orphan_toolcalls,
            'orphan_goods_receipt_prs', orphan_gr_pr
        )
    );
END $$;


-- 6. GHI NHẬN CÁC KIỂM TRA CHƯA THỰC THI (Để minh bạch không báo kiểm chứng khống)
INSERT INTO migration_backup.verification_results (check_code, check_name, status, details)
VALUES 
    ('CHK_06_LIVE_ORDER_CONSUMPTION', 'Đối soát tiêu hao thực tế đơn hàng mới khi chạy live', 'NOT_EXECUTED', '{"note": "Chưa thể chạy khi app chưa chuyển sang code mới trừ kho theo công thức"}'),
    ('CHK_07_PAYMENT_WEBHOOK_LIVE', 'Đối soát webhook IPN thực tế từ VNPay/MoMo', 'NOT_EXECUTED', '{"note": "Chưa thể chạy khi chưa có webhook gọi vào schema mới"}'),
    ('CHK_08_STOCK_COUNT_RECONCILIATION', 'Đối soát chênh lệch kiểm kê thực tế', 'NOT_EXECUTED', '{"note": "Chưa phát sinh phiếu kiểm kê thực tế"}');

COMMIT;

-- IN TỔNG HỢP KẾT QUẢ ĐỐI SOÁT
SELECT check_code, check_name, status, details FROM migration_backup.verification_results ORDER BY check_code;
