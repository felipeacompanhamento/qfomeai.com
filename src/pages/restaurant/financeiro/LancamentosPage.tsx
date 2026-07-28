import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';
import { formatCurrency } from '../../../utils/currencyUtils';
import { 
  ArrowLeft, 
  Search, 
  X, 
  Calendar, 
  Filter, 
  Eye, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  MinusCircle, 
  RefreshCw, 
  Info,
  CreditCard,
  Tag,
  Hash,
  User,
  Clock,
  ShieldCheck,
  FileText,
  DollarSign
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FinancialPageHeader } from './components/FinancialPageHeader';
import { FormField, TextInput, DateInput, SelectInput, FormModal } from '../../../components/ui/FormComponents';
import { useRestaurantPaymentMethods, getPaymentMethodLabel } from '../../../services/paymentMethodsService';

export interface Movement {
  id: string;
  restaurantId?: string;
  cashRegisterId?: string;
  type: 'INCOME' | 'EXPENSE' | 'SUPPLY' | 'WITHDRAWAL' | string;
  category?: string;
  description?: string;
  origin?: string;
  amount: number; // in cents
  paymentMethodId?: string;
  paymentMethodName?: string;
  orderId?: string;
  orderSource?: string;
  accountId?: string;
  paymentId?: string;
  receiptId?: string;
  referenceMovementId?: string;
  idempotencyKey?: string;
  automatic?: boolean;
  createdAt?: string;
  createdBy?: string;
  createdByName?: string;
  observation?: string;
  [key: string]: any;
}

