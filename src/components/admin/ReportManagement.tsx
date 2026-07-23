import React, { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { getReports } from '../../services/reportService';
import { AlertCircle, CheckCircle } from 'lucide-react';

export default function ReportManagement() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const data = await getReports();
        setReports(data);
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  const handleResolve = async (reportId: string) => {
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: 'resolved' });
      // Update local state
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: 'resolved' } : r));
    } catch (error) {
      console.error("Error resolving report:", error);
    }
  };

  if (loading) return <div className="p-12 text-center text-stone-500">Carregando denúncias...</div>;

  return (
    <div className="p-6 bg-white rounded-3xl border border-stone-200 shadow-sm">
      <h2 className="text-2xl font-bold mb-6">Denúncias</h2>
      <div className="space-y-4">
        {reports.map(report => (
          <div key={report.id} className="p-4 border border-stone-200 rounded-2xl flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {report.status === 'pending' ? <AlertCircle className="w-5 h-5 text-orange-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
                <span className="font-bold">{report.reporterType === 'client' ? 'Cliente' : 'Restaurante'} denunciou {report.reporterType === 'client' ? 'Restaurante' : 'Cliente'}</span>
              </div>
              <p className="text-sm text-stone-600 mb-2">{report.message}</p>
              <p className="text-xs text-stone-400">Pedido: {report.orderId} • Data: {report.createdAt?.toDate().toLocaleString()}</p>
            </div>
            {report.status === 'pending' && (
              <button onClick={() => handleResolve(report.id)} className="text-emerald-600 font-bold text-sm hover:underline">Resolver</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
