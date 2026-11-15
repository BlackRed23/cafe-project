import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

// Ensure dist files are built so we test the actual TypeScript implementation
const distUnitConvPath = path.join(apiRoot, 'dist/common/unit-conversion.js');
const distCostUtilsPath = path.join(apiRoot, 'dist/common/ingredient-cost.utils.js');

if (!fs.existsSync(distUnitConvPath) || !fs.existsSync(distCostUtilsPath)) {
  execSync('npx tsc', { cwd: apiRoot, stdio: 'inherit' });
}

const {
  normalizeUnitString,
  getUnitConversionFactor,
  convertToBaseQuantity,
} = require(distUnitConvPath);

const {
  calculateMovingAverageCost,
  sortBatchesForFifo,
  allocateFifoBatches,
  calculateRecipeCost,
  calculateOrderItemCostSnapshot,
} = require(distCostUtilsPath);

describe('1. Unit Conversion (unit-conversion.ts)', () => {
  test('converts 1 kg -> 1000 g', () => {
    const res = convertToBaseQuantity(1, 'kg', 'g');
    assert.equal(res.toNumber(), 1000);
  });

  test('converts 0.5 l -> 500 ml', () => {
    const res = convertToBaseQuantity(0.5, 'l', 'ml');
    assert.equal(res.toNumber(), 500);
  });

  test('converts 2500 mg -> 2.5 g', () => {
    const res = convertToBaseQuantity(2500, 'mg', 'g');
    assert.equal(res.toNumber(), 2.5);
  });

  test('normalizes unit strings and supports aliases (gram -> g, lít -> ml)', () => {
    assert.equal(normalizeUnitString('  KG '), 'kg');
    assert.equal(getUnitConversionFactor('kilogram', 'gram').toNumber(), 1000);
    assert.equal(convertToBaseQuantity(1.5, 'lít', 'ml').toNumber(), 1500);
  });

  test('throws HttpError(400) when converting incompatible unit groups (g -> ml)', () => {
    assert.throws(
      () => convertToBaseQuantity(100, 'g', 'ml'),
      (err) => err.statusCode === 400 && err.message.includes('Không thể quy đổi')
    );
  });
});

describe('2. Moving Weighted Average Cost (calculateMovingAverageCost)', () => {
  test('when currentQty = 0, newAvgCost equals importUnitCost', () => {
    const avg = calculateMovingAverageCost(0, 0, 1000, 380);
    assert.equal(avg.toNumber(), 380);
  });

  test('when currentQty < 0, safely falls back to importUnitCost', () => {
    const avg = calculateMovingAverageCost(-200, 300, 1000, 420);
    assert.equal(avg.toNumber(), 420);
  });

  test('calculates moving weighted average across multiple sequential imports', () => {
    // Import 1: 1000g @ 400đ/g -> 400đ/g
    const avg1 = calculateMovingAverageCost(0, 0, 1000, 400);
    assert.equal(avg1.toNumber(), 400);

    // Import 2: existing 1000g @ 400đ/g + 1000g @ 600đ/g -> (400,000 + 600,000) / 2000 = 500đ/g
    const avg2 = calculateMovingAverageCost(1000, avg1, 1000, 600);
    assert.equal(avg2.toNumber(), 500);

    // Import 3: existing 2000g @ 500đ/g + 500g @ 800đ/g -> (1,000,000 + 400,000) / 2500 = 560đ/g
    const avg3 = calculateMovingAverageCost(2000, avg2, 500, 800);
    assert.equal(avg3.toNumber(), 560);
  });
});

