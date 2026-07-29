import * as fs from "fs";
import * as path from "path";

// Load env files
function loadEnvFiles() {
  const envPaths = [
    path.join(__dirname, "../../../apps/web/.env"),
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../../../.env"),
    path.join(__dirname, "../../../apps/api/.env"),
    path.join(__dirname, "../../../apps/agent/.env"),
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

export interface ProductImageSearchItem {
  sku: string;
  name: string;
  category: string;
  searchKeyword: string;
}

export const PRODUCTS_TO_FETCH: ProductImageSearchItem[] = [
  { sku: "CPH-DALAT-001", name: "Cà Phê Hạt Arabica Cầu Đất Đà Lạt Premium 500g", category: "Cà phê hạt", searchKeyword: "roasted coffee beans bag" },
  { sku: "CPH-BMT-002", name: "Cà Phê Hạt Robusta Buôn Ma Thuột Nguyên Chất 500g", category: "Cà phê hạt", searchKeyword: "coffee beans pouch bag" },
  { sku: "CPH-SONLA-003", name: "Cà Phê Hạt Arabica Sơn La Specialty 500g", category: "Cà phê hạt", searchKeyword: "specialty coffee beans package" },
  { sku: "CPH-GIALAI-004", name: "Cà Phê Hạt Phối Trộn Robusta & Arabica Chư Sê 1kg", category: "Cà phê hạt", searchKeyword: "coffee beans burlap sack package" },
  { sku: "CPH-LAMDONG-005", name: "Cà Phê Hạt Culico (Culi Robusta) Bảo Lộc 500g", category: "Cà phê hạt", searchKeyword: "coffee beans craft paper bag" },
  
  { sku: "CPB-BMT-001", name: "Cà Phê Bột Truyền Thống Pha Phin Buôn Ma Thuột 500g", category: "Cà phê bột", searchKeyword: "ground coffee bag package" },
  { sku: "CPB-DALAT-002", name: "Cà Phê Bột Arabica Cầu Đất Rang Vừa 250g", category: "Cà phê bột", searchKeyword: "ground coffee pouch" },
  { sku: "CPB-QUANGTRI-003", name: "Cà Phê Bột Khe Sanh Arabica Hướng Hóa 500g", category: "Cà phê bột", searchKeyword: "ground coffee package" },
  { sku: "CPB-PLEIKU-004", name: "Cà Phê Bột Moka Đốt Than Pleiku Premium 250g", category: "Cà phê bột", searchKeyword: "dark roast ground coffee bag" },
  { sku: "CPB-KRONG-005", name: "Cà Phê Bột Robusta Mật Chiết (Honey Process) Krông Năng 500g", category: "Cà phê bột", searchKeyword: "coffee powder bag packaging" },
  
  { sku: "CPL-SUADA-001", name: "Cà Phê Lon Sữa Đá Đậm Vị Sài Gòn 235ml", category: "Cà phê lon", searchKeyword: "canned iced coffee drink" },
  { sku: "CPL-DENDA-002", name: "Cà Phê Lon Đen Đá Đắk Lắk Không Đường 235ml", category: "Cà phê lon", searchKeyword: "black coffee can drink" },
  { sku: "CPL-COLDBREW-003", name: "Cà Phê Lon Cold Brew Arabica Đà Lạt Nguyên Chất 250ml", category: "Cà phê lon", searchKeyword: "cold brew coffee can" },
  { sku: "CPL-LATTE-004", name: "Cà Phê Lon Salted Caramel Latte 240ml", category: "Cà phê lon", searchKeyword: "coffee latte can drink" },
  
  { sku: "CPHT-3IN1-001", name: "Cà Phê Hòa Tan 3in1 Đắk Lắk Hộp 20 Gói", category: "Cà phê hòa tan & túi lọc", searchKeyword: "instant coffee box package" },
  { sku: "CPHT-DRIP-002", name: "Cà Phê Túi Lọc Drip Bag Arabica Cầu Đất Hộp 10 Túi", category: "Cà phê hòa tan & túi lọc", searchKeyword: "drip coffee bag package" },
  { sku: "CPHT-BLACK-003", name: "Cà Phê Hòa Tan Đen Sấy Lạnh Pure Black Hộp 15 Gói", category: "Cà phê hòa tan & túi lọc", searchKeyword: "black instant coffee sachet box" },
  { sku: "CPHT-DRIP-004", name: "Cà Phê Túi Lọc Fine Robusta Krông Năng Hộp 10 Túi", category: "Cà phê hòa tan & túi lọc", searchKeyword: "drip bag coffee filter" },
];

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
  console.log("==================================================");
  console.log(`🚀 SCRIPT TẢI ẢNH CÀ PHÊ THẬT TỪ PEXELS API`);
  console.log("==================================================\n");

  if (!PEXELS_API_KEY) {
    console.error("❌ LỖI: Chưa thấy PEXELS_API_KEY trong file .env!");
    console.error("Vui lòng bổ sung PEXELS_API_KEY=xxx vào file packages/database/.env hoặc apps/web/.env");
    process.exit(1);
  }

  const publicImagesDir = path.join(__dirname, "../../../apps/web/public/images/products");

  const mappingResults: {
    sku: string;
    name: string;
    keyword: string;
    fileName: string;
    imageUrl: string;
    status: string;
    pexelsUrl?: string;
  }[] = [];

  for (let i = 0; i < PRODUCTS_TO_FETCH.length; i++) {
    const item = PRODUCTS_TO_FETCH[i];
    const slug = toSlug(item.name);
    const fileName = `${slug}.jpg`;
    const localPath = `/images/products/${fileName}`;
    const absoluteOutputPath = path.join(publicImagesDir, fileName);

    console.log(`[${i + 1}/${PRODUCTS_TO_FETCH.length}] SKU: ${item.sku} | "${item.name}"`);
    console.log(`  -> Từ khóa Pexels: "${item.searchKeyword}"`);

    try {
      const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(item.searchKeyword)}&per_page=3`;
      const apiRes = await fetch(pexelsUrl, {
        headers: {
          Authorization: PEXELS_API_KEY,
        },
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`Pexels HTTP ${apiRes.status}: ${errText}`);
      }

      const data: any = await apiRes.json();

      if (!data.photos || data.photos.length === 0) {
        throw new Error(`Không tìm thấy ảnh trên Pexels cho "${item.searchKeyword}"`);
      }

      // Pick photo
      const photo = data.photos[0];
      const photoUrl = photo.src.medium || photo.src.large || photo.src.original;

      const ok = await downloadImage(photoUrl, absoluteOutputPath);
      if (!ok) {
        throw new Error(`Tải ảnh thất bại từ: ${photoUrl}`);
      }

      console.log(`  ✅ Đã tải: ${fileName}`);
      mappingResults.push({
        sku: item.sku,
        name: item.name,
        keyword: item.searchKeyword,
        fileName,
        imageUrl: localPath,
        status: "Thành công",
        pexelsUrl: photo.url
      });
    } catch (err: any) {
      console.log(`  ❌ Thất bại: ${err.message}`);
      mappingResults.push({
        sku: item.sku,
        name: item.name,
        keyword: item.searchKeyword,
        fileName,
        imageUrl: localPath,
        status: `Lỗi: ${err.message}`
      });
    }

    if (i < PRODUCTS_TO_FETCH.length - 1) {
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  // Print summary mapping table
  console.log("\n==================================================");
  console.log("📸 BẢNG MAPPING ẢNH PEXELS");
  console.log("==================================================\n");
  console.table(mappingResults.map(r => ({
    SKU: r.sku,
    "Tên sản phẩm": r.name,
    "Từ khóa": r.keyword,
    "Tên File Ảnh": r.fileName,
    "Trạng thái": r.status
  })));

  // Output JSON mapping for reference
  const outputPath = path.join(__dirname, "pexels-mapping.json");
  fs.writeFileSync(outputPath, JSON.stringify(mappingResults, null, 2), "utf-8");
  console.log(`\n💾 Đã lưu kết quả mapping vào: ${outputPath}`);
}

main().catch((e) => {
  console.error("Lỗi thực thi:", e);
  process.exit(1);
});
