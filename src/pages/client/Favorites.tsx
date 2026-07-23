import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronLeft, Heart, ShoppingBag, Star, Clock, MapPin, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { restaurantService } from '../../services/restaurantService';
import PlaceholderImage from '../../components/PlaceholderImage';

export default function Favorites() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      // 1. Fetch user favorite restaurant IDs from subcollection
      const favRef = collection(db, 'users', user.uid, 'favoritos');
      const snap = await getDocs(favRef);
      const favIds = snap.docs.map(doc => doc.id);

      if (favIds.length === 0) {
        setFavorites([]);
        setLoading(false);
        return;
      }

      // 2. Fetch all restaurants
      const allRests = await restaurantService.getAllRestaurants();
      
      // 3. Filter only matches
      const matched = allRests.filter((r: any) => favIds.includes(r.id));
      setFavorites(matched);
    } catch (err) {
      console.error("Error loading favorites:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFavorites();
  }, [user]);

  const handleRemoveFavorite = async (restaurantId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'favoritos', restaurantId));
      setFavorites(prev => prev.filter(item => item.id !== restaurantId));
    } catch (err) {
      console.error("Error removing favorite:", err);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans">
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-stone-100 rounded-xl transition-all">
            <ChevronLeft className="w-6 h-6 text-stone-700" />
          </button>
          <h1 className="text-xl font-extrabold text-stone-900">Meus Favoritos</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-stone-400 text-sm font-bold mt-4">Carregando seus favoritos...</p>
          </div>
        ) : !user ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-stone-200 p-6 shadow-xs">
            <Heart className="w-16 h-16 text-stone-200 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-stone-800 mb-2">Faça login para salvar favoritos</h2>
            <p className="text-stone-500 mb-6">Suas escolhas prediletas estarão sempre salvas aqui na nuvem.</p>
            <Link to="/login" className="px-5 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all text-sm">Entrar como Cliente</Link>
          </div>
        ) : favorites.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-3xl border border-stone-200 p-6 shadow-xs">
            <Heart className="w-16 h-16 text-stone-200 mx-auto mb-4 animate-pulse" />
            <h2 className="text-xl font-bold text-stone-800 mb-2">Nenhum favorito ainda</h2>
            <p className="text-stone-500 mb-6">Explore nossos estabelecimentos parceiros e marque-os como favoritos!</p>
            <Link to="/" className="text-emerald-600 font-bold hover:underline text-sm font-sans">Explorar Restaurantes</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {favorites.map(rest => (
              <Link 
                key={rest.id} 
                to={`/${rest.slug}`}
                className="flex items-center gap-4 p-4 bg-white rounded-3xl border border-stone-100 hover:border-emerald-200 hover:shadow-lg transition-all duration-300 group relative"
              >
                <div className="w-16 h-16 rounded-2xl border border-stone-100 overflow-hidden shrink-0 relative shadow-xs">
                  <PlaceholderImage 
                    src={rest.logoUrl} 
                    type="logo" 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-stone-900 truncate group-hover:text-emerald-600 transition-colors">
                    {rest.nome}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium mt-1">
                    <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500 shrink-0" />
                    <span className="font-extrabold text-stone-800">{rest.media_avaliacao?.toFixed(1) || '0.0'}</span>
                    <span className="text-stone-300">•</span>
                    <span className="truncate">{Array.isArray(rest.categorias) ? rest.categorias.join(', ') : rest.categoria_id || 'Alimentação'}</span>
                  </div>
                </div>

                <button 
                  onClick={(e) => handleRemoveFavorite(rest.id, e)}
                  className="p-2.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title="Remover dos favoritos"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
