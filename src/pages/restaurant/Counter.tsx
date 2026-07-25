import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { productService } from '../../services/productService';
import { restaurantService } from '../../services/restaurantService';
import { optionService, OptionItem } from '../../services/optionService';
import { counterOrderService, CounterCartItem } from '../../services/counterOrderService';
import { 
  getProductPriceForChannel, 
  isProductAvailableForChannel 
} from '../../domain/product/productChannels';
import { printThermalOrder } from '../../components/orders/OrderThermalPrint';
import { 
  formatCurrency, 
  parseCurrencyDigits 
} from '../../utils/currencyUtils';
import { 
  Store, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  Check, 
  Printer, 
  Loader2, 
  X, 
  Utensils, 
  User, 
  ShoppingBag, 
  Coins,
  CreditCard,
  QrCode,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

export default function CounterPage({ restaurantProfile }: { restaurantProfile: any }) {
  const { user, profile } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [activeRestaurantProfile, setActiveRestaurantProfile] = useState<any>(restaurantProfile || null);

  // States
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [allOptionItems, setAllOptionItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Mobile View Switcher ('catalog' | 'cart')
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');

  // Service Mode
  const [serviceMode, setServiceMode] = useState<'DINE_IN' | 'COUNTER' | 'PICKUP'>('COUNTER');
  const [clientName, setClientName] = useState<string>('');
  const [clientNameError, setClientNameError] = useState<string | null>(null);

  // Stable clientActionId ref for idempotency
  const clientActionIdRef = useRef<string | null>(null);

  // Cart
  const [cart, setCart] = useState<CounterCartItem[]>([]);
  
  // Payment states
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [isPaid, setIsPaid] = useState<boolean>(true);
  
  // Digits typing string state for amount paid in cash (e.g. "5000" -> R$ 50,00)
  const [amountPaidDigits, setAmountPaidDigits] = useState<string>('');

  // Customization modal state
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedSize, setSelectedSize] = useState<any | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, OptionItem[]>>({});
  const [customizationObs, setCustomizationObs] = useState<string>('');

  // Execution / Modal states
  const [saveLoading, setSaveLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Init restaurant ID & Profile
  useEffect(() => {
    const init = async () => {
      try {
        let rid = profile?.restaurantId;
        if (!rid && user?.uid) {
          const res = await restaurantService.getRestaurantByOwnerId(user.uid);
          rid = res?.id;
          if (res) setActiveRestaurantProfile(res);
        } else if (rid && !activeRestaurantProfile) {
          const res = await restaurantService.getRestaurantById(rid);
          if (res) setActiveRestaurantProfile(res);
        }

        if (rid) {
          setRestaurantId(rid);
        } else {
          setError("Restaurante não identificado.");
          setLoading(false);
        }
      } catch (err) {
        console.error("Error identifying restaurant for Counter:", err);
        setError("Erro ao identificar o restaurante.");
        setLoading(false);
      }
    };
    init();
  }, [profile?.restaurantId, user?.uid]);

  // Load operational data
  useEffect(() => {
    if (!restaurantId) return;

    const loadAllData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [catsDocs, prodDocs, optsDocs] = await Promise.all([
          restaurantService.getRestaurantCategories(restaurantId),
          productService.getProducts(restaurantId),
          optionService.getAllOptions(restaurantId)
        ]);

        setCategories(catsDocs || []);
        setProducts(prodDocs || []);
        setAllOptionItems(optsDocs || []);
      } catch (err) {
        console.error("Error fetching Counter operational data:", err);
        setError("Erro ao carregar dados operacionais. Por favor, tente novamente.");
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, [restaurantId]);

  // Configured payment methods from restaurant profile respecting serviceMode
  const availablePaymentMethods = useMemo(() => {
    const defaultMethods = [
      { id: 'dinheiro', label: 'Dinheiro', icon: Coins },
      { id: 'pix', label: 'PIX', icon: QrCode },
      { id: 'credito', label: 'Cartão de Crédito', icon: CreditCard },
      { id: 'debito', label: 'Cartão de Débito', icon: CreditCard }
    ];

    if (!activeRestaurantProfile) return defaultMethods;

    const configured = activeRestaurantProfile.formas_pagamento || activeRestaurantProfile.payment_methods;
    if (!configured || typeof configured !== 'object') return defaultMethods;

    const validMethods = ['dinheiro', 'pix', 'credito', 'debito'] as const;
    const hasAnyKey = validMethods.some(mId => {
      let v: any = undefined;
      if (mId === 'dinheiro') v = configured.dinheiro;
      else if (mId === 'pix') v = configured.pix;
      else if (mId === 'credito') v = configured.credito ?? configured.cartao_credito;
      else if (mId === 'debito') v = configured.debito ?? configured.cartao_debito;
      return v !== undefined;
    });

    if (!hasAnyKey) return defaultMethods;

    return defaultMethods.filter(m => {
      let val: any = undefined;
      if (m.id === 'dinheiro') val = configured.dinheiro;
      else if (m.id === 'pix') val = configured.pix;
      else if (m.id === 'credito') val = configured.credito ?? configured.cartao_credito;
      else if (m.id === 'debito') val = configured.debito ?? configured.cartao_debito;

      if (val === undefined) return false;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null) {
        if (serviceMode === 'COUNTER') {
          return val.balcao === true || val.counter === true;
        } else if (serviceMode === 'PICKUP') {
          return val.retirada === true || val.pickup === true;
        } else if (serviceMode === 'DINE_IN') {
          return val.consumoLocal === true || val.dine_in === true || val.dineIn === true || val.mesa === true;
        }
      }
      return false;
    });
  }, [activeRestaurantProfile, serviceMode]);

  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      if (!paymentMethod || !availablePaymentMethods.some(m => m.id === paymentMethod)) {
        setPaymentMethod(availablePaymentMethods[0].id);
      }
    } else {
      setPaymentMethod('');
    }
  }, [availablePaymentMethods]);

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (!isProductAvailableForChannel(p, 'counter')) return false;
      if (selectedCategory !== 'todos' && p.categoria_id !== selectedCategory) return false;
      if (searchQuery.trim() !== '') {
        const queryNorm = searchQuery.toLowerCase();
        const nameNorm = (p.nome || '').toLowerCase();
        const descNorm = (p.descricao || '').toLowerCase();
        return nameNorm.includes(queryNorm) || descNorm.includes(queryNorm);
      }
      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations in cents
  const cartSubtotalCents = useMemo(() => {
    return cart.reduce((sum, item) => sum + Math.round(Number(item.precoFinal || 0) * 100) * item.quantidade, 0);
  }, [cart]);

  const cartTotalCents = cartSubtotalCents;
  const cartTotal = cartTotalCents / 100;

  const amountPaidParsed = useMemo(() => {
    return parseCurrencyDigits(amountPaidDigits);
  }, [amountPaidDigits]);

  const changeDueCents = useMemo(() => {
    if (paymentMethod !== 'dinheiro' || !isPaid) return 0;
    const paidCents = Math.round(amountPaidParsed.numberValue * 100);
    if (paidCents <= cartTotalCents) return 0;
    return paidCents - cartTotalCents;
  }, [paymentMethod, isPaid, amountPaidParsed.numberValue, cartTotalCents]);

  const changeDue = changeDueCents / 100;

  const isCashAmountInsufficient = useMemo(() => {
    if (paymentMethod !== 'dinheiro' || !isPaid) return false;
    const paidCents = Math.round(amountPaidParsed.numberValue * 100);
    return paidCents > 0 && paidCents < cartTotalCents;
  }, [paymentMethod, isPaid, amountPaidParsed.numberValue, cartTotalCents]);

  // Handle customization open
  const handleProductClick = (product: any) => {
    setCustomizingProduct(product);
    if (product.sizes && product.sizes.length > 0) {
      setSelectedSize(product.sizes[0]);
    } else {
      setSelectedSize(null);
    }
    setSelectedOptions({});
    setCustomizationObs('');
  };

  const isCustomizationValid = useMemo(() => {
    if (!customizingProduct) return false;
    const groups = customizingProduct.optionGroups || [];
    for (const group of groups) {
      if (group.obrigatorio) {
        const selections = selectedOptions[group.groupId] || [];
        const count = selections.length;
        const min = group.min || 1;
        if (count < min) return false;
      }
    }
    return true;
  }, [customizingProduct, selectedOptions]);

  const handleOptionToggle = (group: any, option: OptionItem, isSingleSelection: boolean) => {
    const groupId = group.groupId;
    const currentSelections = selectedOptions[groupId] || [];
    const max = group.max || 1;

    if (isSingleSelection) {
      setSelectedOptions(prev => ({
        ...prev,
        [groupId]: [option]
      }));
    } else {
      const exists = currentSelections.some(item => item.id === option.id);
      if (exists) {
        setSelectedOptions(prev => ({
          ...prev,
          [groupId]: currentSelections.filter(item => item.id !== option.id)
        }));
      } else {
        if (currentSelections.length >= max) {
          if (max === 1) {
            setSelectedOptions(prev => ({
              ...prev,
              [groupId]: [option]
            }));
          } else {
            return;
          }
        } else {
          setSelectedOptions(prev => ({
            ...prev,
            [groupId]: [...currentSelections, option]
          }));
        }
      }
    }
  };

  const handleAddToCart = () => {
    if (!customizingProduct) return;

    const basePrice = selectedSize 
      ? Number(selectedSize.preco || 0) 
      : getProductPriceForChannel(customizingProduct, 'counter');
    
    const additionalsTotal = Object.values(selectedOptions)
      .flat()
      .reduce((sum, opt) => sum + Number(opt.preco || 0), 0);

    const priceFinal = basePrice + additionalsTotal;

    const additionalsFlattened = Object.entries(selectedOptions).flatMap(([grpId, items]) => {
      const groupName = customizingProduct.optionGroups?.find((g: any) => g.groupId === grpId)?.nome || 'Adicional';
      return items.map(it => ({
        id: it.id || '',
        nome: it.nome,
        preco: Number(it.preco || 0),
        grupoId: grpId,
        grupoNome: groupName
      }));
    });

    const newCartItem: CounterCartItem = {
      cartId: `${customizingProduct.id}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: customizingProduct.id || '',
      nome: customizingProduct.nome,
      precoBase: basePrice,
      precoFinal: priceFinal,
      quantidade: 1,
      observacao: customizationObs.trim(),
      selectedSizeId: selectedSize ? (selectedSize.id || `size_0`) : undefined,
      selectedAdditionalIds: additionalsFlattened.map(a => a.id),
      tamanhoSelecionado: selectedSize ? { id: selectedSize.id || `size_0`, nome: selectedSize.nome, preco: Number(selectedSize.preco || 0) } : undefined,
      adicionaisSelecionados: additionalsFlattened
    };

    setCart(prev => [...prev, newCartItem]);
    setCustomizingProduct(null);
  };

  const updateCartQuantity = (cartId: string, amount: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartId === cartId) {
        const newQty = item.quantidade + amount;
        return newQty > 0 ? { ...item, quantidade: newQty } : item;
      }
      return item;
    }).filter(item => item.quantidade > 0));
  };

  const removeCartItem = (cartId: string) => {
    setCart(prev => prev.filter(item => item.cartId !== cartId));
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || !restaurantId || !activeRestaurantProfile) return;

    setClientNameError(null);
    setError(null);

    if (!user?.uid) {
      setError("Sessão do operador não identificada. Por favor, faça login novamente.");
      return;
    }

    if (serviceMode === 'PICKUP' && !clientName.trim()) {
      setClientNameError("Por favor, informe o nome do cliente para a retirada.");
      return;
    }

    const paidCents = Math.round(amountPaidParsed.numberValue * 100);
    if (paymentMethod === 'dinheiro' && isPaid) {
      if (paidCents < cartTotalCents) {
        setError(`O valor em dinheiro recebido (${amountPaidParsed.formatted}) é menor que o total do pedido (${formatCurrency(cartTotal)}).`);
        return;
      }
    }

    setSaveLoading(true);

    try {
      if (!clientActionIdRef.current) {
        clientActionIdRef.current = `counter_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      const result = await counterOrderService.createCounterOrder({
        restaurantId,
        operatorId: user.uid,
        operatorName: profile?.nome || profile?.nome_fantasia || 'Operador Balcão',
        clientName: clientName.trim(),
        serviceMode,
        items: cart,
        paymentMethod,
        pago: isPaid,
        amountReceived: paymentMethod === 'dinheiro' && isPaid ? amountPaidParsed.numberValue : 0,
        clientActionId: clientActionIdRef.current
      });

      // Reset clientActionIdRef on successful checkout
      clientActionIdRef.current = null;

      // Use official backend order response exclusively
      setCreatedOrder(result.order);

      setShowSuccessModal(true);

      // Reset cart and inputs
      setCart([]);
      setClientName('');
      setAmountPaidDigits('');
      setMobileTab('catalog');
    } catch (err: any) {
      console.error("Error completing checkout on Counter:", err);
      const errCode = err.code || '';
      const errMsg = err.message || '';
      if (errCode === 'PAYMENT_METHOD_NOT_AVAILABLE') {
        setError('A forma de pagamento selecionada não está disponível.');
      } else if (errCode === 'NO_PAYMENT_METHOD_AVAILABLE') {
        setError('Nenhuma forma de pagamento está habilitada para este atendimento.');
      } else if (errCode === 'IDEMPOTENCY_RECORD_INCONSISTENT' || errMsg.includes('IDEMPOTENCY_RECORD_INCONSISTENT')) {
        setError('Existe uma tentativa anterior deste pedido. Confira o painel antes de tentar novamente.');
      } else if (errCode === 'INVALID_SERVER_RESPONSE') {
        setError('O servidor retornou uma resposta inválida. Confira o painel de pedidos.');
      } else {
        setError(errMsg || "Erro ao finalizar pedido no balcão.");
      }
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePrintReceipt = () => {
    if (!createdOrder) return;
    printThermalOrder(createdOrder, activeRestaurantProfile, profile);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[60vh] space-y-4">
        <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
        <p className="text-stone-500 font-medium text-sm">Carregando painel de vendas no balcão...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 space-y-4">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-stone-800">Venda no Balcão (PDV)</h1>
            <p className="text-xs text-stone-500">Atendimento presencial rápido, consumo local e retirada</p>
          </div>
        </div>

        {/* Mobile View Switcher Tabs */}
        <div className="sm:hidden flex w-full bg-stone-100 p-1 rounded-xl">
          <button
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              mobileTab === 'catalog' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500'
            }`}
          >
            Cardápio
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'cart' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-500'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Carrinho ({cart.reduce((a, b) => a + b.quantidade, 0)})</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Catalog (2/3) + Cart Summary (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Left Column: Product Catalog */}
        <div className={`lg:col-span-2 space-y-4 ${mobileTab === 'cart' ? 'hidden sm:block' : 'block'}`}>
          {/* Controls: Search and Categories */}
          <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Buscar produto por nome ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Categories Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedCategory('todos')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'todos'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Todos
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center text-stone-500 text-sm">
              Nenhum produto disponível encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredProducts.map(product => {
                const price = getProductPriceForChannel(product, 'counter');
                return (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="bg-white rounded-2xl p-3 border border-stone-200 text-left hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group active:scale-[0.98]"
                  >
                    <div>
                      {product.imagem_url && (
                        <img 
                          src={product.imagem_url} 
                          alt={product.nome}
                          className="w-full h-24 object-cover rounded-xl mb-2.5 bg-stone-100"
                        />
                      )}
                      <h3 className="font-bold text-stone-800 text-xs sm:text-sm line-clamp-2 group-hover:text-emerald-700">
                        {product.nome}
                      </h3>
                      {product.descricao && (
                        <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5">
                          {product.descricao}
                        </p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-stone-100">
                      <span className="font-extrabold text-stone-900 text-xs sm:text-sm">
                        {formatCurrency(price)}
                      </span>
                      <div className="w-7 h-7 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-all">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Order Cart & Checkout */}
        <div className={`space-y-4 ${mobileTab === 'catalog' ? 'hidden sm:block' : 'block'}`}>
          <div className="bg-white rounded-2xl p-4 border border-stone-200 shadow-sm space-y-4 sticky top-4">
            <h2 className="font-bold text-stone-800 text-base flex items-center justify-between border-b border-stone-100 pb-3">
              <span>Carrinho de Venda</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                {cart.reduce((a, b) => a + b.quantidade, 0)} itens
              </span>
            </h2>

            {/* Service Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-600">Modalidade de Atendimento</label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-stone-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setServiceMode('COUNTER')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    serviceMode === 'COUNTER' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Balcão
                </button>
                <button
                  type="button"
                  onClick={() => setServiceMode('PICKUP')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    serviceMode === 'PICKUP' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Retirada
                </button>
                <button
                  type="button"
                  onClick={() => setServiceMode('DINE_IN')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    serviceMode === 'DINE_IN' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Consumo Local
                </button>
              </div>
            </div>

            {/* Client Identification Input */}
            <div>
              <label className="text-xs font-bold text-stone-600 block mb-1">
                Nome do Cliente {serviceMode === 'PICKUP' && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                placeholder={serviceMode === 'PICKUP' ? 'Nome do cliente para chamada' : 'Nome do cliente (opcional)'}
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (clientNameError) setClientNameError(null);
                }}
                className={`w-full px-3 py-2 bg-stone-50 border rounded-xl text-xs focus:outline-none focus:ring-2 ${
                  clientNameError ? 'border-red-500 focus:ring-red-500' : 'border-stone-200 focus:ring-emerald-500'
                }`}
              />
              {clientNameError && (
                <p className="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{clientNameError}</span>
                </p>
              )}
            </div>

            {/* Cart Items List */}
            <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1 divide-y divide-stone-100">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-stone-400 text-xs">
                  Sua lista de pedido no balcão está vazia.
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.cartId} className="pt-2.5 first:pt-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-bold text-stone-800 text-xs">{item.nome}</div>
                        {item.tamanhoSelecionado && (
                          <div className="text-[10px] text-stone-500">Tamanho: {item.tamanhoSelecionado.nome}</div>
                        )}
                        {item.adicionaisSelecionados.length > 0 && (
                          <div className="text-[10px] text-stone-500">
                            + {item.adicionaisSelecionados.map(a => a.nome).join(', ')}
                          </div>
                        )}
                        {item.observacao && (
                          <div className="text-[10px] text-amber-700 italic">Obs: {item.observacao}</div>
                        )}
                      </div>
                      <div className="font-bold text-stone-900 text-xs">
                        {formatCurrency(item.precoFinal * item.quantidade)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-stone-100 rounded-lg p-0.5">
                        <button
                          onClick={() => updateCartQuantity(item.cartId, -1)}
                          className="p-1 hover:bg-white rounded transition-all text-stone-600"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-stone-800 w-4 text-center">{item.quantidade}</span>
                        <button
                          onClick={() => updateCartQuantity(item.cartId, 1)}
                          className="p-1 hover:bg-white rounded transition-all text-stone-600"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeCartItem(item.cartId)}
                        className="text-stone-400 hover:text-red-500 p-1 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Order Totals Summary */}
            <div className="bg-stone-50 p-3 rounded-xl space-y-2 border border-stone-200/60 text-xs">
              <div className="flex justify-between font-extrabold text-stone-900 text-sm pt-1 border-t border-stone-200">
                <span>Total a Pagar</span>
                <span className="text-emerald-700">{formatCurrency(cartTotal)}</span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-600 block">Forma de Pagamento</label>
              {availablePaymentMethods.length === 0 ? (
                <div className="p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-200">
                  Não existem formas de pagamento configuradas para este atendimento.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availablePaymentMethods.map(m => {
                    const Icon = m.icon;
                    const isSelected = paymentMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                          isSelected 
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm' 
                            : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment Status & Cash Details */}
            <div className="space-y-2 pt-2 border-t border-stone-100">
              <div className="flex items-center justify-between text-xs font-bold text-stone-600">
                <span>Status do Pagamento</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPaid(true)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      isPaid ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    Pago Agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPaid(false)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      !isPaid ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    Pagar na Entrega
                  </button>
                </div>
              </div>

              {/* Cash Change Input */}
              {paymentMethod === 'dinheiro' && isPaid && (
                <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-900">Valor Entregue (R$)</label>
                    <input
                      type="text"
                      placeholder="0,00"
                      value={amountPaidParsed.formatted}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/\D/g, '');
                        setAmountPaidDigits(digitsOnly);
                      }}
                      className="w-28 text-right px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  {isCashAmountInsufficient && (
                    <p className="text-[11px] font-bold text-red-600">
                      O valor recebido em dinheiro é menor que o total do pedido.
                    </p>
                  )}

                  {changeDue > 0 && (
                    <div className="flex justify-between items-center text-xs font-extrabold text-emerald-800 pt-1 border-t border-amber-200/80">
                      <span>Troco a devolver:</span>
                      <span>{formatCurrency(changeDue)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Order Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || saveLoading || isCashAmountInsufficient || availablePaymentMethods.length === 0 || !paymentMethod}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Finalizar e enviar para cozinha ({formatCurrency(cartTotal)})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Product Customization Modal */}
      {customizingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full sm:max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-stone-800 text-base">{customizingProduct.nome}</h3>
                <p className="text-xs text-stone-500">Personalize o produto conforme o pedido do cliente</p>
              </div>
              <button
                onClick={() => setCustomizingProduct(null)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Sizes */}
              {customizingProduct.sizes && customizingProduct.sizes.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-700 block">Escolha o Tamanho</label>
                  <div className="grid grid-cols-2 gap-2">
                    {customizingProduct.sizes.map((sz: any, idx: number) => {
                      const sizeId = sz.id || `size_${idx}`;
                      const normalizedSz = { ...sz, id: sizeId };
                      const isSelected = selectedSize?.id === sizeId;
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedSize(normalizedSz)}
                          className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all ${
                            isSelected 
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                              : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                          }`}
                        >
                          <span>{sz.nome}</span>
                          <span>{formatCurrency(Number(sz.preco || 0))}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Option Groups */}
              {customizingProduct.optionGroups?.map((group: any) => {
                const selections = selectedOptions[group.groupId] || [];
                const isSingle = group.max === 1;

                return (
                  <div key={group.groupId} className="space-y-2 pt-2 border-t border-stone-100">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-stone-800">{group.nome}</label>
                      <span className="text-[10px] font-semibold text-stone-500">
                        {group.obrigatorio ? 'Obrigatório' : 'Opcional'} • Max: {group.max || 1}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {group.options?.map((opt: OptionItem) => {
                        const isSelected = selections.some(s => s.id === opt.id);
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleOptionToggle(group, opt, isSingle)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                              isSelected
                                ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-bold'
                                : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                            }`}
                          >
                            <span>{opt.nome}</span>
                            <span className="font-semibold text-stone-600">
                              {Number(opt.preco || 0) > 0 ? `+ ${formatCurrency(Number(opt.preco))}` : 'Grátis'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Observation */}
              <div className="pt-2 border-t border-stone-100 space-y-1">
                <label className="text-xs font-bold text-stone-700 block">Observações do Item</label>
                <textarea
                  rows={2}
                  placeholder="Ex: sem cebola, ponto da carne..."
                  value={customizationObs}
                  onChange={(e) => setCustomizationObs(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-end gap-2">
              <button
                onClick={() => setCustomizingProduct(null)}
                className="px-4 py-2.5 text-xs font-bold text-stone-600 hover:bg-stone-200 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddToCart}
                disabled={!isCustomizationValid}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                Adicionar ao Pedido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal with Thermal Receipt Button */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-6 text-center shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Check className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-lg font-extrabold text-stone-800">Pedido Realizado com Sucesso!</h3>
              <p className="text-xs text-stone-500 mt-1">
                O pedido do balcão foi gerado e registrado no sistema.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handlePrintReceipt}
                className="w-full flex items-center justify-center gap-2 py-3 bg-stone-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Comprovante Térmico</span>
              </button>

              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
              >
                Fechar e Novo Pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
