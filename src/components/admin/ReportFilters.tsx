import React, { useState, useEffect } from 'react';
import { OrderReportFilters } from '../../services/orderReportService';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';

interface ReportFiltersProps {
  onApplyFilters: (filters: OrderReportFilters) => void;
  isLoading: boolean;
  initialEstadoId?: string;
  initialCidadeId?: string;
}

export const ReportFilters: React.FC<ReportFiltersProps> = ({ 
  onApplyFilters, 
  isLoading,
  initialEstadoId,
  initialCidadeId
}) => {
  // Estado local dos filtros
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [restaurantId, setRestaurantId] = useState<string>('');
  const [cidade, setCidade] = useState<string>('');
  const [estadoId, setEstadoId] = useState<string>(initialEstadoId || '');
  const [status, setStatus] = useState<string>('');
  
  const [error, setError] = useState<string>('');

  // Sincronizar estado local com os filtros globais do dashboard
  // Dados para os selects
  const [allRestaurantes, setAllRestaurantes] = useState<any[]>([]);
  const [filteredRestaurantes, setFilteredRestaurantes] = useState<{ id: string; nome: string }[]>([]);
  const [estados, setEstados] = useState<{ id: string; nome: string }[]>([]);
  const [cidades, setCidades] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (initialEstadoId) setEstadoId(initialEstadoId);
  }, [initialEstadoId]);

  useEffect(() => {
    if (initialCidadeId && cidades.length > 0) {
      const cid = cidades.find(c => c.id === initialCidadeId);
      if (cid) setCidade(cid.nome);
    }
  }, [initialCidadeId, cidades]);

  // Buscar restaurantes e estados ao montar o componente
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar todos os restaurantes para filtrar localmente
        const restSnap = await getDocs(query(collection(db, 'restaurants'), orderBy('nome')));
        const restData = restSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setAllRestaurantes(restData);

        // Buscar estados
        const estSnap = await getDocs(query(collection(db, 'estados'), where('ativo', '==', true), orderBy('nome')));
        setEstados(estSnap.docs.map(d => ({ id: d.id, nome: d.data().nome })));
      } catch (err) {
        console.error("Erro ao buscar dados para filtros:", err);
      }
    };
    fetchData();
  }, []);

  // Filtrar lista de restaurantes baseada no estado/cidade selecionados
  useEffect(() => {
    let filtered = allRestaurantes;
    if (estadoId) {
      filtered = filtered.filter(r => (r.endereco?.estado_id || r.estado_id) === estadoId);
    }
    if (cidade) {
      filtered = filtered.filter(r => (r.endereco?.cidade || r.cidade) === cidade);
    }
    setFilteredRestaurantes(filtered.map(r => ({ id: r.id, nome: r.nome })));
    
    // Se o restaurante selecionado não estiver mais na lista filtrada, limpa a seleção
    if (restaurantId && !filtered.some(r => r.id === restaurantId)) {
      setRestaurantId('');
    }
  }, [estadoId, cidade, allRestaurantes]);

  // Buscar cidades quando o estado muda
  useEffect(() => {
    const fetchCidades = async () => {
      if (!estadoId) {
        setCidades([]);
        setCidade('');
        return;
      }
      try {
        const cidSnap = await getDocs(query(collection(db, 'cidades'), where('estado_id', '==', estadoId), where('ativo', '==', true), orderBy('nome')));
        setCidades(cidSnap.docs.map(d => ({ id: d.id, nome: d.data().nome })));
      } catch (err) {
        console.error("Erro ao buscar cidades:", err);
      }
    };
    fetchCidades();
  }, [estadoId]);

  // Validação: Período é obrigatório
  const isPeriodoValido = dataInicio.trim() !== '' && dataFim.trim() !== '';

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (!isPeriodoValido) {
      setError('O período (Data Início e Data Fim) é obrigatório para gerar o relatório.');
      return;
    }

    if (new Date(dataInicio) > new Date(dataFim)) {
      setError('A data de início não pode ser maior que a data de fim.');
      return;
    }

    setError('');
    
    // Encontrar o nome do estado selecionado para passar no filtro
    const estadoNome = estados.find(est => est.id === estadoId)?.nome || undefined;
    
    // Dispara a busca com os filtros combinados
    onApplyFilters({
      dataInicio,
      dataFim,
      restaurantId: restaurantId || undefined,
      cidade: cidade || undefined,
      estado: estadoNome,
      status: status || undefined,
    });
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm mb-6">
      <h3 className="text-lg font-bold text-stone-800 mb-4">Filtros do Relatório</h3>
      
      <form onSubmit={handleApply} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          
          {/* Período (Obrigatório) */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Data Início <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setError(''); }}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">
              Data Fim <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setError(''); }}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              required
            />
          </div>

          {/* Restaurante */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Restaurante</label>
            <select
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Todos os restaurantes</option>
              {filteredRestaurantes.map(r => (
                <option key={r.id} value={r.id}>{r.nome}</option>
              ))}
            </select>
          </div>

          {/* Estado */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Estado</label>
            <select
              value={estadoId}
              onChange={(e) => {
                setEstadoId(e.target.value);
                setCidade(''); // Reseta a cidade ao trocar de estado
              }}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Todos os estados</option>
              {estados.map(est => (
                <option key={est.id} value={est.id}>{est.nome}</option>
              ))}
            </select>
          </div>

          {/* Cidade */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Cidade</label>
            <select
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              disabled={!estadoId}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none disabled:bg-stone-100 disabled:text-stone-400"
            >
              <option value="">Todas as cidades</option>
              {cidades.map(cid => (
                <option key={cid.id} value={cid.nome}>{cid.nome}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full p-2 border border-stone-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="aceito">Aceito</option>
              <option value="preparo">Em Preparo</option>
              <option value="pronto">Pronto para Entrega</option>
              <option value="entrega">Saiu para Entrega</option>
              <option value="entregue">Entregue</option>
              <option value="cancelado">Cancelado</option>
              <option value="rejeitado">Rejeitado</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm font-medium mt-2">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isLoading || !isPeriodoValido}
            className="px-6 py-2 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Buscando...
              </>
            ) : (
              'Gerar Relatório'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
