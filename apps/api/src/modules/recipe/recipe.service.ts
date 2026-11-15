import { prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { calculateRecipeCost, roundCost4, roundMoney2, toDecimal } from '../../common/ingredient-cost.utils';
import { convertToBaseQuantity } from '../../common/unit-conversion';
import { recipeInclude, recipeRepository, toppingInclude, type RecipeRecord, type ToppingRecord } from './recipe.repository';
import type { CreateRecipeInput, CreateToppingInput, PreviewRecipeCostInput, UpdateToppingInput } from './recipe.validator';

export const toRecipeDto = (recipe: RecipeRecord) => {
    const costCalc = calculateRecipeCost({
        ingredients: recipe.ingredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient.name,
            ingredientSku: ri.ingredient.sku,
            quantity: ri.quantity,
            unit: ri.unit,
            baseUnit: ri.ingredient.baseUnit,
            quantityBase: ri.quantityBase,
            costPerBaseUnit: ri.ingredient.costPerBaseUnit,
            isOptional: ri.isOptional,
            allowSubstitute: ri.allowSubstitute,
            note: ri.note
        })),
        yieldQuantity: recipe.yieldQuantity,
        laborCost: recipe.laborCost,
        overheadCost: recipe.overheadCost,
        productPrice: recipe.product?.price ?? 0
    });

    return {
        id: recipe.id,
        productId: recipe.productId,
        productName: recipe.product?.name ?? '',
        version: recipe.version,
        isActive: recipe.isActive,
        effectiveFrom: recipe.effectiveFrom,
        effectiveTo: recipe.effectiveTo,
        yieldQuantity: Number(recipe.yieldQuantity),
        laborCost: Number(recipe.laborCost),
        overheadCost: Number(recipe.overheadCost),
        note: recipe.note,
        ingredients: recipe.ingredients.map((ri, idx) => ({
            id: ri.id,
            ingredientId: ri.ingredientId,
            ingredientName: ri.ingredient.name,
            ingredientSku: ri.ingredient.sku,
            baseUnit: ri.ingredient.baseUnit,
            costPerBaseUnit: Number(ri.ingredient.costPerBaseUnit),
            quantity: Number(ri.quantity),
            unit: ri.unit,
            quantityBase: Number(ri.quantityBase),
            lineCost: costCalc.breakdown[idx]?.lineCost ?? 0,
            isOptional: ri.isOptional,
            allowSubstitute: ri.allowSubstitute,
            note: ri.note
        })),
        costSummary: {
            ingredientsCost: costCalc.ingredientsCost,
            optionalIngredientsCost: costCalc.optionalIngredientsCost,
            laborCost: costCalc.laborCost,
            overheadCost: costCalc.overheadCost,
            yieldQuantity: costCalc.yieldQuantity,
            totalBatchCost: costCalc.totalBatchCost,
            unitCost: costCalc.unitCost,
            productPrice: costCalc.price,
            marginAmount: costCalc.marginAmount,
            marginPercent: costCalc.marginPercent,
            lowMarginWarning: costCalc.lowMarginWarning
        },
        createdAt: recipe.createdAt,
        updatedAt: recipe.updatedAt
    };
};

export const toToppingDto = (topping: ToppingRecord) => {
    let estimatedCost = new Prisma.Decimal(0);
    const ingredients = topping.ingredients.map((ti) => {
        const qtyBase = toDecimal(ti.quantityBase);
        const unitCost = toDecimal(ti.ingredient.costPerBaseUnit);
        const lineCost = roundMoney2(qtyBase.mul(unitCost));
        estimatedCost = estimatedCost.add(lineCost);
        return {
            id: ti.id,
            ingredientId: ti.ingredientId,
            ingredientName: ti.ingredient.name,
            ingredientSku: ti.ingredient.sku,
            baseUnit: ti.ingredient.baseUnit,
            costPerBaseUnit: Number(unitCost),
            quantityBase: Number(qtyBase),
            lineCost: Number(lineCost),
            note: ti.note
        };
    });

    return {
        id: topping.id,
        name: topping.name,
        toppingType: topping.toppingType,
        price: Number(topping.price),
        estimatedCost: Number(roundMoney2(estimatedCost)),
        productId: topping.productId,
        isActive: topping.isActive,
        sortOrder: topping.sortOrder,
        ingredients,
        createdAt: topping.createdAt,
        updatedAt: topping.updatedAt
    };
};

