import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, FolderClosed, History, CalendarClock } from 'lucide-react';

type TabType = 'ongoing' | 'history';

export default function ServiceRequests() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('ongoing');

  return (
    <div className="min-h-screen bg-stone-50 pb-16 font-sans flex flex-col">
      {/* Header matching image design: dark green background */}
      <header className="bg-[#0b1b17] text-white select-none sticky top-0 z-50 shadow-md">
        <div className="max-w-md mx-auto px-4 py-4.5 flex items-center justify-between relative">
          <button 
            onClick={() => navigate(-1)} 
            className="p-1.5 hover:bg-emerald-950/40 rounded-xl transition-all"
            id="requests-back-btn"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
          
          <h1 className="text-lg font-bold tracking-tight text-white font-sans absolute left-1/2 -translate-x-1/2" id="requests-title">
            Minhas Solicitações
          </h1>

          <div className="w-9 h-9" /> {/* Spacer to align title to center */}
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto flex flex-col bg-white">
        {/* Navigation Tabs with styled underline */}
        <div className="flex border-b border-stone-200" id="requests-tabs-row">
          <button
            onClick={() => setActiveTab('ongoing')}
            className="flex-1 py-4 text-center font-bold text-[13px] sm:text-sm relative transition-colors"
            style={{ color: activeTab === 'ongoing' ? '#ff5f36' : '#78716c' }}
            id="tab-ongoing"
          >
            Em Andamento (0)
            {activeTab === 'ongoing' && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-[3px] rounded-t-full" 
                style={{ backgroundColor: '#ff5f36' }}
              />
            )}
          </button>
          
          <button
            onClick={() => setActiveTab('history')}
            className="flex-1 py-4 text-center font-bold text-[13px] sm:text-sm relative transition-colors"
            style={{ color: activeTab === 'history' ? '#ff5f36' : '#78716c' }}
            id="tab-history"
          >
            Histórico (0)
            {activeTab === 'history' && (
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4/5 h-[3px] rounded-t-full" 
                style={{ backgroundColor: '#ff5f36' }}
              />
            )}
          </button>
        </div>

        {/* Dynamic Tab Body with styled empty states */}
        {activeTab === 'ongoing' ? (
          <div 
            className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center" 
            id="ongoing-empty-container"
          >
            <div className="w-20 h-20 bg-stone-100 rounded-3xl flex items-center justify-center text-stone-300 mb-6 border border-stone-200">
              <FolderClosed className="w-9 h-9 text-stone-400" strokeWidth={1.5} />
            </div>
            
            <p className="text-base sm:text-lg font-medium text-[#78716c] tracking-tight font-sans">
              Nenhuma solicitação em andamento
            </p>
          </div>
        ) : (
          <div 
            className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center" 
            id="history-empty-container"
          >
            <div className="w-20 h-20 bg-stone-100 rounded-3xl flex items-center justify-center text-stone-300 mb-6 border border-stone-200">
              <CalendarClock className="w-9 h-9 text-stone-400" strokeWidth={1.5} />
            </div>
            
            <p className="text-base sm:text-lg font-medium text-[#78716c] tracking-tight font-sans">
              Nenhuma solicitação no histórico
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
