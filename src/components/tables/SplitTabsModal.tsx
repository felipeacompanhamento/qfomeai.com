import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/utils';
import { Table, Tab, TabItem } from '../../types/mesas';
import { tabRoundService } from '../../services/tabRoundService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  X, 
  GitBranch, 
  AlertCircle,
  Plus,
  Minus,
  ArrowRight,
  Sparkles,
  RefreshCw,
  HelpCircle,
  CheckCircle2
} from 'lucide-react';
import {
  Button,
  IconButton
} from '../ui';

interface SplitTabsModalProps {
  isOpen: boolean;
  mainTab: Tab | null;
  mainTable: Table | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface MergedTableInfo {
  id: string;
  name: string;
  number: number;
  tabId: string;
  customerName: string;
}

export function SplitTabsModal({
  isOpen,
  mainTab,
  mainTable,
  onClose,
  onSuccess
}: SplitTabsModalProps) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  // List of previously merged tables stored in the main comanda
  const mergedTables: MergedTableInfo[] = Array.isArray(mainTab?.mergedTables) 
    ? mainTab!.mergedTables 
    : [];

  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  // allocation map: [itemId]: { [targetTableId]: quantity }
  const [allocation, setAllocation] = useState<{ [itemId: string]: { [tableId: string]: number } }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize allocation map when open
  useEffect(() => {
    if (isOpen && mainTab) {
      setSelectedTableIds([]);
      setAllocation({});
      setError(null);
    }
  }, [isOpen, mainTab]);

  if (!isOpen || !mainTab) return null;

  const mainItems = (mainTab.items || []).filter(item => (item.status || '').toLowerCase() !== 'cancelled');

  // Toggle selecting a table to separate
  const handleToggleTable = (tableId: string) => {
    setSelectedTableIds(prev => {
      let next: string[];
      if (prev.includes(tableId)) {
        next = prev.filter(id => id !== tableId);
        // Clear allocation for this table
        setAllocation(current => {
          const updated = { ...current };
          Object.keys(updated).forEach(itemId => {
            if (updated[itemId]) {
              const itemAlloc = { ...updated[itemId] };
              delete itemAlloc[tableId];
              updated[itemId] = itemAlloc;
            }
          });
          return updated;
        });
      } else {
        next = [...prev, tableId];
      }
      return next;
    });
  };

  // Change allocated quantity
  const handleUpdateAllocation = (itemId: string, tableId: string, delta: number, maxQty: number) => {
    setAllocation(prev => {
      const itemAlloc = prev[itemId] ? { ...prev[itemId] } : {};
      const currentVal = itemAlloc[tableId] || 0;
      
      // Calculate other allocated quantities for this item to ensure we don't exceed maxQty
      const otherAllocationsSum = Object.entries(itemAlloc)
        .filter(([tId]) => tId !== tableId)
        .reduce((sum, [_, q]) => sum + q, 0);

      const newVal = Math.max(0, Math.min(maxQty - otherAllocationsSum, currentVal + delta));
      
      if (newVal === 0) {
        delete itemAlloc[tableId];
      } else {
        itemAlloc[tableId] = newVal;
      }

      return {
        ...prev,
        [itemId]: itemAlloc
      };
    });
  };

  // Helper to get currently allocated quantity of an item to a table
  const getAllocatedQty = (itemId: string, tableId: string): number => {
    return allocation[itemId]?.[tableId] || 0;
  };

  // Helper to get total allocated quantity for an item across all selected tables
  const getItemTotalAllocated = (itemId: string): number => {
    if (!allocation[itemId]) return 0;
    return Object.values(allocation[itemId]).reduce((sum, q) => sum + q, 0);
  };

