import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { productService } from '../../services/productService';
import { restaurantService } from '../../services/restaurantService';
import { optionService, OptionItem } from '../../services/optionService';
import { counterOrderService, CounterCartItem } from '../../services/counterOrderService';
import { 
  getProductPriceForChannel, 
  isProductAvailableForChannel,
  resolveCounterUnitPriceCents
} from '../../domain/product/productChannels';
import { v4 as uuidv4 } from 'uuid';
import { PaymentsComposer, getAvailablePaymentMethodsForChannel } from './components/PaymentsComposer';
import { PaymentItem } from './components/PaymentsManager';
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
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';

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
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [deliveredCashCents, setDeliveredCashCents] = useState<number>(0);
  
  // Customization modal state
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedSize, setSelectedSize] = useState<any | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [customizationObs, setCustomizationObs] = useState<string>('');

  // Execution / Modal states
  const [saveLoading, setSaveLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        let currentRestId = restaurantProfile?.id || profile?.restaurantId;
        if (!currentRestId && user?.uid) {
          const fetchedRest = await restaurantService.getRestaurantByOwnerId(user.uid);
          if (fetchedRest) {
            currentRestId = fetchedRest.id;
            if (!restaurantProfile && isMounted) {
              setActiveRestaurantProfile(fetchedRest);
            }
          }
        }
        
        if (currentRestId && isMounted) {
          setRestaurantId(currentRestId);
          const [cats, prods, options] = await Promise.all([
            productService.getCategoriesByRestaurant(currentRestId),
            productService.getProducts(currentRestId),
            optionService.getAllOptions(currentRestId)
          ]);
          
          if (isMounted) {
            setCategories(cats || []);
            setProducts((prods || []).filter(p => p.ativo !== false && isProductAvailableForChannel(p, 'counter')));
            setAllOptionItems(options || []);
          }
        }
      } catch (err) {
        console.error("Error loading counter data:", err);
        if (isMounted) setError("Erro ao carregar os dados. Tente novamente.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    loadData();
    
    return () => { isMounted = false; };
  }, [user?.uid, profile?.restaurantId, restaurantProfile]);


  // Cart total
  const cartTotal = cart.reduce((acc, item) => acc + (item.precoFinal || item.precoBase) * item.quantidade, 0);
  const cartTotalCents = Math.round(cartTotal * 100);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.nome.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'todos' || p.categoriaId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const availablePaymentMethods = useMemo(() => {
    return getAvailablePaymentMethodsForChannel(
      activeRestaurantProfile?.formas_pagamento || activeRestaurantProfile?.payment_methods,
      serviceMode
    );
  }, [activeRestaurantProfile, serviceMode]);
  
  const getProductSizes = (product: any) => {
    if (!product) return [];
    const raw = Array.isArray(product.sizes) && product.sizes.length > 0 ? product.sizes : (Array.isArray(product.tamanhos) ? product.tamanhos : []);
    return raw.map((s: any, idx: number) => ({
      ...s,
      id: s.id || `size_${idx}`
    }));
  };

  const isCustomizationValid = customizingProduct && (
    !getProductSizes(customizingProduct).length || selectedSize
  );

  const cashPaymentsCents = useMemo(() => {
    return payments
      .filter(p => p.paymentMethodId === 'dinheiro')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  useEffect(() => {
    if (cashPaymentsCents > 0 && isPaid) {
      setDeliveredCashCents(prev => (prev < cashPaymentsCents ? cashPaymentsCents : prev));
    } else {
      setDeliveredCashCents(0);
    }
  }, [cashPaymentsCents, isPaid]);

  const isCashAmountInsufficient = cashPaymentsCents > 0 && isPaid && deliveredCashCents < cashPaymentsCents;

  const changeDueCents = (cashPaymentsCents > 0 && isPaid && deliveredCashCents >= cashPaymentsCents)
    ? deliveredCashCents - cashPaymentsCents
    : 0;

  useEffect(() => {
    if (availablePaymentMethods.length === 0) {
      if (payments.length > 0) {
        setPayments([]);
      }
      return;
    }

    if (payments.length === 0) {
      const defaultMethod = availablePaymentMethods[0];
      setPayments([{
        id: uuidv4(),
        paymentMethodId: defaultMethod.id,
        paymentMethodName: defaultMethod.name,
        amount: cartTotalCents,
        status: isPaid ? 'PAID' : 'PENDING'
      }]);
    } else if (payments.length === 1) {
      const p = payments[0];
      const needsAmountUpdate = p.amount !== cartTotalCents;
      const isMethodValid = availablePaymentMethods.some(m => m.id === p.paymentMethodId);
      
      if (needsAmountUpdate || !isMethodValid) {
        const nextMethodId = isMethodValid ? p.paymentMethodId : availablePaymentMethods[0].id;
        const nextMethodName = isMethodValid ? p.paymentMethodName : availablePaymentMethods[0].name;
        
        setPayments([{
          ...p,
          paymentMethodId: nextMethodId,
          paymentMethodName: nextMethodName,
          amount: cartTotalCents
        }]);
      }
    }
  }, [cartTotalCents, availablePaymentMethods, isPaid, payments]);

  const removeCartItem = (cartId: string) => {
    setCart(cart.filter((item) => item.cartId !== cartId));
  };

  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.cartId === cartId) {
        const newQty = item.quantidade + delta;
        if (newQty < 1) return item;
        return { ...item, quantidade: newQty };
      }
      return item;
    }));
  };

  const handleProductClick = (product: any) => {
    setCustomizingProduct(product);
    const pSizes = getProductSizes(product);
    setSelectedSize(pSizes.length > 0 ? pSizes[0] : null);
    setSelectedOptions({});
    setCustomizationObs('');
  };

  const handleOptionToggle = (group: any, opt: any, isSingle: boolean) => {
    setSelectedOptions(prev => {
      const current = prev[group.id] || [];
      if (isSingle) {
        return { ...prev, [group.id]: [opt] };
      } else {
        const exists = current.find((o: any) => o.id === opt.id);
        if (exists) {
          return { ...prev, [group.id]: current.filter((o: any) => o.id !== opt.id) };
        } else {
          if (group.max && current.length >= group.max) return prev;
          return { ...prev, [group.id]: [...current, opt] };
        }
      }
    });
  };

  const handleAddToCart = () => {
    if (!customizingProduct) return;
    
    // Resolve canonical base unit price in CENTS for Balcão
    const baseUnitPriceCents = resolveCounterUnitPriceCents(customizingProduct, selectedSize);

    let totalUnitPriceCents = baseUnitPriceCents;

    let tamanhoSelecionado = null;
    if (selectedSize) {
      tamanhoSelecionado = {
        ...selectedSize,
        preco: resolveCounterUnitPriceCents(customizingProduct, selectedSize) / 100
      };
    }

    const adicionaisSelecionados: any[] = [];
    Object.values(selectedOptions).forEach((opts: any) => {
      opts.forEach((opt: any) => {
        const addPriceCents = Math.round(Number(opt.preco || opt.price || opt.valor || 0) * 100);
        totalUnitPriceCents += addPriceCents;
        adicionaisSelecionados.push(opt);
      });
    });

    const item: CounterCartItem = {
      cartId: uuidv4(),
      productId: customizingProduct.id,
      nome: customizingProduct.nome || customizingProduct.name || 'Produto',
      unitPriceCents: baseUnitPriceCents,
      basePriceCents: baseUnitPriceCents,
      pricingChannel: 'BALCAO',
      precoBase: baseUnitPriceCents / 100,
      precoFinal: totalUnitPriceCents / 100,
      quantidade: 1,
      observacao: customizationObs,
      selectedSizeId: selectedSize?.id,
      tamanhoSelecionado,
      adicionaisSelecionados
    };

    setCart([...cart, item]);
    setCustomizingProduct(null);
  };

  const handleCheckout = async () => {
    setError(null);
    if (!restaurantId || cart.length === 0) return;
    
    const totalPaymentsCents = payments.reduce((acc, p) => acc + p.amount, 0);
    if (totalPaymentsCents !== cartTotalCents) {
      setError('A soma dos pagamentos deve ser igual ao total do pedido.');
      return;
    }

    if (isCashAmountInsufficient) {
      setError('O valor entregue em dinheiro é menor que a parcela em dinheiro.');
      return;
    }

    setSaveLoading(true);
    
    try {
      if (!clientActionIdRef.current) {
        clientActionIdRef.current = uuidv4();
      }

      const primaryPaymentMethod = payments.length > 0 
        ? payments.reduce((prev, current) => (prev.amount > current.amount) ? prev : current).paymentMethodId 
        : 'dinheiro';

      const finalAmountReceivedReais = (cashPaymentsCents > 0 && isPaid)
        ? deliveredCashCents / 100
        : 0;

      const result = await counterOrderService.createCounterOrder({
        restaurantId,
        operatorId: profile?.uid || user?.uid || '',
        operatorName: profile?.nome || profile?.displayName || user?.displayName || 'Operador',
        clientName,
        serviceMode,
        items: cart,
        
        forma_pagamento: primaryPaymentMethod,
        payments: payments.map(p => ({ ...p, status: isPaid ? 'PAID' : 'PENDING' })),
        pago: isPaid,
        amountReceived: finalAmountReceivedReais,
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
      setDeliveredCashCents(0);
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
            <FormField 
              label={`Nome do Cliente ${serviceMode === 'PICKUP' ? '*' : '(opcional)'}`}
              error={clientNameError || undefined}
            >
              <TextInput
                placeholder={serviceMode === 'PICKUP' ? 'Nome do cliente para chamada' : 'Nome do cliente'}
                value={clientName}
                onChange={(e) => {
                  setClientName(e.target.value);
                  if (clientNameError) setClientNameError(null);
                }}
              />
            </FormField>

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

            
            <PaymentsComposer 
              totalOrderCents={cartTotalCents}
              payments={payments}
              setPayments={setPayments}
              configuredMethods={activeRestaurantProfile?.formas_pagamento || activeRestaurantProfile?.payment_methods}
              serviceMode={serviceMode}
              isPaid={isPaid}
              setIsPaid={setIsPaid}
            />
            {/* Cash Change Input */}
            {cashPaymentsCents > 0 && isPaid && (
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-amber-900">Valor entregue em dinheiro</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Ex: R$ 10,00"
                    value={deliveredCashCents > 0 ? (deliveredCashCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
                    onChange={(e) => {
                      const rawDigits = e.target.value.replace(/\D/g, '');
                      const cents = rawDigits ? parseInt(rawDigits, 10) : 0;
                      setDeliveredCashCents(cents);
                    }}
                    className="w-32 text-right px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {isCashAmountInsufficient && (
                  <p className="text-[11px] font-bold text-red-600">
                    O valor entregue em dinheiro é menor que a parcela em dinheiro.
                  </p>
                )}

                {changeDueCents > 0 && (
                  <div className="flex justify-between items-center text-xs font-extrabold text-emerald-800 pt-1 border-t border-amber-200/80">
                    <span>Troco a devolver:</span>
                    <span>{(changeDueCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                  </div>
                )}
              </div>
            )}
            {/* Confirm Order Button */}
            <button
              onClick={handleCheckout}
              disabled={cart.length === 0 || saveLoading || isCashAmountInsufficient || availablePaymentMethods.length === 0 || payments.reduce((a,b)=>a+b.amount,0)!==cartTotalCents}
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
      <FormModal
        isOpen={!!customizingProduct}
        onClose={() => setCustomizingProduct(null)}
        title={customizingProduct?.nome || ''}
        subtitle="Personalize o produto conforme o pedido do cliente"
        icon={Utensils}
        iconBgColor="bg-emerald-50"
        iconTextColor="text-emerald-600"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              onClick={() => setCustomizingProduct(null)}
              className="px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-200 rounded-xl transition-all"
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
        }
      >
        {customizingProduct && (
          <div className="space-y-4 text-left">
            {/* Sizes */}
            {getProductSizes(customizingProduct).length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700 block">Escolha o Tamanho</label>
                <div className="grid grid-cols-2 gap-2">
                  {getProductSizes(customizingProduct).map((sz: any, idx: number) => {
                    const sizeId = sz.id || `size_${idx}`;
                    const normalizedSz = { ...sz, id: sizeId };
                    const isSelected = selectedSize?.id === sizeId;
                    const szPriceCents = resolveCounterUnitPriceCents(customizingProduct, normalizedSz);
                    return (
                      <button
                        key={sizeId}
                        onClick={() => setSelectedSize(normalizedSz)}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition-all ${
                          isSelected 
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800' 
                            : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                        }`}
                      >
                        <span>{sz.nome}</span>
                        <span>{formatCurrency(szPriceCents / 100)}</span>
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
        )}
      </FormModal>

      {/* Success Modal with Thermal Receipt Button */}
      <FormModal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title="Pedido Realizado com Sucesso!"
        subtitle="O pedido do balcão foi gerado e registrado no sistema."
        icon={Check}
        iconBgColor="bg-emerald-100"
        iconTextColor="text-emerald-600"
        footer={
          <div className="flex flex-col gap-2 w-full">
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
        }
      >
        <div className="py-2 text-center text-stone-500 text-xs">
          O pedido foi devidamente integrado ao painel e a impressão está pronta para ser emitida.
        </div>
      </FormModal>
    </div>
  );
}
