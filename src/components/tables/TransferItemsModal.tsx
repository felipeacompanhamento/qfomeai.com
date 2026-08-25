import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/utils';
import { Table, Tab, TabItem } from '../../types/mesas';
import { tabRoundService } from '../../services/tabRoundService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  X, 
  ArrowRightLeft, 
  Plus, 
  Minus, 
  Check, 
  Search, 
  ShoppingCart, 
  User, 
  Hash,
  AlertCircle
} from 'lucide-react';
import {
  Button,
  IconButton,
  SearchInput,
  TextInput
} from '../ui';

interface TransferItemsModalProps {
  isOpen: boolean;
  sourceTab: Tab | null;
  sourceTable: Table | null;
  activeTabs: Tab[];
  tables: Table[];
  onClose: () => void;
  onSuccess: () => void;
}

interface TransferItemSelection {
  itemId: string;
  quantity: number;
  item: TabItem;
}

export function TransferItemsModal({
  isOpen,
  sourceTab,
  sourceTable,
  activeTabs,
  tables,
  onClose,
  onSuccess
}: TransferItemsModalProps) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [selectedItems, setSelectedItems] = useState<Record<string, TransferItemSelection>>({});
  const [selectedTargetTabId, setSelectedTargetTabId] = useState<string>('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedItems({});
      setSelectedTargetTabId('');
      setTargetSearchQuery('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen || !sourceTab) return null;

  // Filter out cancelled items from source tab
  const transferableItems = (sourceTab.items || []).filter(item => {
    const status = (item.status || '').toLowerCase();
    return status !== 'cancelled' && status !== 'cancelado';
  });

  // Filter other active/open tabs of the same restaurant (exclude source comanda)
  const availableTargetTabs = activeTabs.filter(tab => {
    if (tab.id === sourceTab.id) return false;
    const tabStatus = (tab.status || '').toUpperCase().trim();
    const closedStatuses = ['CLOSED', 'FECHADA', 'PAID', 'PAGA', 'CANCELLED', 'CANCELADA', 'MERGED', 'UNIFICADA'];
    return !closedStatuses.includes(tabStatus);
  });

  // Target tabs filtered by search query (customer name or table number)
  const filteredTargetTabs = availableTargetTabs.filter(tab => {
    const table = tables.find(t => t.id === tab.tableId);
    const tableName = table ? table.name.toLowerCase() : '';
    const customer = (tab.customerName || '').toLowerCase();
    const query = targetSearchQuery.toLowerCase().trim();

    if (!query) return true;
    return tableName.includes(query) || customer.includes(query) || tab.id.toLowerCase().includes(query);
  });

  // Toggle item selection
  const handleToggleItem = (item: TabItem) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          itemId: item.id,
          quantity: 1, // Start with 1
          item
        };
      }
      return next;
    });
  };

  // Adjust quantity
  const handleUpdateQuantity = (itemId: string, delta: number, maxQty: number) => {
    setSelectedItems(prev => {
      const selection = prev[itemId];
      if (!selection) return prev;

      const newQty = selection.quantity + delta;
      if (newQty <= 0 || newQty > maxQty) return prev;

      return {
        ...prev,
        [itemId]: {
          ...selection,
          quantity: newQty
        }
      };
    });
  };

  // Submit transfer
  const handleTransfer = async () => {
    if (!restaurantId || isSubmitting) return;

    if (Object.keys(selectedItems).length === 0) {
      setError('Selecione pelo menos um item para transferir.');
      return;
    }

    if (!selectedTargetTabId) {
      setError('Selecione uma comanda de destino.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const itemsPayload = Object.values(selectedItems).map(sel => ({
        itemId: sel.itemId,
        quantity: sel.quantity
      }));

      await tabRoundService.transferItems(
        restaurantId,
        sourceTab.id,
        selectedTargetTabId,
        itemsPayload
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao transferir itens:', err);
      setError(err.message || 'Ocorreu um erro ao realizar a transferência de itens.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedItemsList = Object.values(selectedItems);
  const totalTransferPriceCents = selectedItemsList.reduce((acc, curr) => {
    const unitPrice = curr.item.unitPriceCents || Math.round((curr.item.precoUnitario || 0) * 100);
    return acc + (unitPrice * curr.quantity);
  }, 0);

  // Selected target tab info for summary
  const selectedTargetTab = activeTabs.find(t => t.id === selectedTargetTabId);
  const selectedTargetTable = selectedTargetTab ? tables.find(t => t.id === selectedTargetTab.tableId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                Transferência de Itens entre Comandas
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Origem: Mesa {sourceTable?.name || 'Sem Mesa'} ({sourceTab.customerName || 'Sem nome'})
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

        {/* Content Body: Split into 2 columns on medium screens */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 min-h-[200px]">
          
          {/* Column 1: Item Selection */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                1. Selecione os Itens
              </h4>
              <span className="text-xs font-bold text-stone-400">
                {transferableItems.length} itens disponíveis
              </span>
            </div>

            <div className="flex-1 overflow-y-auto border border-stone-150 rounded-2xl p-2 bg-stone-50/50 max-h-[350px] space-y-1.5">
              {transferableItems.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <p className="text-xs font-bold">Nenhum item disponível para transferência.</p>
                </div>
              ) : (
                transferableItems.map(item => {
                  const isSelected = !!selectedItems[item.id];
                  const selection = selectedItems[item.id];
                  const maxQty = item.quantidade || 1;
                  const unitPrice = item.precoUnitario || 0;

                  return (
                    <div 
                      key={item.id}
                      className={`p-3 rounded-xl border transition-all flex flex-col gap-2 ${
                        isSelected 
                          ? 'bg-white border-rose-300 shadow-xs' 
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleItem(item)}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                            isSelected 
                              ? 'bg-rose-600 border-rose-600 text-white' 
                              : 'border-stone-300 hover:border-stone-400'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>

                        <div className="flex-1 min-w-0" onClick={() => handleToggleItem(item)}>
                          <p className="text-xs font-extrabold text-stone-800 truncate">
                            {item.produtoNome}
                          </p>
                          <p className="text-xs font-bold text-stone-500 mt-0.5">
                            {formatCurrency(unitPrice)}
                            {item.pedidosAdicionais?.size && ` • Tam: ${item.pedidosAdicionais.size}`}
                          </p>
                        </div>
                      </div>

                      {/* Quantity Selector if selected & maxQty > 1 */}
                      {isSelected && (
                        <div className="flex items-center justify-between pt-2 border-t border-stone-100 bg-stone-50/50 -mx-3 -mb-3 p-2.5 rounded-b-xl">
                          <span className="text-xs font-bold text-stone-500 uppercase tracking-wider pl-1">
                            Quantidade a transferir:
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={selection.quantity <= 1}
                              onClick={() => handleUpdateQuantity(item.id, -1, maxQty)}
                              className="p-1 rounded-md bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-extrabold text-stone-850 px-2 min-w-[20px] text-center">
                              {selection.quantity} / {maxQty}
                            </span>
                            <button
                              type="button"
                              disabled={selection.quantity >= maxQty}
                              onClick={() => handleUpdateQuantity(item.id, 1, maxQty)}
                              className="p-1 rounded-md bg-white border border-stone-200 text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Column 2: Destination Comanda Choice */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-stone-700 uppercase tracking-wider">
                2. Selecione a Comanda de Destino
              </h4>
            </div>

            <div className="relative">
              <SearchInput
                placeholder="Buscar comanda ou mesa..."
                value={targetSearchQuery}
                onChange={(e) => setTargetSearchQuery(e.target.value)}
                className="bg-stone-50 border-stone-200 text-xs"
              />
            </div>

            <div className="flex-1 overflow-y-auto border border-stone-150 rounded-2xl p-2 bg-stone-50/50 max-h-[295px] space-y-1.5">
              {availableTargetTabs.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <p className="text-xs font-bold">Nenhuma outra comanda aberta disponível.</p>
                </div>
              ) : filteredTargetTabs.length === 0 ? (
                <div className="py-12 text-center text-stone-400">
                  <p className="text-xs font-bold">Nenhuma comanda corresponde à busca.</p>
                </div>
              ) : (
                filteredTargetTabs.map(tab => {
                  const isSelected = selectedTargetTabId === tab.id;
                  const table = tables.find(t => t.id === tab.tableId);
                  const totalFormatted = formatCurrency(tab.totalInCents || 0, true);

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedTargetTabId(tab.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500' 
                          : 'bg-white border-stone-200 hover:border-stone-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-rose-100 text-rose-800' : 'bg-stone-150 text-stone-700'
                          }`}>
                            {table ? `Mesa ${table.name}` : 'Sem Mesa'}
                          </span>
                          <span className="text-xs text-stone-400 font-bold">
                            #{tab.id.slice(-5).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs font-extrabold text-stone-800">
                          <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span className="truncate">{tab.customerName || 'Cliente não identificado'}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-wider">Consumo</p>
                        <p className="text-xs font-extrabold text-stone-700">{totalFormatted}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="mx-6 mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Summary before confirmation (Only visible when items and target are selected) */}
        {selectedItemsList.length > 0 && selectedTargetTabId && (
          <div className="px-6 py-4.5 border-t border-stone-100 bg-stone-50 flex flex-col gap-3 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-700 uppercase tracking-wider">
              <ShoppingCart className="w-4 h-4 text-rose-600" />
              <span>Resumo da Transferência</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-stone-250 p-4 rounded-2xl shadow-xs">
              
              {/* Items to transfer */}
              <div>
                <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Itens sendo movidos:</span>
                <div className="space-y-1.5 mt-1.5 max-h-[85px] overflow-y-auto">
                  {selectedItemsList.map(sel => {
                    const price = sel.item.precoUnitario || 0;
                    return (
                      <div key={sel.itemId} className="flex justify-between items-center text-xs">
                        <span className="font-extrabold text-stone-700 truncate max-w-[180px]">
                          {sel.quantity}x {sel.item.produtoNome}
                        </span>
                        <span className="font-semibold text-stone-500">
                          {formatCurrency(price * sel.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Transfer path summary */}
              <div className="flex flex-col justify-center border-t md:border-t-0 md:border-l border-stone-150 pt-3 md:pt-0 md:pl-4">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-stone-500">Origem:</span>
                  <span className="font-extrabold text-stone-800">
                    Mesa {sourceTable?.name || 'Sem Mesa'} ({sourceTab.customerName || 'N/A'})
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs mt-1.5">
                  <span className="font-bold text-stone-500">Destino:</span>
                  <span className="font-extrabold text-rose-700">
                    Mesa {selectedTargetTable?.name || 'Sem Mesa'} ({selectedTargetTab.customerName || 'N/A'})
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs mt-3 pt-2 border-t border-stone-100">
                  <span className="font-bold text-stone-500">Total Transferido:</span>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    {formatCurrency(totalTransferPriceCents, true)}
                  </span>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Footer actions */}
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
            disabled={selectedItemsList.length === 0 || !selectedTargetTabId || isSubmitting}
            onClick={handleTransfer}
            variant="destructive"
            loading={isSubmitting}
            icon={<ArrowRightLeft className="w-4 h-4" />}
          >
            Confirmar Transferência
          </Button>
        </div>

      </div>
    </div>
  );
}

export default TransferItemsModal;
