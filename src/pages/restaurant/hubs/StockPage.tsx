import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { productService } from '../../../services/productService';
import { Search, Archive, AlertCircle, CheckCircle, RefreshCw, Save, Edit3 } from 'lucide-react';

export default function StockPage() {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchProducts = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const list = await productService.getProducts(restaurantId);
      setProducts(list || []);
    } catch (err) {
      console.error('Error fetching products for stock:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [restaurantId]);

  const handleToggleStock = async (product: any) => {
    if (!restaurantId || !product.id) return;
    setUpdatingId(product.id);
    try {
      const newDisponivel = !product.disponivel;
      await productService.updateProduct(restaurantId, product.id, {
        disponivel: newDisponivel
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, disponivel: newDisponivel } : p));
    } catch (err) {
      console.error('Error toggling availability:', err);
      alert('Erro ao atualizar disponibilidade.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateQuantity = async (product: any, newQty: number) => {
    if (!restaurantId || !product.id || isNaN(newQty)) return;
    setUpdatingId(product.id);
    try {
      await productService.updateProduct(restaurantId, product.id, {
        estoque_quantidade: Math.max(0, newQty),
        disponivel: newQty > 0
      });
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, estoque_quantidade: Math.max(0, newQty), disponivel: newQty > 0 } : p));
    } catch (err) {
      console.error('Error updating stock quantity:', err);
      alert('Erro ao atualizar estoque.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredProducts = products.filter(p =>
    (p.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.categoria || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div>
          <h3 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Archive className="w-5 h-5 text-emerald-600" />
            <span>Controle de Estoque</span>
          </h3>
          <p className="text-stone-500 text-sm">Gerencie o saldo e a disponibilidade dos produtos em tempo real.</p>
        </div>

        <button
          onClick={fetchProducts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-bold rounded-xl transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Estoque</span>
        </button>
      </div>

      <div className="relative">
        <Search className="w-5 h-5 absolute left-3.5 top-3 text-stone-400" />
        <input
          type="text"
          placeholder="Buscar produto ou categoria..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-stone-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {loading ? (
        <div className="p-12 text-center text-stone-400 bg-white rounded-3xl border border-stone-200">
          Carregando estoque...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="p-12 text-center text-stone-400 bg-white rounded-3xl border border-stone-200">
          Nenhum produto encontrado.
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-stone-500 text-xs font-bold uppercase tracking-wider">
                  <th className="p-4">Produto</th>
                  <th className="p-4">Categoria</th>
                  <th className="p-4 text-center">Disponibilidade</th>
                  <th className="p-4 text-center">Quantidade em Estoque</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-sm">
                {filteredProducts.map(product => {
                  const isAvailable = product.disponivel !== false;
                  const qty = product.estoque_quantidade ?? '-';

                  return (
                    <tr key={product.id} className="hover:bg-stone-50 transition-colors">
                      <td className="p-4 font-bold text-stone-800">
                        {product.nome}
                      </td>
                      <td className="p-4 text-stone-500 text-xs font-medium">
                        {product.categoria || 'Geral'}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleToggleStock(product)}
                          disabled={updatingId === product.id}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                            isAvailable
                              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-red-100 text-red-700 hover:bg-red-200'
                          }`}
                        >
                          {isAvailable ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          <span>{isAvailable ? 'Disponível' : 'Esgotado'}</span>
                        </button>
                      </td>
                      <td className="p-4 text-center">
                        <div className="inline-flex items-center gap-2">
                          <input
                            type="number"
                            defaultValue={qty === '-' ? 0 : qty}
                            onBlur={e => handleUpdateQuantity(product, parseInt(e.target.value))}
                            className="w-20 px-2 py-1 bg-stone-50 border border-stone-200 rounded-lg text-center font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
