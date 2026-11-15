export type Field = { key: string; label: string; value?: string | boolean | number; options?: string[]; ref?: string; fields?: Field[]; optional?: boolean; kind?: 'text' | 'decimal' | 'integer' | 'boolean' | 'timestamp' | 'date'; min?: number };
export type Action = { label: string; path: string; fields: Field[]; admin?: boolean };
export type Area = 'menu' | 'inventory' | 'orders' | 'purchases' | 'counts' | 'payments' | 'agent';
const text = (key: string, label: string, value = '', ref?: string): Field => ({ key, label, value, ref });
const decimal = (key: string, label: string, value = '1'): Field => ({ key, label, value, kind: 'decimal' });
const select = (key: string, label: string, options: string[]): Field => ({ key, label, value: options[0], options });
const rows = (key: string, label: string, fields: Field[], optional = false): Field => ({ key, label, fields, optional });
export const isFieldGroup = (field: Field) => ['proposal', 'input', 'replenishment'].includes(field.key);
const ingredient = () => text('ingredientId', 'Ingredient', 'beans', 'ingredients');
const unit = () => select('unit', 'Unit', ['g', 'kg', 'ml', 'l', 'piece']);
const purchaseFields = [text('supplierId', 'Supplier', 'full-supplier', 'quotes'), rows('lines', 'Purchase lines', [ingredient(), decimal('quantity', 'Base quantity', '36'), decimal('unitCost', 'Cost per base unit', '0.1')])];
const receiptFields = [text('purchaseId', 'Purchase', '', 'purchases'), rows('lines', 'Received lots', [ingredient(), decimal('quantity', 'Base quantity', '36'), { key: 'expirationDate', label: 'Expiry (UTC)', kind: 'timestamp', value: '2027-02-01T00:00:00.000Z' }])];
const countFields = rows('lines', 'Count lines', [text('batchId', 'Lot', 'early', 'lots'), decimal('actual', 'Actual physical quantity', '100')]);
const orderId = () => text('orderId', 'Order', '', 'orders');
const paymentId = () => text('paymentId', 'Payment', '', 'payments');
const receiptId = () => text('receiptId', 'Receipt', '', 'receipts');
const countId = () => text('countId', 'Stock count', '', 'counts');
const executionId = () => text('executionId', 'Proposal', '', 'executions');
const itemIds = () => rows('itemIds', 'Selected item IDs (empty = all eligible)', [text('value', 'Item ID')], true);
const reason = () => text('reason', 'Reason');
export const actions: Record<Area, Action[]> = {
  menu: [
    { label: 'Save recipe draft', path: '/menu/draft', admin: true, fields: [text('productId', 'Product ID', 'new-coffee'), text('name', 'Name', 'New coffee'), decimal('price', 'Sale price', '30'), decimal('yieldQuantity', 'Recipe yield', '1'), rows('ingredients', 'Recipe ingredients', [ingredient(), decimal('quantity', 'Quantity', '18'), unit(), { key: 'optional', label: 'Optional ingredient', kind: 'boolean', value: false }])] },
    { label: 'Archive product', path: '/menu/archive', admin: true, fields: [text('productId', 'Product', '', 'menu')] },
    { label: 'Publish recipe', path: '/menu/publish', admin: true, fields: [text('productId', 'Product', '', 'menu')] },
  ],
  inventory: [{ label: 'Rename ingredient', path: '/ingredients/edit', admin: true, fields: [ingredient(), text('name', 'Name')] }],
  orders: [
    { label: 'Create order', path: '/orders', fields: [decimal('amount', 'POS gross total', '30'), rows('items', 'Order items', [text('productId', 'Product', 'coffee', 'menu'), { key: 'servings', label: 'Servings', kind: 'integer', value: '1' }, rows('omitted', 'Omitted ingredient IDs', [text('value', 'Ingredient ID')], true), rows('effects', 'Added ingredients / toppings', [select('type', 'Effect', ['ADD']), ingredient(), select('baseUnit', 'Base unit', ['g', 'ml', 'piece']), decimal('quantity', 'Quantity'), unit(), { key: 'active', label: 'Active', kind: 'boolean', value: true }], true)])] },
    { label: 'Change order state', path: '/orders/transition', fields: [orderId(), select('action', 'Action', ['prepare', 'complete', 'cancel']), itemIds(), { ...reason(), optional: true }] },
    { label: 'Remake items', path: '/orders/remake', fields: [orderId(), reason(), itemIds()] },
  ],
  purchases: [
    { label: 'Resolve supplier credit', path: '/purchases/credit', admin: true, fields: [text('purchaseId', 'Source purchase', '', 'purchases'), decimal('amount', 'Credit amount'), reason(), { ...text('targetPurchaseId', 'Target purchase (empty = supplier refund)', '', 'purchases'), optional: true }] },
    { label: 'Register mock supplier payment', path: '/purchases/settle', admin: true, fields: [text('purchaseId', 'Purchase', '', 'purchases'), decimal('amount', 'Paid amount'), reason()] },
    { label: 'Create purchase request', path: '/purchases', fields: purchaseFields },
    { label: 'Draft receipt', path: '/receipts/draft', fields: receiptFields },
    { label: 'Edit receipt draft', path: '/receipts/edit', fields: [receiptId(), ...receiptFields] },
    { label: 'Confirm receipt', path: '/receipts/confirm', fields: [receiptId()] },
    { label: 'Receive directly', path: '/receipts/receive', fields: receiptFields },
    { label: 'Correct received stock', path: '/receipts/correct', fields: [receiptId(), text('lineId', 'Receipt line ID'), decimal('quantity', 'Correction quantity'), reason(), select('disposition', 'Disposition', ['RETURN_AVAILABLE', 'RETURN_AND_CREDIT_CONSUMED'])] },
  ],
  counts: [
    { label: 'Create stock count', path: '/counts', fields: [countFields] },
    { label: 'Edit count draft', path: '/counts/edit', fields: [countId(), countFields] },
    { label: 'Submit count', path: '/counts/submit', fields: [countId()] },
    { label: 'Approve count', path: '/counts/approve', admin: true, fields: [countId(), { ...text('selfApprovalReason', 'Reason if approving own count'), optional: true }] },
  ],
  payments: [
    { label: 'Create payment attempt', path: '/payments/attempt', admin: true, fields: [orderId(), text('account', 'Mock account', 'cash')] },
    { label: 'Inject mock settlement', path: '/payments/settle', admin: true, fields: [paymentId(), text('account', 'Mock account', 'cash'), text('eventId', 'Unique event ID'), decimal('amount', 'Amount', '30'), select('outcome', 'Outcome', ['SETTLED', 'FAILED'])] },
    { label: 'Request refund', path: '/refunds/request', admin: true, fields: [paymentId(), decimal('amount', 'Amount')] },
    { label: 'Resolve refund event', path: '/refunds/resolve', admin: true, fields: [paymentId(), text('refundId', 'Refund ID'), text('account', 'Mock account', 'cash'), text('eventId', 'Unique event ID'), select('outcome', 'Outcome', ['UNKNOWN', 'SUCCEEDED', 'FAILED'])] },
    { label: 'Apply mock refund', path: '/payments/refund', admin: true, fields: [paymentId(), decimal('amount', 'Amount')] },
    { label: 'Reconcile account / UTC date', path: '/payments/reconcile', admin: true, fields: [text('account', 'Mock account', 'cash'), { key: 'date', label: 'Accounting date (UTC)', kind: 'date', value: '2026-11-07' }, decimal('expectedGross', 'Expected gross', '30'), decimal('expectedRefunds', 'Expected refunds', '0')] },
  ],
  agent: [
    { label: 'Propose purchase', path: '/agent/plan', fields: [{ key: 'budget', label: 'Tool budget', kind: 'integer', value: 2 }, rows('proposal', 'Purchase proposal', purchaseFields)] },
    { label: 'Plan replenishment', path: '/agent/plan', fields: [
      { key: 'budget', label: 'Tool budget', kind: 'integer', value: 7 },
      rows('replenishment', 'Replenishment inputs', [text('supplierId', 'Supplier', '', 'quotes'),
        rows('unitCosts', 'Ingredient costs', [text('ingredientId', 'Ingredient', '', 'ingredients'), decimal('unitCost', 'Cost per base unit', '')])]),
    ] },
    { label: 'Plan inventory inspection', path: '/agent/plan', fields: [select('prompt', 'Inspection', ['read inventory', 'recommend']), { key: 'budget', label: 'Tool budget', kind: 'integer', value: 1 }] },
    { label: 'Revise proposal', path: '/agent/revise', fields: [executionId(), text('expectedRevision', 'Current revision', '1'), rows('plan', 'Proposed steps', [select('tool', 'Tool', ['purchase.create']), rows('input', 'Purchase', purchaseFields)])] },
    { label: 'Approve proposal', path: '/agent/approve', admin: true, fields: [executionId(), text('expectedHash', 'Reviewed proposal hash'), { key: 'expiresAt', label: 'Approval expiry (UTC)', kind: 'timestamp', value: '' }] },
    { label: 'Revoke approval', path: '/agent/revoke', admin: true, fields: [text('approvalId', 'Approval ID')] },
    { label: 'Execute approved proposal', path: '/agent/execute', fields: [executionId()] },
    { label: 'Cancel replenishment', path: '/agent/cancel', fields: [executionId()] },
    { label: 'Remember', path: '/agent/memory/remember', fields: [text('text', 'Memory text')] },
    { label: 'Learn memory', path: '/agent/memory/learn', fields: [text('memoryId', 'Memory', '', 'memories')] },
    { label: 'Consolidate memory', path: '/agent/memory/consolidate', fields: [] },
    { label: 'Forget memory', path: '/agent/memory/forget', fields: [text('memoryId', 'Memory', '', 'memories')] },
  ],
};
export type Values = Record<string, any>;
export const defaults = (fields: Field[]): Values => Object.fromEntries(fields.map(f => [f.key, f.fields ? (isFieldGroup(f) ? defaults(f.fields) : f.optional ? [] : [defaults(f.fields)]) : f.value ?? '']));
export function payload(fields: Field[], values: Values): Values {
  return Object.fromEntries(fields.flatMap(f => {
    const v = values[f.key];
    if (f.fields) {
      if (isFieldGroup(f)) return [[f.key, payload(f.fields, v)]];
      if (f.key === 'unitCosts') {
        const entries = (v as Values[]).map(row => [row.ingredientId, row.unitCost] as const);
        if (new Set(entries.map(([id]) => id)).size !== entries.length) throw new Error('Enter one cost per ingredient.');
        return [[f.key, Object.fromEntries(entries)]];
      }
      if (f.optional && !v.length && f.key === 'itemIds') return [];
      return [[f.key, v.map((row: Values) => f.fields![0]?.key === 'value' ? row.value : payload(f.fields!, row))]];
    }
    if (f.optional && v === '' && f.key !== 'selfApprovalReason') return [];
    if (f.kind === 'integer') return [[f.key, ['budget'].includes(f.key) ? Number(v) : String(v)]];
    return [[f.key, v]];
  }));
}
/** Use versions of records shown to operator, never refresh guards while submitting a form. */
export function versionGuards(input: Values, data: Values): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of ['productId', 'ingredientId', 'orderId', 'purchaseId', 'receiptId', 'targetPurchaseId']) {
    const id = input[field]; if (!id) continue;
    const record = Object.values(data).flat().find((row: any) => row.id === id && row.version);
    if (record) result[id] = record.version;
    if (field === 'receiptId' && record?.purchaseId) {
      const purchase = data.purchases?.find((p: any) => p.id === record.purchaseId); if (purchase) result[purchase.id] = purchase.version;
    }
  }
  return result;
}
