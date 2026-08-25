import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { FinancialPageHeader } from './financeiro/components/FinancialPageHeader';
import { EmptyFinancialState } from './financeiro/components/EmptyFinancialState';
import { FinancialModal } from './financeiro/components/FinancialModal';
import { LoadingState } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { DataTableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/TableComponents';
import { SecondaryButton } from '../../components/ui/FormComponents';

export default function RestaurantInvoicePage() {
  const { profile } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (!profile?.restaurantId) return;
      setLoading(true);
      try {
        const q = query(collection(db, 'invoices'), where('restaurante_id', '==', profile.restaurantId));
        const snap = await getDocs(q);
        setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [profile?.restaurantId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200/80 p-8 max-w-7xl mx-auto">
        <LoadingState message="Carregando faturas do QFomeAI..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      <FinancialPageHeader 
        title="Faturas QFomeAI"
        subtitle="Acompanhamento e histórico das faturas da sua assinatura e comissões da plataforma."
      />

      {invoices.length === 0 ? (
        <EmptyFinancialState 
          title="Nenhuma fatura encontrada"
          description="Sua conta não possui faturas pendentes ou histórico registrado."
        />
      ) : (
        <DataTableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead align="center">Status</TableHead>
                <TableHead align="right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-semibold text-stone-800">
                    {new Date(inv.vencimento).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="font-bold text-stone-900">
                    R$ {inv.valor?.toFixed(2)}
                  </TableCell>
                  <TableCell align="center">
                    <Badge variant={inv.status === 'paid' ? 'success' : 'danger'}>
                      {inv.status === 'paid' ? 'Pago' : 'Pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell align="right">
                    <SecondaryButton 
                      onClick={() => setSelectedInvoice(inv)} 
                      className="text-xs py-1.5 px-3"
                    >
                      Ver Detalhes
                    </SecondaryButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableContainer>
      )}

      {selectedInvoice && (
        <FinancialModal
          isOpen={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          title="Detalhes da Fatura"
        >
          <div className="space-y-4">
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-100 space-y-2 text-sm font-medium text-stone-700">
              <div className="flex justify-between">
                <span className="text-stone-500">Vencimento:</span>
                <span className="font-semibold">{new Date(selectedInvoice.vencimento).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Valor Total:</span>
                <span className="font-bold text-stone-900">R$ {selectedInvoice.valor?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500">Status:</span>
                <Badge variant={selectedInvoice.status === 'paid' ? 'success' : 'danger'}>
                  {selectedInvoice.status === 'paid' ? 'Pago' : 'Pendente'}
                </Badge>
              </div>
            </div>

            <SecondaryButton 
              onClick={() => setSelectedInvoice(null)} 
              className="w-full justify-center"
            >
              Fechar
            </SecondaryButton>
          </div>
        </FinancialModal>
      )}
    </div>
  );
}
