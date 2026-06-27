import { prisma, PurchaseRequestStatus, OrderStatus, type Prisma } from '@cafe-project/database';
import { fixAgentLogDisplayOutputJson, fixVietnameseMojibakeText } from '../utils/textEncoding';

export const ACTIVE_PURCHASE_REQUEST_MESSAGE = 'Sản phẩm này đã có yêu cầu nhập hàng đang xử lý.';
export const ACTIVE_PURCHASE_REQUEST_STATUSES = [
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
    },
    batches: true
} satisfies Prisma.InventoryInclude;

const logInclude = {
    creator: {
        select: {
            id: true,
            name: true,
            email: true
        }
    }
} satisfies Prisma.AgentLogInclude;

export type AgentInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

const convertRecommendedQuantity = (
    inventory: AgentInventoryRecord,
    supplierProduct: AgentInventoryRecord['product']['supplierProducts'][number],
    quantity: number
) => {
    const purchaseUnit = supplierProduct.purchaseUnit;
    const conversionQuantity = supplierProduct.conversionQuantity;
    const conversionTargetUnit = supplierProduct.conversionTargetUnit;

    if (!purchaseUnit || !conversionQuantity || !conversionTargetUnit || conversionTargetUnit !== inventory.unit) {
        return {
            quantity,
            note: `Sản phẩm ${inventory.product.name} hiện còn ${inventory.quantity} ${inventory.unit}, thấp hơn hoặc bằng ngưỡng tồn kho cần bổ sung.

Hệ thống đề xuất nhập thêm ${quantity} ${inventory.unit} để đưa tồn kho về mức an toàn.

Sản phẩm này chưa có quy cách nhập hàng theo nhà cung cấp, nên số lượng đề xuất đang được hiển thị theo đơn vị tồn kho.`
        };
    }

    const purchaseQuantity = Math.ceil(quantity / conversionQuantity);
    const convertedQuantity = Math.ceil(purchaseQuantity * conversionQuantity);

    return {
        quantity: convertedQuantity,
        note: `Nhu cầu bổ sung tối thiểu là ${quantity} ${inventory.unit}. Theo quy cách nhập hàng của nhà cung cấp: 1 ${purchaseUnit} = ${conversionQuantity} ${conversionTargetUnit}.

Vì vậy hệ thống làm tròn theo quy cách nhập hàng và đề xuất nhập ${purchaseQuantity} ${purchaseUnit} = ${convertedQuantity} ${inventory.unit} để đảm bảo đủ hàng và đúng quy cách nhập.`
    };
};

const safeJsonParse = (value: unknown): any => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

export const serializeAgentLogField = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value;

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const asString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

