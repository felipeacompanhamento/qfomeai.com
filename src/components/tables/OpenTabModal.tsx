import React, { useState, useEffect } from 'react';
import { Table, Hall } from '../../types/mesas';
import { Waiter } from '../../services/waiterService';
import { tabRepository } from '../../domain/tab/tabRepository';
import { useAuth } from '../../contexts/AuthContext';
import { 
  X, 
  Users, 
  UserCheck, 
  User, 
  FileText, 
  UtensilsCrossed, 
  AlertCircle,
  Plus,
  Minus,
  CheckCircle2
} from 'lucide-react';
import {
  Button,
  IconButton,
  TextInput,
  SelectInput,
  TextareaInput,
  FormField,
  FormLabel,
  FormError
} from '../ui';

interface OpenTabModalProps {
  isOpen: boolean;
  table: Table | null;
  hallName?: string;
  waiters?: Waiter[];
  lockedWaiterId?: string;
  lockedWaiterName?: string;
  canChangeWaiter?: boolean;
  onClose: () => void;
  onSuccess: (tabId: string) => void;
}

export function OpenTabModal({
  isOpen,
  table,
  hallName,
  waiters = [],
  lockedWaiterId,
  lockedWaiterName,
  canChangeWaiter = false,
  onClose,
  onSuccess
}: OpenTabModalProps) {
  const { user, profile } = useAuth();
  const restaurantId = profile?.restaurantId;

  // Form states
  const [peopleCount, setPeopleCount] = useState<number>(2);
  const [waiterId, setWaiterId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [observation, setObservation] = useState<string>('');

  // Status states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ peopleCount?: string }>({});

  useEffect(() => {
    if (table) {
      setPeopleCount(Math.max(1, table.capacity || 2));
      setWaiterId(lockedWaiterId || user?.uid || '');
      setCustomerName('');
      setObservation('');
      setError(null);
      setFieldErrors({});
    }
  }, [table, lockedWaiterId, user?.uid]);

  if (!isOpen || !table) return null;

  const handlePeopleChange = (val: number) => {
    const newCount = Math.max(1, val);
    setPeopleCount(newCount);
    if (newCount < 1) {
      setFieldErrors(prev => ({ ...prev, peopleCount: 'Informe ao menos 1 pessoa' }));
    } else {
      setFieldErrors(prev => ({ ...prev, peopleCount: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!table || !restaurantId || isSubmitting) return;

    // Validate people count
    if (!peopleCount || peopleCount < 1) {
      setFieldErrors({ peopleCount: 'A quantidade de pessoas deve ser no mínimo 1.' });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const openedBy = user?.uid || profile?.uid || profile?.name || 'Sistema';

    try {
      const result = await tabRepository.openTabForTable({
        restaurantId,
        tableId: table.id,
        peopleCount: Number(peopleCount),
        openedBy,
        waiterId: waiterId.trim() ? waiterId.trim() : undefined,
        customerName: customerName.trim() ? customerName.trim() : undefined,
        observation: observation.trim() ? observation.trim() : undefined
      });

      onSuccess(result.tab.id);
      onClose();
    } catch (err: any) {
      console.error('Erro ao abrir comanda:', err);
      setError(err?.message || 'Erro ao abrir a comanda. Verifique os dados e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 transition-all animate-in fade-in duration-200">
      {/* Container: Drawer style on mobile (rounded-t-3xl), Modal style on sm+ (rounded-3xl) */}
      <div 
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200 relative pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle pill for mobile drawer visual */}
        <div className="w-12 h-1.5 bg-stone-300 rounded-full mx-auto my-2 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-stone-100 bg-stone-50/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-2xl shadow-xs">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold tracking-wider text-stone-400 block">
                {hallName || 'Salão'}
              </span>
              <h3 className="text-lg font-extrabold text-stone-900">
                Abrir Comanda — {table.name}
              </h3>
            </div>
          </div>

          <IconButton
            aria-label="Fechar modal"
            onClick={onClose}
            disabled={isSubmitting}
            variant="ghost"
            size="md"
            className="text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100"
          >
            <X className="w-5 h-5" />
          </IconButton>
        </div>

        {/* Form Container with Flex-col and Overflow-hidden to support sticky footer */}
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden h-full flex-1">
          {/* Scrollable Form Body */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1 max-h-[calc(85vh-140px)]">
            {/* Global error message */}
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs sm:text-sm flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-snug font-medium">{error}</span>
              </div>
            )}

            {/* People Count Input */}
            <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-700">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-emerald-600" />
                  Quantidade de Pessoas <span className="text-red-500">*</span>
                </span>
                <span className="text-xs font-normal text-stone-400">
                  Capacidade: {table.capacity} lugares
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <IconButton
                    type="button"
                    aria-label="Diminuir quantidade"
                    onClick={() => handlePeopleChange(peopleCount - 1)}
                    disabled={peopleCount <= 1 || isSubmitting}
                    variant="secondary"
                    size="md"
                    className="w-10 h-10 border border-stone-200 bg-white"
                  >
                    <Minus className="w-4 h-4" />
                  </IconButton>

                  <TextInput
                    type="number"
                    min={1}
                    required
                    value={peopleCount}
                    onChange={(e) => handlePeopleChange(parseInt(e.target.value) || 1)}
                    disabled={isSubmitting}
                    className="w-16 h-10 text-center font-extrabold text-base bg-white border border-stone-200 rounded-xl text-stone-900 shadow-xs"
                  />

                  <IconButton
                    type="button"
                    aria-label="Aumentar quantidade"
                    onClick={() => handlePeopleChange(peopleCount + 1)}
                    disabled={isSubmitting}
                    variant="secondary"
                    size="md"
                    className="w-10 h-10 border border-stone-200 bg-white"
                  >
                    <Plus className="w-4 h-4" />
                  </IconButton>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                  {[1, 2, 4, 6, 8].map(num => (
                    <Button
                      key={num}
                      type="button"
                      onClick={() => handlePeopleChange(num)}
                      variant={peopleCount === num ? 'primary' : 'secondary'}
                      size="sm"
                      className="min-h-[36px] px-3.5"
                    >
                      {num}p
                    </Button>
                  ))}
                </div>
              </div>

              <FormError error={fieldErrors.peopleCount} />
            </div>

            {/* Waiter selection */}
            {canChangeWaiter ? (
              <FormField>
                <FormLabel className="flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-stone-500" />
                  Garçom Responsável <span className="text-stone-400 font-normal">(opcional)</span>
                </FormLabel>
                <SelectInput
                  value={waiterId}
                  onChange={(e) => setWaiterId(e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Selecione um garçom (ou deixe sem atribuição)</option>
                  {waiters.filter(w => w.status === 'ACTIVE' || !w.status).map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.email ? `(${w.email})` : ''}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            ) : (
              <div className="p-3 bg-stone-50 border border-stone-200/80 rounded-2xl flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-stone-600 font-medium">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  Garçom Responsável:
                </span>
                <span className="font-extrabold text-stone-900 bg-white px-2.5 py-1 rounded-xl border border-stone-200 shadow-2xs">
                  {lockedWaiterName || profile?.nome || profile?.name || 'Você'}
                </span>
              </div>
            )}

            {/* Customer Name (optional) */}
            <FormField>
              <FormLabel className="flex items-center gap-1.5">
                <User className="w-4 h-4 text-stone-500" />
                Nome do Cliente / Identificação <span className="text-stone-400 font-normal">(opcional)</span>
              </FormLabel>
              <TextInput
                type="text"
                placeholder="Ex: João Silva ou Família Oliveira"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            {/* Observation (optional) */}
            <FormField>
              <FormLabel className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-stone-500" />
                Observação <span className="text-stone-400 font-normal">(opcional)</span>
              </FormLabel>
              <TextareaInput
                rows={2}
                placeholder="Ex: Aniversariante, cadeira de bebê solicitada, etc."
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                disabled={isSubmitting}
                className="resize-none"
              />
            </FormField>
          </div>

          {/* Sticky Footer: Always visible at bottom of modal container */}
          <div className="sticky bottom-0 bg-white border-t border-stone-100 p-5 flex items-center justify-end gap-3 mt-auto shrink-0 z-10 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
            <Button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              variant="ghost"
              className="px-4 py-3 text-stone-600"
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              variant="primary"
              loading={isSubmitting}
              icon={<CheckCircle2 className="w-4 h-4" />}
              className="flex-1 sm:flex-initial"
            >
              Confirmar Abertura
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default OpenTabModal;
