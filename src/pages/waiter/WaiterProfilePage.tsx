import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useWaiter } from '../../contexts/WaiterContext';
import { auth } from '../../firebase';
import { signOut } from 'firebase/auth';
import { PageHeader, Badge, Button } from '../../components/ui';
import { User, LogOut, Shield, Building2, Wifi, CheckCircle2, XCircle } from 'lucide-react';

export function WaiterProfilePage() {
  const { user, profile } = useAuth();
  const { waiterConfig } = useWaiter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Error signing out waiter:', err);
    }
  };

  const status = String(profile?.status || '').toUpperCase();

  const getStatusBadge = () => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success" className="text-xs font-bold rounded-full px-2.5 py-0.5">ATIVO</Badge>;
      case 'BLOCKED':
        return <Badge variant="danger" className="text-xs font-bold rounded-full px-2.5 py-0.5">BLOQUEADO</Badge>;
      case 'INACTIVE':
      default:
        return <Badge variant="warning" className="text-xs font-bold rounded-full px-2.5 py-0.5">INATIVO</Badge>;
    }
  };

  const restaurantDisplayName = profile?.restaurantName || (profile?.restaurantId ? 'Restaurante Vinculado' : 'Não Definido');

  return (
    <div className="space-y-6" id="waiter-profile-page">
      <PageHeader
        title="Meu Perfil"
        description="Visualize as informações da sua conta e permissões de garçom."
        icon={User}
      />

      <div className="space-y-4">
        {/* Profile Card */}
        <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b border-stone-100">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-black text-lg shadow-2xs">
              {(profile?.nome || profile?.name || 'G')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-stone-800 leading-tight truncate">
                {profile?.nome || profile?.name || 'Garçom'}
              </h2>
              <p className="text-xs text-stone-500 font-medium truncate mt-0.5">
                {profile?.email || user?.email}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 pt-1">
            <div className="flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-2 text-stone-500">
                <Shield className="w-4 h-4 text-stone-400" />
                <span>Cargo</span>
              </div>
              <span className="text-stone-800 font-bold bg-stone-100 px-2 py-0.5 rounded-lg text-xs uppercase">
                {profile?.role || 'Garçom'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-2 text-stone-500">
                <Building2 className="w-4 h-4 text-stone-400" />
                <span>Restaurante</span>
              </div>
              <span className="text-stone-800 font-bold text-right max-w-[180px] truncate">
                {restaurantDisplayName}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-2 text-stone-500">
                <Wifi className="w-4 h-4 text-stone-400" />
                <span>Status</span>
              </div>
              <div>{getStatusBadge()}</div>
            </div>
          </div>
        </div>

        {/* Operational Permissions Card */}
        <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-2xs space-y-3">
          <h3 className="text-xs font-extrabold text-stone-900 uppercase tracking-wider">
            Permissões Operacionais
          </h3>
          
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-stone-50">
              <span className="text-stone-700 font-medium">Abrir Comandas</span>
              {waiterConfig.canOpenTab ? (
                <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sim</span>
              ) : (
                <span className="text-stone-400 font-medium flex items-center gap-1"><XCircle className="w-4 h-4" /> Não</span>
              )}
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-stone-50">
              <span className="text-stone-700 font-medium">Transferir Mesa / Itens</span>
              {waiterConfig.canTransferTable ? (
                <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sim</span>
              ) : (
                <span className="text-stone-400 font-medium flex items-center gap-1"><XCircle className="w-4 h-4" /> Não</span>
              )}
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-stone-50">
              <span className="text-stone-700 font-medium">Cancelar Itens</span>
              {waiterConfig.canCancelItem ? (
                <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sim</span>
              ) : (
                <span className="text-stone-400 font-medium flex items-center gap-1"><XCircle className="w-4 h-4" /> Não</span>
              )}
            </div>

            <div className="flex items-center justify-between p-2 rounded-xl bg-stone-50">
              <span className="text-stone-700 font-medium">Visualizar Preços</span>
              {waiterConfig.canViewPrices ? (
                <span className="text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Sim</span>
              ) : (
                <span className="text-stone-400 font-medium flex items-center gap-1"><XCircle className="w-4 h-4" /> Não</span>
              )}
            </div>
          </div>
        </div>

        {/* Warning card */}
        <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 space-y-2">
          <h4 className="text-xs font-bold text-emerald-900 leading-tight">Configurações de Segurança</h4>
          <p className="text-xs text-emerald-800 leading-relaxed font-medium">
            Seu perfil é gerenciado pelo estabelecimento. Entre em contato com o gerente caso precise ajustar suas permissões ou alterar sua senha.
          </p>
        </div>

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="secondary"
          className="w-full py-3 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 hover:text-rose-700 font-extrabold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
          id="btn-profile-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair da Conta</span>
        </Button>
      </div>
    </div>
  );
}

export default WaiterProfilePage;
