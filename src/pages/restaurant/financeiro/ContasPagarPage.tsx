import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { formatDate } from '../../../lib/utils';
import { db } from '../../../firebase';
import { collection, query, where, orderBy, limit, startAfter, getDocs, QueryDocumentSnapshot, QueryConstraint } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { ContaPagar } from '../../../types/financeiro';
import { formatCurrency } from '../../../utils/currencyUtils';
import { Plus, CheckCircle, Search, Filter, Calendar, Tag, Building2, FileText, Wallet, Loader2, ExternalLink, Coins, QrCode, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createContaPagar, registrarPagamento } from '../../../services/contasPagarService';
import { useRestaurantPaymentMethods } from '../../../services/paymentMethodsService';
import { FinancialPageHeader } from './components/FinancialPageHeader';
import { EmptyFinancialState } from './components/EmptyFinancialState';
import { FinancialSummary } from './components/FinancialSummary';
import { FormField, TextInput, DateInput, SelectInput, CurrencyInput, DangerButton, SecondaryButton } from '../../../components/ui/FormComponents';
import { FinancialModal } from './components/FinancialModal';
import { LoadingState } from '../../../components/ui/Feedback';
import { Badge } from '../../../components/ui/Badge';
import { SearchInput, Select } from '../../../components/ui/InputComponents';

const PAGE_SIZE = 20;

