export type TeamRole = 'OWNER' | 'RESTAURANT_ADMIN' | 'MANAGER' | 'WAITER' | 'DRIVER' | 'CASHIER' | 'KITCHEN';

export type UserStatusType = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface PersonalData {
  nome: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl?: string;
  jobTitle?: string;
  employeeId?: string;
  admissionDate?: string;
  shift?: string;
  workDays?: string[];
  emergencyContact?: string;
  observations?: string;
}

export interface OwnerConfig {
  isMainOwner: boolean;
  recoveryEmail: string;
  recoveryPhone: string;
  confirmationRequired: boolean;
}

export interface AdminConfig {
  accessFinancial: boolean;
  accessSettings: boolean;
  accessTeam: boolean;
  accessProducts: boolean;
  accessOrders: boolean;
  accessStock: boolean;
  accessReports: boolean;
}

export interface ManagerConfig {
  allowedModules: string[];
  managedEnvironments: string[];
  allowDiscounts: boolean;
  maxDiscountPercentage: number;
  allowCancellations: boolean;
  allowRegisterOpenClose: boolean;
  manageOrders: boolean;
  manageStock: boolean;
  manageTeam: boolean;
}

export interface WaiterConfig {
  attendedHalls: string[];
  assignedTables: string[];
  shift: string;
  pinCode: string;
  createOrders: boolean;
  transferTable: boolean;
  applyDiscount: boolean;
  maxDiscountPercentage: number;
  cancelUnsentItems: boolean;
  cancelSentItems: boolean;
  closeTable: boolean;
  viewFinancialTotals: boolean;
  commissionRate: number;
  operationalStatus: 'AVAILABLE' | 'BUSY' | 'ON_BREAK';
}

export interface DriverConfig {
  nickname: string;
  cpf: string;
  vehicleType: 'moto' | 'carro' | 'bicicleta' | 'a_pe';
  vehiclePlate: string;
  cnh: string;
  pixKey: string;
  remunerationType: 'FIXED_PER_DELIVERY' | 'DAILY_PLUS_FEE' | 'PERCENTAGE';
  remunerationValue: number;
  availabilityStatus: 'OFFLINE' | 'ONLINE' | 'ON_DELIVERY';
  locationSharing: boolean;
  deliveryRadiusKm: number;
  operationalNotes: string;
}

export interface CashierConfig {
  authorizedRegisters: string[];
  canOpenRegister: boolean;
  canCloseRegister: boolean;
  canSangria: boolean;
  canSuprimento: boolean;
  canApplyDiscount: boolean;
  maxDiscountPercentage: number;
  canCancelSale: boolean;
  canRefund: boolean;
  allowedPaymentMethods: string[];
  pinCode: string;
}

export interface KitchenConfig {
  productionStations: string[];
  viewedCategories: string[];
  canAcceptOrder: boolean;
  canStartPrep: boolean;
  canFinishItem: boolean;
  canChangePriority: boolean;
  canViewValues: boolean;
  soundAlerts: boolean;
  associatedKdsPrinter: string;
}

export interface TeamMemberFormData {
  // Step 1: Personal
  nome: string;
  displayName: string;
  email: string;
  phone: string;
  photoUrl: string;
  jobTitle: string;
  employeeId: string;
  admissionDate: string;
  shift: string;
  workDays: string[];
  emergencyContact: string;
  observations: string;

  // Step 2: Access
  role: TeamRole;
  status: UserStatusType;
  password?: string;
  mustChangePassword: boolean;

  // Step 3: Permissions
  permissions: string[];

  // Step 4: Operational Configs per Role
  ownerConfig: OwnerConfig;
  adminConfig: AdminConfig;
  managerConfig: ManagerConfig;
  waiterConfig: WaiterConfig;
  driverConfig: DriverConfig;
  cashierConfig: CashierConfig;
  kitchenConfig: KitchenConfig;
}

