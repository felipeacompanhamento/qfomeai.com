import React, { useState } from 'react';
import { X, Check } from 'lucide-react';
import { submitReport } from '../services/reportService';

interface ReportModalProps {
  orderId: string;
  restaurantId: string;
  clientId: string;
  reporterId: string;
  reportedId: string;
  reporterType: 'restaurant' | 'client';
  onClose: () => void;
}

export default function ReportModal({ orderId, restaurantId, clientId, reporterId, reportedId, reporterType, onClose }: ReportModalProps) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    await submitReport({
      orderId,
      restaurantId,
      clientId,
      reporterId,
      reportedId,
      reporterType,
      message
    });
    setSubmitting(false);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6">
        {success ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-stone-800">Denúncia enviada com sucesso!</h2>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Denunciar {reporterType === 'restaurant' ? 'Cliente' : 'Abuso'}</h2>
              <button onClick={onClose}><X /></button>
            </div>
            <textarea 
              className="w-full border rounded-xl p-4 mb-4" 
              placeholder="Descreva o motivo da denúncia..." 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              rows={4}
            />
            <button 
              onClick={handleSubmit} 
              disabled={submitting || !message.trim()} 
              className="w-full bg-red-600 text-white rounded-xl py-3 font-bold disabled:opacity-50"
            >
              {submitting ? 'Enviando...' : 'Enviar Denúncia'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
