import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { ContaReceber } from '../../../types/financeiro';
import { formatCurrency } from '../../../utils/currencyUtils';
import { Plus, CheckCircle, Search, Filter, Calendar, User, FileText, Wallet, Loader2, ExternalLink, Coins, QrCode, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createContaReceber, registrarRecebimento } from '../../../services/contasReceberService';
import { useRestaurantPaymentMethods } from '../../../services/paymentMethodsService';
import { FinancialPageHeader } from './components/FinancialPageHeader';
import { EmptyFinancialState } from './components/EmptyFinancialState';
import { FinancialSummary } from './components/FinancialSummary';
import { FormField, TextInput, DateInput, SelectInput, CurrencyInput } from '../../../components/ui/FormComponents';
import { FinancialModal } from './components/FinancialModal';

export const ContasReceberPage: React.FC = () => {
  const { profile } = useAuth();
  const [contas, setContas] = useState<ContaReceber[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isNovaContaModalOpen, setIsNovaContaModalOpen] = useState(false);
  const [isReceberModalOpen, setIsReceberModalOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaReceber | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const restaurantId = profile?.restaurantId;

  useEffect(() => {
    if (!restaurantId) return;
    setLoadingData(true);
    const q = query(collection(db, 'restaurants', restaurantId, 'contasReceber'), orderBy('dueDate', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setContas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContaReceber)));
      setLoadingData(false);
    }, (err) => {
      console.error('Erro ao escutar contas a receber:', err);
      setLoadingData(false);
    });
    return () => unsubscribe();
  }, [restaurantId]);

  const filteredContas = useMemo(() => {
    return contas.filter(conta => {
      const matchesStatus = filterStatus === 'ALL' || conta.status === filterStatus;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (conta.customerName || '').toLowerCase().includes(searchLower) ||
        (conta.description || '').toLowerCase().includes(searchLower);
      return matchesStatus && matchesSearch;
    });
  }, [contas, filterStatus, searchTerm]);

  const summaryData = useMemo(() => {
    let totalCents = 0;
    let paidCents = 0;
    let remainingCents = 0;

    filteredContas.forEach(c => {
      totalCents += (c.totalAmount || 0);
      paidCents += (c.paidAmount || 0);
      remainingCents += (c.remainingAmount || 0);
    });

    return [
      { label: 'Total A Receber', valueCents: totalCents, variant: 'neutral' as const },
      { label: 'Total Recebido', valueCents: paidCents, variant: 'emerald' as const },
      { label: 'Saldo Pendente', valueCents: remainingCents, variant: 'amber' as const },
    ];
  }, [filteredContas]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            Recebida
          </span>
        );
      case 'PARTIALLY_PAID':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/80">
            Parcial
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200/80">
            Pendente
          </span>
        );
    }
  };

  const formatDateBR = (isoDate: string) => {
    if (!isoDate) return '-';
    try {
      const [year, month, day] = isoDate.split('T')[0].split('-');
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
      return new Date(isoDate).toLocaleDateString('pt-BR');
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Page Header */}
      <FinancialPageHeader 
        title="Contas a Receber"
        subtitle="Acompanhamento de vendas a prazo, cartões, PIX e outras entradas futuras."
        actionButton={{
          label: 'Nova Conta a Receber',
          icon: Plus,
          onClick: () => setIsNovaContaModalOpen(true),
          variant: 'emerald'
        }}
      />

      {/* Financial Summary */}
      <FinancialSummary items={summaryData} />

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar cliente ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm font-medium text-stone-800 placeholder-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-stone-400 hidden sm:block" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs sm:text-sm font-semibold text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer"
          >
            <option value="ALL">Todos os status</option>
            <option value="OPEN">Pendente</option>
            <option value="PARTIALLY_PAID">Parcialmente Recebida</option>
            <option value="PAID">Recebida</option>
          </select>
        </div>
      </div>

      {/* Content Section */}
      {loadingData ? (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-12 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          <p className="text-sm font-bold text-stone-600">Carregando contas a receber...</p>
        </div>
      ) : filteredContas.length === 0 ? (
        <EmptyFinancialState 
          title="Nenhuma conta a receber encontrada"
          description={searchTerm || filterStatus !== 'ALL' ? 'Nenhum resultado corresponde aos filtros selecionados.' : 'Cadastre sua primeira conta a receber para acompanhar os recebimentos futuros.'}
          actionButton={{
            label: 'Nova Conta a Receber',
            onClick: () => setIsNovaContaModalOpen(true)
          }}
        />
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden bg-white rounded-2xl border border-stone-200/80 shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-100 text-[11px] font-extrabold text-stone-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Descrição</th>
                  <th className="py-3.5 px-4">Vencimento</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                  <th className="py-3.5 px-4 text-right">Recebido</th>
                  <th className="py-3.5 px-4 text-right">Saldo</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs sm:text-sm font-medium text-stone-700">
                {filteredContas.map((conta) => (
                  <tr key={conta.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-stone-800">{conta.customerName}</td>
                    <td className="py-3.5 px-4 text-stone-600">{conta.description}</td>
                    <td className="py-3.5 px-4 text-stone-600 font-semibold">{formatDateBR(conta.dueDate)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-stone-800">{formatCurrency(conta.totalAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-emerald-600">{formatCurrency(conta.paidAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-amber-600">{formatCurrency(conta.remainingAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-center">{getStatusBadge(conta.status)}</td>
                    <td className="py-3.5 px-4 text-center">
                      {(conta.status === 'OPEN' || conta.status === 'PARTIALLY_PAID') ? (
                        <button
                          onClick={() => { setSelectedConta(conta); setIsReceberModalOpen(true); }}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white font-bold text-xs rounded-xl transition-all shadow-xs inline-flex items-center gap-1.5 active:scale-95"
                          title="Registrar Recebimento"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Receber</span>
                        </button>
                      ) : (
                        <span className="text-xs text-stone-400 font-semibold">Concluída</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {filteredContas.map((conta) => (
              <div key={conta.id} className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div>
                    <h4 className="font-bold text-stone-800 text-sm">{conta.customerName}</h4>
                    <p className="text-xs text-stone-500 mt-0.5">{conta.description}</p>
                  </div>
                  {getStatusBadge(conta.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Vencimento</span>
                    <span className="font-semibold text-stone-700">{formatDateBR(conta.dueDate)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Total</span>
                    <span className="font-bold text-stone-800">{formatCurrency(conta.totalAmount / 100)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Já Recebido</span>
                    <span className="font-semibold text-emerald-600">{formatCurrency(conta.paidAmount / 100)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase font-bold">Saldo Restante</span>
                    <span className="font-bold text-amber-600">{formatCurrency(conta.remainingAmount / 100)}</span>
                  </div>
                </div>

                {(conta.status === 'OPEN' || conta.status === 'PARTIALLY_PAID') && (
                  <button
                    onClick={() => { setSelectedConta(conta); setIsReceberModalOpen(true); }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 active:scale-95"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Registrar Recebimento</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {isNovaContaModalOpen && (
        <NovaContaModal
          isOpen={isNovaContaModalOpen}
          onClose={() => setIsNovaContaModalOpen(false)}
          restaurantId={restaurantId!}
          userId={profile?.id || ''}
        />
      )}

      {isReceberModalOpen && selectedConta && (
        <ReceberContaModal
          isOpen={isReceberModalOpen}
          onClose={() => { setIsReceberModalOpen(false); setSelectedConta(null); }}
          conta={selectedConta}
          restaurantId={restaurantId!}
          userId={profile?.id || ''}
        />
      )}
    </div>
  );
};

/* Nova Conta Modal Component */
const NovaContaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  restaurantId: string;
  userId: string;
}> = ({ isOpen, onClose, restaurantId, userId }) => {
  const [customerName, setCustomerName] = useState('');
  const [description, setDescription] = useState('');
  const [amountCents, setAmountCents] = useState<number>(0);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!customerName.trim()) {
      setError('Informe o nome do cliente.');
      return;
    }
    if (!description.trim()) {
      setError('Informe a descrição da conta.');
      return;
    }
    if (amountCents <= 0) {
      setError('Informe um valor válido maior que R$ 0,00.');
      return;
    }
    if (!dueDate.trim()) {
      setError('Informe uma data de vencimento válida.');
      return;
    }

    setLoading(true);
    try {
      await createContaReceber(restaurantId, {
        customerName: customerName.trim(),
        description: description.trim(),
        totalAmount: amountCents,
        dueDate: dueDate.trim()
      }, userId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta a receber.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinancialModal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Conta a Receber"
      subtitle="Cadastre uma conta ou recebimento com vencimento futuro."
      icon={User}
      iconBgColor="bg-emerald-50"
      iconTextColor="text-emerald-600"
      error={error}
      loading={loading}
      submitLabel="Salvar Conta"
      submitVariant="emerald"
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {/* Customer */}
        <FormField label="Cliente" required>
          <TextInput
            placeholder="Ex: João da Silva / Evento Corporativo"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={loading}
          />
        </FormField>

        {/* Description */}
        <FormField label="Descrição" required>
          <TextInput
            placeholder="Ex: Venda faturada referente ao pedido #1042"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
        </FormField>

        {/* Due Date */}
        <FormField label="Data de Vencimento" required>
          <DateInput
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={loading}
          />
        </FormField>

        {/* Currency Input */}
        <CurrencyInput
          valueCents={amountCents}
          onChangeCents={setAmountCents}
          label="Valor Total (R$)"
          required
          disabled={loading}
        />
      </div>
    </FinancialModal>
  );
};

/* Receber Conta Modal Component */
const ReceberContaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  conta: ContaReceber;
  restaurantId: string;
  userId: string;
}> = ({ isOpen, onClose, conta, restaurantId, userId }) => {
  const [receivedAmountCents, setReceivedAmountCents] = useState<number>(conta.remainingAmount);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [observation, setObservation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    loading: loadingMethods,
    error: methodsError,
    methodsOptions,
    defaultMethodId,
    refetch: refetchMethods
  } = useRestaurantPaymentMethods(restaurantId, null, 'CONTAS_RECEBER');

  const paymentMethods = useMemo(() => {
    const loaded = methodsOptions.map(m => ({ id: m.id, label: m.name }));
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
    if (paymentMethods.length > 0) {
      const isValid = paymentMethods.some(pm => pm.id === paymentMethod);
      if (!paymentMethod || !isValid) {
        setPaymentMethod(defaultMethodId || paymentMethods[0].id);
      }
    } else {
      if (paymentMethod !== '') {
        setPaymentMethod('');
      }
    }
  }, [paymentMethods, defaultMethodId, paymentMethod]);

  const handleSubmit = async () => {
    setError(null);
    if (receivedAmountCents <= 0) {
      setError('Informe um valor de recebimento válido maior que R$ 0,00.');
      return;
    }
    if (receivedAmountCents > conta.remainingAmount) {
      setError('O valor do recebimento excede o saldo restante.');
      return;
    }
    if (!paymentMethod) {
      setError('Selecione uma forma de pagamento para prosseguir.');
      return;
    }

    setLoading(true);
    try {
      await registrarRecebimento(restaurantId, conta.id, {
        amount: receivedAmountCents,
        paymentMethodId: paymentMethod,
        observation: observation.trim() || undefined
      }, userId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar recebimento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinancialModal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Recebimento"
      subtitle="Informe o valor e a forma de pagamento recebida."
      icon={Wallet}
      iconBgColor="bg-emerald-50"
      iconTextColor="text-emerald-600"
      error={error}
      loading={loading}
      submitLabel="Confirmar Recebimento"
      submitVariant="emerald"
      onSubmit={handleSubmit}
      submitDisabled={paymentMethods.length === 0 || loadingMethods}
    >
      <div className="space-y-4">
        {/* Account Info Card */}
        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">Cliente</span>
              <h4 className="text-sm font-bold text-stone-800">{conta.customerName}</h4>
              <p className="text-xs text-stone-500 mt-0.5">{conta.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200/60 text-xs">
            <div>
              <span className="text-stone-400 text-[10px] block font-bold uppercase">Total</span>
              <span className="font-bold text-stone-700">{formatCurrency(conta.totalAmount / 100)}</span>
            </div>
            <div>
              <span className="text-stone-400 text-[10px] block font-bold uppercase">Já Recebido</span>
              <span className="font-bold text-emerald-600">{formatCurrency(conta.paidAmount / 100)}</span>
            </div>
            <div>
              <span className="text-amber-600 text-[10px] block font-bold uppercase">Saldo Restante</span>
              <span className="font-extrabold text-amber-600">{formatCurrency(conta.remainingAmount / 100)}</span>
            </div>
          </div>
        </div>

        {/* Currency Input for operation */}
        <CurrencyInput
          valueCents={receivedAmountCents}
          onChangeCents={setReceivedAmountCents}
          label="Valor desta operação (R$)"
          required
          disabled={loading}
          helperText="Você pode registrar um valor menor para recebimento parcial."
        />

        {/* Payment Method Selector Grid */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-wider block">
            Forma de Pagamento <span className="text-rose-500">*</span>
          </label>
          
          {loadingMethods && paymentMethods.length === 0 ? (
            <div className="flex items-center gap-2 py-3 px-4 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-400">
              <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
              <span>Carregando formas de pagamento...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => {
                const isSelected = paymentMethod === method.id;
                
                // Determine icon
                let IconComponent = Wallet;
                if (method.id === 'dinheiro') IconComponent = Coins;
                else if (method.id === 'pix') IconComponent = QrCode;
                else if (method.id === 'credito' || method.id === 'debito') IconComponent = CreditCard;

                return (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setPaymentMethod(method.id)}
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
          {methodsError && (
            <p className="text-rose-500 text-[10px] font-semibold mt-1">
              Nota: Erro ao carregar formas do servidor. Usando opções padrão.
            </p>
          )}
        </div>

        {/* Optional Observation */}
        <FormField label="Observação (Opcional)">
          <TextInput
            placeholder="Ex: Recebido em PIX direto na conta"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            disabled={loading}
          />
        </FormField>
      </div>
    </FinancialModal>
  );
};

export default ContasReceberPage;
