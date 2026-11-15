import {
    PrismaClient,
    Prisma,
    OrderStatus,
    PaymentStatus,
    PurchaseRequestStatus,
    InventoryTransactionType,
    PaymentMethod,
    TransactionStatus,
    ConsumptionStatus,
} from "@prisma/client";

export async function seedWorkflows(prisma: PrismaClient, log: (msg: string) => void) {
    log("\n[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders pha chế & Purchase Requests Nguyên liệu)...");

    const customer = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!customer || !admin) {
        log("❌ Không tìm thấy user (CUSTOMER hoặc ADMIN) để seed workflows.");
        return;
    }

    const drinks = await prisma.product.findMany({
        where: { isActive: true, sku: { startsWith: "DRK-" } },
        include: {
            recipes: {
                where: { isActive: true },
                include: { ingredients: { include: { ingredient: true } } },
            },
        },
        orderBy: { sku: "asc" },
    });

    const ingredients = await prisma.ingredient.findMany({
        where: { isActive: true, deletedAt: null },
        include: { batches: true, supplierLinks: { include: { supplier: true } } },
        orderBy: { sku: "asc" },
    });

    if (drinks.length === 0 || ingredients.length < 2) {
        log("ℹ️ Chưa có đủ món pha chế và nguyên liệu để seed workflows (hãy chạy seed_ingredients.ts trước hoặc sau).");
        return;
    }

    const ingMilk = ingredients.find((i) => i.sku === "ING-MILK-FRESH") || ingredients[0]!;
    const ingArabica = ingredients.find((i) => i.sku === "ING-CF-ARABICA") || ingredients[1]!;

    // 1. Tạo 1 lô Sữa tươi cận hạn (còn 2 ngày) để demo AI Agent cảnh báo CRITICAL_EXPIRY
    const twoDaysLater = new Date();
    twoDaysLater.setDate(twoDaysLater.getDate() + 2);
    const nearExpBatchCode = `LOT-EXP-${ingMilk.sku}`;
    const existingNearExp = await prisma.ingredientBatch.findFirst({
        where: { ingredientId: ingMilk.id, batchCode: nearExpBatchCode },
    });

    if (!existingNearExp) {
        await prisma.ingredientBatch.create({
            data: {
                ingredientId: ingMilk.id,
                batchCode: nearExpBatchCode,
                quantityInitial: new Prisma.Decimal(2000),
                quantityRemaining: new Prisma.Decimal(2000),
                unitCost: ingMilk.costPerBaseUnit,
                expirationDate: twoDaysLater,
                receivedQty: new Prisma.Decimal(2),
                receivedUnit: "l",
                note: "Lô sữa tươi cận hạn (còn 2 ngày)",
            },
        });
        await prisma.ingredient.update({
            where: { id: ingMilk.id },
            data: { quantity: { increment: new Prisma.Decimal(2000) } },
        });
        log(`  + Đã tạo lô nguyên liệu cận hạn (${nearExpBatchCode}) cho ${ingMilk.name}`);
    }

    // 2. Đảm bảo có Nhà cung cấp nguyên liệu Active
    let supplier = await prisma.supplier.findFirst({ where: { status: "ACTIVE" } });
    if (!supplier) {
        supplier = await prisma.supplier.create({
            data: {
                name: "Nông Trại & Nguyên Liệu Pha Chế Cầu Đất",
                phone: "0909123456",
                email: "nguyenlieu@caudatfarm.vn",
                address: "Cầu Đất, Đà Lạt, Lâm Đồng",
                status: "ACTIVE",
            },
        });
        log(`  + Đã tạo Nhà cung cấp nguyên liệu: ${supplier.name}`);
    }

    // 3. Tạo các Phiếu yêu cầu nhập nguyên liệu (PurchaseRequest gắn ingredientId) nếu chưa có
    const existingIngredientPrCount = await prisma.purchaseRequest.count({
        where: { items: { some: { ingredientId: { not: null } } } },
    });

    if (existingIngredientPrCount === 0) {
        const now = new Date();
        const past1Day = new Date(now.getTime() - 86400000);
        const past2Days = new Date(now.getTime() - 2 * 86400000);

        const arabicaPackPrice = Number(ingArabica.costPerBaseUnit) * 1000; // giá 1 kg
        const milkPackPrice = Number(ingMilk.costPerBaseUnit) * 1000; // giá 1 lít

        // PR 1: PENDING (AI đề xuất nhập Hạt Arabica)
        await prisma.purchaseRequest.create({
            data: {
                requestNumber: `AI-ING-${Date.now() - 3000}`,
                supplierId: supplier.id,
                status: PurchaseRequestStatus.PENDING,
                aiGenerated: true,
                totalAmount: new Prisma.Decimal(arabicaPackPrice * 5),
                requestedBy: admin.id,
                notes: `AI Agent đề xuất nhập 5 kg (5000 g) nguyên liệu "${ingArabica.name}" để đảm bảo định mức pha chế cho nhóm Espresso, Latte, Cappuccino, Caramel Macchiato.`,
                paymentStatus: "UNPAID",
                createdAt: now,
                updatedAt: now,
                items: {
                    create: [
                        {
                            ingredientId: ingArabica.id,
                            quantity: 5,
                            quantityReceived: 0,
                            unitPrice: new Prisma.Decimal(arabicaPackPrice),
                            notes: "Quy cách: 1 kg = 1000 g",
                        },
                    ],
                },
            },
        });

        // PR 2: APPROVED (Nhập Sữa tươi thanh trùng)
        await prisma.purchaseRequest.create({
            data: {
                requestNumber: `PR-ING-${Date.now() - 2000}`,
                supplierId: supplier.id,
                status: PurchaseRequestStatus.APPROVED,
                aiGenerated: false,
                totalAmount: new Prisma.Decimal(milkPackPrice * 12),
                requestedBy: admin.id,
                approvedBy: admin.id,
                approvedAt: past1Day,
                notes: `Nhập định kỳ 12 lít (12000 ml) nguyên liệu "${ingMilk.name}" phục vụ ca pha chế.`,
                paymentStatus: "UNPAID",
                createdAt: past1Day,
                updatedAt: past1Day,
                items: {
                    create: [
                        {
                            ingredientId: ingMilk.id,
                            quantity: 12,
                            quantityReceived: 0,
                            unitPrice: new Prisma.Decimal(milkPackPrice),
                            notes: "Quy cách: 1 l = 1000 ml",
                        },
                    ],
                },
            },
        });

        // PR 3: COMPLETED (Đã nhận kho nguyên liệu)
        await prisma.purchaseRequest.create({
            data: {
                requestNumber: `PR-ING-${Date.now() - 1000}`,
                supplierId: supplier.id,
                status: PurchaseRequestStatus.COMPLETED,
                aiGenerated: false,
                totalAmount: new Prisma.Decimal(arabicaPackPrice * 3),
                receivedAmount: new Prisma.Decimal(arabicaPackPrice * 3),
                amountPaid: new Prisma.Decimal(arabicaPackPrice * 3),
                requestedBy: admin.id,
                approvedBy: admin.id,
                approvedAt: past2Days,
                emailSentAt: past2Days,
                receivedAt: past1Day,
                paidAt: now,
                paymentStatus: "PAID",
                notes: `Đã nhập kho 3 kg (3000 g) nguyên liệu "${ingArabica.name}".`,
                createdAt: past2Days,
                updatedAt: now,
                items: {
                    create: [
                        {
                            ingredientId: ingArabica.id,
                            quantity: 3,
                            quantityReceived: 3,
                            unitPrice: new Prisma.Decimal(arabicaPackPrice),
                            notes: "Đã nhận đủ 3 kg (3000 g)",
                        },
                    ],
                },
            },
        });

        log("  + Đã tạo 3 Phiếu yêu cầu nhập nguyên liệu mẫu (PENDING, APPROVED, COMPLETED).");
    }

    // 4. Tạo Đơn hàng pha chế mẫu (gắn recipeId + giao dịch trừ kho Nguyên liệu) nếu chưa có
    const existingDrinkOrders = await prisma.order.count({
        where: { items: { some: { recipeId: { not: null } } } },
    });

    const drinkWithRecipe = drinks.find((d) => d.recipes.length > 0);
    if (existingDrinkOrders === 0 && drinkWithRecipe) {
        const recipe = drinkWithRecipe.recipes[0]!;
        const qty = 2;
        const total = Number(drinkWithRecipe.price) * qty;
        const now = new Date();
        const orderId = `ORD-DRK-${Date.now()}`;

        const ingredientCostPerCup = recipe.ingredients.reduce(
            (sum, ri) => sum + Number(ri.quantityBase) * Number(ri.ingredient.costPerBaseUnit),
            0
        );
        const totalIngCost = Math.round(ingredientCostPerCup * qty);
        const grossProfit = total - totalIngCost;

        const createdOrder = await prisma.order.create({
            data: {
                id: orderId,
                userId: customer.id,
                status: OrderStatus.COMPLETED,
                paymentStatus: PaymentStatus.PAID,
                paymentMethod: PaymentMethod.CASH,
                totalAmount: new Prisma.Decimal(total),
                shippingFee: new Prisma.Decimal(0),
                stockDeductedAt: now,
                items: {
                    create: [
                        {
                            productId: drinkWithRecipe.id,
                            recipeId: recipe.id,
                            quantity: qty,
                            price: drinkWithRecipe.price,
                            consumptionStatus: ConsumptionStatus.COMMITTED,
                            startedAt: now,
                            committedAt: now,
                            ingredientCost: new Prisma.Decimal(totalIngCost),
                            toppingCost: new Prisma.Decimal(0),
                            totalCost: new Prisma.Decimal(totalIngCost),
                            grossProfit: new Prisma.Decimal(grossProfit),
                        },
                    ],
                },
                payments: {
                    create: [
                        {
                            method: PaymentMethod.CASH,
                            merchantRef: `${orderId}_1`,
                            amount: new Prisma.Decimal(total),
                            status: TransactionStatus.PAID,
                            paidAt: now,
                        },
                    ],
                },
            },
            include: { items: true },
        });

        const orderItemId = createdOrder.items[0]!.id;
        for (const ri of recipe.ingredients) {
            const deductBase = Number(ri.quantityBase) * qty;
            const batch = await prisma.ingredientBatch.findFirst({
                where: { ingredientId: ri.ingredientId, quantityRemaining: { gte: deductBase } },
                orderBy: { receivedAt: "asc" },
            });
            if (batch) {
                await prisma.ingredientBatch.update({
                    where: { id: batch.id },
                    data: { quantityRemaining: { decrement: new Prisma.Decimal(deductBase) } },
                });
                await prisma.ingredient.update({
                    where: { id: ri.ingredientId },
                    data: { quantity: { decrement: new Prisma.Decimal(deductBase) } },
                });
                await prisma.inventoryTransaction.create({
                    data: {
                        ingredientId: ri.ingredientId,
                        batchId: batch.id,
                        orderItemId,
                        performedBy: admin.id,
                        type: InventoryTransactionType.DEDUCT,
                        quantity: new Prisma.Decimal(-deductBase),
                        unitCost: ri.ingredient.costPerBaseUnit,
                        totalCost: new Prisma.Decimal(Math.round(deductBase * Number(ri.ingredient.costPerBaseUnit))),
                        referenceType: "Order",
                        referenceId: createdOrder.id,
                        reason: `Xuất kho pha chế ${qty} ly ${drinkWithRecipe.name} (Đơn ${createdOrder.id})`,
                    },
                });
            }
        }
        log(`  + Đã tạo Đơn hàng pha chế mẫu COMPLETED (${createdOrder.id}) kèm giao dịch xuất kho nguyên liệu.`);
    }
}
