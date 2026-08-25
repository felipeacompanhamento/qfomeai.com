import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../lib/utils';
import { Table, Hall, Tab } from '../../types/mesas';
import { tabRoundService } from '../../services/tabRoundService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  X, 
  ArrowRightLeft, 
  AlertCircle,
  CheckCircle2,
  MapPin,
  Utensils
} from 'lucide-react';
import {
  Button,
  IconButton,
  SearchInput,
  FormLabel
} from '../ui';

interface TransferTableModalProps {
  isOpen: boolean;
  sourceTable: Table | null;
  sourceTab: Tab | null;
  tables: Table[];
  halls: Hall[];
  onClose: () => void;
  onSuccess: () => void;
}

export function TransferTableModal({
  isOpen,
  sourceTable,
  sourceTab,
  tables,
  halls,
  onClose,
  onSuccess
}: TransferTableModalProps) {
  const { profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  const [selectedTargetTable, setSelectedTargetTable] = useState<Table | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setSelectedTargetTable(null);
      setError(null);
      setSearchQuery('');
    }
  }, [isOpen]);

  if (!isOpen || !sourceTable || !sourceTab) return null;

  // Filter available tables (status is AVAILABLE/livre, not active/occupied by another comanda, and not the source table itself)
  const availableTables = tables.filter(t => {
    // Exclude current table
    if (t.id === sourceTable.id) return false;
    
    // Status must be AVAILABLE or livre
    const isAvail = t.status === 'AVAILABLE' || t.status === ('livre' as any);
    return isAvail;
  });

  // Filter based on search query
  const filteredTables = availableTables.filter(t => {
    if (!searchQuery.trim()) return true;
    const hall = halls.find(h => h.id === t.hallId);
    const tableMatch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    const hallMatch = hall?.name.toLowerCase().includes(searchQuery.toLowerCase());
    return tableMatch || hallMatch;
  });

  // Group by Hall
  const tablesByHall = halls.reduce<Record<string, { hall: Hall; tables: Table[] }>>((acc, hall) => {
    const hallTables = filteredTables.filter(t => t.hallId === hall.id);
    if (hallTables.length > 0) {
      acc[hall.id] = { hall, tables: hallTables };
    }
    return acc;
  }, {});

  // For tables with no hall or hall not found
  const noHallTables = filteredTables.filter(t => !t.hallId || !halls.some(h => h.id === t.hallId));
  if (noHallTables.length > 0) {
    tablesByHall['no-hall'] = {
      hall: { id: 'no-hall', restaurantId: restaurantId || '', name: 'Sem Salão', description: '', sortOrder: 999, active: true, createdAt: null, updatedAt: null },
      tables: noHallTables
    };
  }

  const handleTransfer = async () => {
    if (!restaurantId || !selectedTargetTable || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await tabRoundService.transferTable(restaurantId, sourceTab.id, selectedTargetTable.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao transferir mesa:', err);
      setError(err.message || 'Ocorreu um erro ao realizar a transferência de mesa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-stone-200 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">
                Transferir Comanda
              </h3>
              <p className="text-xs font-semibold text-stone-500">
                Mesa {sourceTable.name} &rarr; Nova Mesa
              </p>
            </div>
          </div>
          <IconButton
            aria-label="Fechar modal"
            onClick={onClose}
            variant="ghost"
            size="md"
            className="text-stone-400 hover:text-stone-600 rounded-full animate-none"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Info card of what is being transferred */}
        <div className="mx-6 mt-5 p-4 bg-stone-50 border border-stone-150 rounded-2xl flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-stone-500">Comanda Atual:</span>
            <span className="font-extrabold text-stone-800">#{sourceTab.id.slice(-6).toUpperCase()}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-stone-500">Cliente / Identificação:</span>
            <span className="font-extrabold text-stone-800">{sourceTab.customerName || 'Não informado'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-stone-500">Consumo Parcial:</span>
            <span className="font-extrabold text-emerald-700 text-sm">
              {formatCurrency(sourceTab.totalInCents, true)}
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2">
          <FormLabel className="block mb-1.5">
            Selecione a Mesa de Destino
          </FormLabel>
          <SearchInput
            placeholder="Buscar por número da mesa ou salão..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-stone-50 border-stone-200"
          />
        </div>

        {/* Content list */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2 min-h-[150px]">
          {error && (
            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-xs font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {availableTables.length === 0 ? (
            <div className="py-12 text-center">
              <Utensils className="w-10 h-10 text-stone-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-stone-500">Não há outras mesas disponíveis no momento.</p>
              <p className="text-xs text-stone-400 mt-1">Libere ou finalize o atendimento de outras mesas primeiro.</p>
            </div>
          ) : filteredTables.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-xs font-bold text-stone-500">Nenhuma mesa disponível corresponde à sua busca.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {Object.values(tablesByHall).map(({ hall, tables: hallTables }) => (
                <div key={hall.id} className="space-y-2">
                  <div className="flex items-center gap-1 text-xs font-extrabold text-stone-400 uppercase tracking-wider">
                    <MapPin className="w-3 h-3" />
                    <span>{hall.name}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {hallTables.map(t => {
                      const isSelected = selectedTargetTable?.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTargetTable(t)}
                          className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 group relative overflow-hidden min-h-[75px] ${
                            isSelected 
                              ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500 text-rose-700 font-extrabold' 
                              : 'bg-white border-stone-200 hover:border-stone-400 text-stone-800 font-bold hover:bg-stone-50'
                          }`}
                        >
                          <span className="text-sm tracking-tight">
                            Mesa {t.name}
                          </span>
                          <span className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-rose-100 text-rose-800' : 'bg-stone-150 text-stone-600'
                          }`}>
                            Cap: {t.capacity || t.capacity === 0 ? t.capacity : 4}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selection Confirmation panel */}
        {selectedTargetTable && (
          <div className="px-6 py-4 border-t border-stone-100 bg-rose-50/40 flex flex-col gap-2">
            <p className="text-xs text-rose-800 font-semibold text-center">
              Você está prestes a transferir a comanda da <strong>Mesa {sourceTable.name}</strong> para a <strong>Mesa {selectedTargetTable.name}</strong>.
            </p>
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
            disabled={!selectedTargetTable || isSubmitting}
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

export default TransferTableModal;
