import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
import { seedSuppliers } from "./seed-suppliers";

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
  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  const now = new Date();
  log(`\n\n--- SEED RUN (seed_cafe.ts): ${now.toLocaleString("vi-VN")} ---`);

  try {
    // 1. Seed Default Users
    log("\n[USERS]");
    const hashedPassword = await bcrypt.hash("123456", 10);
    for (const u of DEFAULT_USERS) {
      const existing = await prisma.user.findUnique({ where: { email: u.email } });
      if (existing) {
        log(`- Tồn tại người dùng: "${u.email}" (${u.role}) -> Bỏ qua.`);
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
        log(`+ Đã tạo người dùng: "${u.email}" (${u.role})`);
      }
    }

    // 2. Seed Categories & Products from seed-data/
    const seedDataDir = path.join(__dirname, "seed-data");
    const categoriesPath = path.join(seedDataDir, "categories.json");

    const args = process.argv.slice(2);
    let productFilesToLoad: string[] = [];

    if (args.length > 0) {
      productFilesToLoad = args;
    } else {
      const files = fs.readdirSync(seedDataDir);
      productFilesToLoad = files.filter(
        (f) => f.startsWith("products") && f.endsWith(".json") && f !== "products-batch-2.json"
      );
    }

    log(`\nNguồn dữ liệu sản phẩm: ${productFilesToLoad.join(", ")}`);

    const categoriesRaw = fs.readFileSync(categoriesPath, "utf-8");
    const categories = JSON.parse(categoriesRaw);

    let products: any[] = [];
    for (const file of productFilesToLoad) {
      const filePath = path.join(seedDataDir, file);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          products = products.concat(parsed);
        }
      } else {
        log(`! Cảnh báo: Không tìm thấy file ${file}`);
      }
    }

    const categoryIdMap = new Map<string, string>();
    let catCreated = 0;
    let catExisted = 0;

    log("\n[CATEGORIES]");
    for (const cat of categories) {
      const existing = await prisma.category.findUnique({ where: { name: cat.name } });
      if (existing) {
        log(`- Tồn tại: "${cat.name}" (ID: ${existing.id}) -> Bỏ qua.`);
        categoryIdMap.set(cat.name, existing.id);
        catExisted++;
      } else {
        const created = await prisma.category.create({
          data: {
            name: cat.name,
            description: cat.description,
          },
        });
        log(`+ Đã tạo : "${cat.name}" (ID: ${created.id})`);
        categoryIdMap.set(cat.name, created.id);
        catCreated++;
      }
    }

    let prodCreated = 0;
    let prodExisted = 0;
    let prodErrors = 0;

    log("\n[PRODUCTS & INVENTORY]");
    for (const prod of products) {
      const categoryId = categoryIdMap.get(prod.categoryName);
      if (!categoryId) {
        log(`! Lỗi: Không tìm thấy category "${prod.categoryName}" cho sản phẩm "${prod.name}"`);
        prodErrors++;
        continue;
      }

      const existingSku = await prisma.product.findUnique({ where: { sku: prod.sku } });

      if (existingSku) {
        log(`- Tồn tại: "${prod.name}" (SKU: ${prod.sku}) -> Bỏ qua tạo mới.`);
        prodExisted++;

        // Ensure Inventory exists for existing product
        const existingInv = await prisma.inventory.findUnique({ where: { productId: existingSku.id } });
        if (!existingInv) {
          await prisma.inventory.create({
            data: {
              productId: existingSku.id,
              quantity: 20,
              minThreshold: 5,
              unit: prod.unit || "phần",
            },
          });
          log(`  + Đã bổ sung bản ghi Kho cho sản phẩm "${prod.name}"`);
        }
      } else {
        try {
          const newProduct = await prisma.product.create({
            data: {
              sku: prod.sku,
              name: prod.name,
              description: prod.description || null,
              price: prod.price,
              costPrice: Math.floor(prod.price * 0.6),
              unit: prod.unit,
              categoryId: categoryId,
              isActive: true,
              imageUrl: prod.imageUrl || null,
              origin: prod.origin || null,
              usageInstructions: prod.usageInstructions || null,
              storageInstructions: prod.storageInstructions || null,
              expiryInfo: prod.expiryInfo || null,
              certifications: prod.certifications || null,
              nutritionFacts: prod.nutritionFacts || null,
            },
          });

          // Create Inventory for new product
          await prisma.inventory.create({
            data: {
              productId: newProduct.id,
              quantity: 20,
              minThreshold: 5,
              unit: prod.unit || "phần",
            },
          });

          log(`+ Đã tạo : "${prod.name}" [${prod.categoryName}] - ${prod.price}đ - ${prod.unit}`);
          prodCreated++;
        } catch (e: any) {
          log(`! Lỗi tạo sản phẩm "${prod.name}": ${e.message}`);
          prodErrors++;
        }
      }
    }

    log("\n[SUMMARY]");
    log(`- Danh mục : Tạo mới ${catCreated}, Đã có ${catExisted}.`);
    log(`- Sản phẩm : Tạo mới ${prodCreated}, Đã có ${prodExisted}, Lỗi ${prodErrors}.`);

    if (prodErrors > 0) {
      log("=> TRẠNG THÁI CUỐI: HOÀN THÀNH MỘT PHẦN (CÓ LỖI)");
    } else {
      log("=> TRẠNG THÁI CUỐI: HOÀN THÀNH TỐT ĐẸP");
    }

    // 3. Run Supplier Seeding
    await seedSuppliers(false);
  } catch (err: any) {
    log(`\n! LỖI NGHIÊM TRỌNG TRONG QUÁ TRÌNH SEED: ${err.message}`);
    log("=> TRẠNG THÁI CUỐI: THẤT BẠI");
  } finally {
    const logFilePath = path.join(__dirname, "../../../SEED_LOG.md");
    fs.appendFileSync(logFilePath, logLines.join("\n") + "\n");
    console.log(`\nĐã ghi log vào ${logFilePath}`);
    await prisma.$disconnect();
  }
}

main();
