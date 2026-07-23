import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { DollarSign, Edit3, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function FinancePage() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [newValue, setNewValue] = useState<number>(0);

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'invoices'));
        setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error('Error fetching invoices:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, []);

  useEffect(() => {
    if (editingInvoice) {
      setNewValue(editingInvoice.valor || 0);
    }
  }, [editingInvoice]);

  const handleUpdateInvoice = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'invoices', id), updates);
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, ...updates } : inv));
      setEditingInvoice(null);
    } catch (error) {
      console.error('Error updating invoice:', error);
      alert('Erro ao atualizar fatura.');
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (window.confirm('Tem certeza que deseja apagar esta fatura?')) {
      try {
        await deleteDoc(doc(db, 'invoices', id));
        setInvoices(prev => prev.filter(inv => inv.id !== id));
      } catch (error) {
        console.error('Error deleting invoice:', error);
        alert('Erro ao apagar fatura.');
      }
    }
  };

  const filteredInvoices = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    return invoices.filter(inv => {
      const dueDate = new Date(inv.vencimento);
      dueDate.setHours(0, 0, 0, 0);

      if (filter === 'overdue') return dueDate < now && inv.status !== 'paid';
      if (filter === 'today') return dueDate.getTime() === now.getTime();
      if (filter === 'upcoming') return dueDate > now;
      return true;
    });
  }, [invoices, filter]);

  const generateMonthlyInvoices = async () => {
    setLoading(true);
    try {
      const restaurantsSnap = await getDocs(collection(db, 'restaurants'));
      
      for (const restDoc of restaurantsSnap.docs) {
        const contractSnap = await getDoc(doc(db, 'restaurants', restDoc.id, 'contract', 'details'));
        if (contractSnap.exists()) {
          const contract = contractSnap.data();
          if (contract.ativo) {
            const invoiceId = `${restDoc.id}_${new Date().getFullYear()}_${new Date().getMonth() + 1}`;
            await setDoc(doc(db, 'invoices', invoiceId), {
              restaurante_id: restDoc.id,
              restaurante_nome: restDoc.data().nome,
              valor: contract.mensalidade,
              vencimento: new Date(new Date().getFullYear(), new Date().getMonth(), contract.vencimentoDia).toISOString(),
              status: 'pending',
              data_criacao: new Date().toISOString()
            }, { merge: true });
          }
        }
      }
      alert('Faturas geradas com sucesso!');
      const snap = await getDocs(collection(db, 'invoices'));
      setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Error generating invoices:', error);
      alert('Erro ao gerar faturas.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-stone-800">Financeiro</h1>
        <button 
          onClick={generateMonthlyInvoices}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700"
        >
          Gerar Faturas do Mês
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'overdue', 'today', 'upcoming'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl font-bold ${filter === f ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'}`}
          >
            {f === 'all' ? 'Todos' : f === 'overdue' ? 'Vencidos' : f === 'today' ? 'Vence Hoje' : 'A Vencer'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="p-4">Restaurante</th>
                <th className="p-4">Valor</th>
                <th className="p-4">Vencimento</th>
                <th className="p-4">Status</th>
                <th className="p-4">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id} className="border-b border-stone-100">
                  <td className="p-4 font-bold">{inv.restaurante_nome}</td>
                  <td className="p-4">R$ {inv.valor?.toFixed(2)}</td>
                  <td className="p-4">{new Date(inv.vencimento).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                      {inv.status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="p-4 flex gap-2">
                    <button onClick={() => setEditingInvoice(inv)} className="text-stone-400 hover:text-emerald-600">
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDeleteInvoice(inv.id)} className="text-stone-400 hover:text-red-600">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingInvoice && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-stone-800 mb-4">Editar Fatura</h3>
            <p className="text-stone-600 mb-4">Restaurante: {editingInvoice.restaurante_nome}</p>
            
            <div className="mb-6">
              <label className="block text-sm font-bold text-stone-600 mb-1">Valor (R$)</label>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(parseFloat(e.target.value) || 0)}
                className="w-full p-3 border border-stone-300 rounded-xl focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-3 mb-4">
              <button onClick={() => handleUpdateInvoice(editingInvoice.id, { status: 'paid', valor: newValue })} className="flex-1 bg-emerald-100 text-emerald-600 py-3 rounded-xl font-bold hover:bg-emerald-200">Marcar Pago</button>
              <button onClick={() => handleUpdateInvoice(editingInvoice.id, { status: 'pending', valor: newValue })} className="flex-1 bg-red-100 text-red-600 py-3 rounded-xl font-bold hover:bg-red-200">Pendente</button>
            </div>
            <button onClick={() => setEditingInvoice(null)} className="w-full text-stone-500 font-bold">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
