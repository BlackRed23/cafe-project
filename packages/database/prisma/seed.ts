import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const password = "123456";
const passwordRounds = 10;

const users = [
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

const categories = [
  {
    name: "Cà phê hạt",
    description: "Các dòng cà phê nguyên hạt cho pha máy và pha phin.",
  },
  {
    name: "Cà phê bột",
    description: "Cà phê rang xay đóng gói dùng cho pha phin truyền thống.",
  },
  {
    name: "Cà phê lon",
    description: "Đồ uống cà phê đóng lon tiện lợi.",
  },
];

const products = [
  {
    id: "seed-product-arabica-da-lat-250g",
    sku: "ARB-DL-250G",
    name: "Arabica Đà Lạt 250g",
    description: "Cà phê Arabica Đà Lạt rang mộc, hậu vị thanh và chua nhẹ.",
    price: "125000",
    costPrice: 85000,
    unit: "goi",
    isActive: true,
    imageUrl: "/images/products/arabica-da-lat-250g.jpg",
    categoryName: "Cà phê hạt",
    inventory: {
      quantity: 5,
      minThreshold: 10,
      unit: "gói",
    },
  },
  {
    id: "seed-product-robusta-buon-ma-thuot-250g",
    sku: "ROB-BMT-250G",
    name: "Robusta Buôn Ma Thuột 250g",
    description: "Robusta Buôn Ma Thuột đậm vị, phù hợp pha phin.",
    price: "95000",
    costPrice: 62000,
    unit: "goi",
    isActive: true,
    imageUrl: "/images/products/robusta-buon-ma-thuot-250g.jpg",
    categoryName: "Cà phê hạt",
    inventory: {
      quantity: 36,
      minThreshold: 10,
      unit: "gói",
    },
  },
  {
    id: "seed-product-espresso-blend-500g",
    sku: "ESP-BLEND-500G",
    name: "Espresso Blend 500g",
    description: "Blend hạt cà phê cân bằng cho espresso, latte và cappuccino.",
    price: "185000",
    costPrice: 135000,
    unit: "goi",
    isActive: true,
    imageUrl: "/images/products/espresso-blend-500g.jpg",
    categoryName: "Cà phê hạt",
    inventory: {
      quantity: 24,
      minThreshold: 8,
      unit: "gói",
    },
  },
  {
    id: "seed-product-ca-phe-bot-truyen-thong-500g",
    sku: "CPB-TT-500G",
    name: "Cà phê bột truyền thống 500g",
    description: "Cà phê bột rang xay truyền thống, vị đậm và thơm lâu.",
    price: "110000",
    costPrice: 76000,
    unit: "goi",
    isActive: true,
    imageUrl: "/images/products/ca-phe-bot-truyen-thong-500g.jpg",
    categoryName: "Cà phê bột",
    inventory: {
      quantity: 42,
      minThreshold: 15,
      unit: "gói",
    },
  },
  {
    id: "seed-product-ca-phe-sua-lon",
    sku: "CPS-LON",
    name: "Cà phê sữa lon",
    description: "Cà phê sữa đóng lon dùng ngay, phù hợp bán mang đi.",
    price: "18000",
    costPrice: 12000,
    unit: "lon",
    isActive: true,
    imageUrl: "/images/products/ca-phe-sua-lon.jpg",
    categoryName: "Cà phê lon",
    inventory: {
      quantity: 4,
      minThreshold: 12,
      unit: "lon",
    },
  },
  {
    id: "seed-product-cold-brew-lon",
    sku: "COLD-BREW-LON",
    name: "Cold Brew lon",
    description: "Cold brew đóng lon vị nhẹ, ít đắng, dùng lạnh.",
    price: "24000",
    costPrice: 16500,
    unit: "lon",
    isActive: true,
    imageUrl: "/images/products/cold-brew-lon.jpg",
    categoryName: "Cà phê lon",
    inventory: {
      quantity: 48,
      minThreshold: 12,
      unit: "lon",
    },
  },
];

const suppliers = [
  {
    id: "seed-supplier-cafe-tay-nguyen",
    name: "Nhà cung cấp Cafe Tây Nguyên",
    email: "supplier-taynguyen@example.com",
    contact: "0901000001",
    address: "Buôn Ma Thuột, Đắk Lắk",
  },
  {
    id: "seed-supplier-arabica-da-lat",
    name: "Nhà cung cấp Arabica Đà Lạt",
    email: "supplier-dalat@example.com",
    contact: "0901000002",
    address: "Đà Lạt, Lâm Đồng",
  },
  {
    id: "seed-supplier-do-uong-dong-lon",
    name: "Nhà cung cấp Đồ uống đóng lon",
    email: "supplier-donglon@example.com",
    contact: "0901000003",
    address: "Quận 1, TP. Hồ Chí Minh",
  },
];

const supplierProducts = [
  {
    supplierId: "seed-supplier-arabica-da-lat",
    productId: "seed-product-arabica-da-lat-250g",
    price: "85000",
  },
  {
    supplierId: "seed-supplier-cafe-tay-nguyen",
    productId: "seed-product-robusta-buon-ma-thuot-250g",
    price: "62000",
  },
  {
    supplierId: "seed-supplier-cafe-tay-nguyen",
    productId: "seed-product-espresso-blend-500g",
    price: "135000",
  },
  {
    supplierId: "seed-supplier-cafe-tay-nguyen",
    productId: "seed-product-ca-phe-bot-truyen-thong-500g",
    price: "76000",
  },
  {
    supplierId: "seed-supplier-do-uong-dong-lon",
    productId: "seed-product-ca-phe-sua-lon",
    price: "12000",
  },
  {
    supplierId: "seed-supplier-do-uong-dong-lon",
    productId: "seed-product-cold-brew-lon",
    price: "16500",
  },
];

async function main() {
  const hashedPassword = await bcrypt.hash(password, passwordRounds);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        password: hashedPassword,
        name: user.name,
        role: user.role,
        isActive: true,
      },
      create: {
        email: user.email,
        password: hashedPassword,
        name: user.name,
        role: user.role,
        isActive: true,
      },
    });
  }

  const categoryByName = new Map<string, string>();

  for (const category of categories) {
    const savedCategory = await prisma.category.upsert({
      where: { name: category.name },
      update: {
        description: category.description,
      },
      create: category,
    });

    categoryByName.set(savedCategory.name, savedCategory.id);
  }

  for (const product of products) {
    const categoryId = categoryByName.get(product.categoryName);

    if (!categoryId) {
      throw new Error(`Missing category for product: ${product.name}`);
    }

    const savedProduct = await prisma.product.upsert({
      where: { id: product.id },
      update: {
        name: product.name,
        sku: product.sku,
        description: product.description,
        price: product.price,
        costPrice: product.costPrice,
        unit: product.unit,
        imageUrl: product.imageUrl,
        categoryId,
        isActive: product.isActive,
      },
      create: {
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        price: product.price,
        costPrice: product.costPrice,
        unit: product.unit,
        imageUrl: product.imageUrl,
        categoryId,
        isActive: product.isActive,
      },
    });

    await prisma.inventory.upsert({
      where: { productId: savedProduct.id },
      update: {
        quantity: product.inventory.quantity,
        minThreshold: product.inventory.minThreshold,
        unit: product.inventory.unit,
      },
      create: {
        productId: savedProduct.id,
        quantity: product.inventory.quantity,
        minThreshold: product.inventory.minThreshold,
        unit: product.inventory.unit,
      },
    });
  }

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {
        name: supplier.name,
        email: supplier.email,
        contact: supplier.contact,
        address: supplier.address,
      },
      create: supplier,
    });
  }

  for (const supplierProduct of supplierProducts) {
    await prisma.supplierProduct.upsert({
      where: {
        supplierId_productId: {
          supplierId: supplierProduct.supplierId,
          productId: supplierProduct.productId,
        },
      },
      update: {
        price: supplierProduct.price,
      },
      create: supplierProduct,
    });
  }

  console.log("Seed completed:");
  console.log(`- Users: ${users.length}`);
  console.log(`- Categories: ${categories.length}`);
  console.log(`- Products: ${products.length}`);
  console.log(`- Inventories: ${products.length}`);
  console.log(`- Suppliers: ${suppliers.length}`);
  console.log(`- Supplier products: ${supplierProducts.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
