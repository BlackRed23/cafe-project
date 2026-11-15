import { requireAgentUser } from '../internal-auth';
import { prisma, PurchaseRequestStatus, OrderStatus, InventoryTransactionType, type Prisma } from '@cafe-project/database';
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

const ingredientScanInclude = {
    category: true,
    batches: {
        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }]
    },
    supplierLinks: {
        include: { supplier: true },
        orderBy: [{ isPreferred: 'desc' }, { pricePerBaseUnit: 'asc' }, { leadTimeDays: 'asc' }]
    },
    recipeItems: {
        where: { recipe: { isActive: true } },
        include: {
            recipe: {
                include: {
                    product: { select: { id: true, name: true, sku: true, isActive: true } }
                }
            }
        }
    }
} satisfies Prisma.IngredientInclude;

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
export type AgentIngredientRecord = Prisma.IngredientGetPayload<{ include: typeof ingredientScanInclude }>;

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
        userId = await requireAgentUser(userId);

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
        productId?: string;
        ingredientId?: string;
        supplierId: string;
        recommendedQuantity: number;
        reasoning?: string | null;
        emailDraft?: string | null;
        userId: string;
    }) {
        await requireAgentUser(data.userId);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            if (data.ingredientId) {
                const ingredient = await tx.ingredient.findUnique({
                    where: { id: data.ingredientId }
                });
                if (!ingredient) {
                    throw new Error('Ingredient record not found.');
                }
                const activeItem = await tx.purchaseRequestItem.findFirst({
                    where: {
                        ingredientId: data.ingredientId,
                        request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                    },
                    select: { id: true }
                });
                if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

                const supIng = await tx.supplierIngredient.findUnique({
                    where: {
                        supplierId_ingredientId: {
                            supplierId: data.supplierId,
                            ingredientId: data.ingredientId
                        }
                    }
                });
                const convQty = Math.max(1, Number(supIng?.conversionQuantity || 1));
                const minPacks = Math.max(1, Number(supIng?.minOrderQuantity || 1));
                const neededPacks = Math.max(minPacks, Math.ceil(data.recommendedQuantity / convQty));
                const unitPricePerPack = supIng
                    ? Math.round(Number(supIng.pricePerBaseUnit) * convQty)
                    : Math.round(Number(ingredient.costPerBaseUnit));
                const finalReasoning = (data.reasoning ?? '').trim();

                const pr = await tx.purchaseRequest.create({
                    data: {
                        requestNumber: `AI-REC-ING-${Date.now()}`,
                        supplierId: data.supplierId,
                        requestedBy: data.userId,
                        aiGenerated: true,
                        notes: finalReasoning,
                        emailContent: data.emailDraft,
                        totalAmount: unitPricePerPack * neededPacks,
                        items: {
                            create: {
                                ingredientId: ingredient.id,
                                quantity: neededPacks,
                                unitPrice: unitPricePerPack,
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
            }

            if (!data.productId) {
                throw new Error('Product ID is required.');
            }

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
            where: {
                isActive: true,
                inventory: { isNot: null }
            },
            select: { id: true }
        });
        return products.map((product: { id: string }) => product.id);
    },

    // --- Ingredient BOM/FEFO Adapters (TV2 Contract consumed by TV1 Orchestrator) ---
    async findIngredientsForScan(ingredientIds?: string[]): Promise<AgentIngredientRecord[]> {
        if (!prisma.ingredient?.findMany) return [];
        return prisma.ingredient.findMany({
            where: {
                ...(ingredientIds?.length ? { id: { in: ingredientIds } } : {}),
                isActive: true,
                deletedAt: null
            },
            include: ingredientScanInclude
        });
    },

    async findActiveIngredientIds(): Promise<string[]> {
        if (!prisma.ingredient?.findMany) return [];
        const rows = await prisma.ingredient.findMany({
            where: { isActive: true, deletedAt: null },
            select: { id: true }
        });
        return rows.map((r: { id: string }) => r.id);
    },

    async resolveIngredientIdsFromProducts(productIds: string[]): Promise<string[]> {
        if (!productIds?.length || !prisma.recipe?.findMany) return [];
        const recipes = await prisma.recipe.findMany({
            where: {
                productId: { in: productIds },
                isActive: true
            },
            include: {
                ingredients: {
                    select: { ingredientId: true }
                }
            }
        });
        const ids = new Set<string>();
        for (const r of recipes) {
            for (const ri of r.ingredients ?? []) {
                if (ri.ingredientId) ids.add(ri.ingredientId);
            }
        }
        return Array.from(ids);
    },

    async getIngredientConsumption(ingredientId: string, days = 30) {
        if (!prisma.inventoryTransaction?.findMany) {
            return {
                totalConsumed7d: 0,
                totalConsumed30d: 0,
                dailyConsumption7d: 0,
                dailyConsumption30d: 0
            };
        }
        const now = new Date();
        const date7d = new Date();
        date7d.setDate(now.getDate() - 7);
        const dateNd = new Date();
        dateNd.setDate(now.getDate() - days);

        const consumeTypes = [
            InventoryTransactionType?.CONSUME ?? 'CONSUME',
            InventoryTransactionType?.WASTE ?? 'WASTE',
            InventoryTransactionType?.ORDER ?? 'ORDER'
        ] as InventoryTransactionType[];

        const txns = await prisma.inventoryTransaction.findMany({
            where: {
                ingredientId,
                type: { in: consumeTypes },
                createdAt: { gte: dateNd }
            },
            select: { quantity: true, createdAt: true }
        });

        let totalConsumed7d = 0;
        let totalConsumed30d = 0;
        for (const t of txns) {
            const absQty = Math.abs(Number(t.quantity || 0));
            totalConsumed30d += absQty;
            if (new Date(t.createdAt) >= date7d) {
                totalConsumed7d += absQty;
            }
        }

        return {
            totalConsumed7d,
            totalConsumed30d,
            dailyConsumption7d: totalConsumed7d / 7,
            dailyConsumption30d: totalConsumed30d / Math.max(1, days)
        };
    },

    async hasOpenIngredientPurchaseRequest(ingredientId: string): Promise<boolean> {
        if (!prisma.purchaseRequestItem?.findFirst) return false;
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                ingredientId,
                request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
            },
            select: { id: true }
        });
        return Boolean(item);
    },

    async findOpenIngredientPurchaseRequest(ingredientId: string): Promise<{ id: string; status: string; supplier: { id: string; name: string; status: string; deletedAt: Date | null } } | null> {
        if (!prisma.purchaseRequestItem?.findFirst) return null;
        const item = await prisma.purchaseRequestItem.findFirst({
            where: {
                ingredientId,
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

    async createAiIngredientPurchaseRequest(
        ingredient: AgentIngredientRecord,
        supplierIngredient: AgentIngredientRecord['supplierLinks'][number],
        recommendedBaseQty: number,
        reasoning: string,
        userId?: string,
        emailDraft?: string
    ) {
        userId = await requireAgentUser(userId);

        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const activeItem = await tx.purchaseRequestItem.findFirst({
                where: {
                    ingredientId: ingredient.id,
                    request: { status: { in: [...ACTIVE_PURCHASE_REQUEST_STATUSES] } }
                },
                select: { id: true }
            });
            if (activeItem) throw new Error(ACTIVE_PURCHASE_REQUEST_MESSAGE);

            const convQty = Math.max(1, Number(supplierIngredient.conversionQuantity || 1));
            const minPacks = Math.max(1, Number(supplierIngredient.minOrderQuantity || 1));
            const neededPacks = Math.max(minPacks, Math.ceil(recommendedBaseQty / convQty));
            const convertedBaseQty = Math.ceil(neededPacks * convQty);
            const purchaseUnit = supplierIngredient.purchaseUnit || ingredient.baseUnit;
            const unitPricePerPack = Math.round(Number(supplierIngredient.pricePerBaseUnit || 0) * convQty);
            const totalAmount = unitPricePerPack * neededPacks;

            const conversionNote =
                convQty > 1
                    ? `Nhu cầu bổ sung tối thiểu là ${Math.ceil(recommendedBaseQty)} ${ingredient.baseUnit}. Theo quy cách nhà cung cấp: 1 ${purchaseUnit} = ${convQty} ${ingredient.baseUnit}.\n\nHệ thống làm tròn theo quy cách nhập hàng và đề xuất nhập ${neededPacks} ${purchaseUnit} (= ${convertedBaseQty} ${ingredient.baseUnit}).`
                    : `Hệ thống đề xuất nhập thêm ${neededPacks} ${purchaseUnit} nguyên liệu ${ingredient.name} để đưa tồn kho về mức an toàn.`;

            const finalReasoning = `${reasoning.trim()}\n\n${conversionNote}`;

            return tx.purchaseRequest.create({
                data: {
                    requestNumber: `AI-ING-${Date.now()}-${ingredient.id.slice(-4)}`,
                    status: PurchaseRequestStatus.PENDING,
                    supplierId: supplierIngredient.supplierId,
                    requestedBy: userId as string,
                    aiGenerated: true,
                    notes: finalReasoning,
                    emailContent: emailDraft,
                    totalAmount,
                    items: {
                        create: {
                            ingredientId: ingredient.id,
                            quantity: neededPacks,
                            unitPrice: unitPricePerPack,
                            notes: finalReasoning
                        }
                    }
                },
                include: { supplier: true, items: { include: { ingredient: true } } }
            });
        });
    }
};
