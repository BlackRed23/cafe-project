import { PrismaClient, OrderStatus, PaymentStatus, PurchaseRequestStatus, InventoryTransactionType, PaymentMethod } from "@prisma/client";

export async function seedWorkflows(prisma: PrismaClient, log: (msg: string) => void) {
    log("\n[4/4] Nạp Dữ Liệu Luồng Nghiệp Vụ (Orders, Purchase Requests, Batches)...");
    
    let orderCounts = { PENDING: 0, PROCESSING: 0, COMPLETED: 0, CANCELLED: 0 };
    let prCounts = { PENDING: 0, APPROVED: 0, SENT: 0, RECEIVED: 0, COMPLETED: 0, REJECTED: 0, SENT_PARTIAL: 0 };
    let expiredBatchesCount = 0;

    const customer = await prisma.user.findFirst({ where: { role: "CUSTOMER" } });
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (!customer || !admin) {
        log("❌ Không tìm thấy user (CUSTOMER hoặc ADMIN) để seed workflows.");
        return;
    }

    const products = await prisma.product.findMany({
        where: { isActive: true },
        include: { inventory: { include: { batches: true } } },
        take: 2
    });

    if (products.length < 2 || !products[0].inventory || !products[1].inventory) {
        log("❌ Cần ít nhất 2 sản phẩm đã có inventory để seed workflows.");
        return;
    }

    const prod1 = products[0];
    const prod2 = products[1];
    const inv1 = prod1.inventory!;
    const inv2 = prod2.inventory!;

    // 1. Seed Expired Batch for prod1
    const past30Days = new Date();
    past30Days.setDate(past30Days.getDate() - 30);
    
    // Check if expired batch already exists
    const existingExpired = await prisma.inventoryBatch.findFirst({
        where: { inventoryId: inv1.id, batchCode: `BATCH-EXPIRED-${prod1.sku}` }
    });

    if (!existingExpired) {
        await prisma.inventoryBatch.create({
            data: {
                inventoryId: inv1.id,
                batchCode: `BATCH-EXPIRED-${prod1.sku}`,
                quantity: 10,
                expirationDate: past30Days
            }
        });
        // We also need to add 10 to inventory quantity to match the batch
        await prisma.inventory.update({
            where: { id: inv1.id },
            data: { quantity: { increment: 10 } }
        });
        log(`  + Đã tạo Lô hàng hết hạn cho sản phẩm ${prod1.sku} (BATCH-EXPIRED-${prod1.sku})`);
        expiredBatchesCount++;
    }

    // Dates
    const now = new Date();
    const past3Days = new Date(now); past3Days.setDate(now.getDate() - 3);
    const past2Days = new Date(now); past2Days.setDate(now.getDate() - 2);
    const past1Day = new Date(now); past1Day.setDate(now.getDate() - 1);

    // Helpers
    const createOrder = async (
        status: OrderStatus,
        paymentStatus: PaymentStatus,
        createdAt: Date,
        updatedAt: Date,
        paidAt: Date | null,
        stockDeductedAt: Date | null,
        isRefunded: boolean = false
    ) => {
        const id = `ORDER-SEED-${status}-${paymentStatus}-${Date.now()}`;
        const total = Number(prod1.price) * 2;
        
        const order = await prisma.order.create({
            data: {
                id,
                userId: customer.id,
                status,
                totalAmount: total,
                shippingFee: 0,
                createdAt,
                updatedAt,
                stockDeductedAt,
                items: {
                    create: [
                        { productId: prod1.id, quantity: 2, price: prod1.price }
                    ]
                },
                payment: {
                    create: {
                        method: PaymentMethod.CASH,
                        amount: total,
                        status: paymentStatus,
                        paidAt,
                        createdAt,
                        updatedAt
                    }
                }
            }
        });

        // Generate transactions/stock changes based on status
        if (status === "PENDING" || status === "PROCESSING") {
            // Reserve stock
            await prisma.inventory.update({
                where: { id: inv1.id },
                data: { reservedStock: { increment: 2 } }
            });
            await prisma.inventoryTransaction.create({
                data: { productId: prod1.id, userId: customer.id, type: InventoryTransactionType.ORDER, quantity: 2, reason: `Giữ hàng cho đơn ${id}`, createdAt }
            });
        } else if (status === "COMPLETED") {
            // Deduct stock
            await prisma.inventory.update({
                where: { id: inv1.id },
                data: { quantity: { decrement: 2 } }
            });
            // We assume there's a valid batch because seed_cafe.ts creates one with 50 qty
            const validBatch = await prisma.inventoryBatch.findFirst({
                where: { inventoryId: inv1.id, expirationDate: { gte: new Date() }, quantity: { gte: 2 } }
            });
            if (validBatch) {
                await prisma.inventoryBatch.update({
                    where: { id: validBatch.id },
                    data: { quantity: { decrement: 2 } }
                });
                await prisma.inventoryTransaction.create({
                    data: { productId: prod1.id, userId: admin.id, type: InventoryTransactionType.ORDER, quantity: -2, reason: `Trừ kho thật cho đơn ${id}`, batchId: validBatch.id, createdAt: stockDeductedAt || updatedAt }
                });
            }
        } else if (status === "CANCELLED") {
            // Release stock - wait, if it was cancelled, it released stock. 
            // We simulate the end result: no reserved stock, but we write the cancel transaction for history
            await prisma.inventoryTransaction.create({
                data: { productId: prod1.id, userId: admin.id, type: InventoryTransactionType.CANCEL, quantity: -2, reason: `Nhả giữ hàng cho đơn ${id}`, createdAt: updatedAt }
            });
        }

        orderCounts[status]++;
        log(`  + Đã tạo Order: ${status} / Payment: ${paymentStatus}`);
    };

    // 2. Seed Orders
    await createOrder("PENDING", "PENDING", now, now, null, null);
    await createOrder("PROCESSING", "PAID", past1Day, now, now, null);
    await createOrder("COMPLETED", "PAID", past3Days, past1Day, past2Days, past1Day);
    await createOrder("COMPLETED", "PENDING", past3Days, past1Day, null, past1Day);
    await createOrder("CANCELLED", "FAILED", past2Days, past1Day, null, null);
    await createOrder("CANCELLED", "REFUNDED", past3Days, past1Day, past2Days, null, true);

    // 3. Ensure Supplier
    let supplier = await prisma.supplier.findFirst({ where: { status: "ACTIVE" } });
    if (!supplier) {
        supplier = await prisma.supplier.create({
            data: {
                name: "Nhà Cung Cấp Seed",
                contact: "Mr. Seed",
                email: "seed@supplier.com",
                status: "ACTIVE"
            }
        });
        log(`  + Đã tạo Supplier: ${supplier.name}`);
    }

    // PR Helpers
    const createPR = async (
        status: PurchaseRequestStatus,
        paymentStatus: string,
        aiGenerated: boolean,
        partial: boolean = false,
        createdAt: Date = now,
        updatedAt: Date = now,
        approvedAt: Date | null = null,
        emailSentAt: Date | null = null,
        receivedAt: Date | null = null,
        paidAt: Date | null = null
    ) => {
        const id = `PR-SEED-${status}-${Date.now()}`;
        const qty = 10;
        const price = 50000;
        const receivedQty = partial ? 5 : (status === "RECEIVED" || status === "COMPLETED" ? qty : 0);

        const pr = await prisma.purchaseRequest.create({
            data: {
                id,
                requestNumber: id,
                supplierId: supplier!.id,
                status,
                aiGenerated,
                totalAmount: qty * price,
                requestedBy: admin.id,
                notes: aiGenerated ? "Hệ thống đề xuất nhập hàng do tồn kho thấp." : "Nhân viên yêu cầu nhập thêm.",
                approvedBy: approvedAt ? admin.id : undefined,
                approvedAt,
                emailSentAt,
                receivedAt,
                paymentStatus,
                paidAt,
                receivedAmount: receivedQty * price,
                amountPaid: paidAt ? receivedQty * price : 0,
                createdAt,
                updatedAt,
                items: {
                    create: [
                        {
                            inventoryId: inv2.id,
                            productId: prod2.id,
                            quantity: qty,
                            quantityReceived: receivedQty,
                            unitPrice: price
                        }
                    ]
                }
            }
        });

        // If received (partial or full), adjust inventory
        if (receivedQty > 0) {
            await prisma.inventory.update({
                where: { id: inv2.id },
                data: { quantity: { increment: receivedQty } }
            });
            const batch = await prisma.inventoryBatch.create({
                data: {
                    inventoryId: inv2.id,
                    batchCode: `BATCH-PR-${id}`,
                    quantity: receivedQty,
                    expirationDate: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
                }
            });
            await prisma.inventoryTransaction.create({
                data: { productId: prod2.id, userId: admin.id, type: InventoryTransactionType.IMPORT, quantity: receivedQty, reason: `Nhập lô ${batch.batchCode} từ PR ${id}`, batchId: batch.id, createdAt: receivedAt || updatedAt }
            });
        }

        if (partial) {
            prCounts.SENT_PARTIAL++;
            log(`  + Đã tạo PR: SENT (Partial Receive) / Payment: ${paymentStatus}`);
        } else {
            prCounts[status]++;
            log(`  + Đã tạo PR: ${status} / Payment: ${paymentStatus} (AI: ${aiGenerated})`);
        }
    };

    // 4. Seed PRs
    await createPR("PENDING", "UNPAID", true, false, now, now); // AI Generated
    await createPR("PENDING", "UNPAID", false, false, now, now); // Manual
    await createPR("APPROVED", "UNPAID", false, false, past1Day, past1Day, past1Day);
    await createPR("SENT", "UNPAID", false, false, past2Days, past2Days, past2Days, past2Days);
    await createPR("SENT", "UNPAID", false, true, past3Days, past1Day, past3Days, past3Days, past1Day); // Partial Receive
    await createPR("RECEIVED", "UNPAID", false, false, past3Days, past1Day, past3Days, past2Days, past1Day);
    await createPR("COMPLETED", "PAID", false, false, past3Days, now, past3Days, past2Days, past1Day, now);
    await createPR("REJECTED", "UNPAID", false, false, past1Day, now); // Rejected from PENDING
    await createPR("REJECTED", "UNPAID", false, false, past3Days, now, past2Days, past1Day); // Rejected from SENT

    log("\n==================================================");
    log(`🎯 TỔNG KẾT WORKFLOW SEED:`);
    log(`- Đơn hàng (Order):`);
    log(`  * PENDING: ${orderCounts.PENDING}`);
    log(`  * PROCESSING: ${orderCounts.PROCESSING}`);
    log(`  * COMPLETED: ${orderCounts.COMPLETED}`);
    log(`  * CANCELLED: ${orderCounts.CANCELLED}`);
    log(`- Yêu cầu nhập hàng (Purchase Request):`);
    log(`  * PENDING: ${prCounts.PENDING}`);
    log(`  * APPROVED: ${prCounts.APPROVED}`);
    log(`  * SENT: ${prCounts.SENT}`);
    log(`  * SENT (Partial): ${prCounts.SENT_PARTIAL}`);
    log(`  * RECEIVED: ${prCounts.RECEIVED}`);
    log(`  * COMPLETED: ${prCounts.COMPLETED}`);
    log(`  * REJECTED: ${prCounts.REJECTED}`);
    log(`- Lô hàng (Batches):`);
    log(`  * Đã tạo ${expiredBatchesCount} lô hàng EXPIRED để test.`);
    log(`- Sản phẩm được tham chiếu (Re-used existing products):`);
    log(`  * ${prod1.sku} - ${prod1.name}`);
    log(`  * ${prod2.sku} - ${prod2.name}`);
    log("==================================================");
}
