import React, { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { useCart } from '../../contexts/CartContext';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Trash2, Plus, Minus, ShoppingBag, ArrowRight, AlertCircle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';


export default function Cart() {
  const { items, removeItem, updateQuantity, total, clearCart, restaurantId } = useCart();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<any>(null);

  useEffect(() => {
    const fetchRestaurant = async () => {
      if (!restaurantId) return;
      try {
        const docRef = doc(db, 'restaurants', restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRestaurant(docSnap.data());
        }
      } catch (error) {
        console.error("Error fetching restaurant:", error);
      }
    };

    fetchRestaurant();
  }, [restaurantId]);

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-stone-50 pb-24">
        <div className="w-24 h-24 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag className="w-12 h-12 text-stone-300" />
        </div>
        <h2 className="text-2xl font-bold text-stone-800 mb-2">Seu carrinho está vazio</h2>
        <p className="text-stone-500 mb-8 text-center max-w-xs">Que tal dar uma olhada nos restaurantes próximos e escolher algo delicioso?</p>
        <Link 
          to="/" 
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-emerald-200 transition-all active:scale-95 mb-8"
        >
          Ver Restaurantes
        </Link>
        <Navbar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-stone-800">Meu Carrinho</h1>
          <button onClick={clearCart} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden mb-8">
          <div className="p-6 border-b border-stone-100 bg-stone-50/50">
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Pedindo em</p>
            <h2 className="text-xl font-bold text-emerald-600">{items[0].restaurant_nome}</h2>
          </div>

          <div className="divide-y divide-stone-100">
            {items.map(item => {
              const extrasTotal = (item.adicionais || []).reduce((sum, extra) => sum + (extra.preco * extra.quantidade), 0);
              const itemTotal = (item.preco + extrasTotal) * item.quantidade;

              return (
                <div key={item.cartItemId} className="p-6 flex gap-4">
                  <div className="w-20 h-20 bg-stone-100 rounded-2xl overflow-hidden shrink-0">
                    <img src={item.imagem_url || 'https://picsum.photos/seed/product/200/200'} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                  </div>
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-stone-800">{item.nome}</h3>
                        {item.desconto_aplicado && item.desconto_aplicado > 0 && (
                          <p className="text-xs font-bold text-emerald-600 animate-blink">
                            Desconto de R$ {(item.desconto_aplicado * item.quantidade).toFixed(2)} aplicado
                          </p>
                        )}
                        {item.adicionais && item.adicionais.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.adicionais.map(extra => (
                              <p key={extra.id} className="text-xs text-stone-500">
                                + {extra.quantidade}x {extra.nome} (R$ {(extra.preco * extra.quantidade).toFixed(2)})
                              </p>
                            ))}
                          </div>
                        )}
                        {item.observacao && (
                          <p className="text-xs text-stone-500 mt-1 italic">Obs: {item.observacao}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end">
                        {item.preco_original && item.preco_original > item.preco && (
                          <span className="text-xs text-stone-400 line-through font-light">
                            R$ {((item.preco_original + extrasTotal) * item.quantidade).toFixed(2)}
                          </span>
                        )}
                        <span className="font-bold text-stone-800">R$ {itemTotal.toFixed(2)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center bg-stone-100 rounded-xl p-1">
                        <button 
                          onClick={() => {
                            if (item.quantidade > 1) {
                              updateQuantity(item.cartItemId, -1);
                            } else {
                              removeItem(item.cartItemId);
                            }
                          }}
                          className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-emerald-600 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-8 text-center font-bold text-stone-800">{item.quantidade}</span>
                        <button 
                          onClick={() => updateQuantity(item.cartItemId, 1)}
                          className="w-8 h-8 flex items-center justify-center text-stone-500 hover:text-emerald-600 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeItem(item.cartItemId)}
                        className="text-stone-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-4">
          {restaurant?.valor_minimo_pedido > total && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3 text-amber-800 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Pedido mínimo não atingido</p>
                <p>O valor mínimo para pedidos neste restaurante é de <strong>R$ {restaurant.valor_minimo_pedido.toFixed(2)}</strong>. Adicione mais R$ {(restaurant.valor_minimo_pedido - total).toFixed(2)} em itens.</p>
              </div>
            </div>
          )}
          
          <div className="flex justify-between text-stone-500">
            <span>Subtotal</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-stone-500">
            <span>Taxa de entrega</span>
            <span className="text-emerald-600 font-bold">Grátis</span>
          </div>
          <div className="pt-4 border-t border-stone-100 flex justify-between items-center">
            <span className="text-lg font-bold text-stone-800">Total</span>
            <span className="text-2xl font-bold text-emerald-600">R$ {total.toFixed(2)}</span>
          </div>
        </div>
      </main>

      {/* Footer Checkout Button & Navbar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 z-50">
        <div className="max-w-4xl mx-auto p-6 pb-20">
          <button 
            onClick={() => navigate('/checkout')}
            disabled={restaurant?.valor_minimo_pedido > total}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 px-8 rounded-2xl shadow-xl shadow-emerald-200 flex items-center justify-between group transition-all active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
          >
            <span className="font-bold text-lg">Escolher forma de pagamento</span>
            <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
        <Navbar />
      </div>
    </div>
  );
}
