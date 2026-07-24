import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Helper to load env variables from multiple locations
function loadEnvFiles() {
  const envPaths = [
    path.join(__dirname, "../../../apps/web/.env"),
    path.join(__dirname, "../.env"),
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

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// Convert Vietnamese string to plain ASCII slug
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/([^0-9a-z-\s])/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Map product names to English search keywords
const EXACT_KEYWORD_MAP: Record<string, string> = {
  "Espresso": "espresso coffee cup",
  "Americano": "americano coffee cup",
  "Latte": "caffe latte art cup",
  "Cappuccino": "cappuccino coffee cup",
  "Mocha": "mocha coffee cup",
  "Caramel Macchiato": "caramel macchiato coffee cup",
  "Cà phê đen đá": "vietnamese black iced coffee cup",
  "Cà phê sữa đá": "vietnamese iced milk coffee",
  "Bạc xỉu": "vietnamese iced milk coffee glass",
  "Cà phê muối": "salt cream coffee glass",
  "Cà phê cốt dừa": "coconut iced coffee drink",
  "Trà đào cam sả": "peach orange iced tea glass",
  "Trà sen vàng": "lotus tea drink",
  "Trà vải nhiệt đới": "lychee iced tea glass",
  "Hồng trà macchiato": "black tea macchiato cream",
  "Trà ô long macchiato": "oolong tea macchiato glass",
  "Trà matcha macchiato": "matcha macchiato drink",
  "Matcha đá xay": "matcha green tea frappe smoothie",
  "Cookie đá xay": "oreo cookie frappe smoothie",
  "Caramel đá xay": "caramel coffee frappe smoothie",
  "Cà phê đá xay": "coffee frappe smoothie glass",
  "Nước ép cam tươi": "fresh orange juice glass",
  "Nước ép táo": "fresh apple juice glass",
  "Sinh tố bơ": "avocado smoothie glass",
  "Sinh tố xoài": "mango smoothie glass",
  "Bánh Tiramisu": "tiramisu cake slice",
  "Bánh tiramisu": "tiramisu cake slice",
  "Bánh Croissant": "butter croissant pastry",
  "Bánh croissant": "butter croissant pastry",
  "Bánh Mousse chanh dây": "passion fruit mousse cake",
  "Hạt hướng dương": "sunflower seeds snack",
  "Khô gà lá chanh": "dried chicken snack food",
  "Trân châu đen": "boba tapioca pearls",
  "Trân châu trắng": "white tapioca pearls boba",
  "Thạch trái cây": "fruit jelly dessert",
  "Pudding trứng": "egg pudding dessert",
};

function getSearchKeyword(productName: string): string {
  if (EXACT_KEYWORD_MAP[productName]) {
    return EXACT_KEYWORD_MAP[productName];
  }

  // Dynamic fallback
  const cleanName = productName.replace(/\(.*?\)/g, "").trim();
  const slug = toSlug(cleanName);
  
  if (slug.includes("banh")) return `${slug.replace(/-/g, " ")} cake dessert`;
  if (slug.includes("tra")) return `${slug.replace(/-/g, " ")} iced tea drink`;
  if (slug.includes("ca-phe")) return `${slug.replace(/-/g, " ")} coffee drink`;
  if (slug.includes("sinh-to") || slug.includes("nuoc-ep")) return `${slug.replace(/-/g, " ")} juice smoothie`;
  
  return `${slug.replace(/-/g, " ")} coffee shop food drink`;
}

// Download image buffer from URL
async function downloadImage(url: string, outputPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);
    return true;
  } catch (err) {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isUpdateMode = args.includes("--update") || args.includes("--apply");
  const modeName = isUpdateMode ? "REAL UPDATE" : "DRY-RUN (Chạy thử - Không sửa DB)";

  console.log("==================================================");
  console.log(`🚀 SCRIPT LẤY ẢNH SẢN PHẨM TỪ PEXELS API`);
  console.log(`📌 CHẾ ĐỘ: ${modeName}`);
  console.log("==================================================\n");

  if (!PEXELS_API_KEY) {
    console.error("❌ LỖI: Chưa tìm thấy PEXELS_API_KEY trong file .env!");
    console.error("Vui lòng đặt PEXELS_API_KEY=your_key trong file apps/web/.env hoặc .env ở thư mục gốc.");
    process.exit(1);
  }

  // 1. Fetch all products from DB
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "asc" },
  });

  console.log(`🔍 Đã tìm thấy ${products.length} sản phẩm trong Cơ sở dữ liệu.\n`);

  const publicImagesDir = path.join(__dirname, "../../../apps/web/public/images/products");
  
  let successCount = 0;
  let failCount = 0;
  const warnings: { id: string; name: string; sku: string; reason: string }[] = [];
  const updatedList: { name: string; sku: string; localPath: string; keyword: string }[] = [];

  const logLines: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logLines.push(msg);
  };

  const now = new Date();
  log(`\n\n--- PEXELS IMAGE FETCH & UPDATE RUN: ${now.toLocaleString("vi-VN")} ---`);
  log(`Chế độ: ${modeName}`);
  log(`Nguồn ảnh: Pexels API`);
  log(`Tổng số sản phẩm xử lý: ${products.length}\n`);

  for (let i = 0; i < products.length; i++) {
    const prod = products[i];
    const keyword = getSearchKeyword(prod.name);
    const slug = toSlug(prod.name);
    const fileName = `${slug}.jpg`;
    const localPath = `/images/products/${fileName}`;
    const absoluteOutputPath = path.join(publicImagesDir, fileName);

    console.log(`[${i + 1}/${products.length}] Xử lý: "${prod.name}" (SKU: ${prod.sku})`);
    console.log(`  -> Từ khóa tìm kiếm: "${keyword}"`);

    try {
      // Call Pexels API
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=1`;
      const apiRes = await fetch(pexelsUrl, {
        headers: {
          Authorization: PEXELS_API_KEY,
        },
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Pexels API HTTP ${apiRes.status}: ${errText}`);
      }

      const data: any = await apiRes.json();

      if (!data.photos || data.photos.length === 0) {
        throw new Error(`Không tìm thấy ảnh trên Pexels cho từ khóa "${keyword}"`);
      }

      const photoUrl = data.photos[0].src.medium || data.photos[0].src.large || data.photos[0].src.original;

      // Download image
      const downloaded = await downloadImage(photoUrl, absoluteOutputPath);
      if (!downloaded) {
        throw new Error(`Không thể tải ảnh từ URL: ${photoUrl}`);
      }

      console.log(`  ✅ Đã tải ảnh thành công -> ${localPath}`);

      if (isUpdateMode) {
        await prisma.product.update({
          where: { id: prod.id },
          data: { imageUrl: localPath },
        });
        console.log(`  💾 [DB UPDATE] Đã cập nhật imageUrl = "${localPath}"`);
      } else {
        console.log(`  🔍 [DRY-RUN] Sẽ cập nhật imageUrl = "${localPath}" (Chưa ghi vào DB)`);
      }

      successCount++;
      updatedList.push({ name: prod.name, sku: prod.sku, localPath, keyword });
    } catch (err: any) {
      failCount++;
      console.log(`  ❌ LỖI: ${err.message}`);
      warnings.push({ id: prod.id, name: prod.name, sku: prod.sku, reason: err.message });
    }

    // Delay 750ms between requests to avoid rate limiting
    if (i < products.length - 1) {
      await new Promise((r) => setTimeout(r, 750));
    }
  }

  // Summary
  log("\n==================================================");
  log("📊 TỔNG KẾT QUÁ TRÌNH");
  log("==================================================");
  log(`- Tổng số sản phẩm: ${products.length}`);
  log(`- Tải ảnh ${isUpdateMode ? "& Cập nhật DB " : ""}thành công: ${successCount}`);
  log(`- Thất bại / Chưa có ảnh: ${failCount}`);

  if (updatedList.length > 0) {
    log(`\n📸 DANH SÁCH ẢNH ĐÃ TẢI ${isUpdateMode ? "& CẬP NHẬT DB" : "(DRY-RUN)"}:`);
    for (const item of updatedList) {
      log(`  + [${item.sku}] ${item.name} -> ${item.localPath} (Keyword: "${item.keyword}")`);
    }
  }

  if (warnings.length > 0) {
    log("\n⚠️ DANH SÁCH SẢN PHẨM CHƯA TẢI ĐƯỢC ẢNH (BỎ QUA KHÔNG UPDATE DB):");
    for (const w of warnings) {
      log(`  ! [${w.sku}] ${w.name}: ${w.reason}`);
    }
  } else {
    log("\n🎉 Tất cả sản phẩm đều đã có ảnh hợp lệ!");
  }

  if (!isUpdateMode) {
    log("\n💡 LƯU Ý: Đây là lần chạy DRY-RUN. Để cập nhật thật vào DB, hãy chạy lệnh:");
    log("    npx tsx prisma/fetch-product-images.ts --update");
  }

  // Write log to SEED_LOG.md
  try {
    const seedLogPath = path.join(__dirname, "../../../SEED_LOG.md");
    fs.appendFileSync(seedLogPath, logLines.join("\n") + "\n", "utf-8");
    console.log(`\n📝 Đã ghi nhật ký vào file SEED_LOG.md`);
  } catch (err: any) {
    console.error(`Không thể ghi vào SEED_LOG.md: ${err.message}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FATAL ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