export const LancamentosPage: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const restaurantId = profile?.restaurantId;

  const [lancamentos, setLancamentos] = useState<Movement[]>([]);
  const [caixas, setCaixas] = useState<{ id: string; openedAt?: string; closedAt?: string; status?: string }[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterOrigin, setFilterOrigin] = useState<string>('ALL');
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>('ALL');
  const [filterCaixaId, setFilterCaixaId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Selected movement for Modal
  const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

  const fetchAllMovements = async () => {
    if (!restaurantId) return;
    setLoading(true);

    try {
      const caixasRef = collection(db, 'restaurants', restaurantId, 'caixas');
      const caixasSnap = await getDocs(caixasRef);

      const allMovements: Movement[] = [];
      const loadedCaixas: { id: string; openedAt?: string; closedAt?: string; status?: string }[] = [];

      for (const caixaDoc of caixasSnap.docs) {
        const caixaData = caixaDoc.data();
        loadedCaixas.push({ id: caixaDoc.id, ...caixaData });

        const movementsRef = collection(db, 'restaurants', restaurantId, 'caixas', caixaDoc.id, 'movimentacoes');
        const movementsSnap = await getDocs(movementsRef);

        movementsSnap.docs.forEach(movDoc => {
          allMovements.push({
            id: movDoc.id,
            cashRegisterId: caixaDoc.id,
            restaurantId,
            ...movDoc.data()
          } as Movement);
        });
      }

      // Sort by createdAt descending (newest first)
      const getTime = (dateVal: any) => {
        if (!dateVal) return 0;
        if (typeof dateVal === 'string') return new Date(dateVal).getTime() || 0;
        if (typeof dateVal?.toDate === 'function') return dateVal.toDate().getTime();
        if (typeof dateVal === 'number') return dateVal;
        return 0;
      };

      allMovements.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));

      setCaixas(loadedCaixas);
      setLancamentos(allMovements);
    } catch (err) {
      console.error('Erro ao buscar lançamentos financeiros:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllMovements();
  }, [restaurantId]);

  // Extract unique categories & origins for filters
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    lancamentos.forEach(l => {
      if (l.category) set.add(l.category);
    });
    return Array.from(set);
  }, [lancamentos]);

  const availableOrigins = useMemo(() => {
    const set = new Set<string>();
    lancamentos.forEach(l => {
      if (l.origin) set.add(l.origin);
    });
    return Array.from(set);
  }, [lancamentos]);

  // Reset all filters
  const handleClearFilters = () => {
    setStartDate('');
    setEndDate('');
    setFilterType('ALL');
    setFilterCategory('ALL');
    setFilterOrigin('ALL');
    setFilterPaymentMethod('ALL');
    setFilterCaixaId('ALL');
    setSearchTerm('');
  };

  // Filter logic
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter(item => {
      // Date filter
      if (startDate) {
        const itemTime = new Date(item.createdAt || '').getTime();
        const startTime = new Date(`${startDate}T00:00:00`).getTime();
        if (isNaN(itemTime) || itemTime < startTime) return false;
      }

      if (endDate) {
        const itemTime = new Date(item.createdAt || '').getTime();
        const endTime = new Date(`${endDate}T23:59:59`).getTime();
        if (isNaN(itemTime) || itemTime > endTime) return false;
      }

      // Type filter
      if (filterType !== 'ALL' && item.type !== filterType) return false;

      // Category filter
      if (filterCategory !== 'ALL' && item.category !== filterCategory) return false;

      // Origin filter
      if (filterOrigin !== 'ALL' && item.origin !== filterOrigin) return false;

      // Payment method filter
      if (filterPaymentMethod !== 'ALL') {
        const method = (item.paymentMethodId || '').toLowerCase();
        if (method !== filterPaymentMethod.toLowerCase()) return false;
      }

      // Caixa filter
      if (filterCaixaId !== 'ALL' && item.cashRegisterId !== filterCaixaId) return false;

      // Search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        const matchDesc = (item.description || '').toLowerCase().includes(term);
        const matchOrder = (item.orderId || '').toLowerCase().includes(term);
        const matchAccount = (item.accountId || '').toLowerCase().includes(term);
        const matchPayment = (item.paymentId || '').toLowerCase().includes(term);
        const matchReceipt = (item.receiptId || '').toLowerCase().includes(term);
        const matchRef = (item.referenceMovementId || '').toLowerCase().includes(term);
        const matchOperator = (item.createdBy || item.createdByName || '').toLowerCase().includes(term);
        const matchCategory = (item.category || '').toLowerCase().includes(term);
        const matchOrigin = (item.origin || '').toLowerCase().includes(term);

        if (!matchDesc && !matchOrder && !matchAccount && !matchPayment && !matchReceipt && !matchRef && !matchOperator && !matchCategory && !matchOrigin) {
          return false;
        }
      }

      return true;
    });
  }, [
    lancamentos,
    startDate,
    endDate,
    filterType,
    filterCategory,
    filterOrigin,
    filterPaymentMethod,
    filterCaixaId,
    searchTerm
  ]);

  // Calculations in CENTS
  const { totalEntradasCents, totalSaidasCents, totalSuprimentosCents, totalSangriasCents, saldoCents } = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let suprimentos = 0;
    let sangrias = 0;

    filteredLancamentos.forEach(l => {
      const amt = Math.round(Number(l.amount) || 0);
      if (l.type === 'INCOME') entradas += amt;
      else if (l.type === 'EXPENSE') saidas += amt;
      else if (l.type === 'SUPPLY') suprimentos += amt;
      else if (l.type === 'WITHDRAWAL') sangrias += amt;
    });

    const saldo = entradas + suprimentos - saidas - sangrias;

    return {
      totalEntradasCents: entradas,
      totalSaidasCents: saidas,
      totalSuprimentosCents: suprimentos,
      totalSangriasCents: sangrias,
      saldoCents: saldo
    };
  }, [filteredLancamentos]);

  // Helper label formatters
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800"><TrendingUp className="w-3 h-3" /> Entrada</span>;
      case 'EXPENSE':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800"><TrendingDown className="w-3 h-3" /> Saída</span>;
      case 'SUPPLY':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800"><PlusCircle className="w-3 h-3" /> Suprimento</span>;
      case 'WITHDRAWAL':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><MinusCircle className="w-3 h-3" /> Sangria</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-800">{type}</span>;
    }
  };

  const formatCategory = (cat?: string) => {
    if (!cat) return 'Geral';
    switch (cat) {
      case 'ORDER_PAYMENT': return 'Pagamento de Pedido';
      case 'ORDER_REFUND': return 'Estorno de Pedido';
      case 'SUPPLY': return 'Suprimento de Caixa';
      case 'WITHDRAWAL': return 'Sangria de Caixa';
      case 'CONTA_RECEBER': return 'Recebimento de Conta';
      case 'CONTA_PAGAR': return 'Pagamento de Conta';
      default: return cat;
    }
  };

  const formatOrigin = (orig?: string) => {
    if (!orig) return 'Indefinida';
    switch (orig) {
      case 'ORDER': return 'Pedido';
      case 'ORDER_REFUND': return 'Estorno de Pedido';
      case 'MANUAL': return 'Manual';
      case 'SANGRIA': return 'Sangria';
      case 'SUPRIMENTO': return 'Suprimento';
      case 'CONTA_RECEBER': return 'Contas a Receber';
      case 'CONTA_PAGAR': return 'Contas a Pagar';
      default: return orig;
    }
  };

  const { paymentMethods: configuredMethods } = useRestaurantPaymentMethods(restaurantId);

  const formatPaymentMethod = (pm?: string) => {
    if (!pm) return 'Não informado';
    // Check if matching configured payment method name exists
    const matchedConfig = configuredMethods.find(m => m.id.toLowerCase() === pm.toLowerCase() || m.name.toLowerCase() === pm.toLowerCase());
    if (matchedConfig) return matchedConfig.name;
    return getPaymentMethodLabel(pm);
  };

  const getReferenceLabel = (item: Movement) => {
    if (item.orderId) {
      const orderNum = item.description?.match(/#([A-Za-z0-9]+)/)?.[1] || item.orderId.slice(-6).toUpperCase();
      return `Pedido #${orderNum}`;
    }
    if (item.accountId) {
      return `Conta #${item.accountId.slice(-6).toUpperCase()}`;
    }
    if (item.paymentId) {
      return `Pagamento #${item.paymentId.slice(-6).toUpperCase()}`;
    }
    if (item.receiptId) {
      return `Recibo #${item.receiptId.slice(-6).toUpperCase()}`;
    }
    if (item.referenceMovementId) {
      return `Ref. #${item.referenceMovementId.slice(-8).toUpperCase()}`;
    }
    return item.automatic ? 'Automático' : 'Manual';
  };

  const isPositiveType = (type: string) => ['INCOME', 'SUPPLY'].includes(type);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <FinancialPageHeader 
        title="Lançamentos Financeiros"
        subtitle="Consulta unificada do histórico oficial de movimentações financeiras."
        backPath="/restaurant/financeiro"
        actionButton={{
          label: loading ? 'Atualizando...' : 'Atualizar',
          icon: RefreshCw,
          onClick: fetchAllMovements,
          variant: 'stone',
          disabled: loading
        }}
      />

      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2 font-semibold text-stone-800 text-sm">
            <Filter className="w-4 h-4 text-emerald-600" />
            Filtros de Pesquisa
          </div>
          <button
            onClick={handleClearFilters}
            className="text-xs text-rose-600 hover:text-rose-700 font-medium transition-colors"
          >
            Limpar Filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
          {/* Data Inicial */}
          <FormField label="Data Inicial">
            <DateInput
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>

          {/* Data Final */}
          <FormField label="Data Final">
            <DateInput
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </FormField>

          {/* Tipo */}
          <FormField label="Tipo">
            <SelectInput
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="ALL">Todos os Tipos</option>
              <option value="INCOME">Entrada</option>
              <option value="EXPENSE">Saída</option>
              <option value="SUPPLY">Suprimento</option>
              <option value="WITHDRAWAL">Sangria</option>
            </SelectInput>
          </FormField>

          {/* Categoria */}
          <FormField label="Categoria">
            <SelectInput
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="ALL">Todas as Categorias</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{formatCategory(cat)}</option>
              ))}
            </SelectInput>
          </FormField>

          {/* Origem */}
          <FormField label="Origem">
            <SelectInput
              value={filterOrigin}
              onChange={(e) => setFilterOrigin(e.target.value)}
            >
              <option value="ALL">Todas as Origens</option>
              {availableOrigins.map(orig => (
                <option key={orig} value={orig}>{formatOrigin(orig)}</option>
              ))}
            </SelectInput>
          </FormField>

          {/* Forma de Pagamento */}
          <FormField label="Forma de Pagamento">
            <SelectInput
              value={filterPaymentMethod}
              onChange={(e) => setFilterPaymentMethod(e.target.value)}
            >
              <option value="ALL">Todas as Formas</option>
              {configuredMethods.length > 0 ? (
                configuredMethods.map(method => (
                  <option key={method.id} value={method.id}>{method.name}</option>
                ))
              ) : (
                <>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="credito">Cartão de Crédito</option>
                  <option value="debito">Cartão de Débito</option>
                </>
              )}
            </SelectInput>
          </FormField>

          {/* Caixa */}
          <FormField label="Caixa Relacionado">
            <SelectInput
              value={filterCaixaId}
              onChange={(e) => setFilterCaixaId(e.target.value)}
            >
              <option value="ALL">Todos os Caixas</option>
              {caixas.map(cx => (
                <option key={cx.id} value={cx.id}>
                  Caixa #{cx.id.slice(-6).toUpperCase()} ({cx.status === 'OPEN' ? 'Aberto' : 'Fechado'})
                </option>
              ))}
            </SelectInput>
          </FormField>

          {/* Busca Livre */}
          <FormField label="Busca Livre">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <TextInput
                placeholder="Descrição, pedido, conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </FormField>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Total de Entradas</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-emerald-600">
            {formatCurrency(totalEntradasCents / 100)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Total de Saídas</span>
            <TrendingDown className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-rose-600">
            {formatCurrency(totalSaidasCents / 100)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Saldo do Período</span>
            <DollarSign className="w-4 h-4 text-stone-600" />
          </div>
          <p className={`text-lg sm:text-xl font-bold ${saldoCents >= 0 ? 'text-stone-900' : 'text-rose-600'}`}>
            {formatCurrency(saldoCents / 100)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-stone-500 text-xs font-medium">
            <span>Qtd. Lançamentos</span>
            <Hash className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-lg sm:text-xl font-bold text-stone-900">
            {filteredLancamentos.length}
          </p>
        </div>
      </div>

      {/* Table / List View */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-stone-500 text-sm flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Carregando lançamentos financeiros...</span>
          </div>
        ) : lancamentos.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-sm flex flex-col items-center justify-center gap-2">
            <Info className="w-8 h-8 text-stone-300" />
            <p className="font-semibold text-stone-700">Nenhum lançamento financeiro encontrado.</p>
            <p className="text-xs text-stone-500">As movimentações serão registradas à medida que ocorrerem vendas e operações de caixa.</p>
          </div>
        ) : filteredLancamentos.length === 0 ? (
          <div className="p-12 text-center text-stone-500 text-sm flex flex-col items-center justify-center gap-2">
            <Info className="w-8 h-8 text-stone-300" />
            <p className="font-semibold text-stone-700">Nenhum lançamento encontrado para os filtros selecionados.</p>
            <button onClick={handleClearFilters} className="mt-2 text-xs text-emerald-600 underline font-medium">
              Limpar Filtros
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-xs font-semibold">
                  <tr>
                    <th className="p-3.5">Data / Hora</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Categoria</th>
                    <th className="p-3.5">Descrição</th>
                    <th className="p-3.5">Origem</th>
                    <th className="p-3.5">Forma Pagto</th>
                    <th className="p-3.5 text-right">Valor</th>
                    <th className="p-3.5">Operador</th>
                    <th className="p-3.5">Caixa</th>
                    <th className="p-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {filteredLancamentos.map(item => {
                    const isPos = isPositiveType(item.type);
                    const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '-';
                    const amountCents = Math.round(Number(item.amount) || 0);

                    return (
                      <tr 
                        key={item.id} 
                        onClick={() => setSelectedMovement(item)}
                        className="hover:bg-stone-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="p-3.5 text-xs text-stone-600 whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          {getTypeBadge(item.type)}
                        </td>
                        <td className="p-3.5 text-xs font-medium text-stone-700 whitespace-nowrap">
                          {formatCategory(item.category)}
                        </td>
                        <td className="p-3.5 text-xs text-stone-900 max-w-xs truncate" title={item.description}>
                          {item.description || '-'}
                        </td>
                        <td className="p-3.5 text-xs text-stone-600 whitespace-nowrap">
                          {formatOrigin(item.origin)}
                        </td>
                        <td className="p-3.5 text-xs text-stone-600 whitespace-nowrap">
                          {formatPaymentMethod(item.paymentMethodId || item.paymentMethodName)}
                        </td>
                        <td className={`p-3.5 text-right font-bold whitespace-nowrap text-xs ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isPos ? '+' : '-'}{formatCurrency(amountCents / 100)}
                        </td>
                        <td className="p-3.5 text-xs text-stone-600 whitespace-nowrap">
                          {item.createdBy || item.createdByName || '-'}
                        </td>
                        <td className="p-3.5 text-xs text-stone-500 whitespace-nowrap">
                          #{item.cashRegisterId?.slice(-6).toUpperCase() || '-'}
                        </td>
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMovement(item);
                            }}
                            className="p-1.5 rounded-lg text-stone-400 group-hover:text-emerald-600 hover:bg-stone-100 transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="block md:hidden divide-y divide-stone-100">
              {filteredLancamentos.map(item => {
                const isPos = isPositiveType(item.type);
                const formattedDate = item.createdAt ? new Date(item.createdAt).toLocaleString('pt-BR') : '-';
                const amountCents = Math.round(Number(item.amount) || 0);

                return (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedMovement(item)}
                    className="p-4 space-y-2 hover:bg-stone-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      {getTypeBadge(item.type)}
                      <span className={`font-bold text-sm ${isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPos ? '+' : '-'}{formatCurrency(amountCents / 100)}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-stone-900">{item.description || 'Sem descrição'}</p>

                    <div className="grid grid-cols-2 gap-1 text-[11px] text-stone-500">
                      <div><span className="font-medium text-stone-700">Cat:</span> {formatCategory(item.category)}</div>
                      <div><span className="font-medium text-stone-700">Pagto:</span> {formatPaymentMethod(item.paymentMethodId)}</div>
                      <div><span className="font-medium text-stone-700">Origem:</span> {formatOrigin(item.origin)}</div>
                      <div><span className="font-medium text-stone-700">Ref:</span> {getReferenceLabel(item)}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-stone-400 border-t border-stone-100">
                      <span>{formattedDate}</span>
                      <span>Caixa #{item.cashRegisterId?.slice(-6).toUpperCase()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Details Modal */}
      <FormModal
        isOpen={!!selectedMovement}
        onClose={() => setSelectedMovement(null)}
        title="Detalhes do Lançamento"
        subtitle="Registro oficial de movimentação do caixa."
        icon={ShieldCheck}
        iconBgColor="bg-emerald-50"
        iconTextColor="text-emerald-600"
      >
        {selectedMovement && (
          <div className="space-y-6 text-sm text-stone-800 text-left">
            {/* Read only info banner */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Registro oficial imutável. Esta visualização é estritamente em modo de consulta.</span>
            </div>

            {/* Main Info Header */}
            <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getTypeBadge(selectedMovement.type)}
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{formatCategory(selectedMovement.category)}</span>
                </div>
                <p className="text-stone-900 font-bold">{selectedMovement.description || 'Lançamento sem descrição'}</p>
              </div>

              <div className="text-right">
                <p className="text-xs text-stone-500 font-medium">Valor Total</p>
                <p className={`text-xl font-bold ${isPositiveType(selectedMovement.type) ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isPositiveType(selectedMovement.type) ? '+' : '-'}{formatCurrency((Math.round(Number(selectedMovement.amount) || 0)) / 100)}
                </p>
              </div>
            </div>

            {/* Grid Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> ID do Lançamento</p>
                <p className="font-mono text-xs text-stone-800 select-all break-all">{selectedMovement.id}</p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Data e Hora</p>
                <p className="font-medium text-stone-800">
                  {selectedMovement.createdAt ? new Date(selectedMovement.createdAt).toLocaleString('pt-BR') : '-'}
                </p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Forma de Pagamento</p>
                <p className="font-medium text-stone-800">{formatPaymentMethod(selectedMovement.paymentMethodId || selectedMovement.paymentMethodName)}</p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Origem</p>
                <p className="font-medium text-stone-800">{formatOrigin(selectedMovement.origin)}</p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><User className="w-3.5 h-3.5" /> Operador / Criado por</p>
                <p className="font-medium text-stone-800">{selectedMovement.createdBy || selectedMovement.createdByName || 'Sistema'}</p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Caixa Relacionado</p>
                <p className="font-mono text-xs text-stone-800">{selectedMovement.cashRegisterId || '-'}</p>
              </div>

              {selectedMovement.orderId && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> ID do Pedido</p>
                  <p className="font-mono text-xs text-stone-800">{selectedMovement.orderId}</p>
                </div>
              )}

              {selectedMovement.orderSource && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Canal do Pedido</p>
                  <p className="font-medium text-stone-800">{selectedMovement.orderSource}</p>
                </div>
              )}

              {selectedMovement.paymentId && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> ID do Pagamento</p>
                  <p className="font-mono text-xs text-stone-800">{selectedMovement.paymentId}</p>
                </div>
              )}

              {selectedMovement.accountId && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> ID da Conta</p>
                  <p className="font-mono text-xs text-stone-800">{selectedMovement.accountId}</p>
                </div>
              )}

              {selectedMovement.receiptId && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Recibo / Comprovante</p>
                  <p className="font-mono text-xs text-stone-800">{selectedMovement.receiptId}</p>
                </div>
              )}

              {selectedMovement.referenceMovementId && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><Hash className="w-3.5 h-3.5" /> Movimentação de Referência</p>
                  <p className="font-mono text-xs text-stone-800 break-all">{selectedMovement.referenceMovementId}</p>
                </div>
              )}

              {selectedMovement.idempotencyKey && (
                <div className="p-3 border border-stone-200 rounded-xl space-y-1 sm:col-span-2">
                  <p className="text-xs text-stone-500 font-medium flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Chave de Idempotência</p>
                  <p className="font-mono text-xs text-stone-800 break-all">{selectedMovement.idempotencyKey}</p>
                </div>
              )}

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium">Lançamento Automático</p>
                <p className="font-medium text-stone-800">{selectedMovement.automatic ? 'Sim' : 'Não'}</p>
              </div>

              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium">ID do Restaurante</p>
                <p className="font-mono text-xs text-stone-800 break-all">{selectedMovement.restaurantId}</p>
              </div>
            </div>

            {selectedMovement.observation && (
              <div className="p-3 border border-stone-200 rounded-xl space-y-1">
                <p className="text-xs text-stone-500 font-medium">Observações</p>
                <p className="text-stone-800">{selectedMovement.observation}</p>
              </div>
            )}
          </div>
        )}
      </FormModal>
    </div>
  );
};
