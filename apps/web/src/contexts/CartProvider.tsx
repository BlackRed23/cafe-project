import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import type { Product } from "../types/product.types";

import type { CartItem } from "./CartContextState";
import { CartContext } from "./CartContextState";

const getInventoryQuantity = (product: Product): number | undefined => {
  const quantity = product.inventory?.quantity;
  return typeof quantity === "number" ? quantity : undefined;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const CART_STORAGE_KEY = user ? `cart_${user.id}` : null;

  const readItems = (): CartItem[] => {
    if (!CART_STORAGE_KEY) return [];
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const [items, setItems] = useState(readItems);
  const [previousStorageKey, setPreviousStorageKey] = useState(CART_STORAGE_KEY);
  if (CART_STORAGE_KEY !== previousStorageKey) {
    setPreviousStorageKey(CART_STORAGE_KEY);
    setItems(readItems());
  }

  // Save cart when items change
  useEffect(() => {
    if (CART_STORAGE_KEY) {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  }, [items, CART_STORAGE_KEY]);

  const addToCart = (product: Product, quantity: number) => {
    if (quantity <= 0) return false;

    const stockQuantity = getInventoryQuantity(product);
    if (stockQuantity !== undefined && stockQuantity <= 0) return false;

    let didAdd = true;

    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const nextQuantity = (existing?.quantity ?? 0) + quantity;

      if (stockQuantity !== undefined && nextQuantity > stockQuantity) {
        didAdd = false;
        return prev;
      }

      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: nextQuantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });

    return didAdd;
  };

  const removeFromCart = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return true;
    }

    const item = items.find((cartItem) => cartItem.product.id === productId);
    const stockQuantity = item ? getInventoryQuantity(item.product) : undefined;
    if (stockQuantity !== undefined && quantity > stockQuantity) return false;

    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );

    return true;
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalAmount = items.reduce((acc, item) => acc + item.product.price * item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalAmount,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