export const recalculateProductCost = async (
    productId: string,
    tx: Prisma.TransactionClient = prisma
): Promise<Prisma.Decimal | null> => {
    const activeRecipe = await recipeRepository.findActiveByProductId(productId, tx);
    if (!activeRecipe) {
        return null;
    }

    const calc = calculateRecipeCost({
        ingredients: activeRecipe.ingredients.map((ri) => ({
            ingredientId: ri.ingredientId,
            quantity: ri.quantity,
            unit: ri.unit,
            baseUnit: ri.ingredient.baseUnit,
            quantityBase: ri.quantityBase,
            costPerBaseUnit: ri.ingredient.costPerBaseUnit,
            isOptional: ri.isOptional
        })),
        yieldQuantity: activeRecipe.yieldQuantity,
        laborCost: activeRecipe.laborCost,
        overheadCost: activeRecipe.overheadCost
    });

    await tx.product.update({
        where: { id: productId },
        data: { costPrice: calc.unitCostDecimal }
    });

    return calc.unitCostDecimal;
};

export const recalculateCostsForIngredient = async (
    ingredientId: string,
    tx: Prisma.TransactionClient = prisma
): Promise<string[]> => {
    const affectedRecipes = await tx.recipe.findMany({
        where: {
            isActive: true,
            ingredients: {
                some: { ingredientId }
            }
        },
        select: { productId: true }
    });

    const productIds = Array.from(new Set(affectedRecipes.map((r) => r.productId)));
    for (const productId of productIds) {
        await recalculateProductCost(productId, tx);
    }
    return productIds;
};

export const estimateToppingCost = async (
    toppingId: string,
    tx: Prisma.TransactionClient = prisma
): Promise<Prisma.Decimal> => {
    const topping = await recipeRepository.findToppingById(toppingId, tx);
    if (!topping) {
        throw new HttpError(404, 'Không tìm thấy topping.');
    }

    let cost = new Prisma.Decimal(0);
    for (const ti of topping.ingredients) {
        const line = toDecimal(ti.quantityBase).mul(toDecimal(ti.ingredient.costPerBaseUnit));
        cost = cost.add(line);
    }
    return roundCost4(cost);
};

