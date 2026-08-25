import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/utils';
import { Table, Tab } from '../../types/mesas';
import { tabRoundService } from '../../services/tabRoundService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  X, 
  GitMerge, 
  AlertCircle,
  Check,
  Search,
  ShoppingCart,
  User,
  HelpCircle
} from 'lucide-react';
import {
  Button,
  IconButton,
  SearchInput,
  Checkbox
} from '../ui';

interface MergeTabsModalProps {
  isOpen: boolean;
  mainTab: Tab | null;
  mainTable: Table | null;
  activeTabs: Tab[];
  tables: Table[];
  onClose: () => void;
  onSuccess: () => void;
}

export function MergeTabsModal({
  isOpen,
  mainTab,
  mainTable,
  activeTabs,
  tables,
  onClose,
  onSuccess
}: MergeTabsModalProps) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [selectedSecIds, setSelectedSecIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelectedSecIds([]);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !mainTab) return null;

  // Filter other open/compatible tabs of the same restaurant (exclude main comanda)
  const availableSecondaryTabs = activeTabs.filter(tab => {
    if (tab.id === mainTab.id) return false;
    const tabStatus = (tab.status || '').toUpperCase().trim();
    const closedStatuses = ['CLOSED', 'FECHADA', 'PAID', 'PAGA', 'CANCELLED', 'CANCELADA', 'MERGED', 'UNIFICADA'];
    return !closedStatuses.includes(tabStatus);
  });

  // Filter based on search query
  const filteredSecondaryTabs = availableSecondaryTabs.filter(tab => {
    const table = tables.find(t => t.id === tab.tableId);
    const tableName = table ? table.name.toLowerCase() : '';
    const customer = (tab.customerName || '').toLowerCase();
    const query = searchQuery.toLowerCase().trim();

    if (!query) return true;
    return tableName.includes(query) || customer.includes(query) || tab.id.toLowerCase().includes(query);
  });

  // Toggle selection
  const handleToggleTab = (tabId: string) => {
    setSelectedSecIds(prev => {
      if (prev.includes(tabId)) {
        return prev.filter(id => id !== tabId);
      } else {
        return [...prev, tabId];
      }
    });
  };

  // Submit merge
  const handleMerge = async () => {
    if (!restaurantId || isSubmitting) return;

    if (selectedSecIds.length === 0) {
      setError('Selecione pelo menos uma comanda para unificar.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await tabRoundService.mergeTabs(
        restaurantId,
        mainTab.id,
        selectedSecIds
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao unificar comandas:', err);
      setError(err.message || 'Ocorreu um erro ao realizar a unificação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate prospective values
  const mainTotalCents = mainTab.totalInCents ?? Math.round((mainTab.total || 0) * 100);
  
  const selectedTabs = activeTabs.filter(t => selectedSecIds.includes(t.id));
  const secondaryTotalCents = selectedTabs.reduce((acc, curr) => {
    const total = curr.totalInCents ?? Math.round((curr.total || 0) * 100);
    return acc + total;
  }, 0);

  const finalTotalCents = mainTotalCents + secondaryTotalCents;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                União de Mesas e Comandas
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Principal: Mesa {mainTable?.name || 'Sem Mesa'} ({mainTab.customerName || 'Cliente sem nome'})
              </p>
            </div>
          </div>
          <IconButton
            aria-label="Fechar modal"
            onClick={onClose}
            variant="ghost"
            size="md"
            className="text-stone-400 hover:text-stone-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-5 min-h-[200px]">
          
          <div className="bg-amber-50 border border-amber-200/60 p-4 rounded-2xl flex gap-3 text-amber-800 text-xs">
            <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold">Como funciona a união?</p>
              <p className="mt-1 font-semibold leading-relaxed text-amber-700">
                Todos os itens e pedidos das comandas selecionadas serão movidos para a <strong>Comanda Principal</strong>. 
                As comandas secundárias serão fechadas como incorporadas e as respectivas mesas serão liberadas (ficarão livres/disponíveis). 
                Não há alteração de estoque nem geração de faturamento.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                Selecione as comandas que serão incorporadas
              </h4>
              <span className="text-xs font-bold text-stone-400">
                {selectedSecIds.length} selecionada(s)
              </span>
            </div>

            {/* Search filter */}
            <div className="relative">
              <SearchInput
                placeholder="Buscar comanda secundária por nome do cliente ou número da mesa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-stone-50 border-stone-200 text-xs"
              />
            </div>

            {/* List container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto p-1 bg-stone-50 rounded-2xl border border-stone-150">
              {availableSecondaryTabs.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-stone-400">
                   <p className="text-xs font-bold">Nenhuma outra comanda aberta disponível para união.</p>
                </div>
              ) : filteredSecondaryTabs.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-stone-400">
                  <p className="text-xs font-bold">Nenhuma comanda corresponde aos termos da busca.</p>
                </div>
              ) : (
                filteredSecondaryTabs.map(tab => {
                  const isSelected = selectedSecIds.includes(tab.id);
                  const table = tables.find(t => t.id === tab.tableId);
                  const totalFormatted = formatCurrency(tab.totalInCents || 0, true);
                  const itemsCount = (tab.items || []).filter(i => (i.status || '').toLowerCase() !== 'cancelled').length;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleToggleTab(tab.id)}
                      className={`text-left p-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500 shadow-sm' 
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="min-w-0 flex items-start gap-2.5">
                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                          isSelected 
                            ? 'bg-rose-600 border-rose-600 text-white' 
                            : 'border-stone-300'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-xs font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                              isSelected ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-700'
                            }`}>
                              {table ? `Mesa ${table.name}` : 'Sem Mesa'}
                            </span>
                            <span className="text-xs text-stone-400 font-bold">
                              #{tab.id.slice(-5).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1 text-xs font-extrabold text-stone-800">
                            <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span className="truncate">{tab.customerName || 'Cliente sem identificação'}</span>
                          </div>
                          <span className="text-xs font-bold text-stone-400 mt-1 block">
                            {itemsCount} {itemsCount === 1 ? 'item ativo' : 'itens ativos'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Total</p>
                        <p className="text-xs font-extrabold text-stone-800">{totalFormatted}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Prospective Summary (Visible only when secondary tabs are selected) */}
          {selectedSecIds.length > 0 && (
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                <ShoppingCart className="w-4 h-4 text-rose-600" />
                <span>Resumo Financeiro da União</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold text-stone-600">
                <div className="bg-white border border-stone-200 p-3 rounded-xl">
                  <span className="text-xs text-stone-400 uppercase tracking-wider block font-bold mb-1">Comanda Principal</span>
                  <span className="text-sm font-extrabold text-stone-800">
                    {formatCurrency(mainTotalCents, true)}
                  </span>
                </div>
                <div className="bg-white border border-stone-200 p-3 rounded-xl">
                  <span className="text-xs text-stone-400 uppercase tracking-wider block font-bold mb-1">Incorporando (+{selectedSecIds.length})</span>
                  <span className="text-sm font-extrabold text-rose-700">
                    {formatCurrency(secondaryTotalCents, true)}
                  </span>
                </div>
                <div className="bg-white border border-rose-300 p-3 rounded-xl">
                  <span className="text-xs text-rose-500 uppercase tracking-wider block font-bold mb-1">Novo Total Consolidado</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatCurrency(finalTotalCents, true)}
                  </span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Global Error Card */}
        {error && (
          <div className="mx-6 mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-4.5 border-t border-stone-100 flex items-center justify-end gap-2 bg-stone-50">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            variant="secondary"
          >
            Cancelar
          </Button>
          
          <Button
            type="button"
            disabled={selectedSecIds.length === 0 || isSubmitting}
            onClick={handleMerge}
            variant="destructive"
            loading={isSubmitting}
            icon={<GitMerge className="w-4 h-4" />}
          >
            Confirmar União de Mesas
          </Button>
        </div>

      </div>
    </div>
  );
}

export default MergeTabsModal;
