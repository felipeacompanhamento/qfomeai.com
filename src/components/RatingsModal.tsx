import React, { useEffect, useState } from 'react';
import { X, Star } from 'lucide-react';
import { dashboardService } from '../services/dashboardService';

export default function RatingsModal({ restaurantId, onClose }: { restaurantId: string, onClose: () => void }) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRatings = async () => {
      const reviews = await dashboardService.getReviewsByRestaurantId(restaurantId);
      setRatings(reviews.slice(0, 20)); // Limit to 20
      setLoading(false);
    };
    fetchRatings();
  }, [restaurantId]);

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'há alguns segundos';
    if (seconds < 3600) return `há ${Math.floor(seconds / 60)} minutos`;
    if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} horas`;
    return `há ${Math.floor(seconds / 86400)} dias`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Avaliações</h2>
          <button onClick={onClose}><X /></button>
        </div>
        {loading ? (
          <p>Carregando...</p>
        ) : ratings.length === 0 ? (
          <p>Nenhuma avaliação ainda.</p>
        ) : (
          <div className="space-y-4">
            {ratings.map(r => (
              <div key={r.id} className="border-b pb-4">
                <div className="flex justify-between">
                  <span className="font-bold">{r.nome_cliente}</span>
                  <span className="text-xs text-stone-400">{getTimeAgo(r.data)}</span>
                </div>
                <div className="flex text-yellow-400 my-1">
                  {[1,2,3,4,5].map(n => <Star key={n} className={`w-4 h-4 ${n <= r.nota ? 'fill-yellow-400' : 'text-stone-300'}`} />)}
                </div>
                <p className="text-sm text-stone-600">{r.comentario}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
