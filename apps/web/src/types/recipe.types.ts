export interface RecipeIngredientItem {
  id?: string;
  ingredientId: string;
  ingredientName?: string;
  ingredientSku?: string;
  baseUnit?: string;
  costPerBaseUnit?: number;
  quantity: number;
  unit: string;
  quantityBase?: number;
  lineCost?: number;
  isOptional: boolean;
  allowSubstitute: boolean;
  note?: string | null;
}

export interface RecipeCostSummary {
  ingredientsCost: number;
  optionalIngredientsCost: number;
  laborCost: number;
  overheadCost: number;
  yieldQuantity: number;
  totalBatchCost: number;
  unitCost: number;
  productPrice: number;
  marginAmount: number;
  marginPercent: number;
  lowMarginWarning: boolean;
}

export interface Recipe {
  id: string;
  productId: string;
  productName: string;
  version: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  yieldQuantity: number;
  laborCost: number;
  overheadCost: number;
  note: string | null;
  ingredients: RecipeIngredientItem[];
  costSummary: RecipeCostSummary;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecipePayload {
  yieldQuantity?: number;
  laborCost?: number;
  overheadCost?: number;
  note?: string | null;
  activate?: boolean;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
    isOptional?: boolean;
    allowSubstitute?: boolean;
    note?: string | null;
  }>;
}

export interface PreviewRecipeCostPayload {
  yieldQuantity?: number;
  laborCost?: number;
  overheadCost?: number;
  productPrice?: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
    isOptional?: boolean;
    allowSubstitute?: boolean;
    note?: string | null;
  }>;
}

export interface PreviewRecipeCostResponse {
  breakdown: RecipeIngredientItem[];
  ingredientsCost: number;
  optionalIngredientsCost: number;
  laborCost: number;
  overheadCost: number;
  yieldQuantity: number;
  totalBatchCost: number;
  unitCost: number;
  price: number;
  marginAmount: number;
  marginPercent: number;
  lowMarginWarning: boolean;
}
