import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  XCircle, 
  DollarSign, 
  CreditCard, 
  Clock, 
  TrendingUp, 
  Loader2, 
  AlertCircle, 
  Plus, 
  FileText,
  X,
  Printer,
  ExternalLink,
  Coins,
  QrCode,
  Wallet
} from 'lucide-react';
import { CashOpeningReceipt, CashClosingReceipt } from '../../../components/receipts/CashReceipts';
import { PrintableCashReceipt } from '../../../components/receipts/PrintableCashReceipt';
import { useAuth } from '../../../contexts/AuthContext';
import { FormModal, FormField, TextInput, SelectInput, TextareaInput, PrimaryButton, SecondaryButton, DangerButton, CurrencyInput } from '../../../components/ui/FormComponents';
import { formatCurrency, formatNumberBRL } from '../../../utils/currencyUtils';
import { useRestaurantPaymentMethods, isCashPaymentMethod, getPaymentMethodLabel } from '../../../services/paymentMethodsService';
import { Link } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../../../firebase';
import { 
  collection, 
  query, 
  where, 
  doc, 
  getDocs, 
  getDoc,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';

interface PaymentSummaryItem {
  paymentMethodId: string;
  paymentMethodName: string;
  expectedAmount: number;
  countedAmount: number;
  differenceAmount: number;
}

interface Caixa {
  id: string;
  restaurantId: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedBy: string;
  openingBalance: number;
  closedAt?: string;
  closedBy?: string;
  closingBalance?: number;
  observation?: string;
  createdAt: string;
  updatedAt: string;

  // Closing conference fields
  expectedTotal?: number;
  countedTotal?: number;
  totalDifference?: number;
  totalEntries?: number;
  totalExits?: number;
  totalSupplies?: number;
  totalWithdrawals?: number;
  expectedByPaymentMethod?: Record<string, number>;
  countedByPaymentMethod?: Record<string, number>;
  differenceByPaymentMethod?: Record<string, number>;
  paymentSummary?: PaymentSummaryItem[];
}

interface Movimentacao {
  id: string;
  restaurantId: string;
  cashRegisterId: string;
  type: 'INCOME' | 'EXPENSE' | 'SUPPLY' | 'WITHDRAWAL';
  category: string;
  description: string;
  amount: number; // Stored in cents
  paymentMethodId: string;
  createdAt: string;
  createdBy: string;
  observation?: string;
  orderId?: string;
  orderSource?: string;
  referenceMovementId?: string;
  automatic?: boolean;
  origin?: string;
}

interface PaymentMethodOption {
  id: string;
  label: string;
}

export function CaixaPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const formatCaixaAmount = (centsOrFloat: number | undefined) => {
    if (centsOrFloat === undefined || centsOrFloat === null || isNaN(centsOrFloat)) return 'R$ 0,00';
    return formatCurrency(Number.isInteger(centsOrFloat) ? centsOrFloat : Math.round(centsOrFloat * 100), true);
  };
  
  const [activeCaixa, setActiveCaixa] = useState<Caixa | null>(null);
  const [restaurantData, setRestaurantData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [printData, setPrintData] = useState<{ type: 'opening' | 'closing' | null; data: any | null }>({ type: null, data: null });

  // Modals state
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);

  // Form states
  const [openingBalance, setOpeningBalance] = useState(0);
  const [observation, setObservation] = useState('');
  const [closingBalance, setClosingBalance] = useState('0,00');
  const [closingObservation, setClosingObservation] = useState('');
  const [countedValues, setCountedValues] = useState<Record<string, number | undefined>>({});

  // New movement form states
  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE' | 'SUPPLY' | 'WITHDRAWAL'>('INCOME');
  const [movementCategory, setMovementCategory] = useState('');
  const [movementDescription, setMovementDescription] = useState('');
  const [movementAmount, setMovementAmount] = useState(0);
  const [movementPaymentMethodId, setMovementPaymentMethodId] = useState('');
  const [movementObservation, setMovementObservation] = useState('');
  const [movementError, setMovementError] = useState<string | null>(null);

  // Data states
  const [movements, setMovements] = useState<Movimentacao[]>([]);

  // Real-time payment methods hook
  const {
    loading: loadingPayments,
    error: paymentMethodsError,
    methodsOptions,
    defaultMethodId,
    refetch: refetchPaymentMethods
  } = useRestaurantPaymentMethods(restaurantId, null, 'CAIXA');

  const availablePaymentMethods = useMemo<PaymentMethodOption[]>(() => {
    const loaded = methodsOptions.map(m => ({
      id: m.id,
      label: m.name
    }));
    const standard = [
      { id: 'dinheiro', label: 'Dinheiro' },
      { id: 'pix', label: 'Pix' },
      { id: 'credito', label: 'Cartão de Crédito' },
      { id: 'debito', label: 'Cartão de Débito' }
    ];
    const merged = [...loaded];
    standard.forEach(std => {
      if (!merged.some(m => m.id === std.id)) {
        merged.push(std);
      }
    });
    return merged;
  }, [methodsOptions]);

  useEffect(() => {
    if (availablePaymentMethods.length > 0) {
      if (!movementPaymentMethodId || !availablePaymentMethods.some(p => p.id === movementPaymentMethodId)) {
        setMovementPaymentMethodId(defaultMethodId || availablePaymentMethods[0].id);
      }
    } else {
      setMovementPaymentMethodId('');
    }
  }, [availablePaymentMethods, defaultMethodId]);

  // Load restaurant profile
  useEffect(() => {
    if (!restaurantId) return;
    const fetchRestaurant = async () => {
      try {
        const docRef = doc(db, 'restaurants', restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRestaurantData(docSnap.data());
        }
      } catch (err) {
        console.error("Error fetching restaurant:", err);
      }
    };
    fetchRestaurant();
  }, [restaurantId]);
  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, `restaurants/${restaurantId}/caixas`),
      orderBy("openedAt", "desc"),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const list = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        } as Caixa));
        
        // Find if there is an active OPEN caixa
        const openCaixa = list.find(c => c.status === 'OPEN');
        if (openCaixa) {
          setActiveCaixa(openCaixa);
        } else {
          // Fallback to the latest closed caixa to show its summary
          setActiveCaixa(list[0]);
        }
      } else {
        setActiveCaixa(null);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/caixas`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [restaurantId]);

  // Real-time listener for current Caixa movements
  useEffect(() => {
    if (!restaurantId || !activeCaixa) {
      setMovements([]);
      return;
    }

    const q = query(
      collection(db, `restaurants/${restaurantId}/caixas/${activeCaixa.id}/movimentacoes`)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Movimentacao[] = [];
      snapshot.forEach((doc) => {
        list.push({
          id: doc.id,
          ...doc.data()
        } as Movimentacao);
      });
      // Sort client side to avoid missing index errors
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMovements(list);
    }, (error) => {
      console.error("Error listing movements:", error);
    });

    return () => unsubscribe();
  }, [restaurantId, activeCaixa?.id]);

  // Handle defaults for SUPPLY & WITHDRAWAL (select Cash if available, else first active)
  useEffect(() => {
    if (movementType === 'SUPPLY' || movementType === 'WITHDRAWAL') {
      const cashMethod = availablePaymentMethods.find(p => isCashPaymentMethod(p.id));
      if (cashMethod) {
        setMovementPaymentMethodId(cashMethod.id);
      }
    }
  }, [movementType, availablePaymentMethods]);

  const handleCountedValueChange = (methodId: string, cents: number) => {
    setCountedValues(prev => ({
      ...prev,
      [methodId]: cents
    }));
  };

  // Memoized shift totals (Resumo do Turno)
  const totals = useMemo(() => {
    if (!activeCaixa) return { entries: 0, exits: 0, supplies: 0, withdrawals: 0, balance: 0 };

    let entries = 0;      // INCOME
    let exits = 0;        // EXPENSE
    let supplies = 0;     // SUPPLY
    let withdrawals = 0;  // WITHDRAWAL

    movements.forEach((m) => {
      const amt = m.amount || 0;
      if (m.type === 'INCOME') {
        entries += amt;
      } else if (m.type === 'EXPENSE') {
        exits += amt;
      } else if (m.type === 'SUPPLY') {
        supplies += amt;
      } else if (m.type === 'WITHDRAWAL') {
        withdrawals += amt;
      }
    });

    const rawOpening = activeCaixa.openingBalance || 0;
    const openingCents = Number.isInteger(rawOpening) ? rawOpening : Math.round(rawOpening * 100);
    const balanceCents = openingCents + entries + supplies - exits - withdrawals;

    return {
      entries,
      exits,
      supplies,
      withdrawals,
      balance: balanceCents
    };
  }, [activeCaixa, movements]);

  const getMethodLabel = (id: string): string => {
    const found = availablePaymentMethods.find(p => p.id === id);
    if (found) return found.label;
    return getPaymentMethodLabel(id);
  };

  // Memoized unique payment methods to display
  const displayMethods = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    
    // 1. Add configured methods
    availablePaymentMethods.forEach(pm => {
      map.set(pm.id, { id: pm.id, label: pm.label });
    });

    // 2. Add moved methods
    movements.forEach(m => {
      if (m.paymentMethodId && !map.has(m.paymentMethodId)) {
        map.set(m.paymentMethodId, { 
          id: m.paymentMethodId, 
          label: getMethodLabel(m.paymentMethodId) 
        });
      }
    });

    // 3. Ensure Dinheiro is shown if there is an opening balance
    if (activeCaixa && activeCaixa.openingBalance > 0) {
      if (!map.has('dinheiro')) {
        map.set('dinheiro', { id: 'dinheiro', label: 'Dinheiro' });
      }
    }

    return Array.from(map.values());
  }, [availablePaymentMethods, movements, activeCaixa]);

  // Memoized detailed stats (expected values) per payment method
  const methodsCalculations = useMemo(() => {
    const calculations: Record<string, {
      id: string;
      name: string;
      entries: number;      // cents
      exits: number;        // cents
      supplies: number;     // cents
      withdrawals: number;  // cents
      expected: number;     // cents
    }> = {};

    if (!activeCaixa) return calculations;

    const rawOpeningBal = activeCaixa.openingBalance || 0;
    const initialOpeningCents = Number.isInteger(rawOpeningBal) ? rawOpeningBal : Math.round(rawOpeningBal * 100);

    // Initialize display methods
    displayMethods.forEach((pm) => {
      calculations[pm.id] = {
        id: pm.id,
        name: pm.label,
        entries: 0,
        exits: 0,
        supplies: 0,
        withdrawals: 0,
        expected: pm.id === 'dinheiro' ? initialOpeningCents : 0,
      };
    });

    // Process movements
    movements.forEach((m) => {
      const amt = m.amount || 0;
      const methodId = m.paymentMethodId;
      
      if (!calculations[methodId]) {
        calculations[methodId] = {
          id: methodId,
          name: getMethodLabel(methodId),
          entries: 0,
          exits: 0,
          supplies: 0,
          withdrawals: 0,
          expected: isCashPaymentMethod(methodId) ? initialOpeningCents : 0,
        };
      }

      const calc = calculations[methodId];
      if (m.type === 'INCOME') {
        calc.entries += amt;
      } else if (m.type === 'EXPENSE') {
        calc.exits += amt;
      } else if (m.type === 'SUPPLY') {
        calc.supplies += amt;
      } else if (m.type === 'WITHDRAWAL') {
        calc.withdrawals += amt;
      }
    });

    // Compute final expected for each (opening Balance only affects "dinheiro")
    Object.keys(calculations).forEach((id) => {
      const calc = calculations[id];
      const openingCents = id === 'dinheiro' ? initialOpeningCents : 0;
      calc.expected = openingCents + calc.entries + calc.supplies - calc.exits - calc.withdrawals;
    });

    return calculations;
  }, [activeCaixa, displayMethods, movements]);

  // Memoized calculations inside the closing modal (conference)
  const modalSummary = useMemo(() => {
    let totalExpectedCents = 0;
    let totalCountedCents = 0;

    const items = displayMethods.map((pm) => {
      const expectedCents = methodsCalculations[pm.id]?.expected || 0;
      
      const countedCents = countedValues[pm.id] !== undefined ? countedValues[pm.id]! : 0;
      const isFilled = countedValues[pm.id] !== undefined;
      const isValid = isFilled && countedCents >= 0;
      
      const differenceCents = countedCents - expectedCents;

      totalExpectedCents += expectedCents;
      totalCountedCents += countedCents;

      return {
        paymentMethodId: pm.id,
        paymentMethodName: pm.label,
        expectedCents,
        countedCents,
        differenceCents,
        isFilled,
        isValid
      };
    });

    const totalDifferenceCents = totalCountedCents - totalExpectedCents;

    return {
      items,
      totalExpectedCents,
      totalCountedCents,
      totalDifferenceCents,
      allFilled: items.every(item => item.isFilled),
      allValid: items.every(item => item.isValid)
    };
  }, [displayMethods, methodsCalculations, countedValues]);

  // Init function when opening closing modal
  const initClosingConference = () => {
    const initial: Record<string, number | undefined> = {};
    displayMethods.forEach((pm) => {
      initial[pm.id] = undefined;
    });
    setCountedValues(initial);
    setClosingObservation('');
    setErrorMsg(null);
  };

  const handleOpenCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const openingBalanceCents = openingBalance;
      if (openingBalanceCents < 0) {
        setErrorMsg("O saldo inicial não pode ser negativo.");
        setIsSubmitting(false);
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch('/api/restaurant/financeiro/caixa/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          openingBalanceCents,
          observation: observation.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || "Erro ao abrir caixa. Por favor, tente novamente.");
        setIsSubmitting(false);
        return;
      }

      setOpeningBalance(0);
      setObservation('');
      setIsOpeningModalOpen(false);

      if (data.caixa) {
        setPrintData({ type: 'opening', data: data.caixa });
      }
    } catch (err: any) {
      setErrorMsg("Erro ao abrir caixa. Por favor, tente novamente.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseCaixa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeCaixa) return;

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      if (!modalSummary.allFilled) {
        setErrorMsg("Preencha o valor encontrado para todas as formas de pagamento.");
        setIsSubmitting(false);
        return;
      }

      if (!modalSummary.allValid) {
        setErrorMsg("Certifique-se de que todos os valores inseridos são válidos e não-negativos.");
        setIsSubmitting(false);
        return;
      }

      const countedValuesInCents: Record<string, number> = {};
      modalSummary.items.forEach((item) => {
        countedValuesInCents[item.paymentMethodId] = item.countedCents;
      });

      const token = await user.getIdToken();

      const response = await fetch('/api/restaurant/financeiro/caixa/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          countedValuesInCents,
          observation: closingObservation.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMsg(data.error || "Erro ao fechar caixa. Por favor, tente novamente.");
        setIsSubmitting(false);
        return;
      }

      setClosingBalance('0,00');
      setClosingObservation('');
      setCountedValues({});
      setIsClosingModalOpen(false);

      if (data.caixa) {
        setPrintData({ type: 'closing', data: data.caixa });
      }
    } catch (err: any) {
      setErrorMsg("Erro ao fechar caixa. Por favor, tente novamente.");
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeCaixa) return;

    setMovementError(null);
    setIsSubmitting(true);

    try {
      const amountCents = movementAmount;
      if (amountCents <= 0) {
        setMovementError("O valor da movimentação deve ser maior que zero.");
        setIsSubmitting(false);
        return;
      }

      if (!movementPaymentMethodId) {
        setMovementError("Por favor, selecione uma forma de pagamento válida.");
        setIsSubmitting(false);
        return;
      }

      const token = await user.getIdToken();

      const response = await fetch('/api/restaurant/financeiro/caixa/movement', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: movementType,
          category: movementCategory.trim(),
          description: movementDescription.trim(),
          amountCents,
          paymentMethodId: movementPaymentMethodId,
          observation: movementObservation.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setMovementError(data.error || "Erro ao salvar a movimentação.");
        setIsSubmitting(false);
        return;
      }

      // Clean up & Close
      setMovementCategory('');
      setMovementDescription('');
      setMovementAmount(0);
      setMovementObservation('');
      const hasDinheiro = availablePaymentMethods.find(p => p.id === 'dinheiro');
      setMovementPaymentMethodId(hasDinheiro ? 'dinheiro' : (availablePaymentMethods[0]?.id || ''));
      setMovementType('INCOME');
      setIsMovementModalOpen(false);

    } catch (err: any) {
      console.error(err);
      setMovementError("Erro ao salvar a movimentação. Por favor, tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'INCOME':
        return {
          label: 'Entrada',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        };
      case 'EXPENSE':
        return {
          label: 'Saída',
          className: 'bg-red-50 text-red-700 border-red-100',
        };
      case 'SUPPLY':
        return {
          label: 'Suprimento',
          className: 'bg-blue-50 text-blue-700 border-blue-100',
        };
      case 'WITHDRAWAL':
        return {
          label: 'Sangria',
          className: 'bg-orange-50 text-orange-700 border-orange-100',
        };
      default:
        return {
          label: type,
          className: 'bg-stone-50 text-stone-700 border-stone-100',
        };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-2" />
        <p className="text-stone-500 text-sm">Carregando informações do caixa...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Caixa</h2>
          <p className="text-stone-500 text-sm">Controle de abertura, fechamento e conferência do caixa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => navigate('/restaurant/financeiro')}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-stone-200 text-stone-600 font-bold text-sm rounded-xl hover:bg-stone-50 transition-all shadow-sm active:scale-[0.98]"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Financeiro
          </button>
        </div>
      </div>

      {/* Caixa Status / Action Bar */}
      <div className="p-6 bg-white border border-stone-200 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className={`p-4 rounded-2xl flex items-center justify-center ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
            <Clock className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-stone-800">Status do Caixa</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-600 animate-ping' : 'bg-red-600'}`}></span>
                {activeCaixa && activeCaixa.status === 'OPEN' ? 'Caixa Aberto' : 'Caixa Fechado'}
              </span>
            </div>
            <p className="text-stone-500 text-sm mt-1 max-w-xl">
              {activeCaixa && activeCaixa.status === 'OPEN' 
                ? `Caixa em operação. Aberto em ${new Date(activeCaixa.openedAt).toLocaleString('pt-BR')} por ${activeCaixa.openedBy}.` 
                : activeCaixa && activeCaixa.status === 'CLOSED'
                  ? `Caixa fechado. Fechado em ${new Date(activeCaixa.closedAt!).toLocaleString('pt-BR')} por ${activeCaixa.closedBy!}.`
                  : 'O caixa está fechado no momento. É necessário abrir o caixa para iniciar as operações financeiras e vendas.'}
            </p>
          </div>
        </div>
        <div className="self-end md:self-auto">
          {activeCaixa && activeCaixa.status === 'OPEN' ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setPrintData({ type: 'opening', data: activeCaixa })}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold rounded-xl transition-all shadow-sm"
              >
                <Printer className="w-5 h-5" />
                Reimprimir Abertura
              </button>
              <button
                onClick={() => {
                  setMovementError(null);
                  setIsMovementModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold rounded-xl transition-all shadow-sm active:scale-[0.98]"
              >
                <Plus className="w-5 h-5 text-emerald-600" />
                Nova Movimentação
              </button>
              <button
                onClick={() => {
                  initClosingConference();
                  setIsClosingModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-sm active:scale-[0.98]"
              >
                <XCircle className="w-5 h-5" />
                Fechar Caixa
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {activeCaixa && activeCaixa.status === 'CLOSED' && (
                <button
                  onClick={() => setPrintData({ type: 'closing', data: activeCaixa })}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 font-bold rounded-xl transition-all shadow-sm"
                >
                  <Printer className="w-5 h-5" />
                  Reimprimir Fechamento
                </button>
              )}
              <button
                onClick={() => {
                  setOpeningBalance(0);
                  setObservation('');
                  setIsOpeningModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm active:scale-[0.98]"
              >
                <Play className="w-5 h-5" />
                Abrir Caixa
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Print Modal */}
      {printData.type && printData.data && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-4 max-w-sm w-full">
            <div className="flex justify-between items-center mb-4 no-print">
              <h3 className="font-bold text-lg">Impressão</h3>
              <button onClick={() => setPrintData({ type: null, data: null })}><X /></button>
            </div>
            <PrintableCashReceipt>
              {printData.type === 'opening' ? (
                <CashOpeningReceipt 
                  restaurantName={restaurantData?.nome || 'Restaurante'}
                  cnpj={restaurantData?.cnpj}
                  caixaId={printData.data.id}
                  openedAt={printData.data.openedAt}
                  openedBy={printData.data.openedBy}
                  openingBalance={(printData.data.openingBalance || 0) / 100}
                  observation={printData.data.observation}
                />
              ) : (
                <CashClosingReceipt
                  restaurantName={restaurantData?.nome || 'Restaurante'}
                  cnpj={restaurantData?.cnpj}
                  caixaId={printData.data.id}
                  openedAt={printData.data.openedAt}
                  closedAt={printData.data.closedAt!}
                  openedBy={printData.data.openedBy}
                  closedBy={printData.data.closedBy!}
                  openingBalance={(printData.data.openingBalance || 0) / 100}
                  totalEntries={(printData.data.totalEntries || 0) / 100}
                  totalExits={(printData.data.totalExits || 0) / 100}
                  totalSupplies={(printData.data.totalSupplies || 0) / 100}
                  totalWithdrawals={(printData.data.totalWithdrawals || 0) / 100}
                  expectedTotal={(printData.data.expectedTotal || 0) / 100}
                  countedTotal={(printData.data.countedTotal || 0) / 100}
                  totalDifference={(printData.data.totalDifference || 0) / 100}
                  paymentSummary={(printData.data.paymentSummary || []).map((p: any) => ({
                    ...p,
                    expectedAmount: (p.expectedAmount || 0) / 100,
                    countedAmount: (p.countedAmount || 0) / 100,
                    differenceAmount: (p.differenceAmount || 0) / 100
                  }))}
                />
              )}
            </PrintableCashReceipt>
          </div>
        </div>
      )}

      {/* Grid containing 4 detailed cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Status do Caixa */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Informações</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <Clock className="w-4 h-4" />
              </div>
            </div>
            {activeCaixa ? (
              <div className="space-y-1">
                <p className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Operador</p>
                <p className="text-stone-800 font-bold text-sm truncate">{activeCaixa.status === 'OPEN' ? activeCaixa.openedBy : activeCaixa.closedBy}</p>
                <p className="text-stone-400 text-[10px] uppercase font-bold tracking-wider pt-1">Abertura</p>
                <p className="text-stone-800 font-semibold text-xs truncate">
                  {new Date(activeCaixa.openedAt).toLocaleString('pt-BR')}
                </p>
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <p className="text-xs text-stone-400 font-semibold italic">Sem informações</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Resumo do Turno */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Resumo do Turno</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            {activeCaixa ? (
              activeCaixa.status === 'OPEN' ? (
                /* OPEN CAIXA */
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>Saldo Inicial:</span>
                    <span className="text-stone-700">{formatCaixaAmount(activeCaixa.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>(+) Entradas:</span>
                    <span className="text-emerald-600 font-medium">+{formatCurrency(totals.entries, true)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>(+) Suprimentos:</span>
                    <span className="text-emerald-600 font-medium">+{formatCurrency(totals.supplies, true)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>(-) Saídas:</span>
                    <span className="text-red-500 font-medium">-{formatCurrency(totals.exits, true)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>(-) Sangrias:</span>
                    <span className="text-red-500 font-medium">-{formatCurrency(totals.withdrawals, true)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-stone-100 flex justify-between font-bold">
                    <span className="text-stone-600">Calculado:</span>
                    <span className={totals.balance >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {formatCurrency(totals.balance, true)}
                    </span>
                  </div>
                </div>
              ) : (
                /* CLOSED CAIXA */
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>Total Esperado:</span>
                    <span className="text-stone-700 font-semibold">
                      {formatCaixaAmount(activeCaixa.expectedTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-500">
                    <span>Total Encontrado:</span>
                    <span className="text-stone-800 font-bold">
                      {formatCaixaAmount(activeCaixa.countedTotal)}
                    </span>
                  </div>
                  <div className="pt-1.5 border-t border-stone-100 flex justify-between font-bold">
                    <span className="text-stone-600">Diferença Total:</span>
                    <span className={
                      (activeCaixa.totalDifference || 0) === 0 
                        ? 'text-stone-500' 
                        : (activeCaixa.totalDifference || 0) > 0 
                          ? 'text-emerald-700' 
                          : 'text-red-600'
                    }>
                      {(activeCaixa.totalDifference || 0) > 0 ? '+' : ''}
                      {formatCaixaAmount(activeCaixa.totalDifference)}
                    </span>
                  </div>
                  <div className="pt-2 text-[10px] text-stone-400 space-y-0.5 border-t border-dashed border-stone-100">
                    <div>
                      <span className="font-bold">Status:</span> Fechado
                    </div>
                    <div>
                      <span className="font-bold">Fechamento:</span> {activeCaixa.closedAt ? new Date(activeCaixa.closedAt).toLocaleString('pt-BR') : ''}
                    </div>
                    <div className="truncate">
                      <span className="font-bold">Operador:</span> {activeCaixa.closedBy}
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="h-24 flex items-center justify-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <p className="text-xs text-stone-400 font-semibold italic">Sem informações</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Formas de Pagamento */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Formas de Pagamento</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            {activeCaixa ? (
              activeCaixa.status === 'OPEN' ? (
                /* When open, show list of payment methods and expected balance */
                <div className="space-y-1 text-xs">
                  {Object.values(methodsCalculations).map((calc) => (
                    <div key={calc.id} className="flex justify-between items-center py-0.5 border-b border-stone-50 last:border-0">
                      <span className="text-stone-500 font-medium truncate max-w-[130px]" title={calc.name}>{calc.name}:</span>
                      <span className="text-stone-800 font-bold">
                        {formatCurrency(calc.expected, true)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                /* When closed, show full recorded conference: expected, counted, difference */
                <div className="space-y-2 text-[10px]">
                  <div className="grid grid-cols-4 gap-1 font-bold text-stone-400 uppercase text-[8px] pb-1 border-b border-stone-100">
                    <div>Forma</div>
                    <div className="text-right">Esp.</div>
                    <div className="text-right">Inf.</div>
                    <div className="text-right">Dif.</div>
                  </div>
                  {activeCaixa.paymentSummary?.map((item) => {
                    const isDiffZero = item.differenceAmount === 0;
                    const isDiffPositive = item.differenceAmount > 0;
                    const expectedBrl = Number.isInteger(item.expectedAmount) ? item.expectedAmount / 100 : item.expectedAmount;
                    const countedBrl = Number.isInteger(item.countedAmount) ? item.countedAmount / 100 : item.countedAmount;
                    const differenceBrl = Number.isInteger(item.differenceAmount) ? item.differenceAmount / 100 : item.differenceAmount;
                    return (
                      <div key={item.paymentMethodId} className="grid grid-cols-4 gap-1 items-center py-0.5 border-b border-stone-50 last:border-0 text-stone-600">
                        <div className="font-semibold text-stone-700 truncate" title={item.paymentMethodName}>
                          {item.paymentMethodName}
                        </div>
                        <div className="text-right">
                          {formatNumberBRL(expectedBrl)}
                        </div>
                        <div className="text-right font-medium text-stone-800">
                          {formatNumberBRL(countedBrl)}
                        </div>
                        <div className={`text-right font-bold ${isDiffZero ? 'text-stone-400' : isDiffPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                          {isDiffPositive ? '+' : ''}{formatNumberBRL(differenceBrl)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="h-24 flex items-center justify-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <p className="text-xs text-stone-400 font-semibold italic">Sem informações</p>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Observações / Movimentações */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Métricas</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${activeCaixa && activeCaixa.status === 'OPEN' ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-400'}`}>
                <FileText className="w-4 h-4" />
              </div>
            </div>
            {activeCaixa ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-stone-500">
                  <span>Lançamentos:</span>
                  <span className="text-stone-700 font-bold">{movements.length}</span>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider pt-1">Obs. de Abertura</p>
                  <p className="text-stone-600 italic line-clamp-2 mt-0.5 leading-relaxed">
                    {activeCaixa.observation?.split('---')[0]?.replace(/Fechamento: .*/g, '') || 'Nenhuma observação informada.'}
                  </p>
                </div>
                {activeCaixa.status === 'CLOSED' && (
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase font-bold tracking-wider pt-1">Obs. de Fechamento</p>
                    <p className="text-stone-600 italic line-clamp-2 mt-0.5 leading-relaxed">
                      {activeCaixa.observation?.includes('---') 
                        ? activeCaixa.observation.split('---').pop()?.replace(/Fechamento: /, '').trim() 
                        : 'Nenhuma observação informada.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center border border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <p className="text-xs text-stone-400 font-semibold italic">Sem informações</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Movimentações do Turno Table Section */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-stone-800">Movimentações do Turno</h3>
            <p className="text-stone-400 text-xs">Registro detalhado de entradas, saídas, suprimentos e sangrias no caixa atual.</p>
          </div>
        </div>

        {movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50/50 text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Data e Hora</th>
                  <th className="py-3 px-6">Tipo</th>
                  <th className="py-3 px-6">Categoria</th>
                  <th className="py-3 px-6">Descrição</th>
                  <th className="py-3 px-6">Forma de Pagamento</th>
                  <th className="py-3 px-6 text-right">Valor</th>
                  <th className="py-3 px-6">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {movements.map((movement) => {
                  const typeBadge = getTypeBadge(movement.type);
                  const isPositive = movement.type === 'INCOME' || movement.type === 'SUPPLY';
                  const displayAmount = movement.amount || 0;
                  return (
                    <tr key={movement.id} className="text-xs text-stone-600 hover:bg-stone-50/50 transition-all">
                      <td className="py-4 px-6 font-medium text-stone-500 whitespace-nowrap">
                        {new Date(movement.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${typeBadge.className}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-semibold text-stone-800 whitespace-nowrap">
                        {movement.category}
                      </td>
                      <td className="py-4 px-6 max-w-xs truncate" title={movement.description}>
                        <div className="flex items-center gap-2">
                          <span className="truncate">{movement.description}</span>
                          {movement.automatic && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[9px] font-bold border border-blue-100 uppercase tracking-wider">
                              Automático
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 font-medium whitespace-nowrap">
                        {getMethodLabel(movement.paymentMethodId)}
                      </td>
                      <td className={`py-4 px-6 text-right font-bold whitespace-nowrap ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : '-'} {formatCurrency(displayAmount, true)}
                      </td>
                      <td className="py-4 px-6 font-medium text-stone-500 whitespace-nowrap">
                        {movement.createdBy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Empty Table Placeholder */
          <div className="p-12 text-center flex flex-col items-center justify-center bg-stone-50/50">
            <div className="w-12 h-12 bg-stone-100 text-stone-400 rounded-2xl flex items-center justify-center mb-4">
              <DollarSign className="w-6 h-6" />
            </div>
            <p className="text-stone-500 font-bold text-sm mb-1">Nenhuma movimentação.</p>
            <p className="text-stone-400 text-xs max-w-xs">
              As movimentações de entrada e saída aparecerão aqui quando o caixa estiver aberto e operando.
            </p>
          </div>
        )}
      </div>

      {/* MODAL: NOVA MOVIMENTAÇÃO */}
      <FormModal
        isOpen={isMovementModalOpen && !!activeCaixa}
        onClose={() => setIsMovementModalOpen(false)}
        title="Nova Movimentação"
        subtitle="Adicione um lançamento manual ao caixa aberto."
        icon={Plus}
        iconBgColor="bg-emerald-50"
        iconTextColor="text-emerald-600"
        error={movementError}
        loading={isSubmitting}
      >
        <form onSubmit={handleCreateMovement} className="space-y-4 text-left">
          {/* Validation Check for Payment Methods */}
          {availablePaymentMethods.length === 0 && !loadingPayments && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-2">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>Nenhuma forma de pagamento está disponível. Configure as formas de pagamento nas configurações do restaurante.</span>
              </div>
              <Link
                to="/restaurant/settings/payments"
                className="inline-flex items-center gap-1 font-bold text-amber-900 underline hover:text-amber-700 ml-6"
              >
                <span>Ir para Configurações de Pagamento</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Movement Type */}
          <div>
            <label className="block text-xs font-extrabold text-stone-500 uppercase tracking-wider mb-2">
              Tipo da Movimentação
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMovementType('INCOME')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  movementType === 'INCOME' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-100' 
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setMovementType('EXPENSE')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  movementType === 'EXPENSE' 
                    ? 'bg-red-50 text-red-700 border-red-300 ring-2 ring-red-100' 
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                Saída
              </button>
              <button
                type="button"
                onClick={() => setMovementType('SUPPLY')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  movementType === 'SUPPLY' 
                    ? 'bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-100' 
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                Suprimento
              </button>
              <button
                type="button"
                onClick={() => setMovementType('WITHDRAWAL')}
                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                  movementType === 'WITHDRAWAL' 
                    ? 'bg-orange-50 text-orange-700 border-orange-300 ring-2 ring-orange-100' 
                    : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                }`}
              >
                Sangria
              </button>
            </div>
          </div>

          {/* Category */}
          <FormField label="Categoria" required>
            <TextInput
              placeholder="Ex: Troco, Alimentação, Limpeza, Ajuste"
              value={movementCategory}
              onChange={(e) => setMovementCategory(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>

          {/* Description */}
          <FormField label="Descrição / Motivo" required>
            <TextInput
              placeholder="Ex: Compra de material de escritório"
              value={movementDescription}
              onChange={(e) => setMovementDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </FormField>

          {/* Payment Method Selector Grid */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
              Forma de Pagamento <span className="text-rose-500">*</span>
            </label>
            
            {loadingPayments && availablePaymentMethods.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-4 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-400">
                <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
                <span>Carregando formas de pagamento...</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {availablePaymentMethods.map((method) => {
                  const isSelected = movementPaymentMethodId === method.id;
                  
                  // Determine icon
                  let IconComponent = Wallet;
                  if (method.id === 'dinheiro') IconComponent = Coins;
                  else if (method.id === 'pix') IconComponent = QrCode;
                  else if (method.id === 'credito' || method.id === 'debito') IconComponent = CreditCard;

                  return (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setMovementPaymentMethodId(method.id)}
                      disabled={isSubmitting}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-98 ${
                        isSelected
                          ? 'bg-emerald-50/80 border-emerald-500 text-emerald-950 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
                      }`}
                    >
                      <div className={`p-2 rounded-lg transition-colors ${
                        isSelected ? 'bg-emerald-500 text-white' : 'bg-stone-100 text-stone-500'
                      }`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="leading-tight">
                        <span className="text-xs font-extrabold block">{method.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {paymentMethodsError && (
              <p className="text-rose-500 text-[10px] font-semibold mt-1">
                Nota: Erro ao carregar formas do servidor. Usando opções padrão.
              </p>
            )}
            {(movementType === 'SUPPLY' || movementType === 'WITHDRAWAL') && availablePaymentMethods.find(p => p.id === 'dinheiro') && (
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">
                * Dinheiro foi selecionado por padrão para este tipo de lançamento.
              </p>
            )}
          </div>

          {/* Value / Amount */}
          <FormField label="Valor (R$)" required>
            <CurrencyInput
              valueCents={movementAmount}
              onChangeCents={setMovementAmount}
              disabled={isSubmitting}
              inputClassName="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-xl text-stone-800 font-extrabold text-lg focus:outline-none transition-all"
            />
          </FormField>

          {/* Observation */}
          <FormField label="Observações adicionais (Opcional)">
            <TextareaInput
              value={movementObservation}
              onChange={(e) => setMovementObservation(e.target.value)}
              className="h-20"
              placeholder="Alguma observação relevante..."
              maxLength={250}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="pt-2">
            <PrimaryButton
              type="submit"
              disabled={isSubmitting || availablePaymentMethods.length === 0}
              loading={isSubmitting}
              className="w-full py-3"
            >
              Lançar Movimentação
            </PrimaryButton>
          </div>
        </form>
      </FormModal>

      {/* MODAL: ABERTURA DE CAIXA */}
      <FormModal
        isOpen={isOpeningModalOpen}
        onClose={() => setIsOpeningModalOpen(false)}
        title="Abertura de Caixa"
        subtitle="Insira os dados para iniciar o turno."
        icon={Play}
        iconBgColor="bg-emerald-50"
        iconTextColor="text-emerald-600"
        error={errorMsg}
        loading={isSubmitting}
      >
        <form onSubmit={handleOpenCaixa} className="space-y-4 text-left">
          <FormField label="Valor Inicial do Caixa (Fundo de Troco)" required>
            <CurrencyInput
              valueCents={openingBalance}
              onChangeCents={setOpeningBalance}
              disabled={isSubmitting}
              inputClassName="w-full px-4 py-3 bg-stone-50 border border-stone-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 rounded-xl text-stone-800 font-extrabold text-lg focus:outline-none transition-all"
            />
            <p className="text-[10px] text-stone-400 mt-1">
              Insira o valor em dinheiro disponível para troco na abertura deste caixa.
            </p>
          </FormField>

          <FormField label="Observações de Abertura (Opcional)">
            <TextareaInput
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className="h-24"
              placeholder="Ex: Fundo de troco em moedas e notas de R$ 2, R$ 5."
              maxLength={250}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="pt-2">
            <PrimaryButton
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
              className="w-full py-3"
            >
              Confirmar Abertura
            </PrimaryButton>
          </div>
        </form>
      </FormModal>

      {/* MODAL: FECHAMENTO DE CAIXA */}
      <FormModal
        isOpen={isClosingModalOpen && !!activeCaixa}
        onClose={() => setIsClosingModalOpen(false)}
        title="Fechamento de Caixa"
        subtitle="Insira os dados para fechar o turno do caixa."
        icon={XCircle}
        iconBgColor="bg-rose-50"
        iconTextColor="text-rose-600"
        error={errorMsg}
        loading={isSubmitting}
      >
        <form onSubmit={handleCloseCaixa} className="space-y-4 text-left">
          {/* Informações estáticas do caixa aberto */}
          <div className="p-4 bg-stone-50 border border-stone-200/60 rounded-2xl text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-stone-500 font-medium">Saldo Inicial de Abertura:</span>
              <span className="text-stone-800 font-bold">
                {formatCaixaAmount(activeCaixa.openingBalance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500 font-medium">Data/Hora da Abertura:</span>
              <span className="text-stone-800 font-semibold">
                {new Date(activeCaixa.openedAt).toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500 font-medium">Operador de Turno:</span>
              <span className="text-stone-800 font-semibold">{activeCaixa.openedBy}</span>
            </div>
          </div>

          {/* Conferência por Forma de Pagamento */}
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Conferência por Forma de Pagamento
            </p>
            
            {modalSummary.items.map((item) => {
              const isDiffZero = item.differenceCents === 0;
              const isDiffPositive = item.differenceCents > 0;

              return (
                <div key={item.paymentMethodId} className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-stone-700">{item.paymentMethodName}</span>
                    <span className="text-xs text-stone-500 font-semibold">
                      Esperado: <span className="text-stone-800">{formatCurrency(item.expectedCents, true)}</span>
                    </span>
                  </div>
                  
                  <div className="flex gap-3 items-center">
                    {/* Input Field */}
                    <div className="relative flex-1">
                      <CurrencyInput
                        valueCents={countedValues[item.paymentMethodId] ?? 0}
                        onChangeCents={(cents) => handleCountedValueChange(item.paymentMethodId, cents)}
                        disabled={isSubmitting}
                        inputClassName="w-full px-3 py-2 bg-white border border-stone-200 focus:border-red-500 focus:ring-1 focus:ring-red-200 rounded-lg text-stone-800 font-bold text-sm focus:outline-none transition-all text-right"
                      />
                    </div>

                    {/* Difference Badge/Indicator */}
                    <div className="w-[100px] text-right">
                      <p className="text-[9px] text-stone-400 font-bold uppercase">Diferença</p>
                      <p className={`font-extrabold text-xs truncate ${isDiffZero ? 'text-stone-400' : isDiffPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isDiffPositive ? '+' : ''}{formatNumberBRL(item.differenceCents / 100)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totais de Conferência */}
          <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl text-xs space-y-2">
            <div className="flex justify-between font-medium text-stone-500">
              <span>Total Esperado:</span>
              <span className="text-stone-800 font-bold">
                {formatCurrency(modalSummary.totalExpectedCents, true)}
              </span>
            </div>
            <div className="flex justify-between font-medium text-stone-500">
              <span>Total Encontrado:</span>
              <span className="text-stone-800 font-extrabold">
                {formatCurrency(modalSummary.totalCountedCents, true)}
              </span>
            </div>
            <div className="pt-2 border-t border-stone-200 flex justify-between font-extrabold text-sm">
              <span className="text-stone-700">Diferença Total:</span>
              <span className={modalSummary.totalDifferenceCents === 0 ? 'text-stone-600' : modalSummary.totalDifferenceCents > 0 ? 'text-emerald-700' : 'text-red-600'}>
                {modalSummary.totalDifferenceCents > 0 ? '+' : ''}
                {formatCurrency(modalSummary.totalDifferenceCents, true)}
              </span>
            </div>
          </div>

          <FormField label="Observações de Fechamento (Opcional)">
            <TextareaInput
              value={closingObservation}
              onChange={(e) => setClosingObservation(e.target.value)}
              className="h-24"
              placeholder="Ex: Diferença de R$ 1,00 devido a falta de moedas de centavos para troco."
              maxLength={250}
              disabled={isSubmitting}
            />
          </FormField>

          <div className="pt-2">
            <DangerButton
              type="submit"
              disabled={isSubmitting}
              loading={isSubmitting}
              className="w-full py-3"
            >
              Confirmar Fechamento
            </DangerButton>
          </div>
        </form>
      </FormModal>
    </div>
  );
}

export default CaixaPage;