export function getDefaultOperationalConfigs() {
  return {
    ownerConfig: {
      isMainOwner: true,
      recoveryEmail: '',
      recoveryPhone: '',
      confirmationRequired: true
    },
    adminConfig: {
      accessFinancial: true,
      accessSettings: true,
      accessTeam: true,
      accessProducts: true,
      accessOrders: true,
      accessStock: true,
      accessReports: true
    },
    managerConfig: {
      allowedModules: ['orders', 'stock', 'team', 'products', 'caixa'],
      managedEnvironments: [],
      allowDiscounts: true,
      maxDiscountPercentage: 15,
      allowCancellations: true,
      allowRegisterOpenClose: true,
      manageOrders: true,
      manageStock: true,
      manageTeam: false
    },
    waiterConfig: {
      attendedHalls: [],
      assignedTables: [],
      shift: 'Manhã / Tarde',
      pinCode: '',
      createOrders: true,
      transferTable: true,
      applyDiscount: false,
      maxDiscountPercentage: 5,
      cancelUnsentItems: true,
      cancelSentItems: false,
      closeTable: true,
      viewFinancialTotals: true,
      commissionRate: 10,
      operationalStatus: 'AVAILABLE' as const
    },
    driverConfig: {
      nickname: '',
      cpf: '',
      vehicleType: 'moto' as const,
      vehiclePlate: '',
      cnh: '',
      pixKey: '',
      remunerationType: 'FIXED_PER_DELIVERY' as const,
      remunerationValue: 7.50,
      availabilityStatus: 'OFFLINE' as const,
      locationSharing: true,
      deliveryRadiusKm: 8,
      operationalNotes: ''
    },
    cashierConfig: {
      authorizedRegisters: ['Caixa 01'],
      canOpenRegister: true,
      canCloseRegister: true,
      canSangria: true,
      canSuprimento: true,
      canApplyDiscount: true,
      maxDiscountPercentage: 10,
      canCancelSale: true,
      canRefund: true,
      allowedPaymentMethods: ['Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Pix'],
      pinCode: ''
    },
    kitchenConfig: {
      productionStations: ['Chapa / Grill', 'Fritadeira', 'Forno'],
      viewedCategories: ['Hambúrgueres', 'Porções', 'Pizzas'],
      canAcceptOrder: true,
      canStartPrep: true,
      canFinishItem: true,
      canChangePriority: true,
      canViewValues: false,
      soundAlerts: true,
      associatedKdsPrinter: 'KDS Main Kitchen'
    }
  };
}

export function isOperationalConfigIncomplete(member: any): boolean {
  if (!member) return false;
  const role = (member.role || '').toUpperCase();
  const op = member.operationalConfig || member.config || {};

  switch (role) {
    case 'WAITER': {
      const w = op.waiterConfig || member;
      const pin = w.pinCode || w.operationalPin || member.pinCode || member.operationalPin;
      if (!pin || String(pin).trim().length < 4) return true;
      const shift = w.shift || member.shift || op.commonOperationalData?.shift;
      if (!shift) return true;
      return false;
    }

    case 'CASHIER': {
      const c = op.cashierConfig || member;
      const pin = c.pinCode || c.criticalActionPinRequired || member.pinCode || member.criticalActionPinRequired;
      if (!pin || String(pin).trim().length < 4) return true;
      return false;
    }

    case 'DRIVER': {
      const d = op.driverConfig || member;
      if (!d.vehicleType) return true;
      if ((d.vehicleType === 'moto' || d.vehicleType === 'carro') && !d.vehiclePlate) return true;
      const cpf = d.cpf || member.cpf;
      if (!cpf || String(cpf).replace(/\D/g, '').length < 11) return true;
      return false;
    }

    case 'KITCHEN': {
      const k = op.kitchenConfig || member;
      const stations = k.productionStations || member.productionStations || [];
      if (!Array.isArray(stations) || stations.length === 0) return true;
      return false;
    }

    case 'MANAGER': {
      const m = op.managerConfig || member;
      const allowDiscounts = m.allowDiscounts ?? m.canApproveDiscounts;
      const maxDisc = m.maxDiscountPercentage ?? m.maxDiscountPercent;
      if (allowDiscounts && (!maxDisc || maxDisc <= 0)) return true;
      return false;
    }

    default:
      return false;
  }
}
