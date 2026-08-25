import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AccountType } from '../types';
import { hasPermission } from '../domain/permissions/canonicalPermissions';
import { AccessRestrictedState } from './ui/Feedback';

interface PermissionGuardProps {
  children?: React.ReactNode;
  module: string;
  allowedRoles?: string[];
}

const MODULE_TO_CANONICAL_KEY: Record<string, string> = {
  dashboard: 'dashboard.visualizar',
  pedidos: 'pedidos.visualizar',
  orders: 'pedidos.visualizar',
  balcao: 'balcao.visualizar',
  mesas: 'mesas.visualizar',
  saloes: 'mesas.visualizar',
  tables: 'mesas.visualizar',
  waiters: 'garcom.atender',
  waiter: 'garcom.atender',
  garcom: 'garcom.atender',
  delivery: 'entregas.visualizar',
  driver: 'entregas.visualizar',
  entregas: 'entregas.visualizar',
  kitchen: 'cozinha.visualizar',
  cozinha: 'cozinha.visualizar',
  caixa: 'caixa.visualizar',
  financeiro: 'financeiro.visualizar',
  desempenho: 'financeiro.visualizar',
  finance: 'financeiro.visualizar',
  menu: 'produtos.visualizar',
  products: 'produtos.visualizar',
  produtos: 'produtos.visualizar',
  stock: 'estoque.visualizar',
  estoque: 'estoque.visualizar',
  relatorios: 'relatorios.visualizar',
  clientes: 'clientes.visualizar',
  equipe: 'equipe.visualizar',
  team: 'equipe.visualizar',
  settings: 'configuracoes.visualizar',
  configuracoes: 'configuracoes.visualizar',
  auditoria: 'auditoria.visualizar'
};

export const PermissionGuard: React.FC<PermissionGuardProps> = ({ children, module, allowedRoles }) => {
  const { profile, loading } = useAuth();

  if (loading) return null;

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  const role = (profile.role || profile.tipo_usuario || '').toUpperCase();

  let hasAccess = false;

  if (profile.accountType === AccountType.RESTAURANT || role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
    if (role === 'OWNER' || role === 'RESTAURANT_ADMIN') {
      hasAccess = true;
    } else if (allowedRoles && allowedRoles.map(r => r.toUpperCase()).includes(role)) {
      hasAccess = true;
    } else {
      const canonicalKey = MODULE_TO_CANONICAL_KEY[module.toLowerCase()] || module;
      hasAccess = hasPermission(profile, canonicalKey);
    }
  }

  if (hasAccess) {
    return children ? <>{children}</> : <Outlet />;
  }

  return (
    <div className="flex items-center justify-center p-8 min-h-[400px]">
      <AccessRestrictedState
        title="Acesso Negado"
        description="Você não possui permissão suficiente para acessar este módulo."
      />
    </div>
  );
};
