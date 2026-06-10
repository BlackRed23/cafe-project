import { prisma, PurchaseRequestStatus, OrderStatus, type Prisma } from '@cafe-project/database';

export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Sản phẩm này đã có yêu cầu nhập hàng đang xử lý.';
const ACTIVE_PURCHASE_REQUEST_STATUSES = [
    PurchaseRequestStatus.PENDING,
    PurchaseRequestStatus.APPROVED,
    PurchaseRequestStatus.SENT
] as const;

const inventoryInclude = {
    product: {
        include: {
            category: true,
            supplierProducts: {
                include: { supplier: true },
                orderBy: [{ isPreferred: 'desc' }, { price: 'asc' }, { leadTimeDays: 'asc' }]
            }
        }
    }
} satisfies Prisma.InventoryInclude;

export type AgentInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

export const agentRepository = {
    async findInventories(productIds?: string[]): Promise<AgentInventoryRecord[]> {
        return prisma.inventory.findMany({
            where: {
                ...(productIds?.length ? { productId: { in: productIds } } : {}),
                product: { isActive: true }
            },
            include: inventoryInclude
        });
    },

    async hasOpenPurchaseRequest(productId: string, inventoryId: string): Promise<boolean> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                productId,
                inventoryId,
                request: {
                    status: {
                        in: [
                            ...ACTIVE_PURCHASE_REQUEST_STATUSES
                        ]
                    }
                }
            },
            select: { id: true }
        });
        return Boolean(item);
    },

    async getSalesData(productId: string) {
        const now = new Date();

        const date7d = new Date();
        date7d.setDate(now.getDate() - 7);

        const date30d = new Date();
        date30d.setDate(now.getDate() - 30);

        // Fetch non-cancelled order items
        const items7d = await prisma.orderItem.findMany({
            where: {
                productId,
                order: {
                    status: { not: OrderStatus.CANCELLED },
                    createdAt: { gte: date7d }
                }
            },
            select: { quantity: true }
        });

        const items30d = await prisma.orderItem.findMany({
            where: {
                productId,
                order: {
                    status: { not: OrderStatus.CANCELLED },
                    createdAt: { gte: date30d }
                }
            },
            select: { quantity: true }
        });

        const totalSold7d = items7d.reduce((sum, item) => sum + item.quantity, 0);
        const totalSold30d = items30d.reduce((sum, item) => sum + item.quantity, 0);

        return {
            totalSold7d,
            totalSold30d,
            salesVelocity7d: totalSold7d / 7.0,
            salesVelocity30d: totalSold30d / 30.0
        };
    },

    async findFirstAdmin() {
        return prisma.user.findFirst({
            where: {
                role: 'ADMIN',
                isActive: true
            },
            select: { id: true }
        });
    },

    async createPurchaseRequest(data: {
        productId: string;
        inventoryId: string;
        supplierId: string;
        quantity: number;
        unitPrice: number;
        reasoning: string;
        emailDraft: string;
        requestedBy: string;
        triggerType: 'SCHEDULED' | 'MANUAL';
        fallbackUsed: boolean;
        errorMessage?: string | null;
        confidence: number;
        geminiPrompt?: string | null;
        geminiResponse?: string | null;
        currentQty: number;
        minThreshold: number;
        salesVelocity: number;
    }) {
        return prisma.$transaction(async (tx) => {
            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: {
                    productId: data.productId,
                    inventoryId: data.inventoryId,
                    request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

            // Generate requestNumber matching standard patterns
            const requestNumber = `AI-PR-${Date.now()}-${data.productId.slice(-4)}`;

            // Create purchase request
            const pr = await tx.purchaseRequest.create({
                data: {
                    requestNumber,
                    status: PurchaseRequestStatus.PENDING,
                    supplierId: data.supplierId,
                    requestedBy: data.requestedBy,
                    aiGenerated: true,
                    notes: data.reasoning,
                    emailContent: data.emailDraft,
                    totalAmount: data.unitPrice * data.quantity,
                    items: {
                        create: {
                            inventoryId: data.inventoryId,
                            productId: data.productId,
                            quantity: data.quantity,
                            unitPrice: data.unitPrice,
                            notes: data.reasoning
                        }
                    }
                }
            });

            // Prepare AgentLog payload
            const inputObj = {
                triggerType: data.triggerType,
                inventoryId: data.inventoryId,
                currentQty: data.currentQty,
                minThreshold: data.minThreshold,
                salesVelocity: data.salesVelocity
            };

            const outputObj = {
                recommendedQty: data.quantity,
                recommendedSupplierId: data.supplierId,
                confidence: data.confidence,
                reasoning: data.reasoning,
                geminiPrompt: data.geminiPrompt,
                geminiResponse: data.geminiResponse,
                purchaseRequestId: pr.id
            };

            // Save success AgentLog
            await tx.agentLog.create({
                data: {
                    action: 'SCAN_INVENTORY',
                    result: 'SUCCESS',
                    input: JSON.stringify(inputObj),
                    output: JSON.stringify(outputObj),
                    reasoning: data.reasoning,
                    fallback_used: data.fallbackUsed,
                    error_message: data.errorMessage,
                    reference_type: 'PurchaseRequest',
                    reference_id: pr.id,
                    creator: { connect: { id: data.requestedBy } }
                }
            });

            return pr;
        });
    },

    async createLog(data: {
        action: string;
        result: string;
        input?: string;
        output?: string;
        reasoning?: string;
        error_message?: string | null;
        fallback_used?: boolean;
        reference_type?: string;
        reference_id?: string;
        createdBy?: string;
    }) {
        const { createdBy, ...rest } = data;
        return prisma.agentLog.create({
            data: {
                ...rest,
                creator: createdBy ? { connect: { id: createdBy } } : undefined
            }
        });
    }
};
