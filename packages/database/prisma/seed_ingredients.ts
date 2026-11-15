import { PrismaClient, Prisma, CategoryKind, ToppingType } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

function loadEnvFiles() {
  const envPaths = [
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../../../apps/api/.env"),
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

interface SeedIngredientSpec {
  sku: string;
  name: string;
  categoryName: string;
  baseUnit: string;
  purchaseUnit: string;
  conversionFactor: number;
  costPerBaseUnit: number;
  initialQty: number;
  minThreshold: number;
  shelfLifeDays: number;
}

const INGREDIENTS_DATA: SeedIngredientSpec[] = [
  {
    sku: "ING-CF-ARABICA",
    name: "Hạt cà phê Arabica Cầu Đất rang mộc",
    categoryName: "Hạt & Bột Cà Phê",
    baseUnit: "g",
    purchaseUnit: "kg",
    conversionFactor: 1000,
    costPerBaseUnit: 380, // 380,000đ/kg
    initialQty: 15000,
    minThreshold: 2000,
    shelfLifeDays: 180,
  },
  {
    sku: "ING-CF-ROBUSTA",
    name: "Hạt cà phê Robusta Đắk Lắk Honey",
    categoryName: "Hạt & Bột Cà Phê",
    baseUnit: "g",
    purchaseUnit: "kg",
    conversionFactor: 1000,
    costPerBaseUnit: 220, // 220,000đ/kg
    initialQty: 20000,
    minThreshold: 3000,
    shelfLifeDays: 180,
  },
  {
    sku: "ING-MILK-FRESH",
    name: "Sữa tươi thanh trùng không đường",
    categoryName: "Sữa & Kem Béo",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 36, // 36,000đ/L
    initialQty: 24000,
    minThreshold: 4000,
    shelfLifeDays: 14,
  },
  {
    sku: "ING-MILK-CONDENSED",
    name: "Sữa đặc có đường Ngôi Sao Phương Nam",
    categoryName: "Sữa & Kem Béo",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 55, // 55,000đ/L
    initialQty: 12000,
    minThreshold: 2000,
    shelfLifeDays: 120,
  },
  {
    sku: "ING-CREAM-RICH",
    name: "Kem béo thực vật Rich's",
    categoryName: "Sữa & Kem Béo",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 75, // 75,000đ/L
    initialQty: 8000,
    minThreshold: 1500,
    shelfLifeDays: 30,
  },
  {
    sku: "ING-SYRUP-CARAMEL",
    name: "Syrup Caramel Monin",
    categoryName: "Syrup & Đường",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 240, // 240,000đ/L
    initialQty: 5000,
    minThreshold: 700,
    shelfLifeDays: 365,
  },
  {
    sku: "ING-SYRUP-VANILLA",
    name: "Syrup Vanilla Monin",
    categoryName: "Syrup & Đường",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 230, // 230,000đ/L
    initialQty: 5000,
    minThreshold: 700,
    shelfLifeDays: 365,
  },
  {
    sku: "ING-SUGAR-LIQUID",
    name: "Nước đường Hàn Quốc",
    categoryName: "Syrup & Đường",
    baseUnit: "ml",
    purchaseUnit: "l",
    conversionFactor: 1000,
    costPerBaseUnit: 28, // 28,000đ/L
    initialQty: 15000,
    minThreshold: 2000,
    shelfLifeDays: 365,
  },
  {
    sku: "ING-POWDER-MATCHA",
    name: "Bột Matcha Uji Nhật Bản nguyên chất",
    categoryName: "Trà & Bột Pha Chế",
    baseUnit: "g",
    purchaseUnit: "kg",
    conversionFactor: 1000,
    costPerBaseUnit: 950, // 950,000đ/kg
    initialQty: 3000,
    minThreshold: 500,
    shelfLifeDays: 180,
  },
  {
    sku: "ING-POWDER-COCOA",
    name: "Bột Cacao nguyên chất Malaysia",
    categoryName: "Trà & Bột Pha Chế",
    baseUnit: "g",
    purchaseUnit: "kg",
    conversionFactor: 1000,
    costPerBaseUnit: 320, // 320,000đ/kg
    initialQty: 5000,
    minThreshold: 800,
    shelfLifeDays: 240,
  },
  {
    sku: "ING-PEARL-BLACK",
    name: "Trân châu đen đường đen",
    categoryName: "Topping & Hạt",
    baseUnit: "g",
    purchaseUnit: "kg",
    conversionFactor: 1000,
    costPerBaseUnit: 65, // 65,000đ/kg
    initialQty: 10000,
    minThreshold: 1500,
    shelfLifeDays: 60,
  },
  {
    sku: "ING-PACK-CUP500",
    name: "Ly nhựa PET 500ml kèm nắp cầu",
    categoryName: "Bao Bì & Vật Tư",
    baseUnit: "pcs",
    purchaseUnit: "pcs",
    conversionFactor: 1,
    costPerBaseUnit: 950, // 950đ/bộ
    initialQty: 1000,
    minThreshold: 200,
    shelfLifeDays: 999,
  },
];

async function seedIngredients() {
  console.log("🌱 Bắt đầu khởi tạo dữ liệu Nguyên liệu, Lô hàng, Topping & Công thức (BOM)...");

  // 1. Tạo danh mục nguyên liệu (CategoryKind.INGREDIENT)
  const categoryNames = Array.from(new Set(INGREDIENTS_DATA.map((i) => i.categoryName)));
  const categoryMap = new Map<string, string>();

  for (const name of categoryNames) {
    const category = await prisma.category.upsert({
      where: {
        name_kind: {
          name,
          kind: CategoryKind.INGREDIENT,
        },
      },
      update: {},
      create: {
        name,
        kind: CategoryKind.INGREDIENT,
      },
    });
    categoryMap.set(name, category.id);
  }

  // 2. Tạo nguyên liệu & Lô hàng khởi tạo (idempotent theo SKU)
  const ingredientBySku = new Map<string, { id: string; costPerBaseUnit: Prisma.Decimal; baseUnit: string }>();

  for (const spec of INGREDIENTS_DATA) {
    const categoryId = categoryMap.get(spec.categoryName)!;
    const ing = await prisma.ingredient.upsert({
      where: { sku: spec.sku },
      update: {
        name: spec.name,
        categoryId,
        baseUnit: spec.baseUnit,
        costPerBaseUnit: new Prisma.Decimal(spec.costPerBaseUnit),
        minThreshold: new Prisma.Decimal(spec.minThreshold),
        shelfLifeDays: spec.shelfLifeDays,
        isActive: true,
      },
      create: {
        sku: spec.sku,
        name: spec.name,
        categoryId,
        baseUnit: spec.baseUnit,
        costPerBaseUnit: new Prisma.Decimal(spec.costPerBaseUnit),
        quantity: new Prisma.Decimal(spec.initialQty),
        reserved: new Prisma.Decimal(0),
        minThreshold: new Prisma.Decimal(spec.minThreshold),
        shelfLifeDays: spec.shelfLifeDays,
        isActive: true,
      },
    });

    // Đảm bảo có ít nhất 1 lô hàng khởi tạo nếu chưa có lô nào
    const existingBatches = await prisma.ingredientBatch.count({
      where: { ingredientId: ing.id },
    });

    if (existingBatches === 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + spec.shelfLifeDays);

      await prisma.ingredientBatch.create({
        data: {
          ingredientId: ing.id,
          batchCode: `INIT-${spec.sku}`,
          quantityInitial: new Prisma.Decimal(spec.initialQty),
          quantityRemaining: new Prisma.Decimal(spec.initialQty),
          unitCost: new Prisma.Decimal(spec.costPerBaseUnit),
          expirationDate: spec.shelfLifeDays < 900 ? expDate : null,
        },
      });
    }

    ingredientBySku.set(spec.sku, {
      id: ing.id,
      costPerBaseUnit: ing.costPerBaseUnit,
      baseUnit: ing.baseUnit,
    });
  }

  console.log(`✅ Đã đồng bộ ${ingredientBySku.size} nguyên liệu và lô hàng.`);

  // 3. Liên kết Nhà cung cấp (SupplierIngredient) nếu có Supplier trong hệ thống
  const firstSupplier = await prisma.supplier.findFirst({ where: { status: "ACTIVE" } });
  if (firstSupplier) {
    for (const spec of INGREDIENTS_DATA) {
      const ing = ingredientBySku.get(spec.sku)!;
      await prisma.supplierIngredient.upsert({
        where: {
          supplierId_ingredientId: {
            supplierId: firstSupplier.id,
            ingredientId: ing.id,
          },
        },
        update: {
          pricePerBaseUnit: new Prisma.Decimal(spec.costPerBaseUnit),
          purchaseUnit: spec.purchaseUnit,
          conversionQuantity: new Prisma.Decimal(spec.conversionFactor),
          conversionTargetUnit: spec.baseUnit,
          isPreferred: true,
        },
        create: {
          supplierId: firstSupplier.id,
          ingredientId: ing.id,
          pricePerBaseUnit: new Prisma.Decimal(spec.costPerBaseUnit),
          purchaseUnit: spec.purchaseUnit,
          conversionQuantity: new Prisma.Decimal(spec.conversionFactor),
          conversionTargetUnit: spec.baseUnit,
          leadTimeDays: 2,
          minOrderQuantity: 1,
          isPreferred: true,
        },
      });
    }
    console.log(`✅ Đã liên kết nguyên liệu với nhà cung cấp: ${firstSupplier.name}`);
  }

  // 4. Tạo Topping mẫu + ToppingIngredient
  const toppingsSpec = [
    {
      name: "Shot Espresso Thêm",
      price: 12000,
      ingredientSku: "ING-CF-ARABICA",
      qtyBase: 18,
    },
    {
      name: "Trân Châu Đen Đường Đen",
      price: 10000,
      ingredientSku: "ING-PEARL-BLACK",
      qtyBase: 50,
    },
    {
      name: "Kem Cheese / Kem Béo",
      price: 12000,
      ingredientSku: "ING-CREAM-RICH",
      qtyBase: 40,
    },
    {
      name: "Sốt Caramel Monin",
      price: 8000,
      ingredientSku: "ING-SYRUP-CARAMEL",
      qtyBase: 15,
    },
  ];

  for (const tSpec of toppingsSpec) {
    const ing = ingredientBySku.get(tSpec.ingredientSku);
    let topping = await prisma.topping.findFirst({
      where: { name: tSpec.name },
    });

    if (topping) {
      topping = await prisma.topping.update({
        where: { id: topping.id },
        data: {
          price: new Prisma.Decimal(tSpec.price),
          isActive: true,
        },
      });
    } else {
      topping = await prisma.topping.create({
        data: {
          name: tSpec.name,
          toppingType: ToppingType.ADD,
          price: new Prisma.Decimal(tSpec.price),
          isActive: true,
        },
      });
    }

    if (ing) {
      await prisma.toppingIngredient.upsert({
        where: {
          toppingId_ingredientId: {
            toppingId: topping.id,
            ingredientId: ing.id,
          },
        },
        update: {
          quantityBase: new Prisma.Decimal(tSpec.qtyBase),
        },
        create: {
          toppingId: topping.id,
          ingredientId: ing.id,
          quantityBase: new Prisma.Decimal(tSpec.qtyBase),
        },
      });
    }
  }
  console.log(`✅ Đã đồng bộ ${toppingsSpec.length} Topping mẫu.`);

  // 5. Dọn dẹp toàn bộ dữ liệu Sản phẩm đóng gói & Tồn kho cũ (Inventory / InventoryBatch / SupplierProduct)
  // Chỉ giữ lại các sản phẩm pha chế (DRK-*) và quản lý kho qua Nguyên liệu (Ingredient)
  await prisma.inventoryTransaction.deleteMany({
    where: { ingredientId: null },
  });
  await prisma.purchaseRequestItem.deleteMany({
    where: { ingredientId: null },
  });
  await prisma.purchaseRequest.deleteMany({
    where: { items: { none: {} } },
  });
  await prisma.supplierProduct.deleteMany({});
  await prisma.inventoryBatch.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.agentLog.deleteMany({
    where: {
      OR: [
        { reference_type: "Inventory" },
        { action: { startsWith: "SCAN_INVENTORY_" } },
      ],
      NOT: { action: "SCAN_INVENTORY_SESSION" },
    },
  });

  const packagedProducts = await prisma.product.findMany({
    where: { NOT: { sku: { startsWith: "DRK-" } } },
    select: { id: true },
  });
  if (packagedProducts.length > 0) {
    const packagedIds = packagedProducts.map((p) => p.id);
    await prisma.orderItemTopping.deleteMany({
      where: { orderItem: { productId: { in: packagedIds } } },
    });
    await prisma.orderItem.deleteMany({
      where: { productId: { in: packagedIds } },
    });
    await prisma.order.deleteMany({
      where: { items: { none: {} } },
    });
    await prisma.recipeIngredient.deleteMany({
      where: { recipe: { productId: { in: packagedIds } } },
    });
    await prisma.recipe.deleteMany({
      where: { productId: { in: packagedIds } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: packagedIds } },
    });
  }

  await prisma.category.deleteMany({
    where: {
      kind: CategoryKind.PRODUCT,
      products: { none: {} },
    },
  });

  const products = await prisma.product.findMany({
    where: { sku: { startsWith: "DRK-" } },
    orderBy: { sku: "asc" },
  });

  const DRINK_RECIPES_BY_SKU: Record<string, Array<{ sku: string; quantity: number; unit: string }>> = {
    "DRK-ESP-001": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-AME-002": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-SUGAR-LIQUID", quantity: 10, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-LAT-003": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 180, unit: "ml" },
      { sku: "ING-SYRUP-VANILLA", quantity: 10, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-CAP-004": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 150, unit: "ml" },
      { sku: "ING-POWDER-COCOA", quantity: 5, unit: "g" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-MOC-005": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 150, unit: "ml" },
      { sku: "ING-POWDER-COCOA", quantity: 15, unit: "g" },
      { sku: "ING-MILK-CONDENSED", quantity: 20, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-MAC-006": [
      { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 160, unit: "ml" },
      { sku: "ING-SYRUP-CARAMEL", quantity: 20, unit: "ml" },
      { sku: "ING-CREAM-RICH", quantity: 20, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-CLB-007": [
      { sku: "ING-CF-ARABICA", quantity: 25, unit: "g" },
      { sku: "ING-SYRUP-VANILLA", quantity: 15, unit: "ml" },
      { sku: "ING-SUGAR-LIQUID", quantity: 10, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-PHIN-008": [
      { sku: "ING-CF-ROBUSTA", quantity: 25, unit: "g" },
      { sku: "ING-MILK-CONDENSED", quantity: 40, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-BACXIU-009": [
      { sku: "ING-CF-ROBUSTA", quantity: 15, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 100, unit: "ml" },
      { sku: "ING-MILK-CONDENSED", quantity: 40, unit: "ml" },
      { sku: "ING-CREAM-RICH", quantity: 20, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-MAT-010": [
      { sku: "ING-POWDER-MATCHA", quantity: 8, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 150, unit: "ml" },
      { sku: "ING-MILK-CONDENSED", quantity: 25, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
    "DRK-CHOC-011": [
      { sku: "ING-POWDER-COCOA", quantity: 20, unit: "g" },
      { sku: "ING-MILK-FRESH", quantity: 140, unit: "ml" },
      { sku: "ING-MILK-CONDENSED", quantity: 30, unit: "ml" },
      { sku: "ING-CREAM-RICH", quantity: 20, unit: "ml" },
      { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" },
    ],
  };

  let seededRecipeCount = 0;
  for (const prod of products) {
    const existingActive = await prisma.recipe.findFirst({
      where: { productId: prod.id, isActive: true },
    });
    if (existingActive) continue;

    const nameLower = prod.name.toLowerCase();
    const items: Array<{ sku: string; quantity: number; unit: string }> =
      DRINK_RECIPES_BY_SKU[prod.sku] ? [...DRINK_RECIPES_BY_SKU[prod.sku]!] : [];

    if (items.length === 0) {
      if (nameLower.includes("matcha")) {
        items.push(
          { sku: "ING-POWDER-MATCHA", quantity: 8, unit: "g" },
          { sku: "ING-MILK-FRESH", quantity: 150, unit: "ml" },
          { sku: "ING-MILK-CONDENSED", quantity: 25, unit: "ml" },
          { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" }
        );
      } else if (nameLower.includes("latte") || nameLower.includes("cappuccino") || nameLower.includes("caramel")) {
        items.push(
          { sku: "ING-CF-ARABICA", quantity: 18, unit: "g" },
          { sku: "ING-MILK-FRESH", quantity: 160, unit: "ml" },
          { sku: "ING-SYRUP-CARAMEL", quantity: 15, unit: "ml" },
          { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" }
        );
      } else {
        items.push(
          { sku: "ING-CF-ROBUSTA", quantity: 22, unit: "g" },
          { sku: "ING-MILK-CONDENSED", quantity: 35, unit: "ml" },
          { sku: "ING-SUGAR-LIQUID", quantity: 10, unit: "ml" },
          { sku: "ING-PACK-CUP500", quantity: 1, unit: "pcs" }
        );
      }
    }

    let totalCost = 0;
    for (const item of items) {
      const ing = ingredientBySku.get(item.sku)!;
      totalCost += item.quantity * Number(ing.costPerBaseUnit);
    }
    const roundedCost = Math.round(totalCost);

    await prisma.recipe.create({
      data: {
        productId: prod.id,
        version: 1,
        isActive: true,
        yieldQuantity: new Prisma.Decimal(1),
        laborCost: new Prisma.Decimal(0),
        overheadCost: new Prisma.Decimal(0),
        note: "Công thức tiêu chuẩn khởi tạo tự động",
        ingredients: {
          create: items.map((item) => ({
            ingredientId: ingredientBySku.get(item.sku)!.id,
            quantity: new Prisma.Decimal(item.quantity),
            unit: item.unit,
            quantityBase: new Prisma.Decimal(item.quantity),
            isOptional: false,
            allowSubstitute: false,
          })),
        },
      },
    });

    await prisma.product.update({
      where: { id: prod.id },
      data: {
        costPrice: new Prisma.Decimal(roundedCost),
      },
    });

    seededRecipeCount++;
  }

  console.log(`✅ Đã tạo công thức mẫu và đồng bộ giá vốn cho ${seededRecipeCount} sản phẩm.`);
}

seedIngredients()
  .catch((err) => {
    console.error("❌ Lỗi khi seed nguyên liệu:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
