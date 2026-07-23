import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface City {
  id: string;
  nome: string;
  estado_id: string;
}

interface State {
  id: string;
  nome: string;
}

const CitiesServed = () => {
  const navigate = useNavigate();
  const [groupedCities, setGroupedCities] = useState<Record<string, City[]>>({});
  const [states, setStates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const statesSnapshot = await getDocs(collection(db, 'estados'));
        const statesMap: Record<string, string> = {};
        statesSnapshot.forEach(doc => {
          statesMap[doc.id] = doc.data().nome;
        });
        setStates(statesMap);

        const citiesSnapshot = await getDocs(collection(db, 'cidades'));
        const grouped: Record<string, City[]> = {};
        citiesSnapshot.forEach(doc => {
          const city = { id: doc.id, ...doc.data() } as City;
          if (!grouped[city.estado_id]) {
            grouped[city.estado_id] = [];
          }
          grouped[city.estado_id].push(city);
        });
        setGroupedCities(grouped);
      } catch (error) {
        console.error("Error fetching cities/states:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="p-12 text-center">Carregando...</div>;

  return (
    <div className="min-h-screen bg-stone-50 py-8 md:py-12 px-4 md:px-6">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-6 flex items-center gap-2 text-stone-600 hover:text-emerald-600 transition-all font-bold"
        >
          <ChevronLeft className="w-5 h-5" />
          Voltar
        </button>
        <h1 className="text-3xl md:text-4xl font-extrabold text-stone-900 mb-6 tracking-tight">Cidades Atendidas</h1>
        <p className="text-base md:text-lg text-stone-700 mb-8 md:mb-12">
          O Qfomeai está em constante expansão! Confira abaixo as cidades onde já contamos com restaurantes parceiros ativos, agrupadas por estado:
        </p>
        
        <div className="grid gap-8 md:grid-cols-2">
          {Object.entries(groupedCities).map(([estadoId, cities]) => (
            <div key={estadoId} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100">
              <h2 className="text-2xl font-bold text-stone-900 mb-4">{states[estadoId] || 'Estado Desconhecido'}</h2>
              <ul className="space-y-2">
                {cities.map((city) => (
                  <li key={city.id} className="text-stone-700 font-medium">{city.nome}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CitiesServed;