describe('3. FIFO / FEFO Batch Allocation (allocateFifoBatches)', () => {
  test('allocates 150g across Batch A (100g @ 400đ) and Batch B (200g @ 500đ) -> totalCost = 65,000đ', () => {
    const batches = [
      {
        id: 'batch-b',
        batchCode: 'B-02',
        quantityRemaining: 200,
        unitCost: 500,
        expirationDate: new Date('2026-12-31T00:00:00Z'),
        receivedAt: new Date('2026-06-02T00:00:00Z'),
      },
      {
        id: 'batch-a',
        batchCode: 'B-01',
        quantityRemaining: 100,
        unitCost: 400,
        expirationDate: new Date('2026-11-30T00:00:00Z'),
        receivedAt: new Date('2026-06-01T00:00:00Z'),
      },
    ];

    const result = allocateFifoBatches(batches, 150, 'Arabica');
    assert.equal(result.allocations.length, 2);

    // Batch A should be allocated first (100g @ 400đ = 40,000đ)
    assert.equal(result.allocations[0].batchId, 'batch-a');
    assert.equal(result.allocations[0].quantity.toNumber(), 100);
    assert.equal(result.allocations[0].totalCost.toNumber(), 40000);

    // Batch B should provide remaining 50g @ 500đ = 25,000đ
    assert.equal(result.allocations[1].batchId, 'batch-b');
    assert.equal(result.allocations[1].quantity.toNumber(), 50);
    assert.equal(result.allocations[1].totalCost.toNumber(), 25000);

    // Total cost = 65,000đ
    assert.equal(result.totalCost.toNumber(), 65000);
  });

  test('sorts batches with non-null expirationDate before null expirationDate', () => {
    const batches = [
      {
        id: 'no-exp',
        batchCode: 'NO-EXP',
        quantityRemaining: 100,
        unitCost: 300,
        expirationDate: null,
        receivedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 'with-exp',
        batchCode: 'WITH-EXP',
        quantityRemaining: 100,
        unitCost: 350,
        expirationDate: new Date('2026-10-01T00:00:00Z'),
        receivedAt: new Date('2026-05-01T00:00:00Z'),
      },
    ];

    const sorted = sortBatchesForFifo(batches);
    assert.equal(sorted[0].id, 'with-exp');
    assert.equal(sorted[1].id, 'no-exp');
  });

  test('throws HttpError(400) when total quantityRemaining across batches is insufficient', () => {
    const batches = [
      {
        id: 'batch-1',
        batchCode: 'B-01',
        quantityRemaining: 80,
        unitCost: 400,
        expirationDate: null,
        receivedAt: new Date(),
      },
    ];

    assert.throws(
      () => allocateFifoBatches(batches, 100, 'Arabica'),
      (err) => err.statusCode === 400 && err.message.includes('Không đủ lô nguyên liệu')
    );
  });
});

describe('4. Recipe Cost Calculation (calculateRecipeCost)', () => {
  test('excludes isOptional from mandatory cost, divides by yieldQuantity, and flags <30% margin', () => {
    const ingredients = [
      {
        ingredientId: 'ing-coffee',
        ingredientName: 'Arabica',
        quantity: 21, // 20g + 5% waste = 21g
        unit: 'g',
        baseUnit: 'g',
        costPerBaseUnit: 400, // 21 * 400 = 8,400đ
        isOptional: false,
      },
      {
        ingredientId: 'ing-milk',
        ingredientName: 'Sữa tươi',
        quantity: 0.15, // 0.15 l = 150 ml
        unit: 'l',
        baseUnit: 'ml',
        costPerBaseUnit: 40, // 150 * 40 = 6,000đ
        isOptional: false,
      },
      {
        ingredientId: 'ing-whip',
        ingredientName: 'Kem tươi (Tùy chọn)',
        quantity: 30,
        unit: 'ml',
        baseUnit: 'ml',
        costPerBaseUnit: 100, // 3,000đ optional
        isOptional: true,
      },
    ];

    // High price (45,000đ): mandatory ingredient = 14,400đ, labor = 1,600đ, overhead = 1,000đ -> total = 17,000đ
    const highMargin = calculateRecipeCost({
      ingredients,
      yieldQuantity: 1,
      laborCost: 1600,
      overheadCost: 1000,
      productPrice: 45000,
    });

    assert.equal(highMargin.ingredientsCost, 14400);
    assert.equal(highMargin.optionalIngredientsCost, 3000);
    assert.equal(highMargin.unitCost, 17000);
    assert.equal(highMargin.marginAmount, 28000);
    assert.equal(highMargin.lowMarginWarning, false);

    // Low price (20,000đ): cost = 17,000đ -> profit = 3,000đ -> margin = 15% (<30%) -> lowMarginWarning = true
    const lowMargin = calculateRecipeCost({
      ingredients,
      yieldQuantity: 1,
      laborCost: 1600,
      overheadCost: 1000,
      productPrice: 20000,
    });

    assert.equal(lowMargin.marginPercent, 15);
    assert.equal(lowMargin.lowMarginWarning, true);
  });

  test('divides total recipe cost by yieldQuantity when yieldQuantity > 1', () => {
    const res = calculateRecipeCost({
      ingredients: [
        {
          ingredientId: 'ing-1',
          quantity: 100,
          unit: 'g',
          baseUnit: 'g',
          costPerBaseUnit: 200, // 20,000đ for batch of 2
          isOptional: false,
        },
      ],
      yieldQuantity: 2,
      laborCost: 2000,
      overheadCost: 0,
      productPrice: 30000,
    });

    // (20,000 + 2,000) / 2 = 11,000đ per yield unit
    assert.equal(res.unitCost, 11000);
  });
});

