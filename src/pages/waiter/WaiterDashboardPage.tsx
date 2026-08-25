import React, { Suspense } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { WaiterProvider } from '../../contexts/WaiterContext';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { useNavigate, Routes, Route, Navigate as RouterNavigate } from 'react-router-dom';
import { LogOut, AlertCircle } from 'lucide-react';
import { WaiterLayout } from './WaiterLayout';
import { LoadingState } from '../../components/ui';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const WaiterTablesPage = lazyWithRetry(() => import('./WaiterTablesPage'));
const WaiterTabsPage = lazyWithRetry(() => import('./WaiterTabsPage'));
const WaiterProfilePage = lazyWithRetry(() => import('./WaiterProfilePage'));

export function WaiterDashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/garcom/login');
  };

  const userRoleStr = String(profile?.role || '').toUpperCase();
  const accountTypeStr = String(profile?.accountType || '').toUpperCase();
  const isWaiter = userRoleStr === 'WAITER' || userRoleStr === 'GARCOM' || accountTypeStr === 'WAITER';
  const isRestaurantAccount = accountTypeStr === 'RESTAURANT' || accountTypeStr === 'WAITER' || isWaiter;
  const status = String(profile?.status || '').toUpperCase();
  const hasRestaurant = typeof profile?.restaurantId === 'string' && profile.restaurantId.trim().length > 0;

  const isActive = isWaiter && status === 'ACTIVE' && profile?.active !== false && hasRestaurant;

  const getStatusMessage = () => {
    if (!isWaiter) return "Esta conta não possui perfil de garçom.";
    if (!isRestaurantAccount) return "Esta conta não está associada a um estabelecimento.";
    if (status === 'BLOCKED') return "Sua conta de garçom está bloqueada. Entre em contato com o restaurante.";
    if (status === 'INACTIVE' || profile?.active === false) return "Sua conta de garçom está inativa. Entre em contato com o restaurante.";
    if (!hasRestaurant) return "O acesso desta conta ainda não foi configurado pelo restaurante.";
    if (status !== 'ACTIVE') return "O status desta conta não está configurado corretamente.";
    return "Acesso do garçom configurado com sucesso.";
  };

  if (isActive) {
    return (
      <WaiterProvider>
        <WaiterLayout>
          <Suspense fallback={<LoadingState message="Carregando..." />}>
            <Routes>
              <Route path="mesas" element={<WaiterTablesPage />} />
              <Route path="comandas" element={<WaiterTabsPage />} />
              <Route path="perfil" element={<WaiterProfilePage />} />
              <Route path="*" element={<RouterNavigate to="mesas" replace />} />
            </Routes>
          </Suspense>
        </WaiterLayout>
      </WaiterProvider>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-200 text-center space-y-6">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto bg-red-100 text-red-600">
          <AlertCircle className="w-8 h-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold text-stone-800">
            Acesso Não Autorizado
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            {profile?.email || user?.email}
          </p>
        </div>

        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs leading-relaxed">
          <p className="font-bold">{getStatusMessage()}</p>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs rounded-xl transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair da Conta</span>
        </button>
      </div>
    </div>
  );
}

export default WaiterDashboardPage;
