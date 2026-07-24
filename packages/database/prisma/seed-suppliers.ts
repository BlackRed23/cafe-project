import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

export async function seedSuppliers(isDryRun = false) {
  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  const now = new Date();
  log(`\n--- SEED SUPPLIERS RUN: ${now.toLocaleString("vi-VN")} ${isDryRun ? "(DRY-RUN)" : ""} ---`);

  const seedDataDir = path.join(__dirname, "seed-data");
  const suppliersPath = path.join(seedDataDir, "suppliers.json");
  const supplierProductsPath = path.join(seedDataDir, "supplier-products.json");

  if (!fs.existsSync(suppliersPath) || !fs.existsSync(supplierProductsPath)) {
    log("! Lỗi: Không tìm thấy file suppliers.json hoặc supplier-products.json");
    return;
  }

  const suppliersData = JSON.parse(fs.readFileSync(suppliersPath, "utf-8"));
  const supplierProductsData = JSON.parse(fs.readFileSync(supplierProductsPath, "utf-8"));

  // 1. Delete placeholder Supplier "Công ty TNHH Cà phê Việt"
  const placeholderSupplier = await prisma.supplier.findFirst({
    where: { name: "Công ty TNHH Cà phê Việt" },
  });

  if (placeholderSupplier) {
    log(`\n[XÓA PLACEHOLDER] Phát hiện NCC cũ: "${placeholderSupplier.name}" (ID: ${placeholderSupplier.id})`);
    if (!isDryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.supplierProduct.deleteMany({ where: { supplierId: placeholderSupplier.id } });
        await tx.supplier.delete({ where: { id: placeholderSupplier.id } });
      });
      log(` -> Đã xóa thành công NCC placeholder và toàn bộ liên kết SupplierProduct của nó.`);
    } else {
      log(` -> [DRY-RUN] Sẽ xóa NCC placeholder và các liên kết SupplierProduct.`);
    }
  }

  // 2. Upsert Suppliers
  log("\n[NHÀ CUNG CẤP]");
  const supplierIdMap = new Map<string, string>();
  let supCreated = 0;
  let supExisted = 0;

  for (const sup of suppliersData) {
    const existing = await prisma.supplier.findFirst({ where: { name: sup.name } });
    if (existing) {
      log(`- Tồn tại: "${sup.name}" (ID: ${existing.id}) -> Bỏ qua tạo mới.`);
      supplierIdMap.set(sup.name, existing.id);
      supExisted++;
    } else {
      if (!isDryRun) {
        const created = await prisma.supplier.create({
          data: {
            name: sup.name,
            email: sup.email || null,
            contact: sup.contact || null,
            address: sup.address || null,
            status: sup.status || "ACTIVE",
          },
        });
        log(`+ Đã tạo : "${sup.name}" (${sup.address})`);
        supplierIdMap.set(sup.name, created.id);
      } else {
        log(`+ [DRY-RUN] Sẽ tạo : "${sup.name}" (${sup.address})`);
      }
      supCreated++;
    }
  }

  // 3. Upsert SupplierProducts
  log("\n[LIÊN KẾT SẢN PHẨM & NHÀ CUNG CẤP (SUPPLIER-PRODUCT)]");
  let spCreated = 0;
  let spExisted = 0;
  let spErrors = 0;

  for (const item of supplierProductsData) {
    const supplierId = supplierIdMap.get(item.supplierName);
    if (!supplierId && !isDryRun) {
      log(`! Lỗi: Không tìm thấy NCC "${item.supplierName}" cho SKU ${item.productSku}`);
      spErrors++;
      continue;
    }

    const product = await prisma.product.findUnique({ where: { sku: item.productSku } });
    if (!product) {
      log(`! Lỗi: Không tìm thấy sản phẩm với SKU "${item.productSku}"`);
      spErrors++;
      continue;
    }

    if (!isDryRun && supplierId) {
      const existingSP = await prisma.supplierProduct.findUnique({
        where: {
          supplierId_productId: {
            supplierId: supplierId,
            productId: product.id,
          },
        },
      });

      if (existingSP) {
        log(`- Tồn tại liên kết: NCC "${item.supplierName}" <-> SP "${product.name}" (${item.productSku}) -> Bỏ qua.`);
        spExisted++;
      } else {
        try {
          await prisma.supplierProduct.create({
            data: {
              supplierId: supplierId,
              productId: product.id,
              price: item.price,
              supplierSku: item.supplierSku || null,
              minOrderQuantity: item.minOrderQuantity || 1,
              leadTimeDays: item.leadTimeDays || 3,
              isPreferred: item.isPreferred ?? true,
              purchaseUnit: item.purchaseUnit || null,
              conversionQuantity: item.conversionQuantity || null,
              conversionTargetUnit: item.conversionTargetUnit || null,
            },
          });
          log(`+ Đã liên kết: "${item.supplierName}" <-> "${product.name}" | Giá nhập: ${item.price}đ`);
          spCreated++;
        } catch (e: any) {
          log(`! Lỗi liên kết "${item.supplierName}" <-> "${product.name}": ${e.message}`);
          spErrors++;
        }
      }
    } else {
      log(`+ [DRY-RUN] Sẽ liên kết: "${item.supplierName}" <-> SKU "${item.productSku}" | Giá nhập: ${item.price}đ`);
      spCreated++;
    }
  }

  log("\n[TỔNG KẾT SEED NCC]");
  log(`- Nhà cung cấp : ${isDryRun ? "Sẽ tạo mới" : "Tạo mới"} ${supCreated}, Đã có ${supExisted}.`);
  log(`- Liên kết SP-NCC : ${isDryRun ? "Sẽ liên kết" : "Tạo mới"} ${spCreated}, Đã có ${spExisted}, Lỗi ${spErrors}.`);

  const logFilePath = path.join(__dirname, "../../../SEED_LOG.md");
  fs.appendFileSync(logFilePath, logLines.join("\n") + "\n");
}

if (require.main === module) {
  const isDryRun = process.argv.includes("--dry-run");
  seedSuppliers(isDryRun)
    .catch((err) => {
      console.error("Lỗi khi chạy seed-suppliers:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
