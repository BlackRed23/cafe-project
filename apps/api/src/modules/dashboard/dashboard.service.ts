import { auditDto, auditInclude } from '../agent/agent-audit';
import { Prisma, prisma } from '@cafe-project/database';
import { PurchaseRequestStatus, OrderStatus } from '@cafe-project/database';

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

        const inventories = await prisma.ingredient.findMany({ where: { isActive: true, deletedAt: null } });
        const lowStockCount = inventories.filter(inv => inv.quantity.minus(inv.reserved).lte(inv.minThreshold) && inv.quantity.minus(inv.reserved).gt(0)).length;
        const outOfStockCount = inventories.filter(inv => inv.quantity.minus(inv.reserved).lte(0)).length;

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
        const inventories = await prisma.ingredient.findMany({ where: { isActive: true, deletedAt: null } });
        const grouped = new Map<string, Prisma.Decimal>();
        for (const inv of inventories) grouped.set(inv.baseUnit, (grouped.get(inv.baseUnit) ?? new Prisma.Decimal(0)).plus(inv.quantity));
        const quantitiesByUnit = [...grouped].map(([unit, amount]) => ({ unit, quantity: Number(amount) }));
        const totalQuantity = quantitiesByUnit.length === 1 ? quantitiesByUnit[0]!.quantity : null;
        const lowStockCount = inventories.filter(inv => inv.quantity.minus(inv.reserved).lte(inv.minThreshold) && inv.quantity.minus(inv.reserved).gt(0)).length;
        const outOfStockCount = inventories.filter(inv => inv.quantity.minus(inv.reserved).lte(0)).length;

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
        const totalLogs = await prisma.agentExecution.count();
        const todayScans = await prisma.agentExecution.count({
            where: {
                intent: { contains: 'SCAN' },
                startedAt: {
                    gte: startOfToday
                }
            }
        });

        // 7. Revenue
        const completedOrdersList = await prisma.order.findMany({
            where: {
                status: OrderStatus.COMPLETED
            },
            select: {
                totalAmount: true
            }
        });
        const totalRevenue = completedOrdersList.reduce((sum, order) => sum + Number(order.totalAmount), 0);

        // Get details of the last AI recommendation scan for the dashboard AI widget
        const lastExecution = await prisma.agentExecution.findFirst({ where: { intent: { contains: 'SCAN' } }, orderBy: { startedAt: 'desc' }, include: auditInclude });
        const lastScanLog = lastExecution ? auditDto(lastExecution) : null;
        const recommended = lastScanLog?.output.recommendedSupplierId;
        const supplier = typeof recommended === 'string' ? await prisma.supplier.findUnique({ where: { id: recommended } }) : null;
        const aiWidgetDetails = lastScanLog ? { lastScanTime: lastScanLog.createdAt, reasoning: lastScanLog.reasoning, result: lastScanLog.result,
            lastSupplierSelected: supplier?.name ?? null, totalAiPurchaseRequests: await prisma.purchaseRequest.count({ where: { aiGenerated: true } }) } : null;

        return {
            products: {
                total: totalProducts
            },
            inventory: {
                totalQuantity,
                quantitiesByUnit,
                quantityUnit: quantitiesByUnit.length === 1 ? quantitiesByUnit[0]!.unit : null,
                lowStockCount,
                outOfStockCount
            },
            orders: {
                today: todayOrders,
                pending: pendingOrders,
                completed: completedOrders,
                totalRevenue
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

        // Build continuous timeline in local/UTC dates
        const revenueByDate: Record<string, number> = {};
        for (let i = 0; i < days; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0]!;
            revenueByDate[dateStr] = 0;
        }

        // Aggregate orders revenue
        for (const order of orders) {
            const dateStr = order.createdAt.toISOString().split('T')[0]!;
            if (revenueByDate[dateStr] !== undefined) {
                revenueByDate[dateStr] += Number(order.totalAmount);
            }
        }

        return Object.entries(revenueByDate).map(([date, revenue]) => ({
            date,
            revenue
        })).sort((a, b) => a.date.localeCompare(b.date));
    },

    async getLowStock() {
        const inventories = await prisma.ingredient.findMany({ where: { isActive: true, deletedAt: null } });
        return inventories.filter(inv => inv.quantity.minus(inv.reserved).lte(inv.minThreshold)).map(inv => ({
            ingredientId: inv.id, productName: inv.name, sku: inv.sku, quantity: Number(inv.quantity), availableStock: Number(inv.quantity.minus(inv.reserved)),
            threshold: Number(inv.minThreshold), unit: inv.baseUnit, status: inv.quantity.minus(inv.reserved).lte(0) ? 'OUT OF STOCK' : 'LOW STOCK'
        })).sort((a,b) => a.availableStock - b.availableStock);
    },

    async getRecentActivity() {
        // Fetch 5 latest order events
        const orders = await prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { user: true }
        });

        // Fetch 5 latest inventory imports
        const imports = await prisma.inventoryTransaction.findMany({
            where: {
                type: 'IMPORT'
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { ingredient: true }
        });

        // Fetch 5 latest AI actions
        const aiLogs = await prisma.agentExecution.findMany({
            take: 5,
            orderBy: { startedAt: 'desc' },
            include: auditInclude
        });

        // Fetch 5 latest Purchase Requests
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

        // Normalize Orders
        for (const order of orders) {
            activities.push({
                id: `order-${order.id}`,
                type: 'ORDER',
                title: `Order ${order.status}`,
                description: `Order total amount: ${Number(order.totalAmount).toLocaleString('vi-VN')} VND by ${order.user.name}`,
                timestamp: order.createdAt
            });
        }

        // Normalize Imports
        for (const imp of imports) {
            activities.push({
                id: `import-${imp.id}`,
                type: 'INVENTORY',
                title: `Goods Imported`,
                description: `Imported ${imp.quantity} unit(s) of ${imp.ingredient.name}. Reason: ${imp.reason || 'None'}`,
                timestamp: imp.createdAt
            });
        }

        // Normalize AI Logs
        for (const execution of aiLogs) {
            const log = auditDto(execution);
            activities.push({
                id: `ai-${log.id}`,
                type: 'AI',
                title: `AI Agent Action`,
                description: `Action: ${log.action} - Result: ${log.result || 'SKIPPED'}. Reasoning: ${log.reasoning || 'No details'}`,
                timestamp: log.createdAt
            });
        }

        // Normalize Purchase Requests
        for (const pr of prs) {
            activities.push({
                id: `pr-${pr.id}`,
                type: 'PURCHASE_REQUEST',
                title: `Purchase Request ${pr.status}`,
                description: `Request number: ${pr.requestNumber} for supplier ${pr.supplier.name} totaling ${Number(pr.totalAmount).toLocaleString('vi-VN')} VND`,
                timestamp: pr.createdAt
            });
        }

        // Sort descending by timestamp and take latest 10
        return activities
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 10);
    }
};
