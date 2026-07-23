import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { restaurantService } from '../../services/restaurantService';
import { CreditCard, Banknote, Smartphone, Wallet, Save, Loader2 } from 'lucide-react';

interface PaymentMethodConfig {
  entrega: boolean;
  retirada: boolean;
}

interface PaymentMethods {
  dinheiro: PaymentMethodConfig;
  pix: PaymentMethodConfig;
  credito: PaymentMethodConfig;
  debito: PaymentMethodConfig;
}

const defaultMethods: PaymentMethods = {
  dinheiro: { entrega: false, retirada: false },
  pix: { entrega: false, retirada: false },
  credito: { entrega: false, retirada: false },
  debito: { entrega: false, retirada: false }
};

export default function RestaurantPayments() {
  const { profile } = useAuth();
  const [methods, setMethods] = useState<PaymentMethods>(defaultMethods);
  const [chavePix, setChavePix] = useState('');
  const [pixDisplayType, setPixDisplayType] = useState<'chave' | 'qrcode' | 'mercadopago'>('chave');
  const [mercadopagoEnabled, setMercadopagoEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    const loadPayments = async () => {
      if (!profile?.uid) return;
      try {
        const rid = profile.restaurantId || (await restaurantService.getRestaurantByOwnerId(profile.uid))?.id;
        if (!rid) {
          setLoading(false);
          return;
        }
        
        const docRef = doc(db, 'restaurants', rid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.formas_pagamento) {
            setMethods({ ...defaultMethods, ...data.formas_pagamento });
          }
          if (data.chave_pix) {
            setChavePix(data.chave_pix);
          }
          if (data.pix_display_type) {
            setPixDisplayType(data.pix_display_type as any);
          }
          setMercadopagoEnabled(data.mercadopago_enabled || false);
        }
      } catch (error) {
        console.error("Error loading payment methods:", error);
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [profile?.uid, profile?.restaurantId]);

  const handleToggle = (method: keyof PaymentMethods, type: 'entrega' | 'retirada') => {
    setMethods(prev => ({
      ...prev,
      [method]: {
        ...prev[method],
        [type]: !prev[method][type]
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Validation for PIX
      if (methods.pix.entrega || methods.pix.retirada) {
        if (!chavePix.trim()) {
          setMessage({ type: 'error', text: 'A Chave PIX é obrigatória quando o pagamento via PIX está ativado.' });
          setSaving(false);
          return;
        }

        // Validate PIX key type (CPF, CNPJ, Email, Phone)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const cpfRegex = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
        const cnpjRegex = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;
        const phoneRegex = /^(\(?\d{2}\)?\s?)?9\d{4}-?\d{4}$|^\d{11}$/; // Mobile format

        const isValidKey = emailRegex.test(chavePix) || 
                          cpfRegex.test(chavePix) || 
                          cnpjRegex.test(chavePix) || 
                          phoneRegex.test(chavePix);

        if (!isValidKey) {
          setMessage({ 
            type: 'error', 
            text: 'A Chave PIX deve ser um formato válido de Celular, E-mail, CPF ou CNPJ.' 
          });
          setSaving(false);
          return;
        }

        if (!pixDisplayType) {
          setMessage({ type: 'error', text: 'Selecione como o PIX será exibido para o cliente.' });
          setSaving(false);
          return;
        }
        if (pixDisplayType === 'mercadopago' && !mercadopagoEnabled) {
          setMessage({ type: 'error', text: 'A opção Mercado Pago só pode ser usada se a integração estiver ativa.' });
          setSaving(false);
          return;
        }
      }
      
      const rid = profile?.restaurantId || (await restaurantService.getRestaurantByOwnerId(profile?.uid))?.id;
      if (!rid) {
        setMessage({ type: 'error', text: 'Restaurante não encontrado.' });
        return;
      }

      await updateDoc(doc(db, 'restaurants', rid), {
        formas_pagamento: methods,
        chave_pix: chavePix,
        pix_display_type: pixDisplayType
      });
      setMessage({ type: 'success', text: 'Formas de pagamento atualizadas com sucesso!' });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Error saving payment methods:", error);
      setMessage({ type: 'error', text: 'Erro ao salvar as formas de pagamento.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;
  }

  const paymentOptions = [
    { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { id: 'pix', label: 'Pix', icon: Smartphone, color: 'text-teal-600', bg: 'bg-teal-100' },
    { id: 'credito', label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600', bg: 'bg-blue-100' },
    { id: 'debito', label: 'Cartão de Débito', icon: Wallet, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  ] as const;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-800">Formas de Pagamento</h2>
          <p className="text-stone-500 text-sm">Configure quais métodos de pagamento você aceita no delivery e na retirada.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-emerald-200"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Salvar Alterações
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl font-bold animate-in fade-in slide-in-from-top-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* PIX Key Section */}
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <h3 className="text-lg font-bold text-stone-800 mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-teal-600" />
          Configuração do PIX
        </h3>
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-stone-700">Chave PIX</label>
            <input 
              type="text" 
              value={chavePix}
              onChange={(e) => setChavePix(e.target.value)}
              placeholder="CPF, E-mail, Telefone ou Chave Aleatória"
              className="w-full px-4 py-3 bg-stone-50 border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
            <p className="text-xs text-stone-500">Esta chave será exibida para o cliente quando ele selecionar o pagamento via PIX.</p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-stone-700">Como o PIX será exibido para o cliente?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPixDisplayType('chave')}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${pixDisplayType === 'chave' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200'}`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${pixDisplayType === 'chave' ? 'border-emerald-500' : 'border-stone-300'}`}>
                  {pixDisplayType === 'chave' && <div className="w-3 h-3 rounded-full bg-emerald-500" />}
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">Chave PIX</p>
                  <p className="text-xs opacity-70">Exibe apenas a chave para cópia</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPixDisplayType('qrcode')}
                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${pixDisplayType === 'qrcode' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200'}`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${pixDisplayType === 'qrcode' ? 'border-emerald-500' : 'border-stone-300'}`}>
                  {pixDisplayType === 'qrcode' && <div className="w-3 h-3 rounded-full bg-emerald-500" />}
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">QR Code e Copia e Cola</p>
                  <p className="text-xs opacity-70">Gera QR Code automaticamente</p>
                </div>
              </button>

              {mercadopagoEnabled && (
                <button
                  type="button"
                  onClick={() => setPixDisplayType('mercadopago')}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${pixDisplayType === 'mercadopago' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200'}`}
                >
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${pixDisplayType === 'mercadopago' ? 'border-emerald-500' : 'border-stone-300'}`}>
                    {pixDisplayType === 'mercadopago' && <div className="w-3 h-3 rounded-full bg-emerald-500" />}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm">Mercado Pago (Automático)</p>
                    <p className="text-xs opacity-70">Confirmação automática de pagamento</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {paymentOptions.map((option) => {
          const Icon = option.icon;
          const isEntrega = methods[option.id].entrega;
          const isRetirada = methods[option.id].retirada;

          return (
            <div key={option.id} className="bg-white p-6 rounded-3xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${option.bg} ${option.color}`}>
                  <Icon className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-stone-800">{option.label}</h3>
                  <p className="text-sm text-stone-500">
                    {!isEntrega && !isRetirada ? 'Não aceito' : 
                     isEntrega && isRetirada ? 'Aceito em Entrega e Retirada' :
                     isEntrega ? 'Aceito apenas em Entrega' : 'Aceito apenas em Retirada'}
                  </p>
                </div>
              </div>

              <div className="flex flex-row gap-6 sm:gap-8 bg-stone-50 p-4 rounded-2xl border border-stone-100">
                <label className="flex flex-col items-center gap-2 cursor-pointer group">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider group-hover:text-stone-800 transition-colors">Entrega</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only"
                      checked={isEntrega}
                      onChange={() => handleToggle(option.id, 'entrega')}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${isEntrega ? 'bg-emerald-500' : 'bg-stone-200'}`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${isEntrega ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </div>
                </label>

                <div className="w-px bg-stone-200"></div>

                <label className="flex flex-col items-center gap-2 cursor-pointer group">
                  <span className="text-xs font-bold text-stone-500 uppercase tracking-wider group-hover:text-stone-800 transition-colors">Retirada</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only"
                      checked={isRetirada}
                      onChange={() => handleToggle(option.id, 'retirada')}
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${isRetirada ? 'bg-emerald-500' : 'bg-stone-200'}`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform shadow-sm ${isRetirada ? 'translate-x-6' : 'translate-x-0'}`}></div>
                  </div>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
