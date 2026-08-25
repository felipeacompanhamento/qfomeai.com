import React, { useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Tags, List, PlusCircle, Layers, Ticket, Archive, Lock } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { AccountType } from '../../../types';
import { hasPermission } from '../../../domain/permissions/canonicalPermissions';

import RestaurantProducts from '../Products';
import RestaurantCategories from '../Categories';
import RestaurantSizes from '../Sizes';
import RestaurantExtras from '../Extras';
import OptionGroups from '../OptionGroups';
import Promotions from '../Promotions';
import StockPage from './StockPage';

export type CardapioSubTab = 'produtos' | 'categorias' | 'tamanhos' | 'adicionais' | 'grupos' | 'promocoes' | 'estoque';

interface TabDefinition {
  id: CardapioSubTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const ALL_CARDAPIO_SUBTABS: TabDefinition[] = [
  { id: 'produtos', label: 'Produtos', icon: ShoppingBag },
  { id: 'categorias', label: 'Categorias', icon: Tags },
  { id: 'tamanhos', label: 'Tamanhos', icon: List },
  { id: 'adicionais', label: 'Adicionais', icon: PlusCircle },
  { id: 'grupos', label: 'Grupos de Opções', icon: Layers },
  { id: 'promocoes', label: 'Promoções', icon: Ticket },
  { id: 'estoque', label: 'Estoque', icon: Archive },
];

export default function CardapioHubPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const role = (profile?.role || profile?.tipo_usuario || '').toUpperCase();
  const isRestaurantOwner = profile?.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN';

  // Check role & permissions
  // OWNER & RESTAURANT_ADMIN: Full access
  // MANAGER: According to canonical permissions (produtos/menu, estoque)
  // CASHIER, WAITER, KITCHEN, DRIVER: Blocked from administrative cardapio hub
  const isAllowedHub = isRestaurantOwner || (role === 'MANAGER' && (hasPermission(profile, 'produtos.visualizar') || hasPermission(profile, 'estoque.visualizar')));

  // Available subtabs
  const availableTabs = useMemo(() => {
    if (!isAllowedHub) return [];
    if (isRestaurantOwner) return ALL_CARDAPIO_SUBTABS;

    return ALL_CARDAPIO_SUBTABS.filter(tab => {
      if (tab.id === 'estoque') {
        return hasPermission(profile, 'estoque.visualizar');
      }
      return hasPermission(profile, 'produtos.visualizar');
    });
  }, [isAllowedHub, isRestaurantOwner, profile]);

  // Determine active subtab from URL path or query params
  const pathname = location.pathname.toLowerCase();
  let subtabFromPath: CardapioSubTab | null = null;

  if (pathname.includes('/cardapio/produtos') || pathname.includes('/menu/items')) subtabFromPath = 'produtos';
  else if (pathname.includes('/cardapio/categorias') || pathname.includes('/menu/categories')) subtabFromPath = 'categorias';
  else if (pathname.includes('/cardapio/tamanhos') || pathname.includes('/menu/sizes')) subtabFromPath = 'tamanhos';
  else if (pathname.includes('/cardapio/adicionais') || pathname.includes('/menu/extras')) subtabFromPath = 'adicionais';
  else if (pathname.includes('/cardapio/grupos') || pathname.includes('/menu/grupos')) subtabFromPath = 'grupos';
  else if (pathname.includes('/cardapio/promocoes') || pathname.includes('/menu/promotions')) subtabFromPath = 'promocoes';
  else if (pathname.includes('/cardapio/estoque') || pathname.includes('/estoque') || pathname.includes('/inventory')) subtabFromPath = 'estoque';

  const rawQuerySubtab = (searchParams.get('subtab') || searchParams.get('tab') || '').toLowerCase();
  
  let normalizedQuerySubtab: CardapioSubTab | null = null;
  if (rawQuerySubtab === 'produtos' || rawQuerySubtab === 'items' || rawQuerySubtab === 'products') normalizedQuerySubtab = 'produtos';
  else if (rawQuerySubtab === 'categorias' || rawQuerySubtab === 'categories') normalizedQuerySubtab = 'categorias';
  else if (rawQuerySubtab === 'tamanhos' || rawQuerySubtab === 'sizes') normalizedQuerySubtab = 'tamanhos';
  else if (rawQuerySubtab === 'adicionais' || rawQuerySubtab === 'extras') normalizedQuerySubtab = 'adicionais';
  else if (rawQuerySubtab === 'grupos' || rawQuerySubtab === 'option-groups') normalizedQuerySubtab = 'grupos';
  else if (rawQuerySubtab === 'promocoes' || rawQuerySubtab === 'promotions') normalizedQuerySubtab = 'promocoes';
  else if (rawQuerySubtab === 'estoque' || rawQuerySubtab === 'stock' || rawQuerySubtab === 'inventory') normalizedQuerySubtab = 'estoque';

  let currentSubTab: CardapioSubTab = normalizedQuerySubtab || subtabFromPath || 'produtos';

  if (!availableTabs.some(t => t.id === currentSubTab)) {
    currentSubTab = availableTabs[0]?.id || 'produtos';
  }

  if (!isAllowedHub || availableTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-stone-200 text-center min-h-[400px] font-sans">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-stone-800 mb-2">Acesso Restrito</h3>
        <p className="text-stone-500 max-w-md">
          Seu perfil não possui permissão para gerenciar o cardápio.
        </p>
      </div>
    );
  }

  const handleSubTabChange = (tabId: CardapioSubTab) => {
    setSearchParams({ subtab: tabId }, { replace: false });
    navigate(`/restaurant/cardapio/${tabId}?subtab=${tabId}`, { replace: false });
  };

  return (
    <div className="space-y-6 w-full font-sans">
      {/* Module Sub-Header & Navigation Tabs */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-800">Cardápio</h1>
          <p className="text-stone-500 text-xs sm:text-sm mt-1">
            Gestão completa de produtos, categorias, variações, complementos, promoções e estoque em um só lugar.
          </p>
        </div>

        {/* Horizontal Controlled Subtabs Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl overflow-x-auto scrollbar-none w-full">
          {availableTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = currentSubTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSubTabChange(tab.id)}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 min-w-[120px] sm:min-w-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Render ONLY the Active Tab Component to avoid duplicate listeners & queries */}
      <div>
        {currentSubTab === 'produtos' && <RestaurantProducts />}
        {currentSubTab === 'categorias' && <RestaurantCategories />}
        {currentSubTab === 'tamanhos' && <RestaurantSizes />}
        {currentSubTab === 'adicionais' && <RestaurantExtras />}
        {currentSubTab === 'grupos' && <OptionGroups />}
        {currentSubTab === 'promocoes' && <Promotions />}
        {currentSubTab === 'estoque' && <StockPage />}
      </div>
    </div>
  );
}
