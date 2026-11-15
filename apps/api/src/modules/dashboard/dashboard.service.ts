import { InventoryTransactionType, OrderStatus, Prisma, PurchaseRequestStatus, prisma } from '@cafe-project/database';
import { roundMoney2, toDecimal } from '../../common/ingredient-cost.utils';

export const dashboardService = {
    async getStaffSummary() {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const todayOrders = await prisma.order.count({
            where: {
                createdAt: {
                    gte: startOfToday
                }
            }
        });

        const inventories = await prisma.inventory.findMany();
        const lowStockCount = inventories.filter((inv: { quantity: number; minThreshold: number }) => inv.quantity <= inv.minThreshold && inv.quantity > 0).length;
        const outOfStockCount = inventories.filter((inv: { quantity: number }) => inv.quantity <= 0).length;

        const prPendingReceive = await prisma.purchaseRequest.count({
            where: { status: PurchaseRequestStatus.SENT }
        });

        return {
            orders: {
                today: todayOrders
            },
            inventory: {
                lowStockCount,
                outOfStockCount
            },
            purchaseRequests: {
                pendingReceive: prPendingReceive
            }
        };
    },

    async getSummary() {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // 1. Products count
        const totalProducts = await prisma.product.count();

        // 2. Inventory metrics
        const inventories = await prisma.inventory.findMany();
        const totalQuantity = inventories.reduce((sum: number, inv: { quantity: number }) => sum + inv.quantity, 0);
        const lowStockCount = inventories.filter((inv: { quantity: number; minThreshold: number }) => inv.quantity <= inv.minThreshold && inv.quantity > 0).length;
        const outOfStockCount = inventories.filter((inv: { quantity: number }) => inv.quantity <= 0).length;

        // 3. Orders metrics
        const todayOrders = await prisma.order.count({
            where: {
                createdAt: {
                    gte: startOfToday
                }
            }
        });
        const pendingOrders = await prisma.order.count({
            where: {
                status: OrderStatus.PENDING
            }
        });
        const completedOrders = await prisma.order.count({
            where: {
                status: OrderStatus.COMPLETED
            }
        });

        // 4. Purchase Requests metrics
        const prPending = await prisma.purchaseRequest.count({
            where: { status: PurchaseRequestStatus.PENDING }
        });
        const prApproved = await prisma.purchaseRequest.count({
            where: { status: PurchaseRequestStatus.APPROVED }
        });
        const prSent = await prisma.purchaseRequest.count({
            where: { status: PurchaseRequestStatus.SENT }
        });
        const prCompleted = await prisma.purchaseRequest.count({
            where: { status: PurchaseRequestStatus.COMPLETED }
        });

        // 5. Suppliers count
        const totalSuppliers = await prisma.supplier.count();

        // 6. AI metrics
        const totalLogs = await prisma.agentLog.count();
        const todayScans = await prisma.agentLog.count({
            where: {
                action: {
                    startsWith: 'SCAN_INVENTORY'
                },
                triggered_at: {
                    gte: startOfToday
                }
            }
        });

        // 7. Revenue, COGS & Gross Profit from COMPLETED orders
        const completedOrdersList = await prisma.order.findMany({
            where: {
                status: OrderStatus.COMPLETED
            },
            include: {
                items: {
                    include: {
                        product: { select: { costPrice: true } },
                        toppings: true
                    }
                }
            }
        });

        let totalRevenueDecimal = new Prisma.Decimal(0);
        let itemsRevenueDecimal = new Prisma.Decimal(0);
        let totalCogsDecimal = new Prisma.Decimal(0);
        let totalGrossProfitDecimal = new Prisma.Decimal(0);

        for (const order of completedOrdersList) {
            totalRevenueDecimal = totalRevenueDecimal.add(toDecimal(order.totalAmount));
            for (const item of order.items) {
                const toppingRev = (item.toppings ?? []).reduce(
                    (s, t) => s.add(toDecimal(t.price).mul(t.quantity)),
                    new Prisma.Decimal(0)
                );
                const lineRevenue = toDecimal(item.price).mul(item.quantity).add(toppingRev);
                const hasSnapshot = toDecimal(item.totalCost).gt(0) || !toDecimal(item.grossProfit).equals(0);
                const lineCost = hasSnapshot
                    ? toDecimal(item.totalCost)
                    : toDecimal(item.product?.costPrice ?? 0).mul(item.quantity);
                const lineProfit = hasSnapshot
                    ? toDecimal(item.grossProfit)
                    : lineRevenue.sub(lineCost);

                itemsRevenueDecimal = itemsRevenueDecimal.add(lineRevenue);
                totalCogsDecimal = totalCogsDecimal.add(lineCost);
                totalGrossProfitDecimal = totalGrossProfitDecimal.add(lineProfit);
            }
        }

        const totalRevenue = Number(roundMoney2(totalRevenueDecimal));
        const totalCogs = Number(roundMoney2(totalCogsDecimal));
        const grossProfit = Number(roundMoney2(totalGrossProfitDecimal));
        const grossMarginPercent = itemsRevenueDecimal.gt(0)
            ? Number(
                  totalGrossProfitDecimal
                      .div(itemsRevenueDecimal)
                      .mul(100)
                      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
              )
            : 0;

        const lastScanLog = await prisma.agentLog.findFirst({
            where: {
                action: {
                    startsWith: 'SCAN_INVENTORY'
                }
            },
            orderBy: {
                triggered_at: 'desc'
            },
            include: {
                creator: {
                    select: {
                        name: true
                    }
                }
            }
        });

        let aiWidgetDetails = null;
        if (lastScanLog) {
            let lastSupplierName = null;
            if (lastScanLog.output) {
                try {
                    const outputData = JSON.parse(lastScanLog.output);
                    if (outputData.recommendedSupplierId) {
                        const supplier = await prisma.supplier.findUnique({
                            where: { id: outputData.recommendedSupplierId }
                        });
                        lastSupplierName = supplier?.name || null;
                    }
                } catch {
                    // Ignore JSON parsing errors
                }
            }

            aiWidgetDetails = {
                lastScanTime: lastScanLog.triggered_at,
                reasoning: lastScanLog.reasoning,
                result: lastScanLog.result,
                lastSupplierSelected: lastSupplierName,
                totalAiPurchaseRequests: await prisma.purchaseRequest.count({
                    where: { aiGenerated: true }
                })
            };
        }

        return {
            products: {
                total: totalProducts
            },
            inventory: {
                totalQuantity,
                lowStockCount,
                outOfStockCount
            },
            orders: {
                today: todayOrders,
                pending: pendingOrders,
                completed: completedOrders,
                totalRevenue,
                totalCogs,
                grossProfit,
                grossMarginPercent
            },
            purchaseRequests: {
                pending: prPending,
                approved: prApproved,
                sent: prSent,
                completed: prCompleted
            },
            suppliers: {
                total: totalSuppliers
            },
            ai: {
                totalLogs,
                todayScans,
                widget: aiWidgetDetails
            }
        };
    },

    async getRevenue(days: number) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        const orders = await prisma.order.findMany({
            where: {
                status: OrderStatus.COMPLETED,
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                totalAmount: true,
                createdAt: true
            }
        });

        const revenueByDate: Record<string, number> = {};
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0]!;
            revenueByDate[dateStr] = 0;
        }

        for (const order of orders) {
            const dateStr = order.createdAt.toISOString().split('T')[0]!;
            if (revenueByDate[dateStr] !== undefined) {
                revenueByDate[dateStr] += Number(order.totalAmount);
            }
        }

        return Object.entries(revenueByDate)
            .map(([date, revenue]) => ({
                date,
                revenue
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getProfit(days: number) {
        const safeDays = Math.max(1, Math.min(365, days || 30));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - safeDays + 1);
        startDate.setHours(0, 0, 0, 0);

        const orders = await prisma.order.findMany({
            where: {
                status: OrderStatus.COMPLETED,
                createdAt: {
                    gte: startDate
                }
            },
            include: {
                items: {
                    include: {
                        product: { select: { costPrice: true } },
                        toppings: true
                    }
                }
            }
        });

        const byDate: Record<string, { revenue: Prisma.Decimal; cogs: Prisma.Decimal; grossProfit: Prisma.Decimal }> = {};
        for (let i = 0; i < safeDays; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0]!;
            byDate[dateStr] = {
                revenue: new Prisma.Decimal(0),
                cogs: new Prisma.Decimal(0),
                grossProfit: new Prisma.Decimal(0)
            };
        }

        for (const order of orders) {
            const dateStr = order.createdAt.toISOString().split('T')[0]!;
            const bucket = byDate[dateStr];
            if (!bucket) continue;

            for (const item of order.items) {
                const toppingRev = (item.toppings ?? []).reduce(
                    (s, t) => s.add(toDecimal(t.price).mul(t.quantity)),
                    new Prisma.Decimal(0)
                );
                const lineRevenue = toDecimal(item.price).mul(item.quantity).add(toppingRev);
                const hasSnapshot = toDecimal(item.totalCost).gt(0) || !toDecimal(item.grossProfit).equals(0);
                const lineCogs = hasSnapshot
                    ? toDecimal(item.totalCost)
                    : toDecimal(item.product?.costPrice ?? 0).mul(item.quantity);
                const lineProfit = hasSnapshot
                    ? toDecimal(item.grossProfit)
                    : lineRevenue.sub(lineCogs);

                bucket.revenue = bucket.revenue.add(lineRevenue);
                bucket.cogs = bucket.cogs.add(lineCogs);
                bucket.grossProfit = bucket.grossProfit.add(lineProfit);
            }
        }

        return Object.entries(byDate)
            .map(([date, val]) => ({
                date,
                revenue: Number(roundMoney2(val.revenue)),
                cogs: Number(roundMoney2(val.cogs)),
                grossProfit: Number(roundMoney2(val.grossProfit))
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getProductMargins(days: number) {
        const safeDays = Math.max(1, Math.min(365, days || 30));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - safeDays + 1);
        startDate.setHours(0, 0, 0, 0);

        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: OrderStatus.COMPLETED,
                    createdAt: { gte: startDate }
                }
            },
            include: {
                product: true,
                toppings: true
            }
        });

        const map = new Map<
            string,
            {
                productId: string;
                productName: string;
                productSku: string;
                currentPrice: number;
                currentCostPrice: number;
                soldQty: number;
                revenue: Prisma.Decimal;
                cogs: Prisma.Decimal;
                grossProfit: Prisma.Decimal;
            }
        >();

        for (const item of orderItems) {
            const toppingRev = (item.toppings ?? []).reduce(
                (s, t) => s.add(toDecimal(t.price).mul(t.quantity)),
                new Prisma.Decimal(0)
            );
            const lineRevenue = toDecimal(item.price).mul(item.quantity).add(toppingRev);
            const hasSnapshot = toDecimal(item.totalCost).gt(0) || !toDecimal(item.grossProfit).equals(0);
            const lineCogs = hasSnapshot
                ? toDecimal(item.totalCost)
                : toDecimal(item.product.costPrice).mul(item.quantity);
            const lineProfit = hasSnapshot
                ? toDecimal(item.grossProfit)
                : lineRevenue.sub(lineCogs);

            const prev = map.get(item.productId) ?? {
                productId: item.productId,
                productName: item.product.name,
                productSku: item.product.sku,
                currentPrice: Number(item.product.price),
                currentCostPrice: Number(item.product.costPrice),
                soldQty: 0,
                revenue: new Prisma.Decimal(0),
                cogs: new Prisma.Decimal(0),
                grossProfit: new Prisma.Decimal(0)
            };

            prev.soldQty += item.quantity;
            prev.revenue = prev.revenue.add(lineRevenue);
            prev.cogs = prev.cogs.add(lineCogs);
            prev.grossProfit = prev.grossProfit.add(lineProfit);
            map.set(item.productId, prev);
        }

        return Array.from(map.values())
            .map((entry) => {
                const marginPercent = entry.revenue.gt(0)
                    ? Number(
                          entry.grossProfit
                              .div(entry.revenue)
                              .mul(100)
                              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
                      )
                    : 0;
                return {
                    productId: entry.productId,
                    productName: entry.productName,
                    productSku: entry.productSku,
                    currentPrice: entry.currentPrice,
                    currentCostPrice: entry.currentCostPrice,
                    soldQty: entry.soldQty,
                    revenue: Number(roundMoney2(entry.revenue)),
                    cogs: Number(roundMoney2(entry.cogs)),
                    grossProfit: Number(roundMoney2(entry.grossProfit)),
                    marginPercent
                };
            })
            .sort((a, b) => b.grossProfit - a.grossProfit);
    },

    async getIngredientUsage(days: number) {
        const safeDays = Math.max(1, Math.min(365, days || 30));
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - safeDays + 1);
        startDate.setHours(0, 0, 0, 0);

        const ingredients = await prisma.ingredient.findMany({
            where: { deletedAt: null },
            include: {
                batches: {
                    where: { quantityRemaining: { gt: 0 } }
                }
            },
            orderBy: { name: 'asc' }
        });

        const txns = await prisma.inventoryTransaction.findMany({
            where: {
                ingredientId: { not: null },
                type: { in: [InventoryTransactionType.CONSUME, InventoryTransactionType.WASTE] },
                createdAt: { gte: startDate }
            }
        });

        const usageByIng = new Map<
            string,
            {
                consumeQty: Prisma.Decimal;
                consumeCost: Prisma.Decimal;
                wasteQty: Prisma.Decimal;
                wasteCost: Prisma.Decimal;
            }
        >();

        for (const tx of txns) {
            if (!tx.ingredientId) continue;
            const cur = usageByIng.get(tx.ingredientId) ?? {
                consumeQty: new Prisma.Decimal(0),
                consumeCost: new Prisma.Decimal(0),
                wasteQty: new Prisma.Decimal(0),
                wasteCost: new Prisma.Decimal(0)
            };

            const absQty = toDecimal(tx.quantity).abs();
            const cost = toDecimal(tx.totalCost).abs();

            if (tx.type === InventoryTransactionType.CONSUME) {
                cur.consumeQty = cur.consumeQty.add(absQty);
                cur.consumeCost = cur.consumeCost.add(cost);
            } else if (tx.type === InventoryTransactionType.WASTE) {
                cur.wasteQty = cur.wasteQty.add(absQty);
                cur.wasteCost = cur.wasteCost.add(cost);
            }
            usageByIng.set(tx.ingredientId, cur);
        }

        return ingredients.map((ing) => {
            const u = usageByIng.get(ing.id);
            const batchValue = ing.batches.reduce(
                (sum, b) => sum.add(toDecimal(b.quantityRemaining).mul(toDecimal(b.unitCost))),
                new Prisma.Decimal(0)
            );
            const stockValue = ing.batches.length > 0
                ? roundMoney2(batchValue)
                : roundMoney2(toDecimal(ing.quantity).mul(toDecimal(ing.costPerBaseUnit)));

            return {
                ingredientId: ing.id,
                ingredientName: ing.name,
                ingredientSku: ing.sku,
                baseUnit: ing.baseUnit,
                costPerBaseUnit: Number(ing.costPerBaseUnit),
                consumeQty: Number(u?.consumeQty ?? 0),
                consumeCost: Number(roundMoney2(u?.consumeCost ?? new Prisma.Decimal(0))),
                wasteQty: Number(u?.wasteQty ?? 0),
                wasteCost: Number(roundMoney2(u?.wasteCost ?? new Prisma.Decimal(0))),
                currentQuantity: Number(ing.quantity),
                currentStockValue: Number(stockValue)
            };
        });
    },

    async getLowStock() {
        const inventories = await prisma.inventory.findMany({
            include: {
                product: true
            }
        });

        return inventories
            .filter((inv: { quantity: number; minThreshold: number }) => inv.quantity <= inv.minThreshold)
            .map((inv: any) => ({
                productName: inv.product.name,
                sku: inv.product.sku,
                quantity: inv.quantity,
                threshold: inv.minThreshold,
                status: inv.quantity <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'
            }))
            .sort((a: { quantity: number }, b: { quantity: number }) => a.quantity - b.quantity);
    },

    async getRecentActivity() {
        const orders = await prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: true }
        });

        const imports = await prisma.inventoryTransaction.findMany({
            where: {
                type: 'IMPORT'
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { ingredient: true }
        });

        const importProductIds = Array.from(
            new Set(imports.map((i) => i.productId).filter((id): id is string => Boolean(id)))
        );
        const importProducts = importProductIds.length > 0
            ? await prisma.product.findMany({ where: { id: { in: importProductIds } } })
            : [];
        const productById = new Map(importProducts.map((p) => [p.id, p]));

        const aiLogs = await prisma.agentLog.findMany({
            take: 5,
            orderBy: { triggered_at: 'desc' }
        });

        const prs = await prisma.purchaseRequest.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { supplier: true }
        });

        const activities: Array<{
            id: string;
            type: 'ORDER' | 'INVENTORY' | 'AI' | 'PURCHASE_REQUEST';
            title: string;
            description: string;
            timestamp: Date;
        }> = [];

        for (const order of orders) {
            activities.push({
                id: `order-${order.id}`,
                type: 'ORDER',
                title: `Order ${order.status}`,
                description: `Order total amount: ${Number(order.totalAmount).toLocaleString('vi-VN')} VND by ${order.user.name}`,
                timestamp: order.createdAt
            });
        }

        for (const imp of imports) {
            const targetName = imp.ingredient?.name ?? (imp.productId ? productById.get(imp.productId)?.name : null) ?? 'Item';
            activities.push({
                id: `import-${imp.id}`,
                type: 'INVENTORY',
                title: `Goods Imported`,
                description: `Imported ${Number(imp.quantity)} unit(s) of ${targetName}. Reason: ${imp.reason || 'None'}`,
                timestamp: imp.createdAt
            });
        }

        for (const log of aiLogs) {
            activities.push({
                id: `ai-${log.id}`,
                type: 'AI',
                title: `AI Agent Action`,
                description: `Action: ${log.action} - Result: ${log.result || 'SKIPPED'}. Reasoning: ${log.reasoning || 'No details'}`,
                timestamp: log.triggered_at
            });
        }

        for (const pr of prs) {
            activities.push({
                id: `pr-${pr.id}`,
                type: 'PURCHASE_REQUEST',
                title: `Purchase Request ${pr.status}`,
                description: `Request number: ${pr.requestNumber} for supplier ${pr.supplier.name} totaling ${Number(pr.totalAmount).toLocaleString('vi-VN')} VND`,
                timestamp: pr.createdAt
            });
        }

        return activities
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 10);
    }
};