const findDuplicateSimulationLog = async (data: Prisma.AgentLogCreateInput) => {
    const input = safeJsonParse(data.input);
    const output = safeJsonParse(data.output);
    const triggerType = asString(input?.triggerType);
    const sourceType = asString(input?.sourceType);
    const sourceId = asString(input?.sourceId);
    const productId = asString(input?.productId) || asString(output?.productId);
    const reason = asString(output?.reason);
    const result = asString(data.result);
    const action = asString(data.action);

    if (!sourceId || !productId || !action || !result) return null;
    if (triggerType !== 'SIMULATE_SALE' && sourceType !== 'SIMULATE_SALE') return null;

    const and: Prisma.AgentLogWhereInput[] = [
        { action },
        { result },
        { input: { contains: sourceId } },
        { input: { contains: productId } }
    ];

    if (reason) {
        and.push({ output: { contains: reason } });
    }

    return prisma.agentLog.findFirst({
        where: { AND: and },
        include: logInclude,
        orderBy: { triggered_at: 'asc' }
    });
};

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
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: { id: true }
        });
        return Boolean(item);
    },

    async findOpenPurchaseRequest(productId: string, inventoryId: string): Promise<{ id: string, status: string, supplier: { id: string, name: string, status: string, deletedAt: Date | null } } | null> {
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                productId,
                inventoryId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: {
                request: {
                    select: { 
                        id: true,
                        status: true,
                        supplier: {
                            select: {
                                id: true,
                                name: true,
                                status: true,
                                deletedAt: true
                            }
                        }
                    }
                }
            }
        });
        return item?.request ?? null;
    },

    async getSalesData(productId: string) {
        const now = new Date();
        const date7d = new Date();
        date7d.setDate(now.getDate() - 7);
        const date30d = new Date();
        date30d.setDate(now.getDate() - 30);

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

        const totalSold7d = items7d.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
        const totalSold30d = items30d.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);

        return {
            totalSold7d,
            totalSold30d,
            salesVelocity7d: totalSold7d / 7,
            salesVelocity30d: totalSold30d / 30
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

    async getSettingValue(key: string): Promise<string | null> {
        const setting = await prisma.systemSetting.findUnique({
            where: { key },
            select: { value: true }
        });
        return setting?.value ?? null;
    },

    async createAiPurchaseRequest(
        inventory: AgentInventoryRecord,
        supplierProduct: AgentInventoryRecord['product']['supplierProducts'][number],
        quantity: number,
        reasoning: string,
        userId?: string,
        emailDraft?: string
    ) {
        if (!userId) {
            const admin = await this.findFirstAdmin();
            if (!admin) throw new Error('No admin user found to associate with AI Purchase Request');
            userId = admin.id;
        }

        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const converted = convertRecommendedQuantity(inventory, supplierProduct, quantity);
            const finalReasoning = `${reasoning.trim()}\n\n${converted.note}`;

            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: {
                    productId: inventory.productId,
                    inventoryId: inventory.id,
                    request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

            return tx.purchaseRequest.create({
                data: {
                    requestNumber: `AI-PR-${Date.now()}-${inventory.productId.slice(-4)}`,
                    status: PurchaseRequestStatus.PENDING,
                    supplierId: supplierProduct.supplierId,
                    requestedBy: userId as string,
                    aiGenerated: true,
                    notes: finalReasoning,
                    emailContent: emailDraft,
                    totalAmount: Number(supplierProduct.price) * converted.quantity,
                    items: {
                        create: {
                            inventoryId: inventory.id,
                            productId: inventory.productId,
                            quantity: converted.quantity,
                            unitPrice: supplierProduct.price,
                            notes: finalReasoning
                        }
                    }
                },
                include: { supplier: true, items: { include: { product: true, inventory: true } } }
            });
        });
    },

    async createPurchaseRequestFromRecommendation(data: {
        logId: string;
        productId: string;
        supplierId: string;
        recommendedQuantity: number;
        reasoning?: string | null;
        emailDraft?: string | null;
        userId: string;
    }) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const inventory = await tx.inventory.findUnique({
                where: { productId: data.productId }
            });

            if (!inventory) {
                throw new Error('Inventory record for product not found.');
            }

            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: {
                    productId: data.productId,
                    inventoryId: inventory.id,
                    request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

            const supplierProduct = await tx.supplierProduct.findUnique({
                where: {
                    supplierId_productId: {
                        supplierId: data.supplierId,
                        productId: data.productId
                    }
                }
            });

            const price = supplierProduct ? Number(supplierProduct.price) : 0;
            let finalQuantity = data.recommendedQuantity;
            let finalReasoning = data.reasoning ?? null;

            if (supplierProduct?.purchaseUnit && supplierProduct.conversionQuantity && supplierProduct.conversionTargetUnit === inventory.unit) {
                const purchaseQuantity = Math.ceil(data.recommendedQuantity / supplierProduct.conversionQuantity);
                finalQuantity = Math.ceil(purchaseQuantity * supplierProduct.conversionQuantity);
                finalReasoning = `${data.reasoning ?? ''}

Nhu cầu bổ sung tối thiểu là ${data.recommendedQuantity} ${inventory.unit}. Theo quy cách nhập hàng của nhà cung cấp: 1 ${supplierProduct.purchaseUnit} = ${supplierProduct.conversionQuantity} ${supplierProduct.conversionTargetUnit}.

Vì vậy hệ thống làm tròn theo quy cách nhập hàng và đề xuất nhập ${purchaseQuantity} ${supplierProduct.purchaseUnit} = ${finalQuantity} ${inventory.unit} để đảm bảo đủ hàng và đúng quy cách nhập.`.trim();
            } else {
                finalReasoning = `${data.reasoning ?? ''}

Hệ thống đề xuất nhập thêm ${data.recommendedQuantity} ${inventory.unit} để đưa tồn kho về mức an toàn.

Sản phẩm này chưa có quy cách nhập hàng theo nhà cung cấp, nên số lượng đề xuất đang được hiển thị theo đơn vị tồn kho.`.trim();
            }

            const pr = await tx.purchaseRequest.create({
                data: {
                    requestNumber: `AI-REC-${Date.now()}`,
                    supplierId: data.supplierId,
                    requestedBy: data.userId,
                    aiGenerated: true,
                    notes: finalReasoning,
                    emailContent: data.emailDraft,
                    totalAmount: price * finalQuantity,
                    items: {
                        create: {
                            inventoryId: inventory.id,
                            productId: data.productId,
                            quantity: finalQuantity,
                            unitPrice: price,
                            notes: finalReasoning
                        }
                    }
                }
            });

            await tx.agentLog.update({
                where: { id: data.logId },
                data: {
                    reference_type: 'PurchaseRequest',
                    reference_id: pr.id,
                    result: 'CONVERTED_TO_PR'
                }
            });

            return pr;
        });
    },

    async createLog(data: Prisma.AgentLogCreateInput) {
        const sanitizedData: Prisma.AgentLogCreateInput = {
            ...data,
            input: serializeAgentLogField(data.input),
            output: typeof data.output === 'string' ? fixAgentLogDisplayOutputJson(data.output) : serializeAgentLogField(data.output),
            reasoning: typeof data.reasoning === 'string' ? fixVietnameseMojibakeText(data.reasoning) : data.reasoning,
            error_message: typeof data.error_message === 'string' ? fixVietnameseMojibakeText(data.error_message) : data.error_message
        };
        const duplicate = await findDuplicateSimulationLog(sanitizedData);
        if (duplicate) return duplicate;
        return prisma.agentLog.create({ data: sanitizedData, include: logInclude });
    },

    async findLogs(where: Prisma.AgentLogWhereInput = {}) {
        return prisma.agentLog.findMany({
            where,
            include: logInclude,
            orderBy: { triggered_at: 'desc' },
            take: 1000
        });
    },

    async updateLog(id: string, data: Prisma.AgentLogUpdateInput) {
        const sanitizedData: Prisma.AgentLogUpdateInput = { ...data };
        if (data.input !== undefined) sanitizedData.input = serializeAgentLogField(data.input);
        if (data.output !== undefined) sanitizedData.output = typeof data.output === 'string' ? fixAgentLogDisplayOutputJson(data.output) : serializeAgentLogField(data.output);

        return prisma.agentLog.update({
            where: { id },
            data: sanitizedData,
            include: logInclude
        });
    },

    async findRecommendationLog(logId: string) {
        return prisma.agentLog.findUnique({
            where: { id: logId }
        });
    },

    async findActiveProductIds() {
        const products = await prisma.product.findMany({
            where: { isActive: true },
            select: { id: true }
        });
        return products.map((product: { id: string }) => product.id);
    }
};
