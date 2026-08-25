export type WaiterStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface WaiterPermissions {
  createOrders: boolean;
  editOwnOrders: boolean;
  editOtherWaitersOrders: boolean;
  cancelUnsentItems: boolean;
  cancelSentItems: boolean;
  applyDiscount: boolean;
  transferTable: boolean;
  mergeTables: boolean;
  receivePayment: boolean;
  closeTable: boolean;
  viewFinancialTotals: boolean;
}

export const DEFAULT_WAITER_PERMISSIONS: WaiterPermissions = {
  createOrders: true,
  editOwnOrders: true,
  editOtherWaitersOrders: false,
  cancelUnsentItems: true,
  cancelSentItems: false,
  applyDiscount: false,
  transferTable: false,
  mergeTables: false,
  receivePayment: false,
  closeTable: false,
  viewFinancialTotals: false,
};

export function normalizeWaiterPermissions(rawPermissions: any): WaiterPermissions {
  if (!rawPermissions) return { ...DEFAULT_WAITER_PERMISSIONS };

  return {
    createOrders: typeof rawPermissions.createOrders === 'boolean' 
      ? rawPermissions.createOrders 
      : typeof rawPermissions.canCreateOrder === 'boolean'
      ? rawPermissions.canCreateOrder
      : true,
    editOwnOrders: typeof rawPermissions.editOwnOrders === 'boolean' ? rawPermissions.editOwnOrders : true,
    editOtherWaitersOrders: typeof rawPermissions.editOtherWaitersOrders === 'boolean' ? rawPermissions.editOtherWaitersOrders : false,
    cancelUnsentItems: typeof rawPermissions.cancelUnsentItems === 'boolean' ? rawPermissions.cancelUnsentItems : true,
    cancelSentItems: typeof rawPermissions.cancelSentItems === 'boolean' 
      ? rawPermissions.cancelSentItems 
      : typeof rawPermissions.canCancelItem === 'boolean'
      ? rawPermissions.canCancelItem
      : false,
    applyDiscount: typeof rawPermissions.applyDiscount === 'boolean' 
      ? rawPermissions.applyDiscount 
      : typeof rawPermissions.canApplyDiscount === 'boolean'
      ? rawPermissions.canApplyDiscount
      : false,
    transferTable: typeof rawPermissions.transferTable === 'boolean' 
      ? rawPermissions.transferTable 
      : typeof rawPermissions.canTransferTable === 'boolean'
      ? rawPermissions.canTransferTable
      : false,
    mergeTables: typeof rawPermissions.mergeTables === 'boolean' ? rawPermissions.mergeTables : false,
    receivePayment: typeof rawPermissions.receivePayment === 'boolean' ? rawPermissions.receivePayment : false,
    closeTable: typeof rawPermissions.closeTable === 'boolean' 
      ? rawPermissions.closeTable 
      : typeof rawPermissions.canCloseTable === 'boolean'
      ? rawPermissions.canCloseTable
      : false,
    viewFinancialTotals: typeof rawPermissions.viewFinancialTotals === 'boolean' ? rawPermissions.viewFinancialTotals : false,
  };
}

export interface Waiter {
  id: string; // docId
  restaurantId: string;
  userId?: string; // Auth UID
  accessConfigured: boolean;
  name: string;
  phone?: string;
  email?: string;
  photoUrl?: string;
  status: WaiterStatus;
  permissions: WaiterPermissions;
  environments?: string[];
  assignedTables?: string[];
  shift?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy: {
    userId: string;
    name?: string;
  };
  lastAccessAt?: string | null;
}

export function normalizeWaiter(rawDoc: any, docId: string, restaurantId: string): Waiter {
  const status: WaiterStatus = 
    rawDoc.status === 'BLOCKED' ? 'BLOCKED' :
    rawDoc.status === 'INACTIVE' || rawDoc.ativo === false ? 'INACTIVE' :
    'ACTIVE';

  const name = rawDoc.name || rawDoc.nome || 'Garçom sem nome';
  const email = rawDoc.email || '';
  const userId = typeof rawDoc.userId === 'string' && rawDoc.userId.trim().length > 0
    ? rawDoc.userId.trim()
    : undefined;

  const accessConfigured = Boolean(userId) && Boolean(email) && rawDoc.accessConfigured !== false;

  return {
    id: docId,
    restaurantId: rawDoc.restaurantId || restaurantId,
    userId,
    accessConfigured,
    name,
    phone: rawDoc.phone || rawDoc.telefone || '',
    email,
    photoUrl: rawDoc.photoUrl || '',
    status,
    permissions: normalizeWaiterPermissions(rawDoc.permissions || rawDoc.permissoes),
    environments: rawDoc.environments || [],
    assignedTables: rawDoc.assignedTables || [],
    shift: rawDoc.shift || '',
    createdAt: rawDoc.createdAt || rawDoc.data_criacao || new Date().toISOString(),
    updatedAt: rawDoc.updatedAt || new Date().toISOString(),
    createdBy: rawDoc.createdBy || { userId: '', name: 'Cadastro legado' },
    lastAccessAt: rawDoc.lastAccessAt || null
  };
}