export const ContasPagarPage: React.FC = () => {
  const { profile } = useAuth();
  const [contas, setContas] = useState<ContaPagar[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [isNovaContaModalOpen, setIsNovaContaModalOpen] = useState(false);
  const [isPagarModalOpen, setIsPagarModalOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaPagar | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);
  const restaurantId = profile?.restaurantId;

  const fetchContas = useCallback(async (isReset = true) => {
    if (!restaurantId) {
      setLoadingData(false);
      return;
    }

    if (isReset) {
      setLoadingData(true);
      lastDocRef.current = null;
    } else {
      setLoadingMore(true);
    }

    try {
      const colRef = collection(db, 'restaurants', restaurantId, 'contasPagar');
      const constraints: QueryConstraint[] = [];

      if (filterStatus !== 'ALL') {
        constraints.push(where('status', '==', filterStatus));
      }

      constraints.push(orderBy('dueDate', 'asc'));

      if (!isReset && lastDocRef.current) {
        constraints.push(startAfter(lastDocRef.current));
      }

      constraints.push(limit(PAGE_SIZE));

      let snap;
      try {
        snap = await getDocs(query(colRef, ...constraints));
      } catch (err) {
        console.warn('[ContasPagar] Index missing fallback, querying by orderBy:', err);
        const fallbackConstraints: QueryConstraint[] = [orderBy('dueDate', 'asc')];
        if (!isReset && lastDocRef.current) {
          fallbackConstraints.push(startAfter(lastDocRef.current));
        }
        fallbackConstraints.push(limit(PAGE_SIZE));
        snap = await getDocs(query(colRef, ...fallbackConstraints));
      }

      const newDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContaPagar));

      if (snap.docs.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
        lastDocRef.current = snap.docs[snap.docs.length - 1];
      }

      if (isReset) {
        setContas(newDocs);
      } else {
        setContas(prev => {
          const map = new Map<string, ContaPagar>();
          [...prev, ...newDocs].forEach(c => map.set(c.id, c));
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('Erro ao buscar contas a pagar:', err);
    } finally {
      setLoadingData(false);
      setLoadingMore(false);
    }
  }, [restaurantId, filterStatus]);

  useEffect(() => {
    fetchContas(true);
  }, [restaurantId, filterStatus]);

  const filteredContas = useMemo(() => {
    return contas.filter(conta => {
      const matchesStatus = filterStatus === 'ALL' || conta.status === filterStatus;
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (conta.supplierName || '').toLowerCase().includes(searchLower) ||
        (conta.description || '').toLowerCase().includes(searchLower) ||
        (conta.category || '').toLowerCase().includes(searchLower);
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
      { label: 'Total A Pagar', valueCents: totalCents, variant: 'neutral' as const },
      { label: 'Total Pago', valueCents: paidCents, variant: 'emerald' as const },
      { label: 'Saldo Pendente', valueCents: remainingCents, variant: 'rose' as const },
    ];
  }, [filteredContas]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge variant="success">Paga</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">Parcial</Badge>;
      default:
        return <Badge variant="danger">Pendente</Badge>;
    }
  };

  const formatDateBR = (isoDate: string) => formatDate(isoDate);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Page Header */}
      <FinancialPageHeader 
        title="Contas a Pagar"
        subtitle="Controle de despesas, fornecedores, boletos e saídas programadas."
        actionButton={{
          label: 'Nova Conta a Pagar',
          icon: Plus,
          onClick: () => setIsNovaContaModalOpen(true),
          variant: 'rose'
        }}
      />

      {/* Financial Summary */}
      <FinancialSummary items={summaryData} />

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:w-80">
          <SearchInput
            placeholder="Buscar fornecedor, descrição ou categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-stone-400 hidden sm:block shrink-0" />
          <Select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-auto min-w-[180px]"
          >
            <option value="ALL">Todos os status</option>
            <option value="OPEN">Pendente</option>
            <option value="PARTIALLY_PAID">Parcialmente Paga</option>
            <option value="PAID">Paga</option>
          </Select>
        </div>
      </div>

      {/* Content Section */}
      {loadingData ? (
        <div className="bg-white rounded-2xl border border-stone-200/80 p-8">
          <LoadingState message="Carregando contas a pagar..." />
        </div>
      ) : filteredContas.length === 0 ? (
        <EmptyFinancialState 
          title="Nenhuma conta a pagar encontrada"
          description={searchTerm || filterStatus !== 'ALL' ? 'Nenhum resultado corresponde aos filtros selecionados.' : 'Cadastre sua primeira conta a pagar para acompanhar os compromissos financeiros.'}
          actionButton={{
            label: 'Nova Conta a Pagar',
            onClick: () => setIsNovaContaModalOpen(true)
          }}
        />
      ) : (
        <div>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-hidden bg-white rounded-2xl border border-stone-200/80 shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50/80 border-b border-stone-100 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Fornecedor</th>
                  <th className="py-3.5 px-4">Descrição</th>
                  <th className="py-3.5 px-4">Categoria</th>
                  <th className="py-3.5 px-4">Vencimento</th>
                  <th className="py-3.5 px-4 text-right">Valor Total</th>
                  <th className="py-3.5 px-4 text-right">Pago</th>
                  <th className="py-3.5 px-4 text-right">Saldo</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs sm:text-sm font-medium text-stone-700">
                {filteredContas.map((conta) => (
                  <tr key={conta.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-stone-800">{conta.supplierName}</td>
                    <td className="py-3.5 px-4 text-stone-600">{conta.description}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-600">
                        {conta.category || 'Geral'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-stone-600 font-semibold">{formatDateBR(conta.dueDate)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-stone-800">{formatCurrency(conta.totalAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-emerald-600">{formatCurrency(conta.paidAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-rose-600">{formatCurrency(conta.remainingAmount / 100)}</td>
                    <td className="py-3.5 px-4 text-center">{getStatusBadge(conta.status)}</td>
                    <td className="py-3.5 px-4 text-center">
                      {(conta.status === 'OPEN' || conta.status === 'PARTIALLY_PAID') ? (
                        <DangerButton
                          onClick={() => { setSelectedConta(conta); setIsPagarModalOpen(true); }}
                          className="text-xs py-1 px-2.5"
                          title="Registrar Pagamento"
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1 inline" />
                          Pagar
                        </DangerButton>
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
                    <h4 className="font-bold text-stone-800 text-sm">{conta.supplierName}</h4>
                    <p className="text-xs text-stone-500 mt-0.5">{conta.description}</p>
                  </div>
                  {getStatusBadge(conta.status)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-stone-400 block text-xs uppercase font-bold">Categoria</span>
                    <span className="font-semibold text-stone-700">{conta.category || 'Geral'}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-xs uppercase font-bold">Vencimento</span>
                    <span className="font-semibold text-stone-700">{formatDateBR(conta.dueDate)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-xs uppercase font-bold">Total</span>
                    <span className="font-bold text-stone-800">{formatCurrency(conta.totalAmount / 100)}</span>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-xs uppercase font-bold">Saldo Restante</span>
                    <span className="font-bold text-rose-600">{formatCurrency(conta.remainingAmount / 100)}</span>
                  </div>
                </div>

                {(conta.status === 'OPEN' || conta.status === 'PARTIALLY_PAID') && (
                  <DangerButton
                    onClick={() => { setSelectedConta(conta); setIsPagarModalOpen(true); }}
                    className="w-full py-2"
                  >
                    <CheckCircle className="w-4 h-4 mr-2 inline" />
                    Registrar Pagamento
                  </DangerButton>
                )}
              </div>
            ))}
          </div>

          {/* Pagination Load More Button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <SecondaryButton
                onClick={() => fetchContas(false)}
                disabled={loadingMore}
                loading={loadingMore}
                className="px-5 py-2"
              >
                Carregar mais contas
              </SecondaryButton>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isNovaContaModalOpen && (
        <NovaContaModal
          isOpen={isNovaContaModalOpen}
          onClose={() => {
            setIsNovaContaModalOpen(false);
            fetchContas(true);
          }}
          restaurantId={restaurantId!}
          userId={profile?.id || ''}
        />
      )}

      {isPagarModalOpen && selectedConta && (
        <PagarContaModal
          isOpen={isPagarModalOpen}
          onClose={() => {
            setIsPagarModalOpen(false);
            setSelectedConta(null);
            fetchContas(true);
          }}
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
  const [supplierName, setSupplierName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [amountCents, setAmountCents] = useState<number>(0);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!supplierName.trim()) {
      setError('Informe o nome do fornecedor.');
      return;
    }
    if (!description.trim()) {
      setError('Informe a descrição da conta.');
      return;
    }
    if (!category.trim()) {
      setError('Informe a categoria.');
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
      await createContaPagar(restaurantId, {
        supplierName: supplierName.trim(),
        description: description.trim(),
        category: category.trim(),
        totalAmount: amountCents,
        dueDate: dueDate.trim()
      }, userId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta a pagar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinancialModal
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Conta a Pagar"
      subtitle="Cadastre uma nova despesa ou conta com vencimento futuro."
      icon={Building2}
      iconBgColor="bg-rose-50"
      iconTextColor="text-rose-600"
      error={error}
      loading={loading}
      submitLabel="Salvar Conta"
      submitVariant="rose"
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {/* Supplier */}
        <FormField label="Fornecedor" required>
          <TextInput
            placeholder="Ex: Distribuidora de Bebidas Silva"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            disabled={loading}
          />
        </FormField>

        {/* Description */}
        <FormField label="Descrição" required>
          <TextInput
            placeholder="Ex: Compra de insumos semanal"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
        </FormField>

        {/* Category & Due Date in 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Categoria" required>
            <TextInput
              placeholder="Ex: Insumos, Aluguel"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={loading}
            />
          </FormField>

          <FormField label="Data de Vencimento" required>
            <DateInput
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={loading}
            />
          </FormField>
        </div>

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

/* Pagar Conta Modal Component */
const PagarContaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  conta: ContaPagar;
  restaurantId: string;
  userId: string;
}> = ({ isOpen, onClose, conta, restaurantId, userId }) => {
  const [paymentAmountCents, setPaymentAmountCents] = useState<number>(conta.remainingAmount);
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
  } = useRestaurantPaymentMethods(restaurantId, null, 'CONTAS_PAGAR');

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
    if (paymentAmountCents <= 0) {
      setError('Informe um valor de pagamento válido maior que R$ 0,00.');
      return;
    }
    if (paymentAmountCents > conta.remainingAmount) {
      setError('O valor do pagamento excede o saldo restante.');
      return;
    }
    if (!paymentMethod) {
      setError('Selecione uma forma de pagamento para prosseguir.');
      return;
    }

    setLoading(true);
    try {
      await registrarPagamento(restaurantId, conta.id, {
        amount: paymentAmountCents,
        paymentMethodId: paymentMethod,
        observation: observation.trim() || undefined
      }, userId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar pagamento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FinancialModal
      isOpen={isOpen}
      onClose={onClose}
      title="Registrar Pagamento"
      subtitle="Informe o valor e a forma de pagamento."
      icon={Wallet}
      iconBgColor="bg-rose-50"
      iconTextColor="text-rose-600"
      error={error}
      loading={loading}
      submitLabel="Confirmar Pagamento"
      submitVariant="rose"
      onSubmit={handleSubmit}
      submitDisabled={paymentMethods.length === 0 || loadingMethods}
    >
      <div className="space-y-4">
        {/* Account Info Card */}
        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200/80 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">Fornecedor</span>
              <h4 className="text-sm font-bold text-stone-800">{conta.supplierName}</h4>
              <p className="text-xs text-stone-500 mt-0.5">{conta.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-stone-200/60 text-xs">
            <div>
              <span className="text-stone-400 text-xs block font-bold uppercase">Total</span>
              <span className="font-bold text-stone-700">{formatCurrency(conta.totalAmount / 100)}</span>
            </div>
            <div>
              <span className="text-stone-400 text-xs block font-bold uppercase">Já Pago</span>
              <span className="font-bold text-emerald-600">{formatCurrency(conta.paidAmount / 100)}</span>
            </div>
            <div>
              <span className="text-rose-500 text-xs block font-bold uppercase">Saldo Restante</span>
              <span className="font-extrabold text-rose-600">{formatCurrency(conta.remainingAmount / 100)}</span>
            </div>
          </div>
        </div>

        {/* Currency Input for operation */}
        <CurrencyInput
          valueCents={paymentAmountCents}
          onChangeCents={setPaymentAmountCents}
          label="Valor desta operação (R$)"
          required
          disabled={loading}
          helperText="Você pode registrar um valor menor para pagamento parcial."
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
            <p className="text-rose-500 text-xs font-semibold mt-1">
              Nota: Erro ao carregar formas do servidor. Usando opções padrão.
            </p>
          )}
        </div>

        {/* Optional Observation */}
        <FormField label="Observação (Opcional)">
          <TextInput
            placeholder="Ex: Pagamento referente ao recibo nº 123"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            disabled={loading}
          />
        </FormField>
      </div>
    </FinancialModal>
  );
};

export default ContasPagarPage;
