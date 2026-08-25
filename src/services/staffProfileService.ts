import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where 
} from 'firebase/firestore';
import { CanonicalUser, AccountType, UserRole, UserStatus } from '../types';
import { TeamRole } from '../types/team';
import { 
  StaffProfile, 
  OperationalStatus, 
  CommonOperationalData, 
  RoleSpecificData, 
  OperationalRoleHistory,
  OperationalCompletenessResult,
  OperationalValidationResult 
} from '../types/staffProfile';

const FORBIDDEN_ROLES_FOR_STAFF_PROFILE = ['CLIENT', 'PLATFORM_ADMIN', 'ADMIN'];

export function validateOperationalProfile(role: TeamRole | string, data: any): OperationalValidationResult {
  const errors: string[] = [];
  const normalizedRole = (role || '').toUpperCase();

  if (!normalizedRole) {
    errors.push('O perfil (role) é obrigatório.');
  }

  if (FORBIDDEN_ROLES_FOR_STAFF_PROFILE.includes(normalizedRole)) {
    errors.push(`Perfil operacional não é permitido para ${normalizedRole}.`);
  }

  const validRoles = ['OWNER', 'RESTAURANT_ADMIN', 'MANAGER', 'WAITER', 'DRIVER', 'CASHIER', 'KITCHEN'];
  if (normalizedRole && !validRoles.includes(normalizedRole)) {
    errors.push(`Role inválida: ${normalizedRole}. Roles permitidas: ${validRoles.join(', ')}.`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function checkProfileCompleteness(role: TeamRole | string, data: any): OperationalCompletenessResult {
  const missingFields: string[] = [];
  const reasons: string[] = [];
  const normalizedRole = (role || '').toUpperCase();

  const roleData = data?.roleSpecificData || data || {};
  const common = data?.commonOperationalData || data || {};

  switch (normalizedRole) {
    case 'WAITER': {
      const pin = roleData.operationalPin || roleData.pinCode || data.pinCode;
      if (!pin || String(pin).trim().length < 4) {
        missingFields.push('operationalPin');
        reasons.push('PIN de operação do garçom é obrigatório (mínimo 4 dígitos).');
      }
      const shift = roleData.shift || common.shift || data.shift;
      if (!shift) {
        missingFields.push('shift');
        reasons.push('Turno de trabalho do garçom deve ser informado.');
      }
      break;
    }

    case 'DRIVER': {
      const vType = roleData.vehicleType || data.vehicleType;
      if (!vType) {
        missingFields.push('vehicleType');
        reasons.push('Tipo de veículo do entregador é obrigatório.');
      }
      if ((vType === 'moto' || vType === 'carro') && (!roleData.vehiclePlate && !data.vehiclePlate)) {
        missingFields.push('vehiclePlate');
        reasons.push('Placa do veículo é obrigatória para motos e carros.');
      }
      const cpf = roleData.cpf || data.cpf;
      if (!cpf || String(cpf).replace(/\D/g, '').length < 11) {
        missingFields.push('cpf');
        reasons.push('CPF válido é obrigatório para o entregador.');
      }
      break;
    }

    case 'CASHIER': {
      const pin = roleData.criticalActionPinRequired || roleData.pinCode || data.pinCode;
      if (!pin || String(pin).trim().length < 4) {
        missingFields.push('criticalActionPinRequired');
        reasons.push('PIN para ações críticas do caixa é obrigatório (mínimo 4 dígitos).');
      }
      const registers = roleData.authorizedRegisters || data.authorizedRegisters || [];
      if (!Array.isArray(registers) || registers.length === 0) {
        missingFields.push('authorizedRegisters');
        reasons.push('É necessário selecionar ao menos um caixa autorizado.');
      }
      break;
    }

    case 'KITCHEN': {
      const stations = roleData.productionStations || data.productionStations || [];
      if (!Array.isArray(stations) || stations.length === 0) {
        missingFields.push('productionStations');
        reasons.push('É necessário selecionar ao menos uma praça/estação de produção.');
      }
      break;
    }

    case 'MANAGER': {
      const allowDiscounts = roleData.canApproveDiscounts ?? roleData.allowDiscounts ?? data.allowDiscounts;
      const maxDiscount = roleData.maxDiscountPercent ?? roleData.maxDiscountPercentage ?? data.maxDiscountPercentage;
      if (allowDiscounts && (!maxDiscount || maxDiscount <= 0)) {
        missingFields.push('maxDiscountPercent');
        reasons.push('Percentual máximo de desconto deve ser informado quando descontos são permitidos.');
      }
      break;
    }

    case 'RESTAURANT_ADMIN': {
      // Basic completeness check
      break;
    }

    case 'OWNER': {
      if (roleData.primaryOwner === undefined && data.primaryOwner === undefined) {
        // Warning or default true
      }
      break;
    }
  }

  return {
    profileComplete: missingFields.length === 0,
    missingFields,
    reasons
  };
}

export function extractRoleSpecificDataFromFormData(role: TeamRole | string, formData: any): RoleSpecificData {
  const normRole = (role || '').toUpperCase();
  const opConfig = formData.operationalConfig || formData || {};

  switch (normRole) {
    case 'WAITER': {
      const w = opConfig.waiterConfig || formData.waiterConfig || formData;
      return {
        environments: w.environments || w.attendedHalls || [],
        assignedTables: w.assignedTables || [],
        shift: w.shift || formData.shift || 'Manhã / Tarde',
        operationalPin: w.pinCode || w.operationalPin || '',
        canOpenTab: w.createOrders ?? w.canOpenTab ?? true,
        canTransferTable: w.transferTable ?? w.canTransferTable ?? true,
        canApplyDiscount: w.applyDiscount ?? w.canApplyDiscount ?? false,
        maxDiscountPercent: w.maxDiscountPercentage ?? w.maxDiscountPercent ?? 5,
        canCancelItem: w.cancelUnsentItems ?? w.canCancelItem ?? true,
        canCloseAccount: w.closeTable ?? w.canCloseAccount ?? true,
        canViewPrices: w.viewFinancialTotals ?? w.canViewPrices ?? true,
        canViewOtherWaitersTabs: w.canViewOtherWaitersTabs ?? true,
        canAssignOtherWaitersTabs: w.canAssignOtherWaitersTabs ?? true,
        commissionType: w.commissionType || 'PERCENTAGE',
        commissionValue: w.commissionRate ?? w.commissionValue ?? 10
      };
    }

    case 'DRIVER': {
      const d = opConfig.driverConfig || formData.driverConfig || formData;
      return {
        nickname: d.nickname || formData.displayName || formData.nome || '',
        cpf: d.cpf || '',
        vehicleType: d.vehicleType || 'moto',
        vehiclePlate: d.vehiclePlate || '',
        cnh: d.cnh || '',
        pixKey: d.pixKey || '',
        compensationType: d.remunerationType || d.compensationType || 'FIXED_PER_DELIVERY',
        compensationValue: d.remunerationValue ?? d.compensationValue ?? 7.50,
        availability: d.availabilityStatus || d.availability || 'OFFLINE',
        locationSharingEnabled: d.locationSharing ?? d.locationSharingEnabled ?? true,
        deliveryAreas: d.deliveryAreas || [],
        deliveryRadiusKm: d.deliveryRadiusKm ?? 8,
        operationalNotes: d.operationalNotes || ''
      };
    }

    case 'CASHIER': {
      const c = opConfig.cashierConfig || formData.cashierConfig || formData;
      return {
        authorizedRegisters: c.authorizedRegisters || ['Caixa 01'],
        canOpenRegister: c.canOpenRegister ?? true,
        canCloseRegister: c.canCloseRegister ?? true,
        canCreateWithdrawal: c.canSangria ?? c.canCreateWithdrawal ?? true,
        canCreateSupply: c.canSuprimento ?? c.canCreateSupply ?? true,
        canApplyDiscount: c.canApplyDiscount ?? true,
        maxDiscountPercent: c.maxDiscountPercentage ?? c.maxDiscountPercent ?? 10,
        canCancelSale: c.canCancelSale ?? true,
        canRefundPayment: c.canRefund ?? c.canRefundPayment ?? true,
        allowedPaymentMethods: c.allowedPaymentMethods || ['Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Pix'],
        criticalActionPinRequired: c.pinCode || c.criticalActionPinRequired || ''
      };
    }

    case 'KITCHEN': {
      const k = opConfig.kitchenConfig || formData.kitchenConfig || formData;
      return {
        productionStations: k.productionStations || ['Cozinha Principal'],
        visibleProductCategories: k.viewedCategories || k.visibleProductCategories || [],
        canAcceptOrder: k.canAcceptOrder ?? true,
        canStartPreparation: k.canStartPrep ?? k.canStartPreparation ?? true,
        canCompleteItem: k.canFinishItem ?? k.canCompleteItem ?? true,
        canChangePriority: k.canChangePriority ?? true,
        canViewFinancialValues: k.canViewValues ?? k.canViewFinancialValues ?? false,
        soundAlertsEnabled: k.soundAlerts ?? k.soundAlertsEnabled ?? true,
        printerId: k.printerId || '',
        kdsId: k.associatedKdsPrinter || k.kdsId || 'KDS Kitchen'
      };
    }

    case 'MANAGER': {
      const m = opConfig.managerConfig || formData.managerConfig || formData;
      return {
        managedEnvironments: m.managedEnvironments || [],
        maxDiscountPercent: m.maxDiscountPercentage ?? m.maxDiscountPercent ?? 15,
        canApproveDiscounts: m.allowDiscounts ?? m.canApproveDiscounts ?? true,
        canApproveCancellations: m.allowCancellations ?? m.canApproveCancellations ?? true,
        canOpenRegister: m.allowRegisterOpenClose ?? m.canOpenRegister ?? true,
        canCloseRegister: m.allowRegisterOpenClose ?? m.canCloseRegister ?? true,
        canManageInventory: m.manageStock ?? m.canManageInventory ?? true,
        canManageOrders: m.manageOrders ?? m.canManageOrders ?? true,
        canManageTeam: m.manageTeam ?? m.canManageTeam ?? false
      };
    }

    case 'RESTAURANT_ADMIN': {
      const a = opConfig.adminConfig || formData.adminConfig || formData;
      return {
        administrativeScopes: a.administrativeScopes || ['all'],
        criticalActionsEnabled: a.criticalActionsEnabled ?? true,
        canManageTeam: a.accessTeam ?? a.canManageTeam ?? true,
        canManageFinancial: a.accessFinancial ?? a.canManageFinancial ?? true,
        canManageSettings: a.accessSettings ?? a.canManageSettings ?? true,
        canManageProducts: a.accessProducts ?? a.canManageProducts ?? true,
        canManageInventory: a.accessStock ?? a.canManageInventory ?? true,
        canViewAudit: a.accessReports ?? a.canViewAudit ?? true
      };
    }

    case 'OWNER': {
      const o = opConfig.ownerConfig || formData.ownerConfig || formData;
      return {
        primaryOwner: o.isMainOwner ?? o.primaryOwner ?? true,
        recoveryContact: o.recoveryEmail || o.recoveryPhone || o.recoveryContact || '',
        enhancedConfirmationEnabled: o.confirmationRequired ?? o.enhancedConfirmationEnabled ?? true
      };
    }

    default:
      return {};
  }
}

export function extractCommonOperationalDataFromFormData(formData: any): CommonOperationalData {
  return {
    employeeId: formData.employeeId || formData.internalCode || '',
    internalCode: formData.internalCode || formData.employeeId || '',
    jobTitle: formData.jobTitle || '',
    admissionDate: formData.admissionDate || '',
    shift: formData.shift || '',
    workDays: formData.workDays || [],
    emergencyContact: formData.emergencyContact || '',
    observations: formData.observations || '',
    photoUrl: formData.photoUrl || formData.photoURL || ''
  };
}

export const staffProfileService = {
  // 1. getCanonicalUser
  async getCanonicalUser(uid: string): Promise<CanonicalUser | null> {
    try {
      const docRef = doc(db, 'users', uid);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return null;
      return { uid: snap.id, ...snap.data() } as CanonicalUser;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
      return null;
    }
  },

  // 2. getOperationalProfile
  async getOperationalProfile(uid: string, restaurantId: string): Promise<StaffProfile | null> {
    if (!uid || !restaurantId) return null;
    try {
      const profileRef = doc(db, 'restaurants', restaurantId, 'staffProfiles', uid);
      const snap = await getDoc(profileRef);

      if (snap.exists()) {
        return snap.data() as StaffProfile;
      }

      return null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `restaurants/${restaurantId}/staffProfiles/${uid}`);
      return null;
    }
  },

  // 3. createOperationalProfile
  async createOperationalProfile(
    user: { uid: string; restaurantId: string; role: TeamRole | string },
    formData: any,
    operatorId?: string
  ): Promise<StaffProfile> {
    const normRole = (user.role || '').toUpperCase() as TeamRole;

    const val = validateOperationalProfile(normRole, formData);
    if (!val.isValid) {
      throw new Error(`Validação falhou: ${val.errors.join(' ')}`);
    }

    const profileRef = doc(db, 'restaurants', user.restaurantId, 'staffProfiles', user.uid);
    const existingSnap = await getDoc(profileRef);
    if (existingSnap.exists()) {
      throw new Error(`Já existe um perfil operacional para o usuário ${user.uid} no restaurante.`);
    }

    const commonOperationalData = extractCommonOperationalDataFromFormData(formData);
    const roleSpecificData = extractRoleSpecificDataFromFormData(normRole, formData);
    const completeness = checkProfileCompleteness(normRole, { roleSpecificData, commonOperationalData });

    const now = new Date().toISOString();
    const newProfile: StaffProfile = {
      uid: user.uid,
      restaurantId: user.restaurantId,
      role: normRole,
      operationalStatus: formData.status === 'ACTIVE' || formData.active !== false ? 'AVAILABLE' : 'INACTIVE',
      profileComplete: completeness.profileComplete,
      profileVersion: '1.0',
      commonOperationalData,
      roleSpecificData,
      roleHistory: [],
      createdAt: now,
      updatedAt: now,
      createdBy: operatorId || 'SYSTEM'
    };

    await setDoc(profileRef, newProfile);
    return newProfile;
  },

  // 4. updateOperationalProfile
  async updateOperationalProfile(
    uid: string,
    restaurantId: string,
    formData: any,
    operatorId?: string
  ): Promise<StaffProfile> {
    const existing = await this.getOperationalProfile(uid, restaurantId);
    if (!existing) {
      throw new Error('Perfil operacional não encontrado.');
    }

    const normRole = existing.role;
    const commonOperationalData = {
      ...existing.commonOperationalData,
      ...extractCommonOperationalDataFromFormData(formData)
    };
    const newRoleSpecific = extractRoleSpecificDataFromFormData(normRole, formData);
    const roleSpecificData = {
      ...existing.roleSpecificData,
      ...newRoleSpecific
    };

    const completeness = checkProfileCompleteness(normRole, { roleSpecificData, commonOperationalData });
    const now = new Date().toISOString();

    const updatedProfile: StaffProfile = {
      ...existing,
      profileComplete: completeness.profileComplete,
      commonOperationalData,
      roleSpecificData,
      updatedAt: now,
      updatedBy: operatorId || 'SYSTEM'
    };

    const profileRef = doc(db, 'restaurants', restaurantId, 'staffProfiles', uid);
    await setDoc(profileRef, updatedProfile, { merge: true });
    return updatedProfile;
  },

  // 5. migrateOperationalProfile (role change with history)
  async migrateOperationalProfile(
    uid: string,
    restaurantId: string,
    oldRole: TeamRole | string,
    newRole: TeamRole | string,
    newFormData?: any,
    operatorId?: string
  ): Promise<StaffProfile> {
    const existing = await this.getOperationalProfile(uid, restaurantId);
    const targetRole = (newRole || '').toUpperCase() as TeamRole;

    const val = validateOperationalProfile(targetRole, newFormData);
    if (!val.isValid) {
      throw new Error(`Validação de migração falhou: ${val.errors.join(' ')}`);
    }

    const now = new Date().toISOString();
    let history: OperationalRoleHistory[] = existing?.roleHistory || [];

    if (existing) {
      history.push({
        role: existing.role,
        roleSpecificData: existing.roleSpecificData,
        commonOperationalData: existing.commonOperationalData,
        endedAt: now,
        changedBy: operatorId,
        reason: `Alteração de perfil de ${existing.role} para ${targetRole}`
      });
    }

    const commonOperationalData = extractCommonOperationalDataFromFormData(newFormData || existing?.commonOperationalData || {});
    const roleSpecificData = extractRoleSpecificDataFromFormData(targetRole, newFormData || {});
    const completeness = checkProfileCompleteness(targetRole, { roleSpecificData, commonOperationalData });

    const updatedProfile: StaffProfile = {
      uid,
      restaurantId,
      role: targetRole,
      operationalStatus: existing?.operationalStatus || 'AVAILABLE',
      profileComplete: completeness.profileComplete,
      profileVersion: '1.0',
      commonOperationalData,
      roleSpecificData,
      roleHistory: history,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || operatorId || 'SYSTEM',
      updatedBy: operatorId || 'SYSTEM'
    };

    const profileRef = doc(db, 'restaurants', restaurantId, 'staffProfiles', uid);
    await setDoc(profileRef, updatedProfile);
    return updatedProfile;
  },

  // 8. deactivateOperationalProfile
  async deactivateOperationalProfile(
    uid: string,
    restaurantId: string,
    operatorId?: string
  ): Promise<void> {
    const existing = await this.getOperationalProfile(uid, restaurantId);
    if (!existing) return;

    const profileRef = doc(db, 'restaurants', restaurantId, 'staffProfiles', uid);
    await updateDoc(profileRef, {
      operationalStatus: 'INACTIVE',
      updatedAt: new Date().toISOString(),
      updatedBy: operatorId || 'SYSTEM'
    });
  },

  // 9. anonymizeOperationalProfile
  async anonymizeOperationalProfile(
    uid: string,
    restaurantId: string,
    operatorId?: string
  ): Promise<void> {
    const profileRef = doc(db, 'restaurants', restaurantId, 'staffProfiles', uid);
    const userRef = doc(db, 'users', uid);
    const now = new Date().toISOString();

    const anonymizedCommon: CommonOperationalData = {
      employeeId: 'ANONIMIZADO',
      internalCode: 'ANONIMIZADO',
      jobTitle: 'ANONIMIZADO',
      admissionDate: '',
      shift: '',
      workDays: [],
      emergencyContact: 'REMOVIDO',
      observations: 'Usuário anonimizado em conformidade com LGPD.',
      photoUrl: ''
    };

    const anonymizedUserData = {
      name: 'Usuário Anonimizado',
      nome: 'Usuário Anonimizado',
      displayName: 'Anonimizado',
      email: `anonimo_${uid.substring(0, 8)}@removido.local`,
      phone: '00000000000',
      telefone: '00000000000',
      photoUrl: '',
      photoURL: '',
      status: 'INACTIVE',
      active: false,
      updatedAt: now,
      updatedBy: operatorId || 'SYSTEM',
      isAnonymized: true,
      anonymizedAt: now
    };

    await updateDoc(userRef, anonymizedUserData);

    const existingProfile = await this.getOperationalProfile(uid, restaurantId);
    if (existingProfile) {
      await updateDoc(profileRef, {
        commonOperationalData: anonymizedCommon,
        operationalStatus: 'INACTIVE',
        updatedAt: now,
        updatedBy: operatorId || 'SYSTEM',
        isAnonymized: true,
        anonymizedAt: now
      });
    }
  }
};