  // Validate allocation and submit
  const handleSplit = async () => {
    if (!restaurantId || isSubmitting) return;

    if (selectedTableIds.length === 0) {
      setError('Por favor, selecione pelo menos uma mesa para ser separada.');
      return;
    }

    // Build separations structure
    const separationsToSend = selectedTableIds.map(tableId => {
      const mergedInfo = mergedTables.find(mt => mt.id === tableId)!;
      const itemsForThisTable = mainItems
        .map(item => {
          const qty = getAllocatedQty(item.id, tableId);
          return { itemId: item.id, quantity: qty };
        })
        .filter(i => i.quantity > 0);

      return {
        targetTableId: tableId,
        targetTabId: mergedInfo.tabId,
        items: itemsForThisTable
      };
    });

    // Check if any of the selected tables has 0 items allocated
    const emptyTables = separationsToSend.filter(s => s.items.length === 0);
    if (emptyTables.length > 0) {
      const tableNames = emptyTables.map(s => {
        const info = mergedTables.find(mt => mt.id === s.targetTableId);
        return info ? `Mesa ${info.name}` : s.targetTableId;
      }).join(', ');
      setError(`Distribuição inválida: as seguintes mesas não possuem nenhum item alocado: ${tableNames}. Adicione pelo menos um item.`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await tabRoundService.splitTabs(
        restaurantId,
        mainTab.id,
        separationsToSend
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao separar mesas:', err);
      setError(err.message || 'Ocorreu um erro ao realizar a separação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate prospective values for preview
  const formatBrl = (cents: number) => {
    return formatCurrency(cents, true);
  };

  const mainTotalCents = mainTab.totalInCents ?? Math.round((mainTab.total || 0) * 100);

  // Total cents being moved to each table
  const tableCentsMap: { [tableId: string]: number } = {};
  selectedTableIds.forEach(tableId => {
    let tableTotal = 0;
    mainItems.forEach(item => {
      const qty = getAllocatedQty(item.id, tableId);
      const unitPriceCents = item.unitPriceCents || Math.round((item.precoUnitario || 0) * 100);
      tableTotal += unitPriceCents * qty;
    });
    tableCentsMap[tableId] = tableTotal;
  });

  const totalCentsSeparated = Object.values(tableCentsMap).reduce((sum, v) => sum + v, 0);
  const remainingMainTotalCents = Math.max(0, mainTotalCents - totalCentsSeparated);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <GitBranch className="w-5 h-5 rotate-180" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                Desfazer União / Separação de Mesas
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Principal: Mesa {mainTable?.name || 'Sem Mesa'} ({mainTab.customerName || 'Cliente principal'})
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
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 min-h-[200px]">
          
          <div className="bg-rose-50/50 border border-rose-200/50 p-4 rounded-2xl flex gap-3 text-stone-800 text-xs">
            <HelpCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-rose-950">Como realizar a separação?</p>
              <p className="mt-1 font-semibold leading-relaxed text-stone-700">
                1. Selecione abaixo quais mesas incorporadas você deseja separar desta mesa principal.<br />
                2. Distribua a quantidade de itens que devem ser retornados para cada mesa separada.<br />
                3. Confirme a separação. As mesas selecionadas retornarão ao estado <strong>OCUPADA</strong> com suas respectivas comandas e itens restabelecidos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Left Sidebar: Select tables to separate */}
            <div className="lg:col-span-4 flex flex-col gap-3">
              <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                1. Selecione as Mesas para Separar
              </h4>
              
              <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto p-1 bg-stone-50 rounded-2xl border border-stone-200">
                {mergedTables.length === 0 ? (
                  <div className="py-12 text-center text-stone-400">
                    <p className="text-xs font-bold px-4">Esta comanda não possui mesas incorporadas no seu histórico para separação.</p>
                  </div>
                ) : (
                  mergedTables.map(tbl => {
                    const isSelected = selectedTableIds.includes(tbl.id);
                    const totalAllocated = tableCentsMap[tbl.id] || 0;

                    return (
                      <button
                        key={tbl.id}
                        type="button"
                        onClick={() => handleToggleTable(tbl.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${
                          isSelected 
                            ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500 shadow-sm' 
                            : 'bg-white border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        <div className="w-full flex items-center justify-between">
                          <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-md ${
                            isSelected ? 'bg-rose-600 text-white' : 'bg-stone-100 text-stone-700'
                          }`}>
                            Mesa {tbl.name}
                          </span>
                          <span className="text-xs text-stone-400 font-bold">
                            #{tbl.tabId.slice(-5).toUpperCase()}
                          </span>
                        </div>
                        
                        <div className="text-xs font-bold text-stone-800">
                          Cliente: {tbl.customerName || 'Não identificado'}
                        </div>

                        {isSelected && (
                          <div className="mt-1 pt-1.5 border-t border-rose-200/50 flex items-center justify-between text-xs font-extrabold text-rose-800">
                            <span>Valor Alocado:</span>
                            <span>{formatBrl(totalAllocated)}</span>
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Main area: Distribute items */}
            <div className="lg:col-span-8 flex flex-col gap-3">
              <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                2. Distribua os Itens entre as Mesas Selecionadas
              </h4>

              {selectedTableIds.length === 0 ? (
                <div className="flex-1 min-h-[250px] border border-dashed border-stone-200 rounded-2xl flex flex-col items-center justify-center p-6 text-stone-400 bg-stone-50/50">
                  <GitBranch className="w-10 h-10 text-stone-300 mb-3" />
                  <p className="text-xs font-extrabold text-stone-500">Selecione uma ou mais mesas à esquerda para habilitar a distribuição.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto p-1">
                  {mainItems.map(item => {
                    const totalQty = item.quantidade;
                    const allocatedSum = getItemTotalAllocated(item.id);
                    const remainingQty = totalQty - allocatedSum;
                    const itemPriceCents = item.unitPriceCents || Math.round((item.precoUnitario || 0) * 100);

                    return (
                      <div key={item.id} className="bg-white border border-stone-200 p-4 rounded-2xl shadow-xs flex flex-col gap-3.5">
                        
                        {/* Item Details Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h5 className="text-xs font-extrabold text-stone-800">
                              {item.produtoNome || item.productName || 'Produto'}
                            </h5>
                            <span className="text-xs text-stone-400 font-bold">
                              Preço Unitário: {formatBrl(itemPriceCents)} • Total Disp: <strong className="text-stone-700 font-black">{totalQty} unid.</strong>
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs uppercase font-bold text-stone-400 block mb-0.5">Ficará na Principal</span>
                            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${
                              remainingQty > 0 ? 'bg-stone-100 text-stone-800' : 'bg-red-50 text-red-700'
                            }`}>
                              {remainingQty} unid.
                            </span>
                          </div>
                        </div>

                        {/* Table Allocation Rows */}
                        <div className="pt-2 border-t border-stone-100 flex flex-col gap-2">
                          {selectedTableIds.map(tableId => {
                            const tblInfo = mergedTables.find(mt => mt.id === tableId)!;
                            const qtyAllocated = getAllocatedQty(item.id, tableId);

                            return (
                              <div key={tableId} className="flex items-center justify-between bg-stone-50 px-3 py-2 rounded-xl border border-stone-150 text-xs">
                                <span className="font-extrabold text-stone-700">
                                  Mesa {tblInfo.name}
                                </span>

                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAllocation(item.id, tableId, -1, totalQty)}
                                    disabled={qtyAllocated <= 0}
                                    className="p-1 bg-white hover:bg-stone-150 border border-stone-200 rounded-lg text-stone-500 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  
                                  <span className="w-8 text-center font-black text-stone-900 text-sm">
                                    {qtyAllocated}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAllocation(item.id, tableId, 1, totalQty)}
                                    disabled={remainingQty <= 0}
                                    className="p-1 bg-white hover:bg-stone-150 border border-stone-200 rounded-lg text-stone-500 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-90"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Separation Preview Summary */}
          {selectedTableIds.length > 0 && (
            <div className="p-4 bg-stone-50 border border-stone-200 rounded-2xl flex flex-col gap-3.5 animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                <Sparkles className="w-4 h-4 text-rose-600" />
                <span>Simulação Financeira Após a Separação</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold text-stone-600">
                <div className="bg-white border border-stone-200 p-3 rounded-xl">
                  <span className="text-xs text-stone-400 uppercase tracking-wider block font-bold mb-1">Mesa Principal Atual</span>
                  <span className="text-sm font-extrabold text-stone-800 line-through">
                    {formatBrl(mainTotalCents)}
                  </span>
                </div>
                <div className="bg-white border border-stone-200 p-3 rounded-xl">
                  <span className="text-xs text-rose-500 uppercase tracking-wider block font-bold mb-1">Separado para outras Mesas</span>
                  <span className="text-sm font-extrabold text-rose-700">
                    {formatBrl(totalCentsSeparated)}
                  </span>
                </div>
                <div className="bg-white border border-emerald-300 p-3 rounded-xl">
                  <span className="text-xs text-emerald-600 uppercase tracking-wider block font-bold mb-1">Novo Total Principal</span>
                  <span className="text-sm font-black text-emerald-700">
                    {formatBrl(remainingMainTotalCents)}
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
            disabled={selectedTableIds.length === 0 || isSubmitting}
            onClick={handleSplit}
            variant="destructive"
            loading={isSubmitting}
            icon={<GitBranch className="w-4 h-4 rotate-180" />}
          >
            Confirmar Separação
          </Button>
        </div>

      </div>
    </div>
  );
}

export default SplitTabsModal;
