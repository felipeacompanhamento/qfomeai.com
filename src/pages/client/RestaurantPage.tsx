import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { restaurantService } from '../../services/restaurantService';
import { scheduleService } from '../../services/scheduleService';
import { optionService, OptionGroup, OptionItem } from '../../services/optionService';
import { cache } from '../../utils/cache';
import { useCart, CartItemExtra } from '../../contexts/CartContext';
import { useAppLoading } from '../../contexts/AppLoadingContext';
import { useAuth } from '../../contexts/AuthContext';
import PlaceholderImage from '../../components/PlaceholderImage';
import { ChevronLeft, Star, Clock, Info, Plus, Minus, ShoppingBag, AlertCircle, X, MapPin, Phone, Mail, Instagram, Store } from 'lucide-react';
import { isRestaurantOpen } from '../../utils/restaurantStatus';
import RatingsModal from '../../components/RatingsModal';
import { debounce } from 'lodash';

export default function RestaurantPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isRestaurant } = useAuth();
  const { addItem, items, total } = useCart();
  const { triggerSplash } = useAppLoading();
  const [restaurant, setRestaurant] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [extras, setExtras] = useState<any[]>([]);
  const [allOptions, setAllOptions] = useState<OptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [isRatingsModalOpen, setIsRatingsModalOpen] = useState(false);
  
  // Modal state
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productObservation, setProductObservation] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<Record<string, number>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<any>(null);
  const [isHalf, setIsHalf] = useState(false);
  const [selectedSecondHalf, setSelectedSecondHalf] = useState<any>(null);

  // Scrollspy state
  const [activeCategory, setActiveCategory] = useState<string>('');
  const categoryRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const menuNavRef = useRef<HTMLDivElement>(null);
  const isFetching = useRef(false);

  useEffect(() => {
    triggerSplash();
  }, [navigate, triggerSplash]);

  useEffect(() => {
    isFetching.current = false;
  }, [slug]);

  useEffect(() => {
    if (!slug || isFetching.current) return;
    isFetching.current = true;

    let isMounted = true;

    const fetchRestaurantData = async () => {
      setLoading(true);
      try {
        console.log(`[RestaurantPage] Iniciando carregamento de dados para o slug: ${slug}`);
        const rest = await restaurantService.getRestaurantBySlug(slug);
        
        if (rest && isMounted) {
          setRestaurant(rest);
          
          // Use service methods which already have caching and logging
          const [categoriesData, productsData, extrasData, optionsData, schedulesData, promotionsData] = await Promise.all([
            restaurantService.getRestaurantCategories(rest.id),
            restaurantService.getRestaurantProducts(rest.id),
            restaurantService.getRestaurantExtras(rest.id),
            optionService.getAllOptions(rest.id),
            scheduleService.getSchedulesByRestaurant(rest.id),
            getDocs(query(collection(db, 'restaurants', rest.id, 'promotions'), where('ativo', '==', true))).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
          ]);

          if (isMounted) {
            setCategories(categoriesData);
            setProducts(productsData);
            setExtras(extrasData);
            setAllOptions(optionsData);
            setPromotions(promotionsData);
            console.log(`[RestaurantPage] Promoções carregadas:`, promotionsData);
            setRestaurant({ ...rest, schedules: schedulesData });
            console.log(`[RestaurantPage] Dados carregados com sucesso para ${rest.nome}`);
          }
        } else if (isMounted) {
          console.warn(`[RestaurantPage] Restaurante não encontrado para o slug: ${slug}`);
        }
      } catch (error) {
        console.error("[RestaurantPage] Erro ao carregar dados do restaurante:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRestaurantData();

    return () => {
      isMounted = false;
    };
  }, [slug]);

  // Group products by category
  const productsByCategory = useMemo(() => {
    const now = new Date();
    const activePromotions = promotions.filter(p => {
      const start = new Date(p.data_inicio);
      const end = new Date(p.data_validade);
      return now >= start && now <= end;
    });

    const categorized = categories.map(category => {
      const catPromo = activePromotions.find(p => p.tipo_alvo === 'categoria' && p.alvo_id === category.id);
      
      return {
        ...category,
        products: products.filter(p => p.categoria_id === category.id && p.ativo !== false).map(p => {
          const prodPromo = activePromotions.find(p => p.tipo_alvo === 'produto' && p.alvo_id === p.id);
          const promo = prodPromo || catPromo;
          
          if (promo) {
            let discountedPrice = p.preco;
            if (promo.tipo_desconto === 'porcentagem') {
              discountedPrice = p.preco * (1 - promo.valor_desconto / 100);
            } else {
              discountedPrice = p.preco - promo.valor_desconto;
            }
            return { ...p, originalPrice: p.preco, preco: discountedPrice, promo: promo };
          }
          return p;
        })
      };
    }).filter(c => c.products.length > 0);

    // Products without category
    const uncategorizedProducts = products.filter(p => !p.categoria_id && p.ativo !== false).map(p => {
      const prodPromo = activePromotions.find(p => p.tipo_alvo === 'produto' && p.alvo_id === p.id);
      if (prodPromo) {
        let discountedPrice = p.preco;
        if (prodPromo.tipo_desconto === 'porcentagem') {
          discountedPrice = p.preco * (1 - prodPromo.valor_desconto / 100);
        } else {
          discountedPrice = p.preco - prodPromo.valor_desconto;
        }
        return { ...p, originalPrice: p.preco, preco: discountedPrice, promo: prodPromo };
      }
      return p;
    });
    
    if (uncategorizedProducts.length > 0) {
      categorized.push({
        id: 'uncategorized',
        nome: 'Outros',
        products: uncategorizedProducts
      });
    }
    return categorized;
  }, [categories, products, promotions]);

  // Scrollspy logic
  useEffect(() => {
    const handleScroll = debounce(() => {
      const scrollPosition = window.scrollY + 200; // Offset for sticky header
      
      let currentActive = '';
      for (const category of productsByCategory) {
        const element = categoryRefs.current[category.id];
        if (element && element.offsetTop <= scrollPosition) {
          currentActive = category.id;
        }
      }
      
      if (currentActive) {
        setActiveCategory(prev => {
          if (prev !== currentActive) {
            // Scroll the horizontal menu to show the active category
            const navElement = menuNavRef.current;
            const activeBtn = document.getElementById(`nav-cat-${currentActive}`);
            if (navElement && activeBtn) {
              const scrollLeft = activeBtn.offsetLeft - navElement.offsetWidth / 2 + activeBtn.offsetWidth / 2;
              navElement.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
            return currentActive;
          }
          return prev;
        });
      }
    }, 500);

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      handleScroll.cancel();
    };
  }, [productsByCategory]);

  const scrollToCategory = (categoryId: string) => {
    const element = categoryRefs.current[categoryId];
    if (element) {
      const y = element.getBoundingClientRect().top + window.scrollY - 180;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const openProductModal = (product: any) => {
    if (!isOpen) return;
    setSelectedProduct(product);
    setProductQuantity(1);
    setProductObservation('');
    setSelectedExtras({});
    setSelectedOptions({});
    setValidationError(null);
    setSelectedSize(null);
    setIsHalf(false);
    setSelectedSecondHalf(null);
  };

  const closeProductModal = () => {
    setSelectedProduct(null);
  };

  const handleExtraChange = (extraId: string, delta: number) => {
    setSelectedExtras(prev => {
      const current = prev[extraId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const newExtras = { ...prev };
        delete newExtras[extraId];
        return newExtras;
      }
      return { ...prev, [extraId]: next };
    });
  };

  const handleAddToCart = () => {
    if (!selectedProduct || !restaurant) return;

    setValidationError(null);

    // Validate option groups
    if (selectedProduct.optionGroups) {
      for (const group of selectedProduct.optionGroups) {
        const selectedCount = (selectedOptions[group.groupId] || []).length;
        const min = Number(group.min || 0);
        const max = Number(group.max || 0);

        if (group.obrigatorio && selectedCount < min) {
          setValidationError(`Por favor, selecione pelo menos ${min} opção(ões) em "${group.nome}"`);
          return;
        }
        if (max > 0 && selectedCount > max) {
          setValidationError(`Por favor, selecione no máximo ${max} opção(ões) em "${group.nome}"`);
          return;
        }
      }
    }

    const cartExtras: CartItemExtra[] = Object.entries(selectedExtras).map(([extraId, qty]) => {
      const extra = extras.find(e => e.id === extraId);
      return {
        id: extra?.id || extraId,
        nome: extra?.nome || 'Extra',
        preco: extra?.preco || 0,
        quantidade: qty as number
      };
    }).filter(e => e.quantidade > 0);

    // Add selected options from groups to cartExtras
    Object.entries(selectedOptions).forEach(([_, optionIds]) => {
      (optionIds as string[]).forEach(optionId => {
        const option = allOptions.find(o => o.id === optionId);
        if (option) {
          cartExtras.push({
            id: option.id!,
            nome: option.nome,
            preco: option.preco,
            quantidade: 1
          });
        }
      });
    });

    let basePrice = 0;
    let baseOriginalPrice = 0;
    let discount = 0;
    let itemName = selectedProduct.nome;

    if (isHalf && selectedSize) {
      const firstHalfOriginal = selectedSize.preco / 2;
      const firstHalfDiscounted = getProductPrice(selectedProduct, selectedSize.preco).finalPrice / 2;
      
      let secondHalfOriginal = 0;
      let secondHalfDiscounted = 0;

      if (selectedSecondHalf) {
        const secondHalfSize = selectedSecondHalf.sizes.find((s: any) => s.nome === selectedSize.nome);
        secondHalfOriginal = (secondHalfSize?.preco || 0) / 2;
        secondHalfDiscounted = getProductPrice(selectedSecondHalf, secondHalfSize?.preco || 0).finalPrice / 2;
        itemName = `1/2 ${selectedProduct.nome} + 1/2 ${selectedSecondHalf.nome} (${selectedSize.nome})`;
      } else {
        itemName = `1/2 ${selectedProduct.nome} (${selectedSize.nome})`;
      }

      baseOriginalPrice = firstHalfOriginal + secondHalfOriginal;
      basePrice = firstHalfDiscounted + secondHalfDiscounted;
      discount = baseOriginalPrice - basePrice;
    } else if (selectedSize) {
      const priceInfo = getProductPrice(selectedProduct, selectedSize.preco);
      baseOriginalPrice = priceInfo.originalPrice;
      basePrice = priceInfo.finalPrice;
      discount = priceInfo.discountValue;
      itemName += ` (${selectedSize.nome})`;
    } else {
      const priceInfo = getProductPrice(selectedProduct);
      baseOriginalPrice = priceInfo.originalPrice;
      basePrice = priceInfo.finalPrice;
      discount = priceInfo.discountValue;
    }

    addItem({
      id: selectedProduct.id + (selectedSecondHalf ? `-${selectedSecondHalf.id}` : '') + (selectedSize ? `-${selectedSize.nome}` : ''),
      nome: itemName,
      preco: basePrice,
      preco_original: baseOriginalPrice,
      desconto_aplicado: discount,
      quantidade: productQuantity,
      imagem_url: selectedProduct.imagem_url,
      restaurant_id: restaurant.id,
      restaurant_nome: restaurant.nome,
      observacao: productObservation,
      adicionais: cartExtras
    });

    closeProductModal();
  };

  if (loading) return <div className="flex items-center justify-center h-screen">Carregando...</div>;
  if (!restaurant) return (
    <div className="flex flex-col items-center justify-center h-screen p-4 text-center">
      <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
      <h2 className="text-2xl font-bold text-stone-800 mb-2">Restaurante não encontrado</h2>
      <p className="text-stone-500 mb-8">O restaurante que você está procurando não existe ou foi removido.</p>
      <button 
        onClick={() => navigate('/')}
        className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:bg-emerald-700 transition-all"
      >
        Voltar para o Início
      </button>
    </div>
  );

  const isOpen = isRestaurantOpen(restaurant, restaurant?.schedules);

  const getProductPrice = (product: any, overridePrice?: number) => {
    const productPromo = promotions.find(p => p.tipo_alvo === 'produto' && p.alvo_id === product.id);
    const categoryPromo = promotions.find(p => p.tipo_alvo === 'categoria' && p.alvo_id === product.categoria_id);
    
    const activePromo = productPromo || categoryPromo;
    
    let basePrice = overridePrice !== undefined ? overridePrice : (product.originalPrice !== undefined ? product.originalPrice : product.preco);
    let isFrom = false;

    if (overridePrice === undefined && product.sizes && product.sizes.length > 0) {
      basePrice = Math.min(...product.sizes.map((s: any) => s.preco));
      isFrom = true;
    }
    
    if (!activePromo) return { originalPrice: basePrice, finalPrice: basePrice, discount: null, isFrom };

    let finalPrice = basePrice;
    if (activePromo.tipo_desconto === 'porcentagem') {
      finalPrice = basePrice * (1 - activePromo.valor_desconto / 100);
    } else {
      finalPrice = Math.max(0, basePrice - activePromo.valor_desconto);
    }

    return {
      originalPrice: basePrice,
      finalPrice,
      discount: activePromo.tipo_desconto === 'porcentagem' ? `${activePromo.valor_desconto}%` : `R$ ${activePromo.valor_desconto.toFixed(2)}`,
      discountValue: activePromo.tipo_desconto === 'porcentagem' ? (basePrice * (activePromo.valor_desconto / 100)) : activePromo.valor_desconto,
      isFrom
    };
  };

  // Calculate modal total
  const modalExtrasTotal = Object.entries(selectedExtras).reduce((sum, [extraId, qty]) => {
    const extra = extras.find(e => e.id === extraId);
    return sum + ((extra?.preco || 0) * (qty as number));
  }, 0);

  const modalOptionsTotal = Object.entries(selectedOptions).reduce((sum, [_, optionIds]) => {
    const groupOptionsTotal = (optionIds as string[]).reduce((groupSum, optionId) => {
      const option = allOptions.find(o => o.id === optionId);
      return groupSum + (option?.preco || 0);
    }, 0);
    return sum + groupOptionsTotal;
  }, 0);

  let basePrice = 0;
  let originalBasePrice = 0;

  if (selectedProduct) {
    if (isHalf && selectedSize) {
      const firstHalfOriginal = selectedSize.preco / 2;
      const firstHalfDiscounted = getProductPrice(selectedProduct, selectedSize.preco).finalPrice / 2;
      
      let secondHalfOriginal = 0;
      let secondHalfDiscounted = 0;

      if (selectedSecondHalf) {
        const secondHalfSize = selectedSecondHalf.sizes.find((s: any) => s.nome === selectedSize.nome);
        secondHalfOriginal = (secondHalfSize?.preco || 0) / 2;
        secondHalfDiscounted = getProductPrice(selectedSecondHalf, secondHalfSize?.preco || 0).finalPrice / 2;
      }

      originalBasePrice = firstHalfOriginal + secondHalfOriginal;
      basePrice = firstHalfDiscounted + secondHalfDiscounted;
    } else if (selectedSize) {
      const priceInfo = getProductPrice(selectedProduct, selectedSize.preco);
      originalBasePrice = priceInfo.originalPrice;
      basePrice = priceInfo.finalPrice;
    } else {
      const priceInfo = getProductPrice(selectedProduct);
      originalBasePrice = priceInfo.originalPrice;
      basePrice = priceInfo.finalPrice;
    }
  }

  const modalTotal = selectedProduct ? ((basePrice + modalExtrasTotal + modalOptionsTotal) * productQuantity) : 0;
  const modalOriginalTotal = selectedProduct ? ((originalBasePrice + modalExtrasTotal + modalOptionsTotal) * productQuantity) : 0;

  // Filter extras for the selected product
  const availableExtras = selectedProduct ? extras.filter(e => 
    e.status !== 'inativo' && 
    (!e.categoria_relacionada || e.categoria_relacionada.length === 0 || e.categoria_relacionada.includes(selectedProduct.categoria_id))
  ) : [];

  return (
    <div className="pb-32 bg-stone-50 min-h-screen">
      {/* Header Image */}
      <div className={`h-64 relative ${!isOpen ? 'grayscale' : ''}`}>
        <PlaceholderImage 
          src={restaurant.coverUrl} 
          type="capa" 
          className="w-full h-full object-cover" 
        />
        <div className="absolute inset-0 bg-black/30"></div>
        <button 
          onClick={() => navigate('/')}
          className="absolute top-6 left-6 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center text-stone-800 shadow-lg hover:bg-white transition-all z-10"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        {isRestaurant && (
          <button 
            onClick={() => navigate('/restaurant')}
            className="absolute top-6 right-6 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-700 transition-all z-10 flex items-center gap-2"
          >
            <Store className="w-4 h-4" />
            <span className="hidden sm:inline">Painel</span>
          </button>
        )}
      </div>

      {/* Restaurant Info */}
      <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10">
        <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-6 sm:p-8 mb-6">
          {!isOpen && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">Este restaurante está fechado no momento e não aceita pedidos.</p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <div className={`w-24 h-24 bg-white rounded-2xl border-4 border-white shadow-md overflow-hidden shrink-0 ${!isOpen ? 'grayscale' : ''}`}>
              <PlaceholderImage 
                src={restaurant.logoUrl} 
                type="logo" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-stone-900 mb-1">{restaurant.nome}</h1>
              <p className="text-stone-500 text-sm font-light mb-4 leading-relaxed">{restaurant.descricao || 'O melhor da culinária local entregue na sua porta.'}</p>
              
              <div className="flex flex-wrap gap-4 text-xs font-light">
                <button 
                  onClick={() => setIsRatingsModalOpen(true)}
                  className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full hover:bg-yellow-100 transition-colors font-semibold"
                >
                  <Star className="w-3.5 h-3.5 fill-yellow-600" />
                  <span className="font-bold">{restaurant.media_avaliacao?.toFixed(1) || '0.0'}</span>
                  <span className="text-stone-400 font-light">({restaurant.total_avaliacoes || 0})</span>
                </button>
                <div className="flex items-center gap-1 text-stone-600 bg-stone-100 px-3 py-1 rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-semibold">{restaurant.tempo_min_entrega || '30'}-{restaurant.tempo_max_entrega || '45'} min</span>
                </div>
                <button 
                  onClick={() => setIsInfoModalOpen(true)}
                  className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full hover:bg-emerald-100 transition-colors font-semibold"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Ver mais</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Category Menu */}
        {productsByCategory.length > 0 && (
          <div className="sticky top-0 z-40 bg-stone-50/95 backdrop-blur-md py-4 -mx-4 px-4 sm:mx-0 sm:px-0 mb-6 border-b border-stone-200">
            <div 
              ref={menuNavRef}
              className="flex overflow-x-auto hide-scrollbar gap-2 pb-2"
            >
              {productsByCategory.map(category => (
                <button
                  key={category.id}
                  id={`nav-cat-${category.id}`}
                  onClick={() => scrollToCategory(category.id)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full font-bold text-sm transition-all ${
                    activeCategory === category.id || (!activeCategory && category.id === productsByCategory[0].id)
                      ? 'bg-stone-800 text-white' 
                      : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
                  }`}
                >
                  {category.nome}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Menu Items */}
        <div className="space-y-12">
          {productsByCategory.length === 0 ? (
            <p className="text-stone-500 italic text-center py-12">Nenhum produto cadastrado ainda.</p>
          ) : (
            productsByCategory.map(category => (
              <div 
                key={category.id} 
                id={`category-${category.id}`}
                ref={el => { categoryRefs.current[category.id] = el; }}
                className="scroll-mt-32"
              >
                <h2 className="text-xl font-bold text-stone-900 mb-6">{category.nome}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.products.map((product: any) => (
                    <div 
                      key={product.id} 
                      onClick={() => openProductModal(product)}
                      className={`bg-white rounded-3xl border border-stone-200 p-4 flex gap-4 transition-all group cursor-pointer ${isOpen ? 'hover:border-emerald-500 hover:shadow-md' : 'opacity-75'}`}
                    >
                      <div className="flex-1 flex flex-col justify-between py-1 pr-2">
                        <div>
                          <h3 className="text-base font-semibold text-stone-900 group-hover:text-emerald-700 transition-colors leading-snug">{product.nome}</h3>
                          <p className="text-stone-500 text-sm font-light leading-relaxed line-clamp-2 mt-1">{product.descricao}</p>
                        </div>
                        <div className="mt-4 flex flex-col">
                          {getProductPrice(product).discount && (
                            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit mb-1 uppercase tracking-wider animate-blink">
                              {getProductPrice(product).discount} OFF
                            </span>
                          )}
                          <div className="flex items-center gap-1 flex-wrap">
                            {getProductPrice(product).isFrom && (
                              <span className="text-xs text-stone-500 font-light">a partir de </span>
                            )}
                            <span className="text-base font-bold text-emerald-600">
                              R$ {getProductPrice(product).finalPrice.toFixed(2)}
                            </span>
                            {getProductPrice(product).discount && (
                              <span className="text-xs text-stone-400 line-through font-light ml-1">R$ {getProductPrice(product).originalPrice.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className={`w-28 h-28 bg-stone-100 rounded-2xl overflow-hidden shrink-0 ${!isOpen ? 'grayscale' : ''}`}>
                        <PlaceholderImage 
                          src={product.imagem_url} 
                          type="produto" 
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500" 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Product Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeProductModal}></div>
          <div className="relative w-full sm:w-[500px] bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
            
            {/* Modal Header/Image */}
            <div className="relative h-48 shrink-0">
              <PlaceholderImage 
                src={selectedProduct.imagem_url} 
                type="produto" 
                className="w-full h-full object-cover" 
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
              <button 
                onClick={closeProductModal}
                className="absolute top-4 right-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-white/40 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-xl font-bold text-white mb-1">{selectedProduct.nome}</h2>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-emerald-400">R$ {getProductPrice(selectedProduct).finalPrice.toFixed(2)}</span>
                  {getProductPrice(selectedProduct).discount && (
                    <span className="text-xs text-white/60 line-through font-light">R$ {getProductPrice(selectedProduct).originalPrice.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <p className="text-stone-500 text-sm font-light leading-relaxed mb-8">{selectedProduct.descricao}</p>

              {/* Sizes */}
              {selectedProduct.sizes && selectedProduct.sizes.length > 0 && (
                <div className="mb-8">
                  <div className="bg-stone-100 px-4 py-2 rounded-lg mb-4">
                    <h3 className="font-bold text-stone-800">Tamanhos</h3>
                    <p className="text-xs text-stone-500">Escolha o tamanho</p>
                  </div>
                  <div className="space-y-2">
                    {selectedProduct.sizes.map((size: any) => {
                      const sizePriceInfo = getProductPrice(selectedProduct, size.preco);
                      return (
                        <div key={size.nome} className="flex items-center justify-between p-3 border border-stone-200 rounded-xl">
                          <label className="flex items-center gap-3 flex-1 cursor-pointer">
                            <input
                              type="radio"
                              name="size"
                              checked={selectedSize?.nome === size.nome}
                              onChange={() => {
                                setSelectedSize(size);
                                setIsHalf(false);
                              }}
                              className="text-emerald-600 focus:ring-emerald-500"
                            />
                            <span className="font-bold text-stone-700">{size.nome}</span>
                          </label>
                          <div className="flex flex-col items-end">
                            {sizePriceInfo.originalPrice > sizePriceInfo.finalPrice && (
                              <span className="text-xs text-stone-400 line-through font-light">R$ {sizePriceInfo.originalPrice.toFixed(2)}</span>
                            )}
                            <span className="text-emerald-600 font-bold">R$ {sizePriceInfo.finalPrice.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {selectedSize?.aceita_metade && (
                    <>
                      <div className="mt-4 flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                        <input
                          type="checkbox"
                          checked={isHalf}
                          onChange={(e) => {
                            setIsHalf(e.target.checked);
                            if (!e.target.checked) setSelectedSecondHalf(null);
                          }}
                          className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="font-bold text-emerald-800">Pedir apenas metade</span>
                      </div>
                      
                      {isHalf && (
                        <div className="mt-6 space-y-4">
                          <div className="bg-stone-50 px-4 py-3 rounded-2xl border border-stone-100">
                            <h3 className="font-semibold text-stone-900 text-sm">Escolha o segundo sabor</h3>
                            <p className="text-[11px] text-stone-500 leading-tight">O segundo sabor deve ser do mesmo tamanho ({selectedSize.nome})</p>
                          </div>
                          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {products
                              .filter(p => 
                                p.categoria_id === selectedProduct.categoria_id && 
                                p.sizes?.some((s: any) => s.nome === selectedSize.nome && s.aceita_metade)
                              )
                              .map(p => {
                                const sizePrice = p.sizes.find((s: any) => s.nome === selectedSize.nome).preco;
                                const priceInfo = getProductPrice(p, sizePrice);
                                const halfOriginalPrice = priceInfo.originalPrice / 2;
                                const halfDiscountedPrice = priceInfo.finalPrice / 2;
                                
                                return (
                                  <div 
                                    key={p.id} 
                                    onClick={() => setSelectedSecondHalf(p)}
                                    className={`flex items-center gap-3 p-3 border rounded-2xl cursor-pointer transition-all group ${selectedSecondHalf?.id === p.id ? 'border-emerald-500 bg-emerald-50/30' : 'border-stone-100 hover:border-stone-200 bg-white'}`}
                                  >
                                    <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-stone-100 border border-stone-100">
                                      <img src={p.imagem_url || 'https://picsum.photos/seed/product/200/200'} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                                    </div>
                                    <div className="flex-1">
                                      <p className={`font-medium text-sm transition-colors ${selectedSecondHalf?.id === p.id ? 'text-emerald-700' : 'text-stone-800 group-hover:text-stone-900'}`}>{p.nome}</p>
                                      <p className="text-[10px] text-stone-400 line-clamp-1">{p.descricao}</p>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                      {halfOriginalPrice > halfDiscountedPrice && (
                                        <span className="text-[10px] text-stone-400 line-through font-light">R$ {halfOriginalPrice.toFixed(2)}</span>
                                      )}
                                      <p className={`font-semibold text-sm ${selectedSecondHalf?.id === p.id ? 'text-emerald-600' : 'text-stone-600'}`}>
                                        R$ {halfDiscountedPrice.toFixed(2)}
                                      </p>
                                      <p className="text-[9px] text-stone-400 uppercase tracking-tighter">Meia</p>
                                    </div>
                                  </div>
                                );
                              })
                            }
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Option Groups */}
              {selectedProduct.optionGroups && selectedProduct.optionGroups.length > 0 && (
                <div className="space-y-8 mb-8">
                  {[...selectedProduct.optionGroups]
                    .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
                    .map((group: any) => {
                      const groupOptions = allOptions.filter(o => o.grupoId === group.groupId);
                      if (groupOptions.length === 0) return null;

                    const selected = selectedOptions[group.groupId] || [];
                    const isMaxReached = selected.length >= group.max;

                    return (
                      <div key={group.groupId} id={`group-${group.groupId}`}>
                        <div className={`px-4 py-2 rounded-lg mb-4 flex items-center justify-between transition-colors ${group.obrigatorio && selected.length < Number(group.min || 0) ? 'bg-red-50 border border-red-100' : 'bg-stone-100'}`}>
                          <div>
                            <h3 className={`font-bold ${group.obrigatorio && selected.length < Number(group.min || 0) ? 'text-red-700' : 'text-stone-800'}`}>{group.nome}</h3>
                            <p className="text-[10px] text-stone-500">
                              {Number(group.min) === Number(group.max) 
                                ? `Escolha ${group.min}` 
                                : `Escolha de ${group.min} a ${group.max}`}
                            </p>
                          </div>
                          {group.obrigatorio && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${selected.length >= Number(group.min || 0) ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white animate-pulse'}`}>
                              {selected.length >= Number(group.min || 0) ? 'Concluído' : 'Obrigatório'}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {groupOptions.map(option => {
                            const isSelected = selected.includes(option.id!);
                            const max = Number(group.max || 0);
                            const isRadio = max === 1;

                            return (
                              <div 
                                key={option.id} 
                                className={`flex items-center justify-between p-3 border rounded-xl transition-all cursor-pointer ${isSelected ? 'border-emerald-500 bg-emerald-50/30' : 'border-stone-200 hover:border-stone-300'}`}
                                onClick={() => {
                                  setValidationError(null);
                                  if (isRadio) {
                                    setSelectedOptions(prev => ({ ...prev, [group.groupId]: [option.id!] }));
                                  } else {
                                    setSelectedOptions(prev => {
                                      const current = prev[group.groupId] || [];
                                      if (current.includes(option.id!)) {
                                        return { ...prev, [group.groupId]: current.filter(id => id !== option.id) };
                                      } else if (current.length < max) {
                                        return { ...prev, [group.groupId]: [...current, option.id!] };
                                      }
                                      return prev;
                                    });
                                  }
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-stone-300'}`}>
                                    {isSelected && <div className="w-2 h-2 bg-white rounded-full"></div>}
                                  </div>
                                  <span className="font-medium text-stone-700">{option.nome}</span>
                                </div>
                                {option.preco > 0 && (
                                  <span className="text-emerald-600 font-bold text-sm">+ R$ {option.preco.toFixed(2)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Extras */}
              {selectedProduct.exibir_adicionais !== false && availableExtras.length > 0 && (
                <div className="mb-8">
                  <div className="bg-stone-100 px-4 py-2 rounded-lg mb-4">
                    <h3 className="font-bold text-stone-800">Adicionais</h3>
                    <p className="text-xs text-stone-500">Escolha complementos para o seu pedido</p>
                  </div>
                  <div className="space-y-4">
                    {availableExtras.map(extra => {
                      const qty = selectedExtras[extra.id] || 0;
                      return (
                        <div key={extra.id} className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-stone-800">{extra.nome}</p>
                            <p className="text-sm text-emerald-600">+ R$ {extra.preco.toFixed(2)}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {qty > 0 ? (
                              <>
                                <button 
                                  onClick={() => handleExtraChange(extra.id, -1)}
                                  className="w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-500 hover:bg-stone-100"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-4 text-center font-bold">{qty}</span>
                                <button 
                                  onClick={() => handleExtraChange(extra.id, 1)}
                                  className="w-8 h-8 rounded-full border border-emerald-500 flex items-center justify-center text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <button 
                                onClick={() => handleExtraChange(extra.id, 1)}
                                className="w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-500 hover:border-emerald-500 hover:text-emerald-600"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Observation */}
              <div>
                <div className="bg-stone-100 px-4 py-2 rounded-lg mb-4">
                  <h3 className="font-bold text-stone-800">Alguma observação?</h3>
                  <p className="text-xs text-stone-500">Ex: Tirar cebola, maionese à parte, etc.</p>
                </div>
                <textarea
                  value={productObservation}
                  onChange={(e) => setProductObservation(e.target.value)}
                  placeholder="Digite sua observação aqui..."
                  className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl resize-none h-24 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  maxLength={140}
                />
                <p className="text-right text-xs text-stone-400 mt-1">{productObservation.length}/140</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-100 bg-white flex flex-col gap-3 shrink-0">
              {validationError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm font-medium rounded-xl animate-in fade-in slide-in-from-bottom-2">
                  {validationError}
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-stone-100 rounded-2xl p-1">
                  <button 
                    onClick={() => setProductQuantity(Math.max(1, productQuantity - 1))}
                    className="w-12 h-12 flex items-center justify-center text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="w-8 text-center font-bold text-stone-800 text-lg">{productQuantity}</span>
                  <button 
                    onClick={() => setProductQuantity(productQuantity + 1)}
                    className="w-12 h-12 flex items-center justify-center text-stone-500 hover:text-stone-800 transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <button 
                  onClick={handleAddToCart}
                  disabled={
                    !!(selectedProduct.sizes?.length > 0 && !selectedSize) || 
                    !!(isHalf && !selectedSecondHalf) ||
                    !!(selectedProduct.optionGroups?.some((g: any) => g.obrigatorio && (selectedOptions[g.groupId] || []).length < Number(g.min || 0)))
                  }
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white py-4 px-6 rounded-2xl font-bold shadow-lg shadow-emerald-200 flex justify-between items-center transition-all active:scale-[0.98]"
                >
                  <span>
                    {isHalf && !selectedSecondHalf ? 'Escolha a outra metade' : 
                     selectedProduct.sizes?.length > 0 && !selectedSize ? 'Escolha o tamanho' : 
                     selectedProduct.optionGroups?.some((g: any) => g.obrigatorio && (selectedOptions[g.groupId] || []).length < Number(g.min || 0)) ? 'Escolha os obrigatórios' :
                     'Adicionar'}
                  </span>
                  <div className="flex flex-col items-end">
                    {modalOriginalTotal > modalTotal && (
                      <span className="text-xs text-emerald-200 line-through font-light">R$ {modalOriginalTotal.toFixed(2)}</span>
                    )}
                    <span>R$ {modalTotal.toFixed(2)}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Cart Button */}
      {items.length > 0 && !selectedProduct && !isInfoModalOpen && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-40">
          <button 
            onClick={() => navigate('/cart')}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 px-6 rounded-2xl shadow-2xl flex items-center justify-between group transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold">
                {items.reduce((acc, i) => acc + i.quantidade, 0)}
              </div>
              <span className="font-bold">Ver Carrinho</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">R$ {total.toFixed(2)}</span>
              <ShoppingBag className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      )}
      {/* Info Modal */}
      {isInfoModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInfoModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-stone-800">Sobre o Restaurante</h3>
              <button onClick={() => setIsInfoModalOpen(false)} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-stone-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Description */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Descrição</h4>
                <p className="text-stone-600 leading-relaxed">
                  {restaurant.descricao || 'O melhor da culinária local entregue na sua porta.'}
                </p>
              </div>

              {/* Address */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Endereço</h4>
                <div className="flex items-start gap-3 text-stone-600">
                  <MapPin className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-stone-800">
                      {restaurant.endereco?.rua}, {restaurant.endereco?.numero}
                    </p>
                    <p className="text-sm">
                      {restaurant.endereco?.bairro} - {restaurant.endereco?.cidade}
                    </p>
                    <p className="text-sm text-stone-400">{restaurant.endereco?.cep}</p>
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Contato e Redes</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {restaurant.whatsapp && (
                    <div className="flex items-center gap-3 text-stone-600">
                      <Phone className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm">{restaurant.whatsapp}</span>
                    </div>
                  )}
                  {restaurant.email && (
                    <div className="flex items-center gap-3 text-stone-600">
                      <Mail className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm truncate">{restaurant.email}</span>
                    </div>
                  )}
                  {restaurant.instagram && (
                    <div className="flex items-center gap-3 text-stone-600">
                      <Instagram className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm">{restaurant.instagram}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Operating Hours */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Horários de Funcionamento</h4>
                <div className="grid grid-cols-1 gap-2">
                  {restaurant.schedules && restaurant.schedules.length > 0 ? (
                    (() => {
                      const dayOrder: { [key: string]: number } = {
                        'domingo': 0, 'segunda': 1, 'segunda-feira': 1, 'terca': 2, 'terça': 2, 'terça-feira': 2, 'quarta': 3, 'quarta-feira': 3, 'quinta': 4, 'quinta-feira': 4, 'sexta': 5, 'sexta-feira': 5, 'sabado': 6, 'sábado': 6
                      };
                      return [...restaurant.schedules].sort((a, b) => {
                        const dayA = a.dia_semana.toLowerCase();
                        const dayB = b.dia_semana.toLowerCase();
                        return (dayOrder[dayA] ?? 7) - (dayOrder[dayB] ?? 7);
                      }).map((s: any, index: number) => (
                        <div key={index} className="flex justify-between text-sm text-stone-600">
                          <span className="capitalize">{s.dia_semana}</span>
                          <span>{s.hora_abertura} - {s.hora_fechamento}</span>
                        </div>
                      ));
                    })()
                  ) : (
                    <p className="text-sm text-stone-500 italic">Horários não informados.</p>
                  )}
                </div>
              </div>

              {/* Delivery Info */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Informações de Entrega</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 text-stone-600">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm">Entrega: {restaurant.tempo_min_entrega}-{restaurant.tempo_max_entrega} min</span>
                  </div>
                  {restaurant.valor_minimo_pedido > 0 && (
                    <div className="flex items-center gap-3 text-stone-600">
                      <ShoppingBag className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm">Pedido Mínimo: R$ {restaurant.valor_minimo_pedido.toFixed(2)}</span>
                    </div>
                  )}
                  {restaurant.valor_minimo_frete_gratis > 0 && (
                    <div className="flex items-center gap-3 text-stone-600">
                      <ShoppingBag className="w-5 h-5 text-emerald-600" />
                      <span className="text-sm">Frete Grátis: R$ {restaurant.valor_minimo_frete_gratis.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Service Types */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Serviços Disponíveis</h4>
                <div className="flex flex-wrap gap-2">
                  {restaurant.aceita_entrega !== false && (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">
                      Entrega
                    </span>
                  )}
                  {restaurant.aceita_retirada !== false && (
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-100">
                      Retirada
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 bg-stone-50 border-t border-stone-100">
              <button 
                onClick={() => setIsInfoModalOpen(false)}
                className="w-full py-4 bg-stone-800 text-white font-bold rounded-2xl hover:bg-stone-900 transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {isRatingsModalOpen && (
        <RatingsModal 
          restaurantId={restaurant.id} 
          onClose={() => setIsRatingsModalOpen(false)} 
        />
      )}
    </div>
  );
}
