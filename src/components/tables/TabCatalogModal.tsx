import React, { useState, useEffect, useMemo } from 'react';
import { Product, productService } from '../../services/productService';
import { optionService, OptionItem, OptionGroup } from '../../services/optionService';
import { 
  getProductPriceForChannel, 
  isProductAvailableForChannel,
  resolveChannelUnitPriceCents
} from '../../domain/product/productChannels';
import { formatCurrency } from '../../utils/currencyUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useConnectivity } from '../../contexts/ConnectivityContext';
import { Table, Tab } from '../../types/mesas';
import { tabRoundCartService } from '../../services/tabRoundCartService';
import { tabRoundService } from '../../services/tabRoundService';
import { db } from '../../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { 
  X, 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingBag, 
  Utensils, 
  ChevronRight, 
  Loader2, 
  AlertCircle, 
  Check, 
  FileText,
  SlidersHorizontal,
  CheckCircle2,
  Info,
  Edit2,
  Send
} from 'lucide-react';
import PlaceholderImage from '../PlaceholderImage';
import {
  Button,
  IconButton,
  SearchInput,
  TextInput,
  TextareaInput,
  FormField,
  FormLabel
} from '../ui';

export interface TabDraftItem {
  id: string; // unique draft item id
  productId: string;
  productName: string;
  imagemUrl?: string;
  size?: { nome: string; preco: number };
  options?: { groupId: string; groupName: string; itemId: string; itemNome: string; preco: number }[];
  observation?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

interface TabCatalogModalProps {
  isOpen: boolean;
  table?: Table | null;
  tab?: Tab | null;
  hallName?: string;
  canViewPrices?: boolean;
  onClose: () => void;
  onConfirmDraft?: (draftItems: TabDraftItem[]) => void;
}

export function TabCatalogModal({
  isOpen,
  table,
  tab,
  hallName,
  canViewPrices = true,
  onClose,
  onConfirmDraft
}: TabCatalogModalProps) {
  const { profile } = useAuth();
  const { isOnline } = useConnectivity();
  const restaurantId = profile?.restaurantId;

  // Active tab state resolved from props or fetched dynamically
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const resolvedTab = tab || activeTab;

  // Data states
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [allOptionItems, setAllOptionItems] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');

  // Draft Cart state (Selection in memory & persistent local round cart)
  const [draftItems, setDraftItems] = useState<TabDraftItem[]>([]);
  const [isDraftSummaryOpen, setIsDraftSummaryOpen] = useState<boolean>(false);
  const [editingObsItemId, setEditingObsItemId] = useState<string | null>(null);
  const [editingObsValue, setEditingObsValue] = useState<string>('');

  // Pending action id for idempotency & safe retries
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // Product Customization Modal State
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<{ nome: string; preco: number } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, OptionItem[]>>({});
  const [customizationObs, setCustomizationObs] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [customizationError, setCustomizationError] = useState<string | null>(null);

  // Success Feedback Toast State
  const [showSuccessNotice, setShowSuccessNotice] = useState<boolean>(false);

  // Sync tab state with prop or fetch if missing
  useEffect(() => {
    if (!isOpen) {
      setActiveTab(null);
      return;
    }

    if (tab) {
      setActiveTab(tab);
      return;
    }

    if (table?.id && restaurantId) {
      const fetchActiveTab = async () => {
        try {
          const q = query(
            collection(db, 'tabs'),
            where('restaurantId', '==', restaurantId),
            where('tableId', '==', table.id),
            where('status', 'in', ['OPEN', 'WAITING_ITEMS', 'WAITING_PAYMENT', 'PARTIALLY_PAID']),
            limit(1)
          );
          const snap = await getDocs(q);
          if (!snap.empty) {
            const foundTab = { id: snap.docs[0].id, ...snap.docs[0].data() } as Tab;
            setActiveTab(foundTab);
          }
        } catch (err) {
          console.error('Error fetching active tab for catalog:', err);
        }
      };
      fetchActiveTab();
    }
  }, [isOpen, tab, table?.id, restaurantId]);

  // Load catalog data on mount / open
  useEffect(() => {
    if (!isOpen || !restaurantId) return;

    let isMounted = true;
    const loadCatalogData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [catsData, prodsData, optionsData] = await Promise.all([
          productService.getCategoriesByRestaurant(restaurantId),
          productService.getProducts(restaurantId),
          optionService.getAllOptions(restaurantId)
        ]);

        if (isMounted) {
          setCategories(catsData || []);
          setProducts(prodsData || []);
          setAllOptionItems(optionsData || []);
        }
      } catch (err: any) {
        console.error('Erro ao carregar catálogo da comanda:', err);
        if (isMounted) {
          setError('Não foi possível carregar os produtos do cardápio.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCatalogData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, restaurantId]);

  // Sync internal round cart state with storage on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('todos');
      const loadedCart = tabRoundCartService.getCart(table?.id, resolvedTab?.id);
      setDraftItems(loadedCart);
      setIsDraftSummaryOpen(false);
      setCustomizingProduct(null);
      setShowSuccessNotice(false);
      setEditingObsItemId(null);
    }
  }, [isOpen, table?.id, resolvedTab?.id]);

  // Filter products for in-person availability
  const availableProducts = useMemo(() => {
    return products.filter(p => {
      // Must be active and available for in-person channels (waiter or counter)
      const isActive = p.status === 'ativo' || (p as any).ativo !== false;
      const isAvailableInPerson = 
        isProductAvailableForChannel(p, 'waiter') || 
        isProductAvailableForChannel(p, 'counter');
      return isActive && isAvailableInPerson;
    });
  }, [products]);

  // Filter products by category & search query
  const filteredProducts = useMemo(() => {
    const queryLower = searchQuery.toLowerCase().trim();
    return availableProducts.filter(p => {
      if (!p) return false;
      const matchCategory = selectedCategory === 'todos' || p.categoria_id === selectedCategory;
      const prodName = String(p.nome || (p as any).name || '').toLowerCase();
      const prodDesc = String(p.descricao || (p as any).description || '').toLowerCase();
      const matchSearch = !queryLower || 
        prodName.includes(queryLower) || 
        prodDesc.includes(queryLower);
      return matchCategory && matchSearch;
    });
  }, [availableProducts, selectedCategory, searchQuery]);

  // Open customization modal for a product
  const handleOpenProductCustomization = (product: Product) => {
    setCustomizingProduct(product);
    setCustomizationObs('');
    setItemQuantity(1);
    setCustomizationError(null);

    // Set default size if available
    if (product.sizes && product.sizes.length > 0) {
      setSelectedSize(product.sizes[0]);
    } else {
      setSelectedSize(null);
    }

    // Reset option selections
    setSelectedOptions({});
  };

  // Toggle option selection for a group
  const handleToggleOption = (group: any, optionItem: OptionItem) => {
    const groupId = group.groupId;
    const currentSelections = selectedOptions[groupId] || [];
    const isAlreadySelected = currentSelections.some(item => item.id === optionItem.id);

    if (isAlreadySelected) {
      // Remove selection
      const updated = currentSelections.filter(item => item.id !== optionItem.id);
      setSelectedOptions(prev => ({ ...prev, [groupId]: updated }));
    } else {
      // Check max allowed
      const max = group.max || 999;
      if (max === 1) {
        // Single pick (radio behavior)
        setSelectedOptions(prev => ({ ...prev, [groupId]: [optionItem] }));
      } else {
        if (currentSelections.length >= max) {
          setCustomizationError(`Máximo de ${max} opção(ões) permitida(s) no grupo ${group.nome}`);
          return;
        }
        setCustomizationError(null);
        setSelectedOptions(prev => ({ ...prev, [groupId]: [...currentSelections, optionItem] }));
      }
    }
  };

  // Calculate unit price for customizing product
  const currentItemUnitPriceCents = useMemo(() => {
    if (!customizingProduct) return 0;

    let baseCents = resolveChannelUnitPriceCents(customizingProduct, selectedSize, 'waiter');
    
    // Add option group extras
    Object.values(selectedOptions).forEach(items => {
      items.forEach(opt => {
        if (opt.preco) {
          baseCents += Math.round(opt.preco * 100);
        }
      });
    });

    return baseCents;
  }, [customizingProduct, selectedSize, selectedOptions]);

  // Add customized item to draft cart
  const handleConfirmProductCustomization = () => {
    if (!customizingProduct) return;

    // Validate mandatory option groups
    if (customizingProduct.optionGroups) {
      for (const grp of customizingProduct.optionGroups) {
        if (grp.obrigatorio) {
          const selections = selectedOptions[grp.groupId] || [];
          const min = grp.min || 1;
          if (selections.length < min) {
            setCustomizationError(`Selecione pelo menos ${min} opção(ões) em "${grp.nome}".`);
            return;
          }
        }
      }
    }

    const flattenedOptions: { groupId: string; groupName: string; itemId: string; itemNome: string; preco: number }[] = [];
    if (customizingProduct.optionGroups) {
      customizingProduct.optionGroups.forEach(grp => {
        const selections = selectedOptions[grp.groupId] || [];
        selections.forEach(opt => {
          flattenedOptions.push({
            groupId: grp.groupId,
            groupName: grp.nome,
            itemId: opt.id || '',
            itemNome: opt.nome,
            preco: opt.preco || 0
          });
        });
      });
    }

    const draftItem: TabDraftItem = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: customizingProduct.id || '',
      productName: customizingProduct.nome,
      imagemUrl: customizingProduct.imagem_url,
      size: selectedSize ? { nome: selectedSize.nome, preco: selectedSize.preco } : undefined,
      options: flattenedOptions.length > 0 ? flattenedOptions : undefined,
      observation: customizationObs.trim() ? customizationObs.trim() : undefined,
      quantity: itemQuantity,
      unitPriceCents: currentItemUnitPriceCents,
      totalPriceCents: currentItemUnitPriceCents * itemQuantity
    };

    const updated = tabRoundCartService.addItem(draftItem, table?.id, resolvedTab?.id);
    setDraftItems(updated);
    setCustomizingProduct(null);
    setPendingActionId(null); // Reset pending action id on cart mutation
  };

  // Remove item from draft cart
  const handleRemoveDraftItem = (draftId: string) => {
    const updated = tabRoundCartService.removeItem(draftId, table?.id, resolvedTab?.id);
    setDraftItems(updated);
    setPendingActionId(null);
  };

  // Adjust item quantity in draft cart
  const handleUpdateDraftQuantity = (draftId: string, newQty: number) => {
    const updated = tabRoundCartService.updateQuantity(draftId, newQty, table?.id, resolvedTab?.id);
    setDraftItems(updated);
    setPendingActionId(null);
  };

  // Update item observation in draft cart
  const handleSaveDraftObservation = (draftId: string, newObservation: string) => {
    const updated = tabRoundCartService.updateObservation(draftId, newObservation, table?.id, resolvedTab?.id);
    setDraftItems(updated);
    setEditingObsItemId(null);
    setEditingObsValue('');
    setPendingActionId(null);
  };

  // Total draft stats
  const totalDraftQuantity = useMemo(() => {
    return draftItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [draftItems]);

  const totalDraftPriceCents = useMemo(() => {
    return draftItems.reduce((sum, item) => sum + item.totalPriceCents, 0);
  }, [draftItems]);

  // Finalize Selection (Pass to parent draft callback, NO ORDER / FINANCIAL / INVENTORY WRITES)
  const handleConfirmDraftSelection = () => {
    if (draftItems.length === 0) return;

    if (onConfirmDraft) {
      onConfirmDraft(draftItems);
    }
    setShowSuccessNotice(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  // Round Submission state (Submit order, update tab/table, apply stock, keep comanda open)
  const [isSendingRound, setIsSendingRound] = useState<boolean>(false);
  const [sendRoundError, setSendRoundError] = useState<string | null>(null);
  const [showRoundSuccessNotice, setShowRoundSuccessNotice] = useState<boolean>(false);

  const formatPrice = (cents: number, showCents: boolean = true) => {
    if (!canViewPrices) return '***';
    return formatCurrency(cents, showCents);
  };

  const handleSendRound = async () => {
    if (isSendingRound || draftItems.length === 0) return;

    if (!isOnline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setSendRoundError('Sem conexão. Reconecte-se para enviar a rodada.');
      return;
    }

    if (!restaurantId) {
      setSendRoundError('Restaurante não identificado.');
      return;
    }

    setIsSendingRound(true);
    setSendRoundError(null);

    // Reuse existing action ID for safe retries or generate a new one
    const actionId = pendingActionId || crypto.randomUUID();
    if (!pendingActionId) {
      setPendingActionId(actionId);
    }

    try {
      const origin = profile?.role === 'WAITER' ? 'WAITER' : 'TABLE';

      const result = await tabRoundService.sendRound({
        restaurantId,
        tableId: table?.id || null,
        tabId: resolvedTab?.id || null,
        origin,
        items: draftItems,
        clientActionId: actionId
      });

      if (result.success) {
        // Clear cart ONLY after success
        tabRoundCartService.clearCart(table?.id, resolvedTab?.id);
        setDraftItems([]);
        setPendingActionId(null);
        setIsDraftSummaryOpen(false);

        // Dispara evento para atualização em tempo real no dashboard / cozinha
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('new-order-received'));
        }

        setShowRoundSuccessNotice(true);

        if (onConfirmDraft) {
          onConfirmDraft([]);
        }

        setTimeout(() => {
          setShowRoundSuccessNotice(false);
          onClose();
        }, 1600);
      }
    } catch (err: any) {
      console.error('Erro ao enviar rodada da comanda:', err);
      // Keep pendingActionId intact if error is retryable (e.g. timeout, 500, or network drop)
      if (err.isRetryable === false) {
        setPendingActionId(null);
      }
      setSendRoundError(err.message || 'Não foi possível confirmar o envio. Tente novamente.');
    } finally {
      setIsSendingRound(false);
    }
  };

  if (!isOpen) return null;

  const tableName = table?.name || (resolvedTab?.tableId ? `Mesa` : 'Comanda');

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-stone-900/70 backdrop-blur-xs transition-all animate-in fade-in duration-200">
      {/* Modal Card Full-Screen Container */}
      <div className="bg-stone-50 w-full h-full flex flex-col max-w-5xl mx-auto sm:my-4 sm:rounded-3xl sm:h-[92vh] sm:border sm:border-stone-200 sm:shadow-2xl overflow-hidden relative font-sans">
        
        {/* Header Bar */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-stone-400">
                  {hallName || 'Atendimento em Mesa'}
                </span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                  Cardápio
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-stone-900 leading-tight">
                Adicionar Itens — {tableName}
              </h2>
            </div>
          </div>

          <IconButton
            aria-label="Fechar catálogo"
            onClick={onClose}
            variant="ghost"
            size="md"
            className="text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors active:scale-95"
          >
            <X className="w-6 h-6" />
          </IconButton>
        </div>

        {/* Sticky Search Bar & Category Navigation */}
        <div className="bg-white border-b border-stone-200 px-4 py-3 sm:px-6 space-y-3 shrink-0 shadow-2xs">
          {/* Always Visible Search Input */}
          <div className="relative">
            <SearchInput
              placeholder="Buscar produto por nome ou ingrediente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-stone-100 border-stone-200"
            />
            {searchQuery && (
              <IconButton
                aria-label="Limpar busca"
                onClick={() => setSearchQuery('')}
                variant="ghost"
                size="sm"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 rounded-full"
              >
                <X className="w-3.5 h-3.5" />
              </IconButton>
            )}
          </div>

          {/* Horizontal Scrolling Categories Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
            <button
              onClick={() => setSelectedCategory('todos')}
              className={`px-4 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all shadow-2xs min-h-[34px] flex items-center justify-center ${
                selectedCategory === 'todos'
                  ? 'bg-emerald-600 text-white shadow-xs scale-102'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Todas As Categorias
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all shadow-2xs min-h-[34px] flex items-center justify-center ${
                  selectedCategory === cat.id
                    ? 'bg-emerald-600 text-white shadow-xs scale-102'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {cat.nome}
              </button>
            ))}
          </div>
        </div>

        {/* Catalog Body / Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 pb-28">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-stone-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
                Carregando cardápio...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center space-y-2">
              <p className="text-stone-700 font-bold text-sm">Nenhum produto encontrado</p>
              <p className="text-stone-400 text-xs">
                Tente ajustar a busca ou escolher outra categoria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredProducts.map(product => {
                const priceCents = resolveChannelUnitPriceCents(product, undefined, 'waiter');
                const hasSizes = product.sizes && product.sizes.length > 0;
                const hasOptionGroups = product.optionGroups && product.optionGroups.length > 0;

                return (
                  <div
                    key={product.id}
                    onClick={() => handleOpenProductCustomization(product)}
                    className="bg-white rounded-2xl p-3.5 border border-stone-200/90 shadow-2xs hover:border-emerald-500 hover:shadow-md transition-all flex items-center gap-3.5 cursor-pointer group active:scale-[0.98] select-none"
                  >
                    {/* Compact Image or Fallback */}
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-stone-100 shrink-0 border border-stone-100 relative">
                      {product.imagem_url ? (
                        <img 
                          src={product.imagem_url} 
                          alt={product.nome}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300">
                          <Utensils className="w-8 h-8 stroke-1" />
                        </div>
                      )}
                    </div>

                    {/* Compact Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <h4 className="font-bold text-stone-900 text-sm leading-snug truncate group-hover:text-emerald-700 transition-colors">
                          {product.nome}
                        </h4>
                        {product.descricao && (
                          <p className="text-stone-500 text-xs leading-tight line-clamp-2 mt-0.5">
                            {product.descricao}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-stone-100">
                        <span className="font-extrabold text-stone-900 text-sm">
                          {hasSizes ? `a partir de ${formatPrice(priceCents, true)}` : formatPrice(priceCents, true)}
                        </span>

                        <button
                          type="button"
                          className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-1 shadow-2xs group-hover:bg-emerald-600 group-hover:text-white"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fixed Footer Selection Summary Bar (Rodapé Fixo) */}
        {draftItems.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-stone-900 text-white p-4 sm:px-6 border-t border-stone-800 shadow-2xl flex items-center justify-between gap-4 z-40 animate-in slide-in-from-bottom duration-200">
            <div 
              onClick={() => setIsDraftSummaryOpen(!isDraftSummaryOpen)}
              className="flex items-center gap-3 cursor-pointer select-none"
            >
              <div className="relative">
                <div className="p-2.5 bg-emerald-500 text-stone-900 rounded-2xl shadow-md font-black text-sm">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-extrabold text-xs w-5 h-5 rounded-full flex items-center justify-center border-2 border-stone-900">
                  {totalDraftQuantity}
                </span>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider text-stone-400 font-bold block">
                  {totalDraftQuantity} {totalDraftQuantity === 1 ? 'item selecionado' : 'itens selecionados'}
                </span>
                <span className="text-base font-extrabold text-white">
                  {formatPrice(totalDraftPriceCents, true)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDraftSummaryOpen(!isDraftSummaryOpen)}
                className="px-3 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl text-xs font-bold transition-all hidden sm:flex items-center gap-1"
              >
                <span>Ver Itens</span>
              </button>

              <button
                type="button"
                onClick={handleSendRound}
                disabled={isSendingRound || draftItems.length === 0}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              >
                {isSendingRound ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 stroke-[2.5]" />
                    <span>Enviar Rodada ({totalDraftQuantity})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Draft Items Slide-up Drawer */}
        {isDraftSummaryOpen && draftItems.length > 0 && (
          <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
            <div className="bg-white rounded-t-3xl max-h-[75vh] max-h-[75dvh] flex flex-col overflow-hidden animate-in slide-in-from-bottom">
              <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-50">
                <h3 className="font-extrabold text-stone-900 text-sm sm:text-base flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-emerald-600" />
                  Itens Selecionados ({totalDraftQuantity})
                </h3>
                <button
                  onClick={() => setIsDraftSummaryOpen(false)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-3.5 divide-y divide-stone-100 flex-1 min-h-0">
                {draftItems.map((item) => (
                  <div key={item.id} className="pt-3.5 first:pt-0 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h5 className="font-bold text-stone-900 text-sm leading-snug break-words">
                          {item.productName}
                        </h5>
                        {item.size && (
                          <p className="text-xs text-stone-600 font-medium mt-0.5">
                            Tamanho: <span className="font-semibold text-stone-800">{item.size.nome}</span>
                          </p>
                        )}
                        {item.options && item.options.length > 0 && (
                          <p className="text-xs text-stone-500 mt-0.5 leading-normal">
                            Adicionais: {item.options.map(o => o.itemNome).join(', ')}
                          </p>
                        )}

                        {/* Observation Display / Inline Edit */}
                        {editingObsItemId === item.id ? (
                          <div className="mt-2 flex items-center gap-1.5 max-w-md">
                            <TextInput
                              type="text"
                              value={editingObsValue}
                              onChange={(e) => setEditingObsValue(e.target.value)}
                              placeholder="Digite a observação..."
                              className="flex-1 min-h-[34px] py-1.5 px-2.5 text-xs border border-stone-300"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveDraftObservation(item.id, editingObsValue);
                                }
                              }}
                            />
                            <IconButton
                              type="button"
                              aria-label="Salvar observação"
                              onClick={() => handleSaveDraftObservation(item.id, editingObsValue)}
                              variant="primary"
                              size="sm"
                              className="w-9 h-9 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                            >
                              <Check className="w-4 h-4 stroke-[3]" />
                            </IconButton>
                            <IconButton
                              type="button"
                              aria-label="Cancelar"
                              onClick={() => setEditingObsItemId(null)}
                              variant="secondary"
                              size="sm"
                              className="w-9 h-9 flex items-center justify-center bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-xl"
                            >
                              <X className="w-4 h-4" />
                            </IconButton>
                          </div>
                        ) : (
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {item.observation ? (
                              <span className="text-xs text-amber-800 italic bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg inline-flex items-center gap-1.5">
                                <span>Obs: {item.observation}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingObsItemId(item.id);
                                    setEditingObsValue(item.observation || '');
                                  }}
                                  className="text-amber-900 hover:text-amber-700 p-0.5 rounded"
                                  title="Editar observação"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingObsItemId(item.id);
                                  setEditingObsValue('');
                                }}
                                className="text-xs text-stone-500 hover:text-emerald-700 font-medium flex items-center gap-1 hover:underline"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Adicionar observação</span>
                              </button>
                            )}
                          </div>
                        )}

                        <p className="font-extrabold text-stone-900 text-xs sm:text-sm mt-1.5">
                          {formatPrice(item.totalPriceCents, true)}
                        </p>
                      </div>

                      {/* Quantity & Delete Touch-friendly Controls */}
                      <div className="flex items-center gap-1.5 shrink-0 bg-stone-50 p-1 rounded-2xl border border-stone-200">
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 rounded-xl bg-white text-stone-700 border border-stone-200 flex items-center justify-center font-extrabold hover:bg-stone-100 active:scale-95 transition-all"
                          title="Diminuir quantidade"
                        >
                          <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <span className="font-black text-stone-900 text-xs w-6 text-center">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleUpdateDraftQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 rounded-xl bg-white text-stone-700 border border-stone-200 flex items-center justify-center font-extrabold hover:bg-stone-100 active:scale-95 transition-all"
                          title="Aumentar quantidade"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDraftItem(item.id)}
                          className="w-8 h-8 rounded-xl text-red-500 hover:text-red-700 hover:bg-red-50 flex items-center justify-center transition-colors ml-0.5"
                          title="Remover item da rodada"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-stone-200 bg-stone-50 space-y-3 shrink-0">
                {sendRoundError && (
                  <div 
                    role="alert" 
                    aria-live="polite" 
                    className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2 text-red-700 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{sendRoundError}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-stone-700 text-xs">Total da Rodada</span>
                  <span className="font-extrabold text-stone-900 text-base">
                    {formatPrice(totalDraftPriceCents, true)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSendRound}
                  disabled={isSendingRound || draftItems.length === 0}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
                >
                  {isSendingRound ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{pendingActionId ? 'Confirmando envio...' : 'Enviando Rodada para Produção...'}</span>
                    </>
                  ) : sendRoundError && pendingActionId ? (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Tentar Novamente ({formatPrice(totalDraftPriceCents, true)})</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Enviar Rodada para Produção ({formatPrice(totalDraftPriceCents, true)})</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Product Customization Modal / Drawer */}
        {customizingProduct && (
          <div 
            className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in"
            onClick={() => setCustomizingProduct(null)}
          >
            <div 
              className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] max-h-[88dvh] sm:max-h-[85vh] animate-in slide-in-from-bottom duration-200 relative pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Drawer Header */}
              <div className="p-4 sm:p-5 border-b border-stone-100 bg-stone-50 flex items-center justify-between shrink-0">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-stone-400">
                    Personalizar Produto
                  </span>
                  <h3 className="text-base sm:text-lg font-extrabold text-stone-900">
                    {customizingProduct.nome}
                  </h3>
                </div>

                <button
                  onClick={() => setCustomizingProduct(null)}
                  className="p-2 text-stone-400 hover:text-stone-700 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Customization Form Body */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 min-h-0">
                {customizationError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>{customizationError}</span>
                  </div>
                )}

                {/* Description */}
                {customizingProduct.descricao && (
                  <p className="text-stone-500 text-xs leading-relaxed bg-stone-50 p-3 rounded-2xl border border-stone-100">
                    {customizingProduct.descricao}
                  </p>
                )}

                {/* Size Selection */}
                {customizingProduct.sizes && customizingProduct.sizes.length > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-stone-800">
                      Tamanho / Variação <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {customizingProduct.sizes.map((sz, idx) => {
                        const isSelected = selectedSize?.nome === sz.nome;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setSelectedSize(sz)}
                            className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20'
                                : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100'
                            }`}
                          >
                            <span className="font-extrabold text-xs">{sz.nome}</span>
                            <span className="text-xs font-bold mt-1 text-stone-900">
                              {formatPrice(sz.preco * 100, true)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Option Groups / Adicionais */}
                {customizingProduct.optionGroups && customizingProduct.optionGroups.map((grp) => {
                  const groupOptions = allOptionItems.filter(opt => opt.grupoId === grp.groupId && opt.ativo);
                  const currentGrpSelections = selectedOptions[grp.groupId] || [];

                  return (
                    <div key={grp.groupId} className="space-y-2 bg-stone-50 p-3.5 rounded-2xl border border-stone-200">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-800 text-xs">
                          {grp.nome} {grp.obrigatorio && <span className="text-red-500">*</span>}
                        </span>
                        <span className="text-xs text-stone-400 font-medium">
                          {grp.max === 1 ? 'Escolha 1 opção' : `Até ${grp.max} opções`}
                        </span>
                      </div>

                      {groupOptions.length === 0 ? (
                        <p className="text-stone-400 text-xs italic">Nenhum adicional neste grupo.</p>
                      ) : (
                        <div className="space-y-1.5 pt-1">
                          {groupOptions.map(opt => {
                            const isChecked = currentGrpSelections.some(item => item.id === opt.id);

                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => handleToggleOption(grp, opt)}
                                className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                                  isChecked
                                    ? 'bg-emerald-100/70 border-emerald-500 text-emerald-950 font-bold'
                                    : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                                }`}
                              >
                                <span className="text-xs">{opt.nome}</span>
                                <span className="text-xs font-bold text-stone-900">
                                  {opt.preco > 0 ? `+ ${formatPrice(opt.preco * 100, true)}` : 'Grátis'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Observação / Special Instructions */}
                <div>
                  <FormLabel className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-3.5 h-3.5 text-stone-500" />
                    Observação do Item <span className="text-stone-400 font-normal">(opcional)</span>
                  </FormLabel>
                  <TextareaInput
                    rows={2}
                    placeholder="Ex: Sem cebola, molho à parte..."
                    value={customizationObs}
                    onChange={(e) => setCustomizationObs(e.target.value)}
                    className="resize-none"
                  />
                </div>

                {/* Quantity Control */}
                <div className="flex items-center justify-between bg-stone-50 p-3 rounded-2xl border border-stone-200">
                  <span className="font-bold text-stone-800 text-xs">Quantidade:</span>
                  <div className="flex items-center gap-3">
                    <IconButton
                      type="button"
                      aria-label="Diminuir quantidade"
                      onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                      disabled={itemQuantity <= 1}
                      variant="secondary"
                      size="sm"
                      className="w-9 h-9 border border-stone-200 bg-white"
                    >
                      <Minus className="w-4 h-4" />
                    </IconButton>
                    <span className="font-extrabold text-stone-900 text-sm w-6 text-center">
                      {itemQuantity}
                    </span>
                    <IconButton
                      type="button"
                      aria-label="Aumentar quantidade"
                      onClick={() => setItemQuantity(itemQuantity + 1)}
                      variant="secondary"
                      size="sm"
                      className="w-9 h-9 border border-stone-200 bg-white"
                    >
                      <Plus className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 pb-6 sm:pb-5 border-t border-stone-100 bg-stone-50 flex items-center justify-between gap-3 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCustomizingProduct(null)}
                  className="px-3.5 sm:px-4 py-3 text-stone-600 animate-none hover:bg-stone-200 min-h-[44px]"
                >
                  Cancelar
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  onClick={handleConfirmProductCustomization}
                  className="flex-1 min-h-[44px] text-xs sm:text-sm font-extrabold"
                  icon={<Plus className="w-4 h-4 stroke-[3]" />}
                >
                  Adicionar ({formatPrice(currentItemUnitPriceCents * itemQuantity, true)})
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success Notice Modal */}
        {showSuccessNotice && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl animate-in zoom-in-95">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-extrabold text-stone-900 text-base">Seleção Concluída!</h4>
              <p className="text-stone-500 text-xs leading-relaxed">
                {totalDraftQuantity} {totalDraftQuantity === 1 ? 'item foi adicionado' : 'itens foram adicionados'} ao rascunho da comanda.
              </p>
            </div>
          </div>
        )}

        {/* Round Success Notice Modal */}
        {showRoundSuccessNotice && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl animate-in zoom-in-95">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="font-extrabold text-stone-900 text-base">Rodada Enviada!</h4>
              <p className="text-stone-500 text-xs leading-relaxed">
                O pedido foi enviado para produção e a comanda permanece aberta.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default TabCatalogModal;
