"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function runTest() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("=== STARTING RECEIVE TEST ===");
        // 1. Setup Data
        const supplier = yield prisma.supplier.findFirst({ where: { status: 'ACTIVE' } });
        if (!supplier)
            throw new Error("No active supplier found");
        const product = yield prisma.product.findFirst({
            include: { inventory: true, supplierProducts: true }
        });
        if (!product || !product.inventory)
            throw new Error("No product with inventory found");
        const user = yield prisma.user.findFirst();
        if (!user)
            throw new Error("No user found");
        const adminId = user.id;
        // Create PR APPROVED, No Email Sent
        const pr1 = yield prisma.purchaseRequest.create({
            data: {
                status: 'APPROVED',
                requestNumber: `PR-${Date.now()}-1`,
                supplier: { connect: { id: supplier.id } },
                requester: { connect: { id: adminId } },
                notes: 'Test PR 1',
                totalAmount: 1000,
                items: {
                    create: {
                        productId: product.id,
                        quantity: 1,
                        unitPrice: 1000,
                        inventoryId: product.inventory.id,
                    }
                }
            },
            include: { items: true }
        });
        console.log("PR1 Created:", pr1.id, pr1.status);
        // Test 1: Try to receive PR1 (Should Fail)
        try {
            const { purchaseService } = require('./src/modules/purchase/purchase.service');
            yield purchaseService.receive(pr1.id, {
                notes: "Test receive 1",
                items: [{ purchaseRequestItemId: pr1.items[0].id, receivedQuantity: 10 }]
            }, adminId);
            console.log("FAIL: Test 1 should have thrown an error but succeeded.");
        }
        catch (e) {
            console.log("PASS Test 1: Received expected error:", e.message);
        }
        // Create PR SENT
        const initialStock = product.inventory.quantity;
        const pr2 = yield prisma.purchaseRequest.create({
            data: {
                status: 'SENT',
                requestNumber: `PR-${Date.now()}-2`,
                emailSentAt: new Date(),
                supplier: { connect: { id: supplier.id } },
                requester: { connect: { id: adminId } },
                notes: 'Test PR 2',
                totalAmount: 2000,
                items: {
                    create: {
                        productId: product.id,
                        quantity: 1,
                        unitPrice: 2000,
                        inventoryId: product.inventory.id,
                    }
                }
            },
            include: { items: true }
        });
        console.log("\nPR2 Created:", pr2.id, pr2.status);
        console.log("Initial Stock:", initialStock);
        // Test 2 & 3: Receive PR2 (Should Succeed & Convert 32)
        try {
            const { purchaseService } = require('./src/modules/purchase/purchase.service');
            const result = yield purchaseService.receive(pr2.id, {
                notes: "Test receive 2",
                items: [{ purchaseRequestItemId: pr2.items[0].id, receivedQuantity: 32 }]
            }, adminId);
            const updatedInv = yield prisma.inventory.findUnique({ where: { id: product.inventory.id } });
            console.log("Stock after receive:", updatedInv === null || updatedInv === void 0 ? void 0 : updatedInv.quantity);
            console.log("PR2 New Status:", result.purchaseRequest.status);
            if ((updatedInv === null || updatedInv === void 0 ? void 0 : updatedInv.quantity) === initialStock + 32) {
                console.log("PASS Test 2 & 3: Successfully received and incremented stock by 32.");
            }
            else {
                console.log("FAIL Test 2 & 3: Stock incremented incorrectly.");
            }
            // Test 4: Receive PR2 Again (Should Fail)
            try {
                yield purchaseService.receive(pr2.id, {
                    notes: "Test receive 3",
                    items: [{ purchaseRequestItemId: pr2.items[0].id, receivedQuantity: 32 }]
                }, adminId);
                console.log("FAIL Test 4: Double receive should have thrown an error.");
            }
            catch (e) {
                console.log("PASS Test 4: Double receive blocked with error:", e.message);
            }
        }
        catch (e) {
            console.log("FAIL Test 2 & 3 threw error:", e);
        }
        // Wait a few seconds for Agent to process background scan and check logs
        console.log("\nWaiting 3 seconds for Agent logs...");
        yield new Promise(r => setTimeout(r, 3000));
        const recentLog = yield prisma.agentLog.findFirst({
            orderBy: { createdAt: 'desc' },
            where: { action: { in: ['SCAN_INVENTORY_STOCK_OK', 'SCAN_INVENTORY_WARNING'] } }
        });
        if (recentLog) {
            console.log("PASS Test 5: Notification log found:", recentLog.action);
            console.log("Log output notification:", JSON.parse(recentLog.output).notification);
        }
        else {
            console.log("FAIL Test 5: No notification log found.");
        }
        // Cleanup
        yield prisma.purchaseRequestItem.deleteMany({ where: { purchaseRequestId: { in: [pr1.id, pr2.id] } } });
        yield prisma.purchaseRequest.deleteMany({ where: { id: { in: [pr1.id, pr2.id] } } });
        yield prisma.inventory.update({ where: { id: product.inventory.id }, data: { quantity: initialStock } });
        console.log("\nCleanup done.");
    });
}
runTest().catch(console.error).finally(() => prisma.$disconnect());
