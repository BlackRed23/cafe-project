import { prisma } from '@cafe-project/database';
import { PurchaseRequestStatus, OrderStatus } from '@cafe-project/database';

export const dashboardService = {
    async getSummary() {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // 1. Products count
        const totalProducts = await prisma.product.count();

        // 2. Inventory metrics
        const inventories = await prisma.inventory.findMany();
        const totalQuantity = inventories.reduce((sum, inv) => sum + inv.quantity, 0);
        const lowStockCount = inventories.filter((inv) => inv.quantity <= inv.minThreshold && inv.quantity > 0).length;
        const outOfStockCount = inventories.filter((inv) => inv.quantity <= 0).length;

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
        const inventories = await prisma.inventory.findMany({
            include: {
                product: true
            }
        });

        return inventories
            .filter((inv) => inv.quantity <= inv.minThreshold)
            .map((inv) => ({
                productName: inv.product.name,
                sku: inv.product.sku,
                quantity: inv.quantity,
                threshold: inv.minThreshold,
                status: inv.quantity <= 0 ? 'OUT OF STOCK' : 'LOW STOCK'
            }))
            .sort((a, b) => a.quantity - b.quantity);
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
            include: { product: true }
        });

        // Fetch 5 latest AI actions
        const aiLogs = await prisma.agentLog.findMany({
            take: 5,
            orderBy: { triggered_at: 'desc' }
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
                description: `Imported ${imp.quantity} unit(s) of ${imp.product.name}. Reason: ${imp.reason || 'None'}`,
                timestamp: imp.createdAt
            });
        }

        // Normalize AI Logs
        for (const log of aiLogs) {
            activities.push({
                id: `ai-${log.id}`,
                type: 'AI',
                title: `AI Agent Action`,
                description: `Action: ${log.action} - Result: ${log.result || 'SKIPPED'}. Reasoning: ${log.reasoning || 'No details'}`,
                timestamp: log.triggered_at
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
