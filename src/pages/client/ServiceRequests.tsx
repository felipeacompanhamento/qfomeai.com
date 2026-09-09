import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FolderClosed, CalendarClock } from 'lucide-react';
import Navbar from '../../components/Navbar';

type TabType = 'ongoing' | 'history';

export default function ServiceRequests() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('ongoing');

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans flex flex-col antialiased">
      {/* Header matching Qfomeai design: dark green background with emerald accent */}
      <header className="bg-[#0b1b17] text-white select-none sticky top-0 z-50 shadow-sm border-b border-emerald-950/30">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between relative">
          <button 
            onClick={() => navigate(-1)} 
            className="p-2 hover:bg-emerald-950/80 active:scale-95 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400"
            id="requests-back-btn"
            aria-label="Voltar"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-sans" id="requests-title">
            Minhas Solicitações
          </h1>

          <div className="w-9 h-9" /> {/* Spacer to align title cleanly */}
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-6 flex flex-col">
        <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden flex flex-col flex-1">
          {/* Navigation Tabs with styled emerald underline */}
          <div className="flex border-b border-stone-200" id="requests-tabs-row">
            <button
              onClick={() => setActiveTab('ongoing')}
              className={`flex-1 py-4 text-center font-extrabold text-xs sm:text-sm relative transition-colors ${
                activeTab === 'ongoing' ? 'text-emerald-600' : 'text-stone-500 hover:text-stone-800'
              }`}
              id="tab-ongoing"
            >
              Em Andamento (0)
              {activeTab === 'ongoing' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[3px] rounded-t-full bg-emerald-600" />
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-4 text-center font-extrabold text-xs sm:text-sm relative transition-colors ${
                activeTab === 'history' ? 'text-emerald-600' : 'text-stone-500 hover:text-stone-800'
              }`}
              id="tab-history"
            >
              Histórico (0)
              {activeTab === 'history' && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[3px] rounded-t-full bg-emerald-600" />
              )}
            </button>
          </div>

          {/* Dynamic Tab Body with styled empty states */}
          {activeTab === 'ongoing' ? (
            <div 
              className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center" 
              id="ongoing-empty-container"
            >
              <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center text-emerald-600 mb-5 border border-emerald-100">
                <FolderClosed className="w-7 h-7 text-emerald-600" strokeWidth={1.5} />
              </div>
              
              <h3 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                Nenhuma solicitação em andamento
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-xs font-medium">
                Quando você contatar prestadores de serviços, o acompanhamento aparecerá aqui.
              </p>
            </div>
          ) : (
            <div 
              className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center" 
              id="history-empty-container"
            >
              <div className="w-16 h-16 bg-stone-100 rounded-3xl flex items-center justify-center text-stone-400 mb-5 border border-stone-200/80">
                <CalendarClock className="w-7 h-7 text-stone-500" strokeWidth={1.5} />
              </div>
              
              <h3 className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                Nenhuma solicitação no histórico
              </h3>
              <p className="text-xs sm:text-sm text-stone-500 mt-1 max-w-xs font-medium">
                Seus atendimentos concluídos e históricos anteriores serão registrados aqui.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Standard bottom Navbar */}
      <Navbar />
    </div>
  );
}
