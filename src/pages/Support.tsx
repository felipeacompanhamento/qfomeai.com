import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, MessageCircle, HelpCircle, ChevronLeft } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const Support = () => {
  const navigate = useNavigate();
  const [adminPhone, setAdminPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAdmin = async () => {
      try {
        const q = query(collection(db, 'users'), where('tipo_usuario', '==', 'admin'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const admin = snap.docs[0].data();
          setAdminPhone(admin.telefone || '');
          setAdminEmail(admin.email || '');
        }
      } catch (error) {
        console.error("Error fetching admin:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAdmin();
  }, []);

  const formatPhoneForWhatsApp = (phone: string) => {
    // Remove non-numeric characters and prepend Brazil country code 55
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('55') ? cleaned : `55${cleaned}`;
  };

  return (
    <div className="min-h-screen bg-stone-50 py-8 md:py-12 px-4 md:px-6">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-6 flex items-center gap-2 text-stone-600 hover:text-emerald-600 transition-all font-bold"
        >
          <ChevronLeft className="w-5 h-5" />
          Voltar
        </button>
        <div className="bg-white p-6 md:p-12 rounded-2xl shadow-sm border border-stone-100">
          <div className="flex items-center gap-4 mb-8">
          <HelpCircle className="w-8 h-8 md:w-10 md:h-10 text-orange-500" />
          <h1 className="text-2xl md:text-4xl font-extrabold text-stone-900 tracking-tight">Suporte Qfomeai</h1>
        </div>
        
        <p className="text-base md:text-lg text-stone-700 mb-8 md:mb-10 leading-relaxed">
          Precisa de ajuda com seu pedido, restaurante ou tem alguma dúvida sobre nossa plataforma? 
          Nossa equipe de suporte está pronta para te atender.
        </p>

        {!loading && (
          <div className="grid gap-6 md:grid-cols-2">
            <a 
              href={`https://wa.me/${formatPhoneForWhatsApp(adminPhone)}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-6 bg-green-50 rounded-xl border border-green-100 hover:bg-green-100 transition-colors"
            >
              <MessageCircle className="w-8 h-8 text-green-600" />
              <div>
                <h3 className="font-bold text-stone-900">WhatsApp</h3>
                <p className="text-sm text-stone-600">Atendimento rápido via chat</p>
              </div>
            </a>

            <a 
              href={`mailto:${adminEmail}`} 
              className="flex items-center gap-4 p-6 bg-blue-50 rounded-xl border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              <Mail className="w-8 h-8 text-blue-600" />
              <div>
                <h3 className="font-bold text-stone-900">E-mail</h3>
                <p className="text-sm text-stone-600">{adminEmail}</p>
              </div>
            </a>
          </div>
        )}

        <div className="mt-12 p-6 bg-stone-100 rounded-xl text-stone-700 text-sm">
          <h4 className="font-bold mb-2">Horário de Atendimento</h4>
          <p>Segunda a Sexta: 08:00 às 23:59</p>
          <p>Sábado e Domingo: 15:00 às 23:59</p>
          <p className="mt-2 font-semibold">Atendemos até nos feriados.</p>
        </div>
      </div>
    </div>
  </div>
  );
};

export default Support;