describe('5. OrderItem Cost Snapshot (calculateOrderItemCostSnapshot)', () => {
  test('calculates OrderItem snapshot with active recipe, FIFO ingredient cost, and toppings', () => {
    // 2 cups @ 45,000đ + 2 toppings @ 10,000đ = 110,000đ revenue
    // Ingredient FIFO cost for 2 cups = 28,000đ; Topping cost = 2 * 3,250đ = 6,500đ
    // Recipe labor + overhead = (1000 + 500) / 1 * 2 = 3,000đ -> totalCost = 37,500đ -> grossProfit = 72,500đ
    const snap = calculateOrderItemCostSnapshot({
      price: 45000,
      quantity: 2,
      ingredientCostTotal: 28000,
      toppings: [
        {
          toppingId: 'top-pearl',
          quantity: 2,
          price: 10000,
          unitCostSnapshot: 3250,
        },
      ],
      recipe: {
        yieldQuantity: 1,
        laborCost: 1000,
        overheadCost: 500,
      },
    });

    assert.equal(snap.ingredientCost.toNumber(), 28000);
    assert.equal(snap.toppingCost.toNumber(), 6500);
    assert.equal(snap.totalCost.toNumber(), 37500);
    assert.equal(snap.grossProfit.toNumber(), 72500);
  });

  test('supports fallback Product.costPrice * quantity when product has no active recipe', () => {
    // Product without recipe: fallbackProductCostPrice = 15,000đ * 2 = 30,000đ, price = 35,000đ * 2 = 70,000đ
    const snap = calculateOrderItemCostSnapshot({
      price: 35000,
      quantity: 2,
      recipe: null,
      fallbackProductCostPrice: 15000,
    });

    assert.equal(snap.ingredientCost.toNumber(), 30000);
    assert.equal(snap.toppingCost.toNumber(), 0);
    assert.equal(snap.totalCost.toNumber(), 30000);
    assert.equal(snap.grossProfit.toNumber(), 40000);
  });
});

describe('6. Idempotency & Reservation Release Lifecycle Simulation', () => {
  test('RESERVE -> COMPLETED deducts FIFO once and ignores duplicate COMPLETED via idempotencyKey', () => {
    const ledger = new Map();
    const state = {
      quantity: 1000,
      reservedQuantity: 0,
      batches: [
        {
          id: 'batch-1',
          batchCode: 'B-01',
          quantityRemaining: 1000,
          unitCost: 380,
          expirationDate: null,
          receivedAt: new Date(),
        },
      ],
    };

    const orderId = 'ord-1001';
    const ingredientId = 'ing-arabica';
    const requiredQty = 40;

    // Step 1: Create Order -> RESERVE
    const reserveKey = `ORDER_RESERVE:${orderId}:${ingredientId}`;
    if (!ledger.has(reserveKey)) {
      state.reservedQuantity += requiredQty;
      ledger.set(reserveKey, { type: 'RESERVE', qty: requiredQty });
    }
    assert.equal(state.quantity, 1000);
    assert.equal(state.reservedQuantity, 40);
    assert.equal(state.quantity - state.reservedQuantity, 960);

    // Step 2: Complete Order (1st time) -> FIFO CONSUME
    const completeOrder = () => {
      const fifo = allocateFifoBatches(state.batches, requiredQty, 'Arabica');
      for (const alloc of fifo.allocations) {
        const consumeKey = `ORDER_CONSUME:${orderId}:${ingredientId}:${alloc.batchId}`;
        if (ledger.has(consumeKey)) {
          return { skippedDuplicate: true };
        }
        const deducted = alloc.quantity.toNumber();
        state.quantity -= deducted;
        state.reservedQuantity = Math.max(0, state.reservedQuantity - deducted);
        state.batches[0].quantityRemaining -= deducted;
        ledger.set(consumeKey, {
          type: 'CONSUME',
          qty: deducted,
          totalCost: alloc.totalCost.toNumber(),
        });
      }
      return { skippedDuplicate: false, totalCost: fifo.totalCost.toNumber() };
    };

    const firstRun = completeOrder();
    assert.equal(firstRun.skippedDuplicate, false);
    assert.equal(firstRun.totalCost, 15200);
    assert.equal(state.quantity, 960);
    assert.equal(state.reservedQuantity, 0);

    // Step 3: Duplicate Complete Order call -> idempotencyKey prevents double deduction
    const secondRun = completeOrder();
    assert.equal(secondRun.skippedDuplicate, true);
    assert.equal(state.quantity, 960);
    assert.equal(state.reservedQuantity, 0);
  });

  test('RESERVE -> CANCELLED releases reservedQuantity back to available stock without deducting batches', () => {
    const state = {
      quantity: 500,
      reservedQuantity: 0,
    };

    // Reserve 50g
    state.reservedQuantity += 50;
    assert.equal(state.quantity - state.reservedQuantity, 450);

    // Cancel order -> RELEASE 50g
    const releaseQty = Math.min(state.reservedQuantity, 50);
    state.reservedQuantity -= releaseQty;

    assert.equal(state.quantity, 500);
    assert.equal(state.reservedQuantity, 0);
    assert.equal(state.quantity - state.reservedQuantity, 500);
  });
});
