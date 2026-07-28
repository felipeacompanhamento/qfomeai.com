const fs = require('fs');

let content = fs.readFileSync('src/pages/restaurant/Counter.tsx', 'utf8');

const replacement = `  // Payment states
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [isPaid, setIsPaid] = useState<boolean>(true);
  const [amountPaidDigits, setAmountPaidDigits] = useState<string>('');
  
  // Customization modal state
  const [customizingProduct, setCustomizingProduct] = useState<any | null>(null);
  const [selectedSize, setSelectedSize] = useState<any | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [customizationObs, setCustomizationObs] = useState<string>('');

  // Execution / Modal states
  const [saveLoading, setSaveLoading] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cart total
  const cartTotal = cart.reduce((acc, item) => acc + (item.precoFinal || item.precoBase) * item.quantidade, 0);
  const cartTotalCents = Math.round(cartTotal * 100);

  const amountPaidParsed = {
    numberValue: Number(amountPaidDigits) / 100,
    formatted: (Number(amountPaidDigits) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  };

  const isCashAmountInsufficient = payments.some(p => p.paymentMethodId === 'dinheiro') && isPaid && amountPaidParsed.numberValue < cartTotal;

  useEffect(() => {
    if (payments.length === 0) {
      setPayments([{
        id: uuidv4(),
        paymentMethodId: 'dinheiro',
        paymentMethodName: 'Dinheiro',
        amount: cartTotalCents,
        status: isPaid ? 'PAID' : 'PENDING'
      }]);
    } else if (payments.length === 1 && payments[0].amount !== cartTotalCents) {
      setPayments([{
        ...payments[0],
        amount: cartTotalCents
      }]);
    }
  }, [cartTotalCents]);

  const removeCartItem = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateCartQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    const newCart = [...cart];
    newCart[index].quantidade = newQuantity;
    setCart(newCart);
  };

  const handleProductClick = (product: any) => {
    setCustomizingProduct(product);
    setSelectedSize(product.tamanhos?.length > 0 ? product.tamanhos[0] : null);
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
    let precoFinal = customizingProduct.preco || 0;
    
    let tamanhoSelecionado = null;
    if (selectedSize) {
      precoFinal = Number(selectedSize.preco);
      tamanhoSelecionado = selectedSize;
    }

    const adicionaisSelecionados: any[] = [];
    Object.values(selectedOptions).forEach((opts: any) => {
      opts.forEach((opt: any) => {
        precoFinal += Number(opt.preco || 0);
        adicionaisSelecionados.push(opt);
      });
    });

    const item: CounterCartItem = {
      cartId: uuidv4(),
      productId: customizingProduct.id,
      nome: customizingProduct.nome,
      precoBase: customizingProduct.preco || 0,
      precoFinal,
      quantidade: 1,
      observacao: customizationObs,
      tamanhoSelecionado,
      adicionaisSelecionados
    };

    setCart([...cart, item]);
    setCustomizingProduct(null);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!restaurantId || cart.length === 0) return;
    
    const totalPaymentsCents = payments.reduce((acc, p) => acc + p.amount, 0);
    if (totalPaymentsCents !== cartTotalCents) {
      setError('A soma dos pagamentos deve ser igual ao total do pedido.');
      return;
    }

    setSaveLoading(true);
    
    try {
      if (!clientActionIdRef.current) {
        clientActionIdRef.current = uuidv4();
      }

      const paymentMethod = payments.length > 0 ? payments.reduce((prev, current) => (prev.amount > current.amount) ? prev : current).paymentMethodId : 'dinheiro';

      const result = await counterOrderService.createCounterOrder({
        restaurantId,
        operatorId: profile?.uid || user?.uid || '',
        operatorName: profile?.nome || profile?.displayName || user?.displayName || 'Operador',
        clientName,
        serviceMode,
        items: cart,
        paymentMethod: paymentMethod,
        payments: payments.map(p => ({ ...p, status: isPaid ? 'PAID' : 'PENDING' })),
        pago: isPaid,
        amountReceived: payments.some(p => p.paymentMethodId === 'dinheiro') && isPaid ? amountPaidParsed.numberValue : 0,
        clientActionId: clientActionIdRef.current
`;

const regex = /const \[forma_pagamento[\s\S]*?clientActionId: clientActionIdRef\.current/;
content = content.replace(regex, replacement);

fs.writeFileSync('src/pages/restaurant/Counter.tsx', content);
