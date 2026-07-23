import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { productService, Product } from '../../services/productService';
import { optionService, OptionGroup } from '../../services/optionService';
import { Plus, Edit2, Trash2, X, Check, AlertCircle, Loader2, Image as ImageIcon, Search, Filter, Settings2 } from 'lucide-react';
import PlaceholderImage from '../../components/PlaceholderImage';
import ImageUpload from '../../components/ImageUpload';

export default function RestaurantProducts({ adminRestaurantId }: { adminRestaurantId?: string }) {
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(adminRestaurantId || null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [availableGroups, setAvailableGroups] = useState<OptionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    categoria_id: '',
    categoria_nome: '',
    imagem_url: '',
    preco: 0,
    min_extras: 0,
    max_extras: 0,
    status: 'ativo' as 'ativo' | 'inativo',
    exibir_adicionais: true,
    sizes: [] as { nome: string; preco: number; aceita_metade: boolean }[],
    optionGroups: [] as { groupId: string; nome: string; ordem: number; obrigatorio: boolean; min: number; max: number }[]
  });

  useEffect(() => {
    if (adminRestaurantId) {
      setRestaurantId(adminRestaurantId);
      return;
    }
    const init = async () => {
      if (!user?.uid) return;
      
      try {
        const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(user.uid))?.id;
        if (rid) {
          setRestaurantId(rid);
        } else {
          setError("Restaurante não encontrado.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error initializing products:", err);
        setError("Erro ao identificar restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid, adminRestaurantId]);

  useEffect(() => {
    if (!restaurantId) return;

    const loadData = async () => {
      try {
        // Load categories
        const qCats = query(
          collection(db, 'restaurants', restaurantId, 'categories')
        );
        const catsSnapshot = await getDocs(qCats);
        const catsDocs = catsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeCats = catsDocs.filter((cat: any) => cat.status === 'ativo' || !cat.status);
        setCategories(activeCats);

        // Load sizes
        const qSizes = query(
          collection(db, 'restaurants', restaurantId, 'sizes'),
          orderBy('ordem', 'asc')
        );
        const sizesSnapshot = await getDocs(qSizes);
        const sizesDocs = sizesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const activeSizes = sizesDocs.filter((size: any) => size.status === 'ativo' || !size.status);
        setSizes(activeSizes);

        // Load option groups
        const groups = await optionService.getGroups(restaurantId);
        setAvailableGroups(groups);

        // Load products
        const products = await productService.getProducts(restaurantId);
        setProducts(products as Product[]);
        setLoading(false);
      } catch (err) {
        console.error("Error loading product data:", err);
        setError("Erro ao carregar dados.");
        setLoading(false);
      }
    };
    loadData();
  }, [restaurantId]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({
        nome: product.nome,
        descricao: product.descricao,
        categoria_id: product.categoria_id,
        categoria_nome: product.categoria_nome,
        imagem_url: product.imagem_url,
        preco: product.preco,
        min_extras: product.min_extras,
        max_extras: product.max_extras,
        status: product.status,
        exibir_adicionais: product.exibir_adicionais ?? true,
        sizes: product.sizes || [],
        optionGroups: product.optionGroups || []
      });
    } else {
      setEditingProduct(null);
      setFormData({
        nome: '',
        descricao: '',
        categoria_id: '',
        categoria_nome: '',
        imagem_url: '',
        preco: 0,
        min_extras: 0,
        max_extras: 0,
        status: 'ativo',
        exibir_adicionais: true,
        sizes: [],
        optionGroups: []
      });
    }
    setError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setFormData({
      nome: '',
      descricao: '',
      categoria_id: '',
      categoria_nome: '',
      imagem_url: '',
      preco: 0,
      min_extras: 0,
      max_extras: 0,
      status: 'ativo',
      exibir_adicionais: true,
      sizes: [],
      optionGroups: []
    });
  };

  const validateForm = () => {
    if (!formData.nome.trim()) return "Nome do produto é obrigatório.";
    if (!formData.categoria_id) return "Categoria é obrigatória.";
    if (formData.sizes.length === 0 && formData.preco <= 0) return "Preço deve ser maior que zero se nenhum tamanho for selecionado.";
    if (formData.sizes.length > 0 && formData.sizes.some(s => s.preco <= 0)) return "Preço do tamanho deve ser maior que zero.";
    if (formData.min_extras > formData.max_extras) return "Mínimo de adicionais não pode ser maior que o máximo.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!restaurantId) return;

    setSaveLoading(true);
    setError(null);

    try {
      // Find category name
      const category = categories.find(c => c.id === formData.categoria_id);
      const finalData = {
        ...formData,
        categoria_nome: category?.nome || '',
        preco: formData.sizes.length > 0 ? 0 : formData.preco
      };

      if (editingProduct?.id) {
        await productService.updateProduct(restaurantId, editingProduct.id, finalData);
        // Atualiza o estado local imediatamente
        setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...finalData } : p));
        setSuccessMessage("Produto atualizado com sucesso! Aguarde, ele será exibido em instantes.");
      } else {
        const newProductId = await productService.createProduct(restaurantId, finalData);
        // Atualiza o estado local imediatamente
        const newProduct = { id: newProductId, ...finalData } as Product;
        setProducts(prev => [newProduct, ...prev]);
        setSuccessMessage("Produto cadastrado com sucesso! Aguarde, ele será exibido em instantes.");
      }
      handleCloseModal();
      // Limpa a mensagem de sucesso após 5 segundos
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error saving product:", err);
      setError("Erro ao salvar produto. Tente novamente.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!restaurantId || !productToDelete?.id) return;

    setSaveLoading(true);
    try {
      await productService.deleteProduct(restaurantId, productToDelete.id);
      // Atualiza o estado local imediatamente
      setProducts(prev => prev.filter(p => p.id !== productToDelete.id));
      setSuccessMessage("Produto excluído com sucesso!");
      setIsDeleteModalOpen(false);
      setProductToDelete(null);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error("Error deleting product:", err);
      alert("Erro ao excluir produto.");
    } finally {
      setSaveLoading(false);
    }
  };

  const confirmDelete = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteModalOpen(true);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.descricao.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || p.categoria_id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Cardápio ({products.length})</h2>
          <p className="text-stone-500 text-sm">Gerencie os produtos do seu restaurante.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
        >
          <Plus className="w-5 h-5" />
          Novo Produto
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 text-sm font-bold animate-in fade-in slide-in-from-top-2">
          <Check className="w-5 h-5 shrink-0" />
          <p>{successMessage}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
        <div className="w-full md:w-64 relative">
          <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 w-4 h-4" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none"
          >
            <option value="all">Todas as Categorias</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.nome}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-100">
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Produto</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Categoria</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Preço</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-stone-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
                    <span className="text-stone-400 text-sm font-medium">Carregando produtos...</span>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-400">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                (() => {
                  const groups: { category: any; items: any[] }[] = [];
                  categories.forEach(cat => {
                    const items = filteredProducts.filter(p => p.categoria_id === cat.id);
                    if (items.length > 0) {
                      groups.push({ category: cat, items });
                    }
                  });

                  const uncategorized = filteredProducts.filter(p => 
                    !p.categoria_id || !categories.find(c => c.id === p.categoria_id)
                  );
                  if (uncategorized.length > 0) {
                    groups.push({ category: { id: 'uncategorized', nome: 'Outros' }, items: uncategorized });
                  }

                  return groups.map((group) => (
                    <React.Fragment key={group.category.id}>
                      <tr className="bg-stone-50/80 border-y border-stone-100/50">
                        <td colSpan={5} className="px-6 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={`w-1 h-3.5 rounded-full ${group.category.id === 'uncategorized' ? 'bg-stone-300' : 'bg-emerald-500'}`} />
                            <span className="text-[10px] font-black text-stone-600 uppercase tracking-widest">
                              {group.category.nome} <span className="ml-1 text-stone-400">({group.items.length})</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                      {group.items.map((product) => (
                        <tr key={product.id} className="hover:bg-stone-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-stone-100 rounded-xl overflow-hidden shrink-0 border border-stone-200">
                                <PlaceholderImage 
                                  src={product.imagem_url} 
                                  type="produto" 
                                  className="w-full h-full object-cover" 
                                  alt={product.nome}
                                />
                              </div>
                              <div>
                                <p className="font-bold text-stone-800">{product.nome}</p>
                                <p className="text-xs text-stone-500 line-clamp-1">{product.descricao}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium text-stone-600 bg-stone-100 px-2.5 py-1 rounded-lg">
                              {product.categoria_nome}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-bold text-stone-800">R$ {product.preco.toFixed(2)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                              product.status === 'ativo' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                            }`}>
                              {product.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenModal(product)}
                                className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                title="Editar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => confirmDelete(product)}
                                className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ));
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50 shrink-0">
              <div>
                <h3 className="text-xl font-bold text-stone-800">
                  {editingProduct ? 'Editar Produto' : 'Novo Produto'}
                </h3>
                <p className="text-xs text-stone-500 font-medium">Preencha as informações abaixo.</p>
              </div>
              <button onClick={handleCloseModal} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
                <X className="w-5 h-5 text-stone-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
              {error && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-bold">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="space-y-6">
                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    Informações Básicas
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-stone-700 mb-1">Nome do Produto <span className="text-emerald-600">*</span></label>
                        <input
                          type="text"
                          required
                          value={formData.nome}
                          onChange={e => setFormData({ ...formData, nome: e.target.value })}
                          placeholder="Ex: Pizza Calabresa G"
                          className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-stone-700 mb-1">Categoria <span className="text-emerald-600">*</span></label>
                        <select
                          required
                          value={formData.categoria_id}
                          onChange={e => setFormData({ ...formData, categoria_id: e.target.value })}
                          className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        >
                          <option value="">Selecione uma categoria</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-stone-700 mb-1">Preço (R$) <span className="text-emerald-600">*</span></label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={Number.isNaN(formData.preco) ? '' : formData.preco}
                          onChange={e => setFormData({ ...formData, preco: parseFloat(e.target.value) })}
                          className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-stone-700 mb-1">Status</label>
                        <div className="flex gap-4">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, status: 'ativo' })}
                            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border ${
                              formData.status === 'ativo' 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                                : 'bg-stone-50 border-stone-200 text-stone-400'
                            }`}
                          >
                            Ativo
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, status: 'inativo' })}
                            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all border ${
                              formData.status === 'inativo' 
                                ? 'bg-red-50 border-red-200 text-red-600' 
                                : 'bg-stone-50 border-stone-200 text-stone-400'
                            }`}
                          >
                            Inativo
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.exibir_adicionais}
                            onChange={e => setFormData({ ...formData, exibir_adicionais: e.target.checked })}
                            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-bold text-stone-700">Exibir adicionais</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    Tamanhos
                  </h4>
                  <div className="space-y-2">
                    {sizes.map((size) => {
                      const selectedSize = formData.sizes.find(s => s.nome === size.nome);
                      return (
                        <div key={size.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
                          <input
                            type="checkbox"
                            checked={!!selectedSize}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, sizes: [...formData.sizes, { nome: size.nome, preco: 0, aceita_metade: false }] });
                              } else {
                                setFormData({ ...formData, sizes: formData.sizes.filter(s => s.nome !== size.nome) });
                              }
                            }}
                            className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="flex-1 font-bold text-stone-700">{size.nome}</span>
                          {selectedSize && (
                            <>
                              <input
                                type="number"
                                placeholder="Preço"
                                value={Number.isNaN(selectedSize.preco) ? '' : selectedSize.preco}
                                onChange={(e) => setFormData({
                                  ...formData,
                                  sizes: formData.sizes.map(s => s.nome === size.nome ? { ...s, preco: parseFloat(e.target.value) } : s)
                                })}
                                className="w-24 px-2 py-1 border border-stone-200 rounded-lg"
                              />
                              <label className="flex items-center gap-1 text-xs font-bold text-stone-600">
                                <input
                                  type="checkbox"
                                  checked={selectedSize.aceita_metade}
                                  onChange={(e) => setFormData({
                                    ...formData,
                                    sizes: formData.sizes.map(s => s.nome === size.nome ? { ...s, aceita_metade: e.target.checked } : s)
                                  })}
                                />
                                Metade
                              </label>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ImageUpload
                      label="Imagem do Produto"
                      path={`restaurants/${restaurantId}/products`}
                      onUploadComplete={(url) => setFormData({ ...formData, imagem_url: url })}
                      currentImageUrl={formData.imagem_url}
                      processProductImage={true}
                    />

                    <div>
                      <label className="block text-sm font-bold text-stone-700 mb-1">Descrição Breve</label>
                      <textarea
                        value={formData.descricao}
                        onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                        placeholder="Descreva os ingredientes, tamanho, etc."
                        className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all h-32 resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-stone-100 shadow-sm">
                  <h4 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                    Grupos de Opções
                  </h4>
                  <div className="space-y-3">
                    {availableGroups.length === 0 ? (
                      <p className="text-sm text-stone-400 italic">Nenhum grupo de opções cadastrado.</p>
                    ) : (
                      availableGroups.map(group => {
                        const selectedGroup = formData.optionGroups.find(g => g.groupId === group.id);
                        return (
                          <div key={group.id} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={!!selectedGroup}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      optionGroups: [...formData.optionGroups, {
                                        groupId: group.id!,
                                        nome: group.nome,
                                        ordem: group.ordem || 0,
                                        obrigatorio: false,
                                        min: 0,
                                        max: 1
                                      }]
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      optionGroups: formData.optionGroups.filter(g => g.groupId !== group.id)
                                    });
                                  }
                                }}
                                className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <div className="flex-1">
                                <p className="font-bold text-stone-700">{group.nome}</p>
                                {group.descricao && <p className="text-[10px] text-stone-500">{group.descricao}</p>}
                              </div>
                            </div>

                            {selectedGroup && (
                              <div className="pl-8 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-left-2">
                                <label className="flex items-center gap-2 text-xs font-bold text-stone-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedGroup.obrigatorio}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, obrigatorio: e.target.checked } : g)
                                    })}
                                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                                  />
                                  Obrigatório
                                </label>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-stone-400 uppercase">Min</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={selectedGroup.min}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, min: parseInt(e.target.value) || 0 } : g)
                                    })}
                                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded-lg text-xs"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-bold text-stone-400 uppercase">Max</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={selectedGroup.max}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      optionGroups: formData.optionGroups.map(g => g.groupId === group.id ? { ...g, max: parseInt(e.target.value) || 1 } : g)
                                    })}
                                    className="w-full px-2 py-1 bg-white border border-stone-200 rounded-lg text-xs"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="bg-stone-50 p-6 rounded-3xl border border-stone-100 space-y-4">
                  <h4 className="font-bold text-stone-800 flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-emerald-600" />
                    Limites de Adicionais
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Mínimo</label>
                      <input
                        type="number"
                        min="0"
                        value={Number.isNaN(formData.min_extras) ? '' : formData.min_extras}
                        onChange={e => setFormData({ ...formData, min_extras: parseInt(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase mb-1">Máximo</label>
                      <input
                        type="number"
                        min="0"
                        value={Number.isNaN(formData.max_extras) ? '' : formData.max_extras}
                        onChange={e => setFormData({ ...formData, max_extras: parseInt(e.target.value) })}
                        className="w-full px-4 py-3 bg-white border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-400 font-medium italic">
                    * Define quantos adicionais o cliente pode/deve escolher para este produto.
                  </p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-6 py-4 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="flex-2 px-6 py-4 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveLoading && <Loader2 className="w-5 h-5 animate-spin" />}
                  {editingProduct ? 'Salvar Alterações' : 'Criar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Exclusão */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-stone-800">Excluir Produto</h3>
                <p className="text-stone-500 text-sm mt-1">
                  Tem certeza que deseja excluir o produto <strong>{productToDelete?.nome}</strong>? 
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setProductToDelete(null);
                  }}
                  className="flex-1 px-4 py-3 bg-stone-100 text-stone-600 font-bold rounded-2xl hover:bg-stone-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saveLoading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saveLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusCircle({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>
    </svg>
  );
}
