export enum AccountType {
  CLIENT = 'CLIENT',
  RESTAURANT = 'RESTAURANT',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN'
}

export enum UserRole {
  OWNER = 'OWNER',
  RESTAURANT_ADMIN = 'RESTAURANT_ADMIN',
  MANAGER = 'MANAGER',
  WAITER = 'WAITER',
  DRIVER = 'DRIVER',
  CASHIER = 'CASHIER',
  KITCHEN = 'KITCHEN',
  CLIENT = 'CLIENT',
  ADMIN = 'ADMIN'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING'
}

export interface CanonicalUser {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  accountType: AccountType | string;
  role: UserRole | string;
  restaurantId?: string;
  permissions?: string[];
  status: UserStatus | string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  // Legacy fields preserved for compatibility
  tipo_usuario?: string;
  nome?: string;
  telefone?: string;
  active?: boolean;
  data_criacao?: string;
  [key: string]: any;
}

export function normalizeUser(
  raw: any, 
  options?: { legacyUserCompatibilityEnabled?: boolean }
): CanonicalUser {
  if (!raw) return raw;
  const legacyEnabled = options?.legacyUserCompatibilityEnabled ?? true;

  const name = raw.name || raw.nome || '';
  const phone = raw.phone || raw.telefone || '';
  const createdAt = raw.createdAt || raw.data_criacao || new Date().toISOString();
  const updatedAt = raw.updatedAt || raw.atualizadoEm || createdAt;
  const status = raw.status || (raw.active !== false ? UserStatus.ACTIVE : UserStatus.INACTIVE);
  
  let accountType = raw.accountType;
  let role = raw.role;
  const legacyTipo = raw.tipo_usuario;
  const isLegacyUnmigrated = !raw.accountType || !raw.role || !raw._migratedAt;

  // Only run legacy fallback if legacy compatibility is enabled
  if (legacyEnabled) {
    if (!accountType && legacyTipo) {
      if (legacyTipo === 'cliente') accountType = AccountType.CLIENT;
      else if (['restaurant', 'restaurante', 'restaurant_admin', 'manager', 'waiter', 'cashier', 'kitchen'].includes(legacyTipo)) accountType = AccountType.RESTAURANT;
      else if (['delivery_driver', 'entregador'].includes(legacyTipo)) accountType = AccountType.DRIVER;
      else if (legacyTipo === 'admin') accountType = AccountType.ADMIN;
      else accountType = AccountType.CLIENT;
    }

    if (!role && legacyTipo) {
      if (legacyTipo === 'restaurant' || legacyTipo === 'restaurante') role = UserRole.OWNER;
      else if (legacyTipo === 'restaurant_admin') role = UserRole.RESTAURANT_ADMIN;
      else if (legacyTipo === 'manager') role = UserRole.MANAGER;
      else if (legacyTipo === 'waiter') role = UserRole.WAITER;
      else if (legacyTipo === 'delivery_driver' || legacyTipo === 'entregador') role = UserRole.DRIVER;
      else if (legacyTipo === 'cashier') role = UserRole.CASHIER;
      else if (legacyTipo === 'kitchen') role = UserRole.KITCHEN;
      else if (legacyTipo === 'admin') role = UserRole.ADMIN;
      else if (legacyTipo === 'cliente') role = UserRole.CLIENT;
      else role = UserRole.CLIENT;
    }
  }

  const finalAccountType = accountType || (legacyEnabled ? AccountType.CLIENT : 'INVALID_UNMIGRATED');
  const finalRole = role || (legacyEnabled ? UserRole.CLIENT : 'INVALID_UNMIGRATED');

  return {
    ...raw,
    uid: raw.uid || raw.id || '',
    name,
    email: raw.email || '',
    phone,
    accountType: finalAccountType,
    role: finalRole,
    restaurantId: raw.restaurantId || undefined,
    permissions: raw.permissions || [],
    status,
    createdAt,
    updatedAt,
    createdBy: raw.createdBy || undefined,
    tipo_usuario: legacyTipo || raw.tipo_usuario,
    nome: name,
    telefone: phone,
    active: status === UserStatus.ACTIVE,
    isLegacyUnmigrated
  };
}

