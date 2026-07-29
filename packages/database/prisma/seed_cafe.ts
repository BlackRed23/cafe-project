import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";

// Load env explicitly
function loadEnvFiles() {
  const envPaths = [
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../../../apps/web/.env"),
    path.join(__dirname, "../../../.env"),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key] && val) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnvFiles();

const prisma = new PrismaClient();

const DEFAULT_USERS = [
  {
    email: "admin@cafe.com",
    name: "Cafe Admin",
    role: "ADMIN" as const,
  },
  {
    email: "staff@cafe.com",
    name: "Cafe Staff",
    role: "STAFF" as const,
  },
  {
    email: "customer@cafe.com",
    name: "Cafe Customer",
    role: "CUSTOMER" as const,
  },
];

async function main() {
  const args = process.argv.slice(2);
  const isApplyMode = args.includes("--apply") || args.includes("--real");
  const modeText = isApplyMode ? "🔥 CẬP NHẬT THẬT VÀO DATABASE" : "🔍 DRY-RUN (DỰ KIẾN - CHƯA GHI DB)";

  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  const now = new Date();
  log("==================================================");
  log(`🚀 CÀ PHÊ PROJECT - SEED DATA RUN`);
  log(`📌 CHẾ ĐỘ: ${modeText}`);
  log(`⏰ Thời gian: ${now.toLocaleString("vi-VN")}`);
  log(`🔌 Database Target: ${process.env.DATABASE_URL || "Local DB (Localhost:5433)"}`);
  log("==================================================\n");

  const seedDataDir = path.join(__dirname, "seed-data");
  const categoriesPath = path.join(seedDataDir, "categories.json");
  const productsPath = path.join(seedDataDir, "products.json");

  if (!fs.existsSync(categoriesPath) || !fs.existsSync(productsPath)) {
    console.error("❌ LỖI: Không tìm thấy file seed-data/categories.json hoặc seed-data/products.json");
    process.exit(1);
  }

  const categories = JSON.parse(fs.readFileSync(categoriesPath, "utf-8"));
  const products = JSON.parse(fs.readFileSync(productsPath, "utf-8"));

  log(`📂 Đã nạp từ file:`);
  log(`  - categories.json : ${categories.length} danh mục`);
  log(`  - products.json   : ${products.length} sản phẩm\n`);

  // Print Preview Tables
  log("--------------------------------------------------");
  log("1️⃣ DANH SÁCH DANH MỤC SẼ TẠO:");
  log("--------------------------------------------------");
  console.table(categories);

  log("\n--------------------------------------------------");
  log("2️⃣ DANH SÁCH SẢN PHẨM CÀ PHÊ THẬT SẼ TẠO:");
  log("--------------------------------------------------");
  console.table(products.map((p: any) => ({
    SKU: p.sku,
    "Tên Sản Phẩm": p.name,
    "Danh Mục": p.categoryName,
    "ĐVT": p.unit,
    "Giá Bán (đ)": p.price.toLocaleString("vi-VN"),
    "Giá Vốn (đ)": p.costPrice.toLocaleString("vi-VN"),
    "Xuất Xứ": p.origin,
    "Ảnh": p.imageUrl
  })));

  if (!isApplyMode) {
    log("\n--------------------------------------------------");
    log("💡 ĐÂY LÀ LẦN CHẠY DRY-RUN (DỰ KIẾN). KHÔNG CÓ BẢN GHI NHÀO ĐƯỢC GHI VÀO DB.");
    log("Vui lòng duyệt danh sách trên. Khi sẵn sàng nạp thật, chạy lệnh:");
    log("   npx tsx prisma/seed_cafe.ts --apply");
    log("--------------------------------------------------");
    return;
  }

  // --- REAL APPLY MODE ---
  log("\n⚡ ĐANG THỰC HIỆN NẠP DỮ LIỆU THẬT VÀO DATABASE...");

  // 1. Users
  log("\n[1/3] Nạp Người Dùng...");
  const hashedPassword = await bcrypt.hash("123456", 10);
  for (const u of DEFAULT_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      log(`  - Tồn tại người dùng: "${u.email}" (${u.role}) -> Bỏ qua.`);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          password: hashedPassword,
          name: u.name,
          role: u.role,
          isActive: true,
        },
      });
      log(`  + Đã tạo người dùng: "${u.email}" (${u.role})`);
    }
  }

  // 2. Categories
  log("\n[2/3] Nạp Danh Mục Cà Phê...");
  const categoryIdMap = new Map<string, string>();
  for (const cat of categories) {
    let categoryRecord = await prisma.category.findUnique({ where: { name: cat.name } });
    if (!categoryRecord) {
      categoryRecord = await prisma.category.create({
        data: {
          name: cat.name,
          description: cat.description,
        },
      });
      log(`  + Đã tạo danh mục: "${cat.name}" (ID: ${categoryRecord.id})`);
    } else {
      log(`  - Đã có danh mục: "${cat.name}" (ID: ${categoryRecord.id})`);
    }
    categoryIdMap.set(cat.name, categoryRecord.id);
  }

  // 3. Products & Inventory
  log("\n[3/3] Nạp Sản Phẩm & Khởi Tạo Kho...");
  let createdCount = 0;
  for (const prod of products) {
    const catId = categoryIdMap.get(prod.categoryName);
    if (!catId) {
      log(`  ❌ Không tìm thấy danh mục "${prod.categoryName}" cho sản phẩm "${prod.name}"`);
      continue;
    }

    const existingProduct = await prisma.product.findUnique({ where: { sku: prod.sku } });
    let productRecord = existingProduct;

    if (!existingProduct) {
      productRecord = await prisma.product.create({
        data: {
          sku: prod.sku,
          name: prod.name,
          description: prod.description,
          price: prod.price,
          costPrice: prod.costPrice,
          unit: prod.unit,
          categoryId: catId,
          imageUrl: prod.imageUrl,
          origin: prod.origin,
          usageInstructions: prod.usageInstructions,
          storageInstructions: prod.storageInstructions,
          expiryInfo: prod.expiryInfo,
          certifications: null,
          nutritionFacts: null,
          isActive: true,
        },
      });
      log(`  + Đã tạo sản phẩm [${prod.sku}]: "${prod.name}"`);
      createdCount++;
    } else {
      log(`  - Sản phẩm [${prod.sku}] đã tồn tại -> Bỏ qua.`);
    }

    // Inventory record
    if (productRecord) {
      const existingInv = await prisma.inventory.findUnique({ where: { productId: productRecord.id } });
      if (!existingInv) {
        await prisma.inventory.create({
          data: {
            productId: productRecord.id,
            quantity: 50,
            minThreshold: 10,
            unit: prod.unit,
          },
        });
        log(`    └ Tự động tạo bản ghi Kho (Tồn: 50 ${prod.unit}, Ngưỡng: 10)`);
      }
    }
  }

  log("\n==================================================");
  log(`🎉 HOÀN THÀNH SEED DỮ LIỆU CÀ PHÊ THẬT:`);
  log(`- Tổng sản phẩm đã nạp: ${createdCount}/${products.length}`);
  log("==================================================");

  // Write SEED_LOG.md
  try {
    const logFilePath = path.join(__dirname, "../../../SEED_LOG.md");
    fs.appendFileSync(logFilePath, logLines.join("\n") + "\n", "utf-8");
    log(`\n📝 Đã ghi lịch sử vào SEED_LOG.md`);
  } catch (err: any) {
    console.error("Không thể ghi log:", err.message);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL ERROR IN SEED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
