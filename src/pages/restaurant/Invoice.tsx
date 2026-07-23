import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { DollarSign, Clock, FileText } from 'lucide-react';

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

  if (loading) return <div className="p-8 text-center text-stone-500">Carregando faturas...</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-stone-800">Minhas Faturas</h1>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-stone-50 border-b border-stone-200">
              <th className="p-4">Vencimento</th>
              <th className="p-4">Valor</th>
              <th className="p-4">Status</th>
              <th className="p-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} className="border-b border-stone-100">
                <td className="p-4">{new Date(inv.vencimento).toLocaleDateString()}</td>
                <td className="p-4 font-bold">R$ {inv.valor?.toFixed(2)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                    {inv.status === 'paid' ? 'Pago' : 'Pendente'}
                  </span>
                </td>
                <td className="p-4">
                  <button onClick={() => setSelectedInvoice(inv)} className="text-emerald-600 font-bold text-sm">
                    Ver Detalhes
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedInvoice && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-stone-800 mb-4">Detalhes da Fatura</h3>
            <p className="text-stone-600 mb-2">Vencimento: {new Date(selectedInvoice.vencimento).toLocaleDateString()}</p>
            <p className="text-stone-600 mb-2">Valor: R$ {selectedInvoice.valor?.toFixed(2)}</p>
            <p className="text-stone-600 mb-6">Status: {selectedInvoice.status === 'paid' ? 'Pago' : 'Pendente'}</p>
            <button onClick={() => setSelectedInvoice(null)} className="w-full bg-stone-100 text-stone-800 py-3 rounded-xl font-bold hover:bg-stone-200">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
