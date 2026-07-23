import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import ConsentCheckbox from '../components/ConsentCheckbox';

export default function Consent() {
  const { user, profile, refreshUser } = useAuth();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleAccept = async () => {
    if (!checked) {
      setError('Você precisa aceitar os termos para continuar.');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        lgpdAccepted: true,
        acceptedAt: serverTimestamp(),
        termsVersion: "1.0"
      });
      
      localStorage.setItem('lgpdAccepted', 'true');
      
      await refreshUser();
      
      setTimeout(() => {
        navigate('/');
      }, 300);
    } catch (err) {
      console.error(err);
      setError('Erro ao salvar consentimento.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-stone-200 p-8 space-y-6">
        <h1 className="text-2xl font-bold text-stone-800">Termos de Uso e Privacidade</h1>
        <p className="text-stone-600 text-sm">
          Para continuar utilizando o Qfomeai, por favor, leia e aceite nossos Termos de Uso e Política de Privacidade.
        </p>
        
        <ConsentCheckbox checked={checked} onChange={setChecked} error={error} />
        
        <button
          onClick={handleAccept}
          disabled={loading || !checked}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Aceitar e Continuar'}
        </button>
      </div>
    </div>
  );
}