export const recipeService = {
    async listByProduct(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) {
            throw new HttpError(404, 'Không tìm thấy sản phẩm.');
        }
        const recipes = await recipeRepository.findByProductId(productId);
        return recipes.map(toRecipeDto);
    },

    async getActiveByProduct(productId: string) {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
        if (!product) {
            throw new HttpError(404, 'Không tìm thấy sản phẩm.');
        }
        const active = await recipeRepository.findActiveByProductId(productId);
        return active ? toRecipeDto(active) : null;
    },

    async previewCost(productId: string, input: PreviewRecipeCostInput) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            select: { id: true, name: true, price: true, costPrice: true }
        });
        if (!product) {
            throw new HttpError(404, 'Không tìm thấy sản phẩm.');
        }

        const ingredientIds = Array.from(new Set(input.ingredients.map((i) => i.ingredientId)));
        const ingredients = ingredientIds.length > 0
            ? await prisma.ingredient.findMany({
                  where: { id: { in: ingredientIds }, deletedAt: null }
              })
            : [];
        const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));

        const enriched = input.ingredients.map((item) => {
            const ing = ingredientById.get(item.ingredientId);
            if (!ing) {
                throw new HttpError(404, `Không tìm thấy nguyên liệu (${item.ingredientId}).`);
            }
            const qtyBase = convertToBaseQuantity(item.quantity, item.unit, ing.baseUnit);
            return {
                ingredientId: ing.id,
                ingredientName: ing.name,
                ingredientSku: ing.sku,
                quantity: item.quantity,
                unit: item.unit,
                baseUnit: ing.baseUnit,
                quantityBase: qtyBase,
                costPerBaseUnit: ing.costPerBaseUnit,
                isOptional: item.isOptional,
                allowSubstitute: item.allowSubstitute,
                note: item.note
            };
        });

        const priceToUse = input.productPrice !== undefined ? input.productPrice : product.price;

        return calculateRecipeCost({
            ingredients: enriched,
            yieldQuantity: input.yieldQuantity,
            laborCost: input.laborCost,
            overheadCost: input.overheadCost,
            productPrice: priceToUse
        });
    },

    async createVersion(productId: string, input: CreateRecipeInput) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            throw new HttpError(404, 'Không tìm thấy sản phẩm.');
        }

        const seenIds = new Set<string>();
        for (const item of input.ingredients) {
            if (seenIds.has(item.ingredientId)) {
                throw new HttpError(400, 'Một nguyên liệu không được lặp lại nhiều dòng trong cùng một công thức.');
            }
            seenIds.add(item.ingredientId);
        }

        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const ingredientIds = input.ingredients.map((i) => i.ingredientId);
            const ingredients = await tx.ingredient.findMany({
                where: { id: { in: ingredientIds }, deletedAt: null, isActive: true }
            });
            const ingredientById = new Map(ingredients.map((ing) => [ing.id, ing]));

            const preparedItems = input.ingredients.map((item) => {
                const ing = ingredientById.get(item.ingredientId);
                if (!ing) {
                    throw new HttpError(404, `Nguyên liệu không tồn tại hoặc đã ngừng hoạt động (${item.ingredientId}).`);
                }
                const quantityBase = convertToBaseQuantity(item.quantity, item.unit, ing.baseUnit);
                return {
                    ingredientId: ing.id,
                    quantity: new Prisma.Decimal(item.quantity).toDecimalPlaces(3),
                    unit: item.unit.trim(),
                    quantityBase,
                    isOptional: Boolean(item.isOptional),
                    allowSubstitute: Boolean(item.allowSubstitute),
                    note: item.note?.trim() || null
                };
            });

            const nextVersion = (await recipeRepository.getMaxVersion(productId, tx)) + 1;
            const now = new Date();
            const shouldActivate = input.activate !== false;

            if (shouldActivate) {
                await tx.recipe.updateMany({
                    where: { productId, isActive: true },
                    data: { isActive: false, effectiveTo: now }
                });
            }

            const created = await tx.recipe.create({
                data: {
                    productId,
                    version: nextVersion,
                    isActive: shouldActivate,
                    effectiveFrom: now,
                    effectiveTo: shouldActivate ? null : now,
                    yieldQuantity: new Prisma.Decimal(input.yieldQuantity ?? 1).toDecimalPlaces(2),
                    laborCost: new Prisma.Decimal(input.laborCost ?? 0).toDecimalPlaces(2),
                    overheadCost: new Prisma.Decimal(input.overheadCost ?? 0).toDecimalPlaces(2),
                    note: input.note?.trim() || null,
                    ingredients: {
                        create: preparedItems
                    }
                },
                include: recipeInclude
            });

            if (shouldActivate) {
                await recalculateProductCost(productId, tx);
            }

            const refreshed = await recipeRepository.findById(created.id, tx);
            return toRecipeDto(refreshed!);
        });
    },

    async activateVersion(productId: string, recipeId: string) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const recipe = await recipeRepository.findById(recipeId, tx);
            if (!recipe || recipe.productId !== productId) {
                throw new HttpError(404, 'Không tìm thấy phiên bản công thức của sản phẩm này.');
            }

            const now = new Date();
            await tx.recipe.updateMany({
                where: { productId, isActive: true, id: { not: recipeId } },
                data: { isActive: false, effectiveTo: now }
            });

            await tx.recipe.update({
                where: { id: recipeId },
                data: { isActive: true, effectiveFrom: now, effectiveTo: null }
            });

            await recalculateProductCost(productId, tx);

            const refreshed = await recipeRepository.findById(recipeId, tx);
            return toRecipeDto(refreshed!);
        });
    },

    async listToppings(includeInactive = false, productId?: string) {
        const toppings = await recipeRepository.findToppings(includeInactive, productId);
        return toppings.map(toToppingDto);
    },

    async getTopping(id: string) {
        const topping = await recipeRepository.findToppingById(id);
        if (!topping) {
            throw new HttpError(404, 'Không tìm thấy topping.');
        }
        return toToppingDto(topping);
    },

    async createTopping(input: CreateToppingInput) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const preparedIngredients = [];
            if (input.ingredients && input.ingredients.length > 0) {
                const ingIds = input.ingredients.map((i) => i.ingredientId);
                const ings = await tx.ingredient.findMany({ where: { id: { in: ingIds }, deletedAt: null } });
                const ingMap = new Map(ings.map((i) => [i.id, i]));

                for (const item of input.ingredients) {
                    const ing = ingMap.get(item.ingredientId);
                    if (!ing) {
                        throw new HttpError(404, `Không tìm thấy nguyên liệu (${item.ingredientId}).`);
                    }
                    const qtyBase = item.quantityBase !== undefined
                        ? new Prisma.Decimal(item.quantityBase).toDecimalPlaces(3)
                        : convertToBaseQuantity(item.quantity ?? 1, item.unit || ing.baseUnit, ing.baseUnit);

                    preparedIngredients.push({
                        ingredientId: ing.id,
                        quantityBase: qtyBase,
                        note: item.note?.trim() || null
                    });
                }
            }

            const topping = await tx.topping.create({
                data: {
                    name: input.name.trim(),
                    toppingType: input.toppingType,
                    price: new Prisma.Decimal(input.price).toDecimalPlaces(2),
                    productId: input.productId || null,
                    isActive: input.isActive ?? true,
                    sortOrder: input.sortOrder ?? 0,
                    ingredients: preparedIngredients.length > 0 ? { create: preparedIngredients } : undefined
                },
                include: toppingInclude
            });

            return toToppingDto(topping);
        });
    },

    async updateTopping(id: string, input: UpdateToppingInput) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const existing = await recipeRepository.findToppingById(id, tx);
            if (!existing) {
                throw new HttpError(404, 'Không tìm thấy topping.');
            }

            if (input.ingredients !== undefined) {
                await tx.toppingIngredient.deleteMany({ where: { toppingId: id } });
                const ingIds = input.ingredients.map((i) => i.ingredientId);
                const ings = ingIds.length > 0
                    ? await tx.ingredient.findMany({ where: { id: { in: ingIds }, deletedAt: null } })
                    : [];
                const ingMap = new Map(ings.map((i) => [i.id, i]));

                for (const item of input.ingredients) {
                    const ing = ingMap.get(item.ingredientId);
                    if (!ing) {
                        throw new HttpError(404, `Không tìm thấy nguyên liệu (${item.ingredientId}).`);
                    }
                    const qtyBase = item.quantityBase !== undefined
                        ? new Prisma.Decimal(item.quantityBase).toDecimalPlaces(3)
                        : convertToBaseQuantity(item.quantity ?? 1, item.unit || ing.baseUnit, ing.baseUnit);

                    await tx.toppingIngredient.create({
                        data: {
                            toppingId: id,
                            ingredientId: ing.id,
                            quantityBase: qtyBase,
                            note: item.note?.trim() || null
                        }
                    });
                }
            }

            const updated = await tx.topping.update({
                where: { id },
                data: {
                    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                    ...(input.toppingType !== undefined ? { toppingType: input.toppingType } : {}),
                    ...(input.price !== undefined ? { price: new Prisma.Decimal(input.price).toDecimalPlaces(2) } : {}),
                    ...(input.productId !== undefined ? { productId: input.productId || null } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
                },
                include: toppingInclude
            });

            return toToppingDto(updated);
        });
    },

    async deleteTopping(id: string) {
        const existing = await recipeRepository.findToppingById(id);
        if (!existing) {
            throw new HttpError(404, 'Không tìm thấy topping.');
        }

        const usedCount = await prisma.orderItemTopping.count({ where: { toppingId: id } });
        if (usedCount > 0) {
            const updated = await prisma.topping.update({
                where: { id },
                data: { isActive: false },
                include: toppingInclude
            });
            return toToppingDto(updated);
        }

        const deleted = await prisma.topping.delete({
            where: { id },
            include: toppingInclude
        });
        return toToppingDto(deleted);
    }
};
