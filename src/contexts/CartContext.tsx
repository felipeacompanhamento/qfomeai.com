import React, { createContext, useContext, useState, useEffect } from 'react';
import CartConflictModal from '../components/CartConflictModal';

export interface CartItemExtra {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
}

export interface CartItem {
  cartItemId: string; // Unique ID for the cart item instance
  id: string; // Product ID
  nome: string;
  preco: number;
  preco_original?: number;
  desconto_aplicado?: number;
  quantidade: number;
  imagem_url: string;
  restaurant_id: string;
  restaurant_nome: string;
  observacao?: string;
  adicionais?: CartItemExtra[];
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'cartItemId'>) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  total: number;
  restaurantId: string | null;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  total: 0,
  restaurantId: null,
});

export const useCart = () => useContext(CartContext);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    const saved = sessionStorage.getItem('@qfomeai:cart');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingItem, setPendingItem] = useState<Omit<CartItem, 'cartItemId'> | null>(null);

  useEffect(() => {
    sessionStorage.setItem('@qfomeai:cart', JSON.stringify(items));
  }, [items]);

  const addItem = (newItem: Omit<CartItem, 'cartItemId'>) => {
    if (items.length > 0 && items[0].restaurant_id !== newItem.restaurant_id) {
      setPendingItem(newItem);
      setShowConflictModal(true);
      return;
    }

    setItems(prev => {
      // Check if there's an exact match (same product, same extras, same observation)
      const existingIndex = prev.findIndex(i => {
        if (i.id !== newItem.id) return false;
        if (i.observacao !== newItem.observacao) return false;
        
        const existingExtras = i.adicionais || [];
        const newExtras = newItem.adicionais || [];
        if (existingExtras.length !== newExtras.length) return false;
        
        // Check if all extras match
        return existingExtras.every(ee => {
          const ne = newExtras.find(n => n.id === ee.id);
          return ne && ne.quantidade === ee.quantidade;
        });
      });

      if (existingIndex >= 0) {
        const newItems = [...prev];
        newItems[existingIndex].quantidade += newItem.quantidade;
        return newItems;
      }

      return [...prev, { ...newItem, cartItemId: Math.random().toString(36).substring(2, 9) }];
    });
  };

  const removeItem = (cartItemId: string) => {
    setItems(prev => prev.filter(i => i.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.cartItemId === cartItemId) {
        const newQuantity = Math.max(1, item.quantidade + delta);
        return { ...item, quantidade: newQuantity };
      }
      return item;
    }));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((acc, item) => {
    const extrasTotal = (item.adicionais || []).reduce((sum, extra) => sum + (extra.preco * extra.quantidade), 0);
    return acc + ((item.preco + extrasTotal) * item.quantidade);
  }, 0);
  
  const restaurantId = items.length > 0 ? items[0].restaurant_id : null;

  const handleConfirmConflict = () => {
    if (pendingItem) {
      setItems([{ ...pendingItem, cartItemId: Math.random().toString(36).substring(2, 9) }]);
      setPendingItem(null);
    }
    setShowConflictModal(false);
  };

  const handleCancelConflict = () => {
    setPendingItem(null);
    setShowConflictModal(false);
  };

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, total, restaurantId }}>
      {children}
      <CartConflictModal 
        isOpen={showConflictModal}
        onConfirm={handleConfirmConflict}
        onCancel={handleCancelConflict}
      />
    </CartContext.Provider>
  );
};
