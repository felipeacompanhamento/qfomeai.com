import { CanonicalUser, AccountType, UserRole, UserStatus } from '../types';

export interface AuthResolution {
  isValid: boolean;
  destination: string | null;
  error: string | null;
}

export function resolveUserDestination(user: CanonicalUser | null): AuthResolution {
  if (!user) {
    return { isValid: false, destination: null, error: 'Usuário não autenticado.' };
  }

  if (user.role === 'INVALID_UNMIGRATED' || user.accountType === 'INVALID_UNMIGRATED') {
    return { isValid: false, destination: null, error: 'Acesso negado: Perfil de usuário não migrado para o modelo canônico e compatibilidade legada desativada.' };
  }

  // 2. Validar status
  const userStatusStr = String(user.status || '').toUpperCase();
  if (userStatusStr === UserStatus.INACTIVE || userStatusStr === 'BLOCKED' || userStatusStr === 'DELETED' || user.active === false) {
    return { isValid: false, destination: null, error: 'Conta inativa, bloqueada ou deletada.' };
  }

  const accountTypeStr = String(user.accountType || '').toUpperCase();
  const roleStr = String(user.role || '').toUpperCase();
  const restaurantId = user.restaurantId;

  // 3 & 4 & 5. Validar accountType, role, restaurantId
  if (accountTypeStr === AccountType.ADMIN || roleStr === UserRole.ADMIN) {
    return { isValid: true, destination: '/admin-dashboard', error: null };
  }

  if (roleStr === 'WAITER' || roleStr === 'GARCOM' || accountTypeStr === 'WAITER') {
    if (!restaurantId || String(restaurantId).trim().length === 0) {
      return { isValid: false, destination: null, error: 'Acesso negado: Garçom sem restaurante associado.' };
    }
    return { isValid: true, destination: '/garcom', error: null };
  }

  if (accountTypeStr === AccountType.CLIENT || roleStr === UserRole.CLIENT) {
    // CLIENT não deve receber restaurantId obrigatório
    return { isValid: true, destination: '/', error: null };
  }

  if (accountTypeStr === AccountType.RESTAURANT) {
    if (!restaurantId || String(restaurantId).trim().length === 0) {
      return { isValid: false, destination: null, error: 'Acesso negado: Usuário interno sem restaurante associado.' };
    }

    switch (roleStr) {
      case UserRole.OWNER:
      case UserRole.RESTAURANT_ADMIN:
      case UserRole.MANAGER:
      case 'GERENTE':
      case 'ADMINISTRADOR':
        return { isValid: true, destination: '/restaurant', error: null };
      case UserRole.WAITER:
      case 'GARCOM':
        return { isValid: true, destination: '/garcom', error: null };
      case UserRole.DRIVER:
      case 'DELIVERY_DRIVER':
      case 'ENTREGADOR':
        return { isValid: true, destination: '/entregador', error: null };
      case UserRole.CASHIER:
      case 'CAIXA':
        return { isValid: true, destination: '/restaurant/financeiro/caixa', error: null };
      case UserRole.KITCHEN:
      case 'COZINHA':
        return { isValid: true, destination: '/restaurant/orders', error: null };
      default:
        return { isValid: true, destination: '/restaurant', error: null };
    }
  }

  if (accountTypeStr === AccountType.DRIVER || roleStr === UserRole.DRIVER || roleStr === 'ENTREGADOR') {
    return { isValid: true, destination: '/entregador', error: null };
  }

  return { isValid: false, destination: null, error: 'Perfil inválido ou desconhecido.' };
}
