import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Printer, Save, Loader2 } from 'lucide-react';

export default function PrintSettings() {
  const { profile } = useAuth();
  const [paperSize, setPaperSize] = useState<'48mm' | '72mm' | '112mm'>('72mm');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      if (!profile?.restaurantId) return;
      setLoading(true);
      try {
        const docRef = doc(db, 'restaurants', profile.restaurantId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPaperSize(data.defaultPaperSize || '72mm');
        }
      } catch (error) {
        console.error("Error fetching print settings:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [profile?.restaurantId]);

  const handleSave = async () => {
    if (!profile?.restaurantId) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'restaurants', profile.restaurantId);
      await updateDoc(docRef, { defaultPaperSize: paperSize });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error("Error saving print settings:", error);
      alert('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-stone-400">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-stone-800">Configurações de Impressão</h2>
        <p className="text-stone-500 text-sm">Configure o tamanho de papel padrão para suas impressões.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm space-y-6">
        <div>
          <label className="block text-sm font-bold text-stone-700 mb-4">Tamanho de Papel Padrão</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(['48mm', '72mm', '112mm'] as const).map((size) => (
              <button
                key={size}
                onClick={() => setPaperSize(size)}
                className={`p-4 rounded-2xl border-2 font-bold transition-all ${
                  paperSize === size
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-stone-200 hover:border-stone-300 text-stone-600'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto px-8 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
