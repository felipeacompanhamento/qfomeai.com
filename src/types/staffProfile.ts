import { TeamRole } from './team';

export type OperationalStatus = 
  | 'AVAILABLE' 
  | 'BUSY' 
  | 'ON_BREAK' 
  | 'OFFLINE' 
  | 'ONLINE' 
  | 'ON_DELIVERY' 
  | 'PAUSED' 
  | 'INACTIVE';

export interface CommonOperationalData {
  employeeId?: string;
  internalCode?: string;
  jobTitle?: string;
  admissionDate?: string;
  shift?: string;
  workDays?: string[];
  emergencyContact?: string;
  observations?: string;
  photoUrl?: string;
}

export interface WaiterOperationalData {
  environments: string[];
  attendedHalls?: string[];
  assignedTables: string[];
  shift: string;
  operationalPin: string;
  canOpenTab: boolean;
  canTransferTable: boolean;
  canApplyDiscount: boolean;
  maxDiscountPercent: number;
  canCancelItem: boolean;
  canCloseAccount: boolean;
  canViewPrices: boolean;
  canViewOtherWaitersTabs?: boolean;
  canAssignOtherWaitersTabs?: boolean;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
}

export interface DriverOperationalData {
  nickname: string;
  cpf: string;
  vehicleType: 'moto' | 'carro' | 'bicicleta' | 'a_pe';
  vehiclePlate: string;
  cnh: string;
  pixKey: string;
  compensationType: 'FIXED_PER_DELIVERY' | 'DAILY_PLUS_FEE' | 'PERCENTAGE';
  compensationValue: number;
  availability: 'OFFLINE' | 'ONLINE' | 'ON_DELIVERY';
  locationSharingEnabled: boolean;
  deliveryAreas: string[];
  deliveryRadiusKm: number;
  operationalNotes: string;
}

export interface CashierOperationalData {
  authorizedRegisters: string[];
  canOpenRegister: boolean;
  canCloseRegister: boolean;
  canCreateWithdrawal: boolean;
  canCreateSupply: boolean;
  canApplyDiscount: boolean;
  maxDiscountPercent: number;
  canCancelSale: boolean;
  canRefundPayment: boolean;
  allowedPaymentMethods: string[];
  criticalActionPinRequired: string;
}

export interface KitchenOperationalData {
  productionStations: string[];
  visibleProductCategories: string[];
  canAcceptOrder: boolean;
  canStartPreparation: boolean;
  canCompleteItem: boolean;
  canChangePriority: boolean;
  canViewFinancialValues: boolean;
  soundAlertsEnabled: boolean;
  printerId: string;
  kdsId: string;
}

export interface ManagerOperationalData {
  managedEnvironments: string[];
  maxDiscountPercent: number;
  canApproveDiscounts: boolean;
  canApproveCancellations: boolean;
  canOpenRegister: boolean;
  canCloseRegister: boolean;
  canManageInventory: boolean;
  canManageOrders: boolean;
  canManageTeam: boolean;
}

export interface AdminOperationalData {
  administrativeScopes: string[];
  criticalActionsEnabled: boolean;
  canManageTeam: boolean;
  canManageFinancial: boolean;
  canManageSettings: boolean;
  canManageProducts: boolean;
  canManageInventory: boolean;
  canViewAudit: boolean;
}

export interface OwnerOperationalData {
  primaryOwner: boolean;
  recoveryContact: string;
  enhancedConfirmationEnabled: boolean;
}

export type RoleSpecificData = 
  | WaiterOperationalData 
  | DriverOperationalData 
  | CashierOperationalData 
  | KitchenOperationalData 
  | ManagerOperationalData 
  | AdminOperationalData 
  | OwnerOperationalData 
  | Record<string, any>;

export interface OperationalRoleHistory {
  role: TeamRole;
  roleSpecificData: any;
  commonOperationalData?: CommonOperationalData;
  endedAt: string;
  changedBy?: string;
  reason?: string;
}

export interface StaffProfile {
  uid: string;
  restaurantId: string;
  role: TeamRole;
  operationalStatus: OperationalStatus;
  profileComplete: boolean;
  profileVersion: string;
  commonOperationalData: CommonOperationalData;
  roleSpecificData: RoleSpecificData;
  roleHistory: OperationalRoleHistory[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface OperationalCompletenessResult {
  profileComplete: boolean;
  missingFields: string[];
  reasons: string[];
}

export interface OperationalValidationResult {
  isValid: boolean;
  errors: string[];
}
