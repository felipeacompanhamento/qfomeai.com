import React, { useState, useEffect } from 'react';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, getDocs, query, where, getDoc, collectionGroup, getCountFromServer, updateDoc, increment, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { sendPushNotification } from '../../services/notificationService';
import { ChevronLeft, MapPin, CreditCard, CheckCircle2, Loader2, Smartphone, Banknote, Wallet, Copy } from 'lucide-react';
import { invalidateRestaurantCache } from '../../services/restaurantService';

export default function Checkout() {
  const { items, total, clearCart } = useCart();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [deliveryType, setDeliveryType] = useState<'entrega' | 'retirada'>('entrega');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [changeAmount, setChangeAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [restaurantData, setRestaurantData] = useState<any>(null);
  const [deliveryAreas, setDeliveryAreas] = useState<any[]>([]);
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [deliveryError, setDeliveryError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    if (!user || items.length === 0) return;

    const fetchRestaurantData = async () => {
      try {
        const restaurantId = items[0].restaurant_id;
        const restDoc = await getDoc(doc(db, 'restaurants', restaurantId));
        if (restDoc.exists()) {
          setRestaurantData(restDoc.data());
        } else {
          console.error("Restaurant document does not exist:", restaurantId);
        }

        const areasSnap = await getDocs(collection(db, 'restaurants', restaurantId, 'delivery_areas'));
        setDeliveryAreas(areasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error fetching restaurant data:", error);
        // Add specific error handling for permissions
        if (error instanceof Error && error.message.includes('permission')) {
          console.error("Permission error details:", error.message);
        }
      }
    };

    const fetchAddresses = async () => {
      try {
        const q = query(collection(db, 'users', user.uid, 'enderecos'));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAddresses(docs);
        if (docs.length > 0) setSelectedAddress(docs[0].id);
      } catch (error) {
        console.error("Error fetching addresses:", error);
      }
    };

    fetchRestaurantData();
    fetchAddresses();
  }, [user, items]);

  // Calculate delivery fee
  useEffect(() => {
    setDeliveryError('');
    console.log("Calculating delivery fee. selectedAddress:", selectedAddress, "deliveryAreas:", deliveryAreas.length, "addresses:", addresses.length);
    if (deliveryType === 'retirada') {
      setDeliveryFee(0);
      return;
    }

    if (!selectedAddress) {
      console.log("No address selected");
      return;
    }

    if (deliveryAreas.length === 0) {
      console.log("No delivery areas defined");
      // Maybe set an error here? Or just wait?
      return;
    }

    const address = addresses.find(a => a.id === selectedAddress);
    console.log("Address found:", address);
    if (!address) {
      console.log("Address not found in addresses list");
      return;
    }
    
    if (!address.bairro || !address.cidade || !address.estado) {
      console.log("Address has missing fields:", address);
      setDeliveryError('O restaurante não atende no endereço selecionado.');
      setDeliveryFee(0);
      return;
    }

    // 1. Verificar se o endereço está no mesmo estado e cidade do restaurante
    const restaurantCidade = (restaurantData?.endereco?.cidade || '').toLowerCase().trim();
    const restaurantEstado = (restaurantData?.endereco?.estado || '').toLowerCase().trim();
    const addressCidade = (address.cidade || '').toLowerCase().trim();
    const addressEstado = (address.estado || '').toLowerCase().trim();

    if (addressCidade !== restaurantCidade || addressEstado !== restaurantEstado) {
      setDeliveryError(`Este restaurante entrega apenas em ${restaurantData?.endereco?.cidade || 'sua cidade'} - ${restaurantData?.endereco?.estado || 'UF'}.`);
      setDeliveryFee(0);
      return;
    }

    // 2. Verificar se o restaurante entrega no bairro do endereço selecionado
    const area = deliveryAreas.find(a => 
      (a.bairro_nome || '').toLowerCase().trim() === address.bairro.toLowerCase().trim()
    );

    console.log("Area found:", area);
    if (area) {
      // Check for free delivery threshold
      if (restaurantData?.valor_minimo_frete_gratis > 0 && total >= restaurantData.valor_minimo_frete_gratis) {
        setDeliveryFee(0);
      } else {
        setDeliveryFee(area.taxa_entrega);
      }
    } else {
      console.log("Setting delivery error: Area not found");
      setDeliveryError('Este restaurante não realiza entregas neste bairro.');
      setDeliveryFee(0);
    }
  }, [selectedAddress, deliveryType, deliveryAreas, addresses, total, restaurantData]);

  // Set default payment method based on availability
  useEffect(() => {
    if (restaurantData?.formas_pagamento) {
      const available = Object.entries(restaurantData.formas_pagamento)
        .filter(([_, config]: [string, any]) => config[deliveryType])
        .map(([id]) => id);
      
      if (available.length > 0 && !available.includes(paymentMethod)) {
        setPaymentMethod(available[0]);
      }
    }
  }, [deliveryType, restaurantData]);

  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const q = query(collection(db, 'coupons'), where('codigo', '==', couponCode.toUpperCase()), where('ativo', '==', true));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setCouponError('Cupom inválido ou expirado.');
        setAppliedCoupon(null);
        setDiscount(0);
        return;
      }

      const coupon = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
      const now = new Date();

      if (coupon.data_inicio) {
        // Parse as local date to avoid timezone offset issues
        const [year, month, day] = coupon.data_inicio.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 0, 0, 0, 0);
        if (startDate > now) {
          setCouponError('Este cupom ainda não é válido.');
          return;
        }
      }

      if (coupon.data_fim) {
        // Parse as local date to avoid timezone offset issues
        const [year, month, day] = coupon.data_fim.split('-');
        const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59, 59, 999);
        if (endDate < now) {
          setCouponError('Este cupom expirou.');
          return;
        }
      }

      if (coupon.valor_minimo && total < coupon.valor_minimo) {
        setCouponError(`O valor mínimo para este cupom é R$ ${coupon.valor_minimo.toFixed(2)}.`);
        return;
      }

      // Check scope
      if (coupon.tipo_escopo === 'restaurante' && coupon.escopo_id !== items[0].restaurant_id) {
        setCouponError('Este cupom não é válido para este restaurante.');
        return;
      }

      let eligibleTotal = total;

      if (coupon.tipo_escopo === 'produto') {
        const hasProduct = items.some(item => item.id === coupon.escopo_id);
        if (!hasProduct) {
          setCouponError('Este cupom é válido apenas para um produto específico que não está no seu carrinho.');
          return;
        }
        eligibleTotal = items.filter(item => item.id === coupon.escopo_id).reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
      }

      if (coupon.tipo_escopo === 'categoria') {
        const productIds = items.map(i => i.id);
        const productsSnap = await Promise.all(productIds.map(id => getDoc(doc(db, 'restaurants', items[0].restaurant_id, 'products', id))));
        const categoryProductIds = productsSnap.filter(p => p.exists() && p.data()?.categoria_id === coupon.escopo_id).map(p => p.id);
        
        if (categoryProductIds.length === 0) {
          setCouponError('Este cupom é válido apenas para uma categoria específica que não está no seu carrinho.');
          return;
        }
        eligibleTotal = items.filter(item => categoryProductIds.includes(item.id)).reduce((acc, item) => acc + (item.preco * item.quantidade), 0);
      }

      // Check usage limits
      if (coupon.limite_total && coupon.limite_total > 0) {
        const usos = coupon.usos || 0;
        if (usos >= coupon.limite_total) {
          setCouponError('O limite de uso deste cupom já foi atingido.');
          return;
        }
      }

      if (coupon.limite_por_usuario && coupon.limite_por_usuario > 0 && user) {
        // Query orders in the current restaurant to check user usage
        const userUsesSnap = await getDocs(query(
          collection(db, 'restaurants', items[0].restaurant_id, 'orders'), 
          where('cliente_id', '==', user.uid)
        ));
        
        const userUses = userUsesSnap.docs.filter(d => d.data().cupom_id === coupon.id).length;
        
        if (userUses >= coupon.limite_por_usuario) {
          setCouponError('Você já atingiu o limite de uso deste cupom.');
          return;
        }
      }

      setAppliedCoupon(coupon);
      let calculatedDiscount = 0;
      if (coupon.tipo === 'fixo') {
        calculatedDiscount = coupon.valor;
      } else {
        calculatedDiscount = eligibleTotal * (coupon.valor / 100);
      }
      setDiscount(Math.min(calculatedDiscount, eligibleTotal)); // Discount cannot exceed eligible total
      setCouponError('');
    } catch (error) {
      console.error("Error validating coupon:", error);
      setCouponError('Erro ao validar cupom.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleFinishOrder = async () => {
    if (!user || (deliveryType === 'entrega' && !selectedAddress) || !paymentMethod) return;
    if (deliveryError) return;
    setLoading(true);
    try {
      // Fetch latest restaurant data to ensure PIX settings are up to date
      const restDoc = await getDoc(doc(db, 'restaurants', items[0].restaurant_id));
      const currentRestaurantData = restDoc.exists() ? restDoc.data() : restaurantData;

      const selectedAddressData = deliveryType === 'entrega' ? addresses.find(a => a.id === selectedAddress) : null;

      const orderData = {
        cliente_id: user.uid,
        cliente_nome: profile?.nome || user.displayName || 'Cliente',
        restaurant_id: items[0].restaurant_id,
        restaurant_nome: items[0].restaurant_nome,
        status: 'pendente',
        tipo_entrega: deliveryType,
        valor_produtos: total,
        taxa_entrega: deliveryFee,
        valor_desconto: discount,
        cupom_id: appliedCoupon?.id || null,
        cupom_codigo: appliedCoupon?.codigo || null,
        valor_total: total + deliveryFee - discount,
        forma_pagamento: paymentMethod,
        troco: paymentMethod === 'dinheiro' ? changeAmount : null,
        endereco_id: deliveryType === 'entrega' ? selectedAddress : null,
        endereco: selectedAddressData ? {
          rua: selectedAddressData.rua,
          numero: selectedAddressData.numero,
          bairro: selectedAddressData.bairro,
          cidade: selectedAddressData.cidade,
          estado: selectedAddressData.estado,
          complemento: selectedAddressData.complemento || '',
          referencia: selectedAddressData.referencia || ''
        } : null,
        cidade: deliveryType === 'entrega' ? selectedAddressData?.cidade : currentRestaurantData?.endereco?.cidade,
        estado: deliveryType === 'entrega' ? selectedAddressData?.estado : currentRestaurantData?.endereco?.estado,
        data_criacao: new Date().toISOString(),
        chave_pix: currentRestaurantData?.chave_pix || currentRestaurantData?.pixKey || null,
        pix_display_type: currentRestaurantData?.pix_display_type || 'chave',
        itens: items.map(i => ({
          id: i.id,
          nome: i.nome,
          preco: i.preco,
          quantidade: i.quantidade,
          observacao: i.observacao || '',
          adicionais: i.adicionais || []
        }))
      };

      // Create order directly in Firestore
      const orderRef = await addDoc(collection(db, 'restaurants', items[0].restaurant_id, 'orders'), orderData);
      
      // Increment orders count
      try {
        await setDoc(doc(db, 'public_stats', 'global'), {
          orders: increment(1)
        }, { merge: true });
      } catch (e) {
        console.error("Error incrementing orders count:", e);
      }
      
      // If payment method is PIX and Mercado Pago is enabled, generate PIX before proceeding
      if (paymentMethod === 'pix' && currentRestaurantData?.pix_display_type === 'mercadopago' && currentRestaurantData?.mercadopago_enabled && currentRestaurantData?.mercadopago_access_token) {
        try {
          const response = await fetch('/api/payments/mercadopago/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: orderRef.id,
              restaurantId: items[0].restaurant_id
            })
          });
          
          if (response.ok) {
            const mpData = await response.json();
            // Notificar cliente que o PIX foi gerado
            if (profile?.fcmToken) {
              await sendPushNotification(
                profile.fcmToken,
                "PIX Gerado! 💸",
                `O código PIX para o seu pedido #${orderRef.id.slice(-6).toUpperCase()} já está disponível. Copie e pague no seu banco.`,
                orderRef.id,
                "pix_generated"
              );
            }
          } else {
            const errData = await response.json();
            console.error("Failed to create Mercado Pago payment during checkout:", errData);
          }
        } catch (err) {
          console.error("Error calling Mercado Pago API:", err);
        }
      }

      // Send push notification to restaurant
      try {
        const restaurantUserDoc = await getDoc(doc(db, 'users', items[0].restaurant_id));
        const restaurantData = restaurantUserDoc.data();
        let fcmToken = restaurantData?.fcmToken;
        
        if (!fcmToken) {
          const restDoc = await getDoc(doc(db, 'restaurants', items[0].restaurant_id));
          fcmToken = restDoc.data()?.fcmToken;
        }

        if (fcmToken) {
          const shortOrderId = orderRef.id.slice(0, 6).toUpperCase();
          const customerName = user?.displayName || 'Cliente';
          await sendPushNotification(
            fcmToken,
            "Novo pedido recebido! 🍔",
            `Pedido #${shortOrderId} de ${customerName}. Acesse agora para visualizar.`,
            orderRef.id,
            "new_order"
          );
        }
      } catch (error) {
        console.error("Error sending push notification to restaurant:", error);
      }
      
      if (appliedCoupon?.id) {
        try {
          await updateDoc(doc(db, 'coupons', appliedCoupon.id), {
            usos: increment(1)
          });
        } catch (e) {
          console.error("Error incrementing coupon usage:", e);
        }
      }

      invalidateRestaurantCache(items[0].restaurant_id);
      clearCart();
      setOrderSuccess(true);
      navigate('/orders');
    } catch (error) {
      console.error("Error creating order:", error);
    } finally {
      setLoading(false);
    }
  };

  if (orderSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-emerald-600 text-white">
        <CheckCircle2 className="w-24 h-24 mb-6 animate-bounce" />
        <h2 className="text-3xl font-bold mb-2 text-center">Pedido Realizado!</h2>
        <p className="text-emerald-100 text-center mb-8">Seu pedido foi enviado para o restaurante. Você será redirecionado em instantes.</p>
      </div>
    );
  }

  const paymentOptions = [
    { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: 'text-emerald-600' },
    { id: 'pix', label: 'Pix', icon: Smartphone, color: 'text-teal-600' },
    { id: 'credito', label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600' },
    { id: 'debito', label: 'Cartão de Débito', icon: Wallet, color: 'text-indigo-600' },
  ];

  const availablePaymentMethods = restaurantData?.formas_pagamento 
    ? paymentOptions.filter(opt => restaurantData.formas_pagamento[opt.id]?.[deliveryType])
    : [];

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-stone-800">Finalizar Pedido</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8 space-y-6">
        {/* Delivery Type */}
        <section className="bg-white rounded-3xl border border-stone-200 p-2 flex gap-1">
          <button 
            onClick={() => setDeliveryType('entrega')}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold transition-all ${deliveryType === 'entrega' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Entrega
          </button>
          <button 
            onClick={() => setDeliveryType('retirada')}
            className={`flex-1 py-3 px-4 rounded-2xl font-bold transition-all ${deliveryType === 'retirada' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'text-stone-500 hover:bg-stone-50'}`}
          >
            Retirada
          </button>
        </section>

        {/* Address Selection - Only for Delivery */}
        {deliveryType === 'entrega' && (
          <section className="bg-white rounded-3xl border border-stone-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-lg">Endereço de Entrega</h2>
              </div>
              <button 
                type="button"
                onClick={() => navigate('/profile', { state: { addAddress: true, triggerGps: true } })}
                className="text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-105 font-bold px-3.5 py-2 rounded-xl transition-all border border-emerald-100/10 shadow-2xs"
              >
                + Entregar em outro endereço
              </button>
            </div>
            
            {deliveryError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4 border border-red-100">
                {deliveryError}
              </div>
            )}
            
            {addresses.length === 0 ? (
              <div className="text-center py-6 bg-stone-50 border border-dashed rounded-2xl p-4">
                <p className="text-stone-500 mb-4 text-sm font-medium">Nenhum endereço cadastrado para entrega.</p>
                <button 
                  onClick={() => navigate('/profile', { state: { addAddress: true, triggerGps: true } })} 
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-xs"
                >
                  Cadastrar Endereço Novo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {addresses.map(addr => (
                  <label key={addr.id} className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedAddress === addr.id ? 'border-emerald-500 bg-emerald-50/30' : 'border-stone-100 hover:border-stone-200'}`}>
                    <input 
                      type="radio" 
                      name="address" 
                      checked={selectedAddress === addr.id}
                      onChange={() => setSelectedAddress(addr.id)}
                      className="w-5 h-5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-stone-800">{addr.rua}, {addr.numero}</p>
                      <p className="text-sm text-stone-500 flex items-center gap-1">
                        {addr.bairro} 
                        {addr.referencia && <span className="text-emerald-600 font-bold ml-1">• Ref: {addr.referencia}</span>}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Payment Method */}
        <section className="bg-white rounded-3xl border border-stone-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-lg">Forma de Pagamento</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availablePaymentMethods.map(method => {
              const Icon = method.icon;
              return (
                <label key={method.id} className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${paymentMethod === method.id ? 'border-emerald-500 bg-emerald-50/30' : 'border-stone-100 hover:border-stone-200'}`}>
                  <input 
                    type="radio" 
                    name="payment" 
                    checked={paymentMethod === method.id}
                    onChange={() => setPaymentMethod(method.id)}
                    className="w-5 h-5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <Icon className={`w-5 h-5 ${method.color}`} />
                  <span className="font-bold text-stone-700">{method.label}</span>
                </label>
              );
            })}
          </div>

          {/* Cash Change */}
          {paymentMethod === 'dinheiro' && (
            <div className="mt-4 p-4 bg-stone-50 rounded-2xl border border-stone-100 animate-in fade-in slide-in-from-top-2">
              <label className="block text-sm font-bold text-stone-700 mb-2">Troco para quanto?</label>
              <input 
                type="text" 
                value={changeAmount}
                onChange={(e) => setChangeAmount(e.target.value)}
                placeholder="Ex: R$ 50,00 (Deixe vazio se não precisar)"
                className="w-full px-4 py-3 bg-white border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
          )}
        </section>

        {/* Order Summary */}
        <section className="bg-white rounded-3xl border border-stone-200 p-6">
          <h2 className="font-bold text-lg mb-4">Resumo do Pedido</h2>
          <div className="space-y-3">
            {items.map((item, index) => {
              const extrasTotal = (item.adicionais || []).reduce((sum, extra) => sum + (extra.preco * extra.quantidade), 0);
              const itemTotal = (item.preco + extrasTotal) * item.quantidade;
              return (
                <div key={`${item.id}-${index}`} className="flex justify-between items-start text-sm">
                  <div className="flex-1">
                    <p className="font-bold text-stone-800">{item.quantidade}x {item.nome}</p>
                    {item.desconto_aplicado && item.desconto_aplicado > 0 && (
                      <p className="text-[10px] font-bold text-emerald-600 animate-blink">
                        Desconto de R$ {(item.desconto_aplicado * item.quantidade).toFixed(2)} aplicado
                      </p>
                    )}
                    {item.adicionais && item.adicionais.length > 0 && (
                      <p className="text-[10px] text-stone-500">
                        + {item.adicionais.map(a => `${a.quantidade}x ${a.nome}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end">
                    {item.preco_original && item.preco_original > item.preco && (
                      <span className="text-[10px] text-stone-400 line-through font-light">
                        R$ {((item.preco_original + extrasTotal) * item.quantidade).toFixed(2)}
                      </span>
                    )}
                    <span className="font-bold text-stone-800">R$ {itemTotal.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
            
            <div className="pt-4 border-t border-stone-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Subtotal</span>
                <span className="font-bold text-stone-800">R$ {total.toFixed(2)}</span>
              </div>
              {deliveryType === 'entrega' && (
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Taxa de Entrega</span>
                  <span className="font-bold text-emerald-600">{deliveryFee > 0 ? `R$ ${deliveryFee.toFixed(2)}` : 'Grátis'}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Desconto {appliedCoupon?.codigo && `(${appliedCoupon.codigo})`}</span>
                  <span className="font-bold text-red-600">- R$ {discount.toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 flex justify-between items-center">
                <span className="font-bold text-stone-800 text-lg">Total</span>
                <span className="text-2xl font-bold text-emerald-600">R$ {(total + deliveryFee - discount).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Coupon Section */}
        <section className="bg-white rounded-3xl border border-stone-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Copy className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-lg">Cupom de Desconto</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              type="text" 
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Digite seu cupom"
              disabled={!!appliedCoupon}
              className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all uppercase w-full"
            />
            {appliedCoupon ? (
              <button 
                onClick={() => {
                  setAppliedCoupon(null);
                  setDiscount(0);
                  setCouponCode('');
                }}
                className="w-full sm:w-auto px-6 py-3 bg-stone-100 text-stone-600 font-bold rounded-xl hover:bg-stone-200 transition-all flex justify-center items-center"
              >
                Remover
              </button>
            ) : (
              <button 
                onClick={validateCoupon}
                disabled={couponLoading || !couponCode.trim()}
                className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:bg-stone-300 transition-all flex justify-center items-center gap-2 flex-shrink-0"
              >
                {couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar'}
              </button>
            )}
          </div>
          {couponError && <p className="text-red-500 text-xs mt-2 font-medium">{couponError}</p>}
          {appliedCoupon && <p className="text-emerald-600 text-xs mt-2 font-medium">Cupom aplicado com sucesso!</p>}
        </section>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 p-6 z-50">
        <div className="max-w-4xl mx-auto">
          <button 
            onClick={handleFinishOrder}
            disabled={loading || (deliveryType === 'entrega' && (!selectedAddress || !!deliveryError)) || !paymentMethod}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white py-4 px-8 rounded-2xl shadow-xl shadow-emerald-200 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <span className="font-bold text-lg">Finalizar Pedido</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
