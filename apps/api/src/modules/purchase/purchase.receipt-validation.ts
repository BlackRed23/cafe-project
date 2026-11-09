// Shared by the HTTP schema and the repository boundary (which can be called directly).
export const duplicateReceiptItemIndex = (items: readonly { purchaseRequestItemId: string }[]): number => {
    const seen = new Set<string>();
    return items.findIndex(item => {
        const id = item.purchaseRequestItemId.trim();
        if (seen.has(id)) return true;
        seen.add(id);
        return false;
    });
};
