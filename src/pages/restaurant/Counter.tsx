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
  Truck,
  Phone,
  MapPin,
  Coins,
  CreditCard,
  QrCode,
  ArrowRight,
  AlertCircle,
  Receipt,
  Users
} from 'lucide-react';
import { FormField, TextInput, SelectInput, FormModal } from '../../components/ui/FormComponents';
import { tableRepository } from '../../domain/table/tableRepository';
import { tabRepository } from '../../domain/tab/tabRepository';
import { Table, Tab, TableStatus } from '../../types/mesas';

export type BalcaoTipoAtendimento = 'RETIRADA' | 'MESA' | 'ENTREGA';

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

  // Tipo de Atendimento: Retirada | Consumir na Mesa | Entrega
  const [tipoAtendimento, setTipoAtendimento] = useState<BalcaoTipoAtendimento>('RETIRADA');
  const [serviceMode, setServiceMode] = useState<'DINE_IN' | 'COUNTER' | 'PICKUP'>('PICKUP');

  // Screen states for the selected Atendimento
  const [clientName, setClientName] = useState<string>('');
  const [clientPhone, setClientPhone] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [deliveryStreet, setDeliveryStreet] = useState<string>('');
  const [deliveryNumber, setDeliveryNumber] = useState<string>('');
  const [deliveryNeighborhood, setDeliveryNeighborhood] = useState<string>('');
  const [deliveryComplement, setDeliveryComplement] = useState<string>('');
  const [deliveryReference, setDeliveryReference] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState<string>('');

  // Field validation errors
  const [clientNameError, setClientNameError] = useState<string | null>(null);
  const [clientPhoneError, setClientPhoneError] = useState<string | null>(null);
  const [tableNumberError, setTableNumberError] = useState<string | null>(null);
  const [deliveryStreetError, setDeliveryStreetError] = useState<string | null>(null);
  const [deliveryNumberError, setDeliveryNumberError] = useState<string | null>(null);
  const [deliveryNeighborhoodError, setDeliveryNeighborhoodError] = useState<string | null>(null);

  // Available restaurant tables for quick selection
  const [restaurantTables, setRestaurantTables] = useState<any[]>([]);

  // Table / Comanda selection states for "Consumir na Mesa"
  const [activeTabs, setActiveTabs] = useState<Tab[]>([]);
  const [mesaSelectionMode, setMesaSelectionMode] = useState<'FREE_TABLE' | 'ACTIVE_TAB'>('FREE_TABLE');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const [tableFilterQuery, setTableFilterQuery] = useState<string>('');

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

  const loadedRestIdRef = useRef<string | null>(null);

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
          if (loadedRestIdRef.current === currentRestId) {
            setLoading(false);
            return;
          }
          loadedRestIdRef.current = currentRestId;

          const [cats, prods, options, tablesData] = await Promise.all([
            productService.getCategoriesByRestaurant(currentRestId),
            productService.getProducts(currentRestId),
            optionService.getAllOptions(currentRestId),
            tableRepository.listTablesByRestaurant(currentRestId).catch(() => [])
          ]);
          
          if (isMounted) {
            setCategories(cats || []);
            setProducts((prods || []).filter(p => p.ativo !== false && isProductAvailableForChannel(p, 'counter')));
            setAllOptionItems(options || []);
            setRestaurantTables((tablesData || []).filter((t: any) => t.active !== false));
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
  }, [user?.uid, profile?.restaurantId, restaurantProfile?.id]);

  // Real-time synchronization for tables and active tabs in Counter
  useEffect(() => {
    if (!restaurantId) return;
    const unsubTabs = tabRepository.subscribeActiveTabs(
      restaurantId,
      (tabs) => {
        setActiveTabs(tabs || []);
      },
      (err) => {
        console.error("Error subscribing active tabs in Counter:", err);
      }
    );
    const unsubTables = tableRepository.subscribeTablesByRestaurant(
      restaurantId,
      (tables) => {
        setRestaurantTables((tables || []).filter((t: any) => t.active !== false));
      },
      (err) => {
        console.error("Error subscribing tables in Counter:", err);
      }
    );
    return () => {
      unsubTabs();
      unsubTables();
    };
  }, [restaurantId]);

  // Set of table IDs with active tabs
  const activeTabTableIds = useMemo(() => {
    return new Set(activeTabs.map(t => t.tableId).filter(Boolean));
  }, [activeTabs]);

  // Free tables (no active comanda and status is not occupied or disabled)
  const freeTables = useMemo(() => {
    return restaurantTables.filter(t => {
      if (t.active === false) return false;
      if (activeTabTableIds.has(t.id)) return false;
      const st = String(t.status || '').toUpperCase();
      if (st === 'OCCUPIED' || st === 'OCUPADA' || st === 'DISABLED' || st === 'INATIVA' || st === 'WAITING_PAYMENT') return false;
      return true;
    });
  }, [restaurantTables, activeTabTableIds]);

  const filteredFreeTables = useMemo(() => {
    if (!tableFilterQuery.trim()) return freeTables;
    const q = tableFilterQuery.toLowerCase().trim();
    return freeTables.filter(t => {
      const name = String(t.name || '').toLowerCase();
      const num = String(t.number ?? '').toLowerCase();
      return name.includes(q) || num.includes(q);
    });
  }, [freeTables, tableFilterQuery]);

  const filteredActiveTabs = useMemo(() => {
    if (!tableFilterQuery.trim()) return activeTabs;
    const q = tableFilterQuery.toLowerCase().trim();
    return activeTabs.filter(t => {
      const tName = String(t.tableName || '').toLowerCase();
      const tNum = String(t.tableNumber ?? '').toLowerCase();
      const cName = String(t.customerName || '').toLowerCase();
      const tabId = String(t.id || '').toLowerCase();
      return tName.includes(q) || tNum.includes(q) || cName.includes(q) || tabId.includes(q);
    });
  }, [activeTabs, tableFilterQuery]);


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

  const handleSelectTipoAtendimento = (tipo: BalcaoTipoAtendimento) => {
    setTipoAtendimento(tipo);
    setClientNameError(null);
    setClientPhoneError(null);
    setTableNumberError(null);
    setDeliveryStreetError(null);
    setDeliveryNumberError(null);
    setDeliveryNeighborhoodError(null);

    if (tipo === 'RETIRADA') {
      setServiceMode('PICKUP');
      // Limpa dados de mesa/comanda e entrega
      setSelectedTable(null);
      setSelectedTab(null);
      setTableNumber('');
      setTableFilterQuery('');
      setDeliveryStreet('');
      setDeliveryNumber('');
      setDeliveryNeighborhood('');
      setDeliveryComplement('');
      setDeliveryReference('');
    } else if (tipo === 'MESA') {
      setServiceMode('DINE_IN');
      // Limpa dados de entrega e valores de troco
      setDeliveryStreet('');
      setDeliveryNumber('');
      setDeliveryNeighborhood('');
      setDeliveryComplement('');
      setDeliveryReference('');
      setDeliveredCashCents(0);
    } else {
      setServiceMode('COUNTER');
      // Limpa dados de mesa/comanda
      setSelectedTable(null);
      setSelectedTab(null);
      setTableNumber('');
      setTableFilterQuery('');
    }
  };

  const handleCheckout = async () => {
    setError(null);
    setClientNameError(null);
    setClientPhoneError(null);
    setTableNumberError(null);
    setDeliveryStreetError(null);
    setDeliveryNumberError(null);
    setDeliveryNeighborhoodError(null);

    if (!restaurantId || cart.length === 0) return;

    // Validações por modalidade de atendimento no Balcão
    if (tipoAtendimento === 'RETIRADA') {
      // Cliente é opcional ("cliente, se necessário"). Se vazio, adota "Cliente Balcão".
    } else if (tipoAtendimento === 'MESA') {
      if (mesaSelectionMode === 'FREE_TABLE') {
        if (!selectedTable) {
          setTableNumberError('Selecione uma mesa livre para este pedido.');
          return;
        }
      } else {
        if (!selectedTab) {
          setTableNumberError('Selecione uma comanda ativa existente para este pedido.');
          return;
        }
      }
    } else if (tipoAtendimento === 'ENTREGA') {
      let hasError = false;
      if (!clientName.trim()) {
        setClientNameError('Informe o nome do cliente.');
        hasError = true;
      }
      if (!clientPhone.trim()) {
        setClientPhoneError('Informe o telefone / WhatsApp.');
        hasError = true;
      }
      if (!deliveryStreet.trim()) {
        setDeliveryStreetError('Informe o endereço (rua/logradouro).');
        hasError = true;
      }
      if (!deliveryNumber.trim()) {
        setDeliveryNumberError('Informe o número.');
        hasError = true;
      }
      if (!deliveryNeighborhood.trim()) {
        setDeliveryNeighborhoodError('Informe o bairro.');
        hasError = true;
      }
      if (hasError) return;
    }
    
    if (tipoAtendimento !== 'MESA') {
      const totalPaymentsCents = payments.reduce((acc, p) => acc + p.amount, 0);
      if (totalPaymentsCents !== cartTotalCents) {
        setError('A soma dos pagamentos deve ser igual ao total do pedido.');
        return;
      }

      if (isCashAmountInsufficient) {
        setError('O valor entregue em dinheiro é menor que a parcela em dinheiro.');
        return;
      }
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

      let formattedClientName = '';
      let resolvedTableId: string | undefined = undefined;
      let resolvedTableName: string | undefined = undefined;
      let resolvedTableNumber: string | number | undefined = undefined;
      let resolvedTabId: string | undefined = undefined;

      if (tipoAtendimento === 'RETIRADA') {
        formattedClientName = clientName.trim() || 'Cliente Balcão';
      } else if (tipoAtendimento === 'MESA') {
        if (mesaSelectionMode === 'FREE_TABLE' && selectedTable) {
          resolvedTableId = selectedTable.id;
          resolvedTableName = selectedTable.name || (selectedTable.number ? `Mesa ${selectedTable.number}` : undefined);
          resolvedTableNumber = selectedTable.number;
          const tableStr = resolvedTableName || (resolvedTableNumber ? `Mesa ${resolvedTableNumber}` : 'Mesa');
          formattedClientName = clientName.trim() ? `${tableStr} - ${clientName.trim()}` : tableStr;
        } else if (mesaSelectionMode === 'ACTIVE_TAB' && selectedTab) {
          resolvedTabId = selectedTab.id;
          resolvedTableId = selectedTab.tableId;
          resolvedTableName = selectedTab.tableName;
          resolvedTableNumber = selectedTab.tableNumber;
          const tableStr = resolvedTableName || (resolvedTableNumber ? `Mesa ${resolvedTableNumber}` : `Comanda #${selectedTab.id.slice(0, 6)}`);
          const custName = clientName.trim() || selectedTab.customerName || '';
          formattedClientName = custName ? `${tableStr} - ${custName}` : tableStr;
        }
      } else if (tipoAtendimento === 'ENTREGA') {
        formattedClientName = clientName.trim() || 'Cliente';
      }

      const mappedServiceMode = tipoAtendimento === 'RETIRADA'
        ? 'PICKUP'
        : (tipoAtendimento === 'MESA' ? 'DINE_IN' : 'COUNTER');

      const fullDeliveryAddress = tipoAtendimento === 'ENTREGA' ? [
        `${deliveryStreet.trim()}, ${deliveryNumber.trim()}`,
        deliveryNeighborhood.trim(),
        deliveryComplement.trim() ? `Compl: ${deliveryComplement.trim()}` : '',
        deliveryReference.trim() ? `Ref: ${deliveryReference.trim()}` : ''
      ].filter(Boolean).join(' - ') : undefined;

      const result = await counterOrderService.createCounterOrder({
        restaurantId,
        operatorId: profile?.uid || user?.uid || '',
        operatorName: profile?.nome || profile?.displayName || user?.displayName || 'Operador',
        clientName: formattedClientName,
        clientPhone: clientPhone.trim(),
        tableId: resolvedTableId,
        tableName: resolvedTableName,
        tableNumber: resolvedTableNumber ?? (tipoAtendimento === 'MESA' ? tableNumber.trim() : undefined),
        tabId: resolvedTabId,
        comandaId: resolvedTabId,
        deliveryAddress: tipoAtendimento === 'ENTREGA' ? {
          street: deliveryStreet.trim(),
          rua: deliveryStreet.trim(),
          endereco: deliveryStreet.trim(),
          number: deliveryNumber.trim(),
          numero: deliveryNumber.trim(),
          neighborhood: deliveryNeighborhood.trim(),
          bairro: deliveryNeighborhood.trim(),
          complement: deliveryComplement.trim() || undefined,
          complemento: deliveryComplement.trim() || undefined,
          reference: deliveryReference.trim() || undefined,
          ponto_referencia: deliveryReference.trim() || undefined,
          referencia: deliveryReference.trim() || undefined,
          fullAddress: fullDeliveryAddress
        } : undefined,
        tipoAtendimento,
        serviceMode: mappedServiceMode,
        items: cart,
        
        forma_pagamento: tipoAtendimento === 'MESA' ? 'comanda' : primaryPaymentMethod,
        payments: tipoAtendimento === 'MESA' ? [] : payments.map(p => ({ ...p, status: isPaid ? 'PAID' : 'PENDING' })),
        pago: tipoAtendimento === 'MESA' ? false : isPaid,
        amountReceived: tipoAtendimento === 'MESA' ? 0 : finalAmountReceivedReais,
        clientActionId: clientActionIdRef.current,
        observacoes: orderNotes.trim() || undefined,
        observacao: orderNotes.trim() || undefined
      });

      // Reset clientActionIdRef on successful checkout
      clientActionIdRef.current = null;

      // Use official backend order response exclusively
      setCreatedOrder(result.order);

      setShowSuccessModal(true);

      // Reset cart and inputs
      setCart([]);
      setClientName('');
      setClientPhone('');
      setTableNumber('');
      setSelectedTable(null);
      setSelectedTab(null);
      setTableFilterQuery('');
      setDeliveryStreet('');
      setDeliveryNumber('');
      setDeliveryNeighborhood('');
      setDeliveryComplement('');
      setDeliveryReference('');
      setOrderNotes('');
      setClientNameError(null);
      setClientPhoneError(null);
      setTableNumberError(null);
      setDeliveryStreetError(null);
      setDeliveryNumberError(null);
      setDeliveryNeighborhoodError(null);
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
    <div className="w-full flex-1 flex flex-col min-h-0 min-w-0 max-w-7xl mx-auto px-1 sm:px-3 py-2 sm:py-3 space-y-3 sm:space-y-4 h-full overflow-hidden font-sans">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <Store className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-extrabold text-stone-900">Venda no Balcão (PDV)</h1>
              {/* Modalidade escolhida claramente visível */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                BALCÃO • {tipoAtendimento}
              </span>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">Origem: Balcão • Atendimento adaptável por modalidade</p>
          </div>
        </div>

        {/* Mobile View Switcher Tabs */}
        <div className="sm:hidden flex w-full bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setMobileTab('catalog')}
            className={`flex-1 min-h-[44px] py-2 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'catalog' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'
            }`}
          >
            Cardápio
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className={`flex-1 min-h-[44px] py-2 text-xs font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mobileTab === 'cart' ? 'bg-white text-emerald-800 shadow-xs' : 'text-stone-500'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Pedido ({cart.reduce((a, b) => a + b.quantidade, 0)})</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-50 text-red-700 rounded-2xl border border-red-200 text-sm flex items-center gap-2 shrink-0">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Grid: Catalog (2/3 or 7/12 cols) + Cart Summary (1/3 or 5/12 cols) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-4 items-stretch h-full overflow-hidden">
        {/* Left Column: Product Catalog */}
        <div className={`lg:col-span-7 xl:col-span-8 flex flex-col min-h-0 h-full overflow-hidden space-y-3 ${mobileTab === 'cart' ? 'hidden sm:flex' : 'flex'}`}>
          {/* Controls: Search and Categories - Fixed */}
          <div className="bg-white rounded-2xl p-3 sm:p-4 border border-stone-200 shadow-xs space-y-3 shrink-0">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Buscar produto por nome ou descrição..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Categories Pills */}
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedCategory('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  selectedCategory === 'todos'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                Todos ({products.length})
              </button>
              {categories.map(cat => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {cat.nome}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid - Scrollable */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
            {filteredProducts.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-stone-200 text-center text-stone-500 text-sm">
                Nenhum produto disponível encontrado.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                {filteredProducts.map(product => {
                  const price = getProductPriceForChannel(product, 'counter');
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductClick(product)}
                      className="bg-white rounded-2xl p-3 border border-stone-200 text-left hover:border-emerald-500 hover:shadow-md transition-all flex flex-col justify-between group active:scale-[0.98] cursor-pointer"
                    >
                      <div>
                        {product.imagem_url && (
                          <img 
                            src={product.imagem_url} 
                            alt={product.nome}
                            className="w-full h-24 object-cover rounded-xl mb-2 bg-stone-100"
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
        </div>

        {/* Right Column: Order Cart & Checkout */}
        <div className={`lg:col-span-5 xl:col-span-4 flex flex-col min-h-0 h-full overflow-hidden ${mobileTab === 'catalog' ? 'hidden sm:flex' : 'flex'}`}>
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-stone-200 shadow-xs flex flex-col h-full min-h-0 overflow-hidden">
            {/* Cart Header - Fixed */}
            <div className="shrink-0 space-y-3 border-b border-stone-100 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-stone-900 text-base flex items-center gap-2">
                  <span>Novo Pedido</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">
                    {cart.reduce((a, b) => a + b.quantidade, 0)} {cart.reduce((a, b) => a + b.quantidade, 0) === 1 ? 'item' : 'itens'}
                  </span>
                </h2>
                {/* Modalidade escolhida visível */}
                <span className="inline-flex items-center gap-1.5 text-xs font-black tracking-wider uppercase px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  BALCÃO • {tipoAtendimento}
                </span>
              </div>

              {/* Escolha da Modalidade: COMO SERÁ O ATENDIMENTO? */}
              <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-stone-900 tracking-wider uppercase">
                    COMO SERÁ O ATENDIMENTO?
                  </label>
                  <span className="text-[10px] font-bold text-stone-500">
                    Origem: Balcão
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    id="btn-atendimento-retirada"
                    onClick={() => handleSelectTipoAtendimento('RETIRADA')}
                    className={`min-h-[48px] py-2 px-1.5 text-xs font-black rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer border ${
                      tipoAtendimento === 'RETIRADA' 
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-600/30' 
                        : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200 hover:border-stone-300 active:scale-[0.98]'
                    }`}
                  >
                    <ShoppingBag className="w-4 h-4 shrink-0" />
                    <span className="truncate">RETIRADA</span>
                  </button>

                  <button
                    type="button"
                    id="btn-atendimento-mesa"
                    onClick={() => handleSelectTipoAtendimento('MESA')}
                    className={`min-h-[48px] py-2 px-1.5 text-xs font-black rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer border ${
                      tipoAtendimento === 'MESA' 
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-600/30' 
                        : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200 hover:border-stone-300 active:scale-[0.98]'
                    }`}
                  >
                    <Utensils className="w-4 h-4 shrink-0" />
                    <span className="truncate">MESA</span>
                  </button>

                  <button
                    type="button"
                    id="btn-atendimento-entrega"
                    onClick={() => handleSelectTipoAtendimento('ENTREGA')}
                    className={`min-h-[48px] py-2 px-1.5 text-xs font-black rounded-xl transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer border ${
                      tipoAtendimento === 'ENTREGA' 
                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-600/30' 
                        : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200 hover:border-stone-300 active:scale-[0.98]'
                    }`}
                  >
                    <Truck className="w-4 h-4 shrink-0" />
                    <span className="truncate">ENTREGA</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Screen States per Tipo de Atendimento */}
              {tipoAtendimento === 'RETIRADA' && (
                <div className="space-y-2 p-3 bg-stone-50/80 rounded-xl border border-stone-200/60">
                  <div className="flex items-center justify-between text-xs text-stone-600 font-semibold">
                    <span>Identificação para Retirada</span>
                    <span className="text-[10px] text-stone-400 font-normal">Chamada no balcão</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormField 
                      label="Cliente (opcional)"
                      error={clientNameError || undefined}
                    >
                      <TextInput
                        placeholder="Ex: Ana, Carlos, etc."
                        value={clientName}
                        onChange={(e) => {
                          setClientName(e.target.value);
                          if (clientNameError) setClientNameError(null);
                        }}
                      />
                    </FormField>
                    <FormField 
                      label="Telefone / WhatsApp (opcional)"
                      error={clientPhoneError || undefined}
                    >
                      <TextInput
                        placeholder="(00) 00000-0000"
                        value={clientPhone}
                        onChange={(e) => {
                          setClientPhone(e.target.value);
                          if (clientPhoneError) setClientPhoneError(null);
                        }}
                      />
                    </FormField>
                  </div>
                </div>
              )}

              {tipoAtendimento === 'MESA' && (
                <div className="space-y-3 p-3 bg-stone-50/90 rounded-xl border border-stone-200/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                      <Utensils className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Destino do Pedido (Consumir na Mesa)</span>
                    </div>
                    <span className="text-[10px] text-stone-500 font-medium">Lançamento em conta</span>
                  </div>

                  {/* Mode selector: Mesa Livre vs Comanda Ativa Existente */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-stone-200/70 rounded-xl">
                    <button
                      type="button"
                      id="btn-mesa-iniciar-atendimento"
                      onClick={() => {
                        setMesaSelectionMode('FREE_TABLE');
                        setSelectedTab(null);
                        setTableNumberError(null);
                      }}
                      className={`min-h-[44px] py-2 px-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        mesaSelectionMode === 'FREE_TABLE'
                          ? 'bg-white text-emerald-900 shadow-xs ring-1 ring-emerald-600/30'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">Iniciar Atendimento ({freeTables.length})</span>
                    </button>

                    <button
                      type="button"
                      id="btn-mesa-comanda-existente"
                      onClick={() => {
                        setMesaSelectionMode('ACTIVE_TAB');
                        setSelectedTable(null);
                        setTableNumberError(null);
                      }}
                      className={`min-h-[44px] py-2 px-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        mesaSelectionMode === 'ACTIVE_TAB'
                          ? 'bg-white text-emerald-900 shadow-xs ring-1 ring-emerald-600/30'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">Comanda da Mesa ({activeTabs.length})</span>
                    </button>
                  </div>

                  {/* Filter input */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input
                      type="text"
                      placeholder={mesaSelectionMode === 'FREE_TABLE' ? "Buscar mesa livre..." : "Buscar mesa, cliente ou comanda..."}
                      value={tableFilterQuery}
                      onChange={(e) => setTableFilterQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Selection List */}
                  {mesaSelectionMode === 'FREE_TABLE' ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium">
                        <span>Selecione a mesa disponível:</span>
                        {selectedTable && (
                          <span className="text-emerald-700 font-bold truncate max-w-[180px]">
                            {selectedTable.name || (selectedTable.number ? `Mesa ${selectedTable.number}` : `Mesa ${selectedTable.id}`)}
                          </span>
                        )}
                      </div>

                      {filteredFreeTables.length === 0 ? (
                        <div className="p-3 text-center bg-white rounded-lg border border-dashed border-stone-200 text-xs text-stone-500">
                          {restaurantTables.length === 0 
                            ? 'Nenhuma mesa cadastrada no salão.'
                            : 'Nenhuma mesa livre encontrada. Selecione "Comanda Ativa".'}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-0.5">
                          {filteredFreeTables.map((tbl: any) => {
                            const isSelected = selectedTable?.id === tbl.id;
                            const tblLabel = tbl.name || (tbl.number ? `Mesa ${tbl.number}` : `Mesa ${tbl.id}`);
                            return (
                              <button
                                key={tbl.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTable(tbl);
                                  setSelectedTab(null);
                                  setTableNumber(tblLabel);
                                  setTableNumberError(null);
                                }}
                                className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                    : 'bg-white hover:bg-emerald-50/50 text-stone-800 border-stone-200 hover:border-emerald-300'
                                }`}
                              >
                                <div className="font-extrabold text-xs truncate">{tblLabel}</div>
                                {tbl.capacity ? (
                                  <div className={`text-[10px] ${isSelected ? 'text-emerald-100' : 'text-stone-400'}`}>
                                    {tbl.capacity} lugares
                                  </div>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium">
                        <span>Selecione a comanda já aberta:</span>
                        {selectedTab && (
                          <span className="text-emerald-700 font-bold truncate max-w-[180px]">
                            {selectedTab.tableName || (selectedTab.tableNumber !== undefined && selectedTab.tableNumber !== null ? `Mesa ${selectedTab.tableNumber}` : `Mesa ${selectedTab.tableId}`)}
                          </span>
                        )}
                      </div>

                      {filteredActiveTabs.length === 0 ? (
                        <div className="p-3 text-center bg-white rounded-lg border border-dashed border-stone-200 text-xs text-stone-500">
                          Nenhuma comanda ativa no momento.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto custom-scrollbar p-0.5">
                          {filteredActiveTabs.map((tab: Tab) => {
                            const isSelected = selectedTab?.id === tab.id;
                            const tabLabel = tab.tableName || (tab.tableNumber !== undefined && tab.tableNumber !== null ? `Mesa ${tab.tableNumber}` : `Mesa ${tab.tableId}`);
                            const currentTotal = (tab.totalInCents ? tab.totalInCents / 100 : (tab.total || 0));
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => {
                                  setSelectedTab(tab);
                                  setSelectedTable(null);
                                  setTableNumber(tabLabel);
                                  if (tab.customerName && !clientName) {
                                    setClientName(tab.customerName);
                                  }
                                  setTableNumberError(null);
                                }}
                                className={`p-2 rounded-lg text-left transition-all border cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                                    : 'bg-white hover:bg-amber-50/40 text-stone-800 border-stone-200 hover:border-amber-300'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-extrabold text-xs truncate">{tabLabel}</span>
                                  <span className={`text-[10px] font-bold ${isSelected ? 'text-white' : 'text-emerald-700'}`}>
                                    {formatCurrency(currentTotal)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] mt-0.5">
                                  <span className={`truncate ${isSelected ? 'text-emerald-100' : 'text-stone-500'}`}>
                                    {tab.customerName ? `Cliente: ${tab.customerName}` : `Comanda #${tab.id.slice(0, 6)}`}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {tableNumberError && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{tableNumberError}</span>
                    </p>
                  )}

                  {/* Customer name input (optional) */}
                  <FormField 
                    label="Identificador / Nome do Cliente (opcional)"
                    error={clientNameError || undefined}
                  >
                    <TextInput
                      placeholder="Ex: Carlos (mesa) ou Convidado"
                      value={clientName}
                      onChange={(e) => {
                        setClientName(e.target.value);
                        if (clientNameError) setClientNameError(null);
                      }}
                    />
                  </FormField>
                </div>
              )}

              {tipoAtendimento === 'ENTREGA' && (
                <div className="space-y-2.5 p-3 bg-stone-50/90 rounded-xl border border-stone-200/80">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                      <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Dados para Entrega (Origem Balcão)</span>
                    </div>
                    <span className="text-[10px] text-stone-500 font-medium">Campos com * obrigatórios</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormField 
                      label="Nome do Cliente *"
                      error={clientNameError || undefined}
                    >
                      <TextInput
                        placeholder="Nome completo do cliente"
                        value={clientName}
                        onChange={(e) => {
                          setClientName(e.target.value);
                          if (clientNameError) setClientNameError(null);
                        }}
                      />
                    </FormField>
                    <FormField 
                      label="Telefone / WhatsApp *"
                      error={clientPhoneError || undefined}
                    >
                      <TextInput
                        placeholder="(00) 00000-0000"
                        value={clientPhone}
                        onChange={(e) => {
                          setClientPhone(e.target.value);
                          if (clientPhoneError) setClientPhoneError(null);
                        }}
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <FormField 
                        label="Endereço (Rua / Logradouro) *"
                        error={deliveryStreetError || undefined}
                      >
                        <TextInput
                          placeholder="Ex: Rua das Flores, Av. Brasil"
                          value={deliveryStreet}
                          onChange={(e) => {
                            setDeliveryStreet(e.target.value);
                            if (deliveryStreetError) setDeliveryStreetError(null);
                          }}
                        />
                      </FormField>
                    </div>
                    <div className="sm:col-span-1">
                      <FormField 
                        label="Número *"
                        error={deliveryNumberError || undefined}
                      >
                        <TextInput
                          placeholder="Ex: 120 ou S/N"
                          value={deliveryNumber}
                          onChange={(e) => {
                            setDeliveryNumber(e.target.value);
                            if (deliveryNumberError) setDeliveryNumberError(null);
                          }}
                        />
                      </FormField>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <FormField 
                      label="Bairro *"
                      error={deliveryNeighborhoodError || undefined}
                    >
                      <TextInput
                        placeholder="Ex: Centro"
                        value={deliveryNeighborhood}
                        onChange={(e) => {
                          setDeliveryNeighborhood(e.target.value);
                          if (deliveryNeighborhoodError) setDeliveryNeighborhoodError(null);
                        }}
                      />
                    </FormField>
                    <FormField 
                      label="Complemento (se houver)"
                    >
                      <TextInput
                        placeholder="Ex: Apto 101, Bloco B"
                        value={deliveryComplement}
                        onChange={(e) => setDeliveryComplement(e.target.value)}
                      />
                    </FormField>
                  </div>

                  <FormField 
                    label="Ponto de Referência (se houver)"
                  >
                    <TextInput
                      placeholder="Ex: Próximo ao supermercado, portão verde"
                      value={deliveryReference}
                      onChange={(e) => setDeliveryReference(e.target.value)}
                    />
                  </FormField>
                </div>
              )}
            </div>

            {/* Cart Items List - Independently Scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar my-2 divide-y divide-stone-100 pr-1 space-y-2">
              {cart.length === 0 ? (
                <div className="py-8 text-center text-stone-400 text-xs">
                  Sua lista de pedido no balcão está vazia.
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.cartId} className="pt-2 first:pt-0 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-stone-800 text-xs truncate">{item.nome}</div>
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
                      <div className="font-bold text-stone-900 text-xs shrink-0">
                        {formatCurrency(item.precoFinal * item.quantidade)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 bg-stone-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.cartId, -1)}
                          className="p-1 hover:bg-white rounded transition-all text-stone-600 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold text-stone-800 w-4 text-center">{item.quantidade}</span>
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.cartId, 1)}
                          className="p-1 hover:bg-white rounded transition-all text-stone-600 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeCartItem(item.cartId)}
                        className="text-stone-400 hover:text-red-500 p-1 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Observações do Pedido (Geral / Cozinha / Bar) */}
            <div className="shrink-0 space-y-1.5 py-2 border-t border-stone-100">
              <label htmlFor="counter-order-notes" className="text-xs font-bold text-stone-700 flex items-center justify-between">
                <span>Observações do Pedido</span>
                <span className="text-[10px] text-stone-400 font-normal">Cozinha / Bar</span>
              </label>
              <textarea
                id="counter-order-notes"
                rows={2}
                placeholder={
                  tipoAtendimento === 'RETIRADA'
                    ? "Ex: Embalar para viagem, fornecer talheres descartáveis..."
                    : tipoAtendimento === 'MESA'
                    ? "Ex: Bebidas primeiro, carne ao ponto..."
                    : "Ex: Tocar campainha 2 vezes, deixar na portaria..."
                }
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                maxLength={500}
                className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all resize-none font-medium"
              />
            </div>

            {/* Totals & Payments & Checkout - Fixed at bottom */}
            <div className="shrink-0 border-t border-stone-100 pt-2.5 space-y-2.5 max-h-[45vh] overflow-y-auto custom-scrollbar pr-0.5">
              {/* Order Totals Summary */}
              <div className="bg-stone-50 p-2.5 rounded-xl space-y-1 border border-stone-200/60 text-xs">
                <div className="flex justify-between font-extrabold text-stone-900 text-sm">
                  <span>{tipoAtendimento === 'MESA' ? 'Total dos Itens' : 'Total a Pagar'}</span>
                  <span className="text-emerald-700">{formatCurrency(cartTotal)}</span>
                </div>
                {tipoAtendimento === 'MESA' && (
                  <div className="text-[11px] text-stone-500 flex items-center justify-between pt-1 border-t border-stone-200/60">
                    <span>Destino:</span>
                    <span className="font-bold text-stone-800 truncate max-w-[180px]">
                      {mesaSelectionMode === 'FREE_TABLE'
                        ? (selectedTable ? (selectedTable.name || (selectedTable.number ? `Mesa ${selectedTable.number}` : `Mesa ${selectedTable.id}`)) : 'Selecione uma mesa livre')
                        : (selectedTab ? (selectedTab.tableName || (selectedTab.tableNumber !== undefined ? `Mesa ${selectedTab.tableNumber}` : `Comanda #${selectedTab.id.slice(0, 6)}`)) : 'Selecione uma comanda ativa')}
                    </span>
                  </div>
                )}
              </div>

              {tipoAtendimento === 'MESA' ? (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <Receipt className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>O valor deste pedido pertence à COMANDA</span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Não solicitar pagamento individual desse pedido. O acerto financeiro será efetuado no fechamento da comanda da mesa.
                  </p>
                </div>
              ) : (
                <>
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
                    <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
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
                          className="w-28 text-right px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                </>
              )}

              {/* Confirm Order Button */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  cart.length === 0 || 
                  saveLoading || 
                  (tipoAtendimento === 'MESA' 
                    ? (mesaSelectionMode === 'FREE_TABLE' ? !selectedTable : !selectedTab)
                    : (isCashAmountInsufficient || availablePaymentMethods.length === 0 || payments.reduce((a,b)=>a+b.amount,0)!==cartTotalCents))
                }
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saveLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>
                      {tipoAtendimento === 'MESA'
                        ? `Lançar na Comanda/Mesa (${formatCurrency(cartTotal)})`
                        : `Finalizar e enviar para cozinha (${formatCurrency(cartTotal)})`}
                    </span>
                  </>
                )}
              </button>
            </div>
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
