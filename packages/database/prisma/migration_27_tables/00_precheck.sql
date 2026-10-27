-- ============================================================================
-- 00_precheck.sql
-- Mục đích: Kiểm tra tính sẵn sàng của PostgreSQL, ghi lại baseline đối soát
-- Điều kiện chạy: Database hiện tại đang ở schema 15 bảng (sau 2 migrations ban đầu)
-- Chế độ thực thi: ĐỌC VÀ TẠO BẢNG TẠM BASELINE (An toàn, không sửa dữ liệu nghiệp vụ)
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- 1. Kiểm tra phiên bản PostgreSQL (khuyến nghị >= 14)
DO $$
DECLARE
    pg_ver INT;
BEGIN
    SELECT current_setting('server_version_num')::INT INTO pg_ver;
    IF pg_ver < 120000 THEN
        RAISE EXCEPTION 'Phiên bản PostgreSQL (%) quá cũ. Cần tối thiểu PostgreSQL 12+ (khuyến nghị 14+)', pg_ver;
    END IF;
    RAISE NOTICE '[PRECHECK PASS] PostgreSQL version: %', version();
END $$;

-- 2. Kiểm tra sự tồn tại của 15 bảng nghiệp vụ hiện tại
DO $$
DECLARE
    tbl_record RECORD;
    expected_tables TEXT[] := ARRAY[
        'User', 'Category', 'Product', 'Inventory', 'InventoryBatch',
        'InventoryTransaction', 'Supplier', 'SupplierProduct', 'PurchaseRequest',
        'PurchaseRequestItem', 'Order', 'OrderItem', 'Payment', 'AgentLog', 'SystemSetting'
    ];
    tbl_name TEXT;
    missing_count INT := 0;
BEGIN
    FOREACH tbl_name IN ARRAY expected_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = tbl_name
        ) THEN
            RAISE WARNING 'Thiếu bảng hiện tại: public."%"', tbl_name;
            missing_count := missing_count + 1;
        END IF;
    END LOOP;

    IF missing_count > 0 THEN
        RAISE EXCEPTION 'Database chưa đủ 15 bảng gốc. Dừng precheck để kiểm tra lại migration cũ.';
    END IF;
    RAISE NOTICE '[PRECHECK PASS] Toàn bộ 15 bảng hiện tại đã tồn tại đầy đủ.';
END $$;

-- 3. Tạo schema lưu trữ baseline đối soát phục vụ bước Verify sau này
CREATE SCHEMA IF NOT EXISTS migration_backup;

-- Lưu baseline số lượng bản ghi của 15 bảng hiện tại
CREATE TABLE IF NOT EXISTS migration_backup.baseline_table_counts (
    table_name TEXT PRIMARY KEY,
    record_count BIGINT NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE migration_backup.baseline_table_counts;

INSERT INTO migration_backup.baseline_table_counts (table_name, record_count)
VALUES
    ('User', (SELECT COUNT(*) FROM public."User")),
    ('Category', (SELECT COUNT(*) FROM public."Category")),
    ('Product', (SELECT COUNT(*) FROM public."Product")),
    ('Inventory', (SELECT COUNT(*) FROM public."Inventory")),
    ('InventoryBatch', (SELECT COUNT(*) FROM public."InventoryBatch")),
    ('InventoryTransaction', (SELECT COUNT(*) FROM public."InventoryTransaction")),
    ('Supplier', (SELECT COUNT(*) FROM public."Supplier")),
    ('SupplierProduct', (SELECT COUNT(*) FROM public."SupplierProduct")),
    ('PurchaseRequest', (SELECT COUNT(*) FROM public."PurchaseRequest")),
    ('PurchaseRequestItem', (SELECT COUNT(*) FROM public."PurchaseRequestItem")),
    ('Order', (SELECT COUNT(*) FROM public."Order")),
    ('OrderItem', (SELECT COUNT(*) FROM public."OrderItem")),
    ('Payment', (SELECT COUNT(*) FROM public."Payment")),
    ('AgentLog', (SELECT COUNT(*) FROM public."AgentLog")),
    ('SystemSetting', (SELECT COUNT(*) FROM public."SystemSetting"));

-- 4. Lưu baseline chi tiết tồn kho theo từng đơn vị (KHÔNG cộng gộp g, ml, cái)
CREATE TABLE IF NOT EXISTS migration_backup.baseline_inventory_summary (
    unit TEXT PRIMARY KEY,
    total_quantity NUMERIC NOT NULL,
    total_reserved NUMERIC NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE migration_backup.baseline_inventory_summary;

INSERT INTO migration_backup.baseline_inventory_summary (unit, total_quantity, total_reserved)
SELECT 
    COALESCE(unit, 'UNKNOWN') AS unit,
    SUM(quantity) AS total_quantity,
    SUM("reservedStock") AS total_reserved
FROM public."Inventory"
GROUP BY unit;

-- 5. Lưu baseline doanh thu và trạng thái đơn hàng
CREATE TABLE IF NOT EXISTS migration_backup.baseline_order_summary (
    status TEXT PRIMARY KEY,
    order_count BIGINT NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE migration_backup.baseline_order_summary;

INSERT INTO migration_backup.baseline_order_summary (status, order_count, total_amount)
SELECT 
    status::TEXT,
    COUNT(*),
    COALESCE(SUM("totalAmount"), 0)
FROM public."Order"
GROUP BY status;

-- 6. Lưu baseline thanh toán
CREATE TABLE IF NOT EXISTS migration_backup.baseline_payment_summary (
    status TEXT PRIMARY KEY,
    payment_count BIGINT NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

TRUNCATE TABLE migration_backup.baseline_payment_summary;

INSERT INTO migration_backup.baseline_payment_summary (status, payment_count, total_amount)
SELECT 
    status::TEXT,
    COUNT(*),
    COALESCE(SUM(amount), 0)
FROM public."Payment"
GROUP BY status;

-- 7. Quét phát hiện dữ liệu bất thường (Orphan records / null vi phạm)
DO $$
DECLARE
    orphan_order_items INT;
    orphan_batches INT;
    orphan_pr_items INT;
BEGIN
    SELECT COUNT(*) INTO orphan_order_items
    FROM public."OrderItem" oi
    LEFT JOIN public."Order" o ON oi."orderId" = o.id
    WHERE o.id IS NULL;

    SELECT COUNT(*) INTO orphan_batches
    FROM public."InventoryBatch" b
    LEFT JOIN public."Inventory" i ON b."inventoryId" = i.id
    WHERE i.id IS NULL;

    SELECT COUNT(*) INTO orphan_pr_items
    FROM public."PurchaseRequestItem" pri
    LEFT JOIN public."PurchaseRequest" pr ON pri."requestId" = pr.id
    WHERE pr.id IS NULL;

    IF orphan_order_items > 0 OR orphan_batches > 0 OR orphan_pr_items > 0 THEN
        RAISE EXCEPTION '[PRECHECK ANOMALY] Phát hiện khóa ngoại mồ côi: OrderItem (%), InventoryBatch (%), PurchaseRequestItem (%)',
            orphan_order_items, orphan_batches, orphan_pr_items;
    END IF;

    RAISE NOTICE '[PRECHECK PASS] Không có khóa ngoại mồ côi trong dữ liệu hiện tại.';
END $$;

COMMIT;

-- In báo cáo baseline đã lưu
SELECT table_name, record_count FROM migration_backup.baseline_table_counts ORDER BY table_name;
SELECT * FROM migration_backup.baseline_inventory_summary;
SELECT * FROM migration_backup.baseline_order_summary;
SELECT * FROM migration_backup.baseline_payment_summary;
