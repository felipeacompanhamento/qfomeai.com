export function normalizeWaiterPermissionsServer(raw: any = {}) {
  return {
    createOrders: raw.createOrders === true,
    editOwnOrders: raw.editOwnOrders === true,
    editOtherWaitersOrders: raw.editOtherWaitersOrders === true,
    cancelUnsentItems: raw.cancelUnsentItems === true,
    cancelSentItems: raw.cancelSentItems === true,
    applyDiscount: raw.applyDiscount === true,
    transferTable: raw.transferTable === true,
    mergeTables: raw.mergeTables === true,
    receivePayment: raw.receivePayment === true,
    closeTable: raw.closeTable === true,
    viewFinancialTotals: raw.viewFinancialTotals === true
  };
}

export function extractServerCommonData(formData: any) {
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

export function extractServerRoleSpecificData(role: string, formData: any) {
  const normRole = (role || '').toUpperCase();
  const opConfig = formData.operationalConfig || formData || {};

  switch (normRole) {
    case 'WAITER': {
      const w = opConfig.waiterConfig || formData.waiterConfig || formData;
      const pin = w.operationalPin || w.pinCode || formData.pinCode || '';
      return {
        environments: w.environments || w.attendedHalls || [],
        assignedTables: w.assignedTables || [],
        shift: w.shift || formData.shift || 'Manhã / Tarde',
        operationalPin: pin,
        pinCode: pin,
        canOpenTab: w.canOpenTab ?? w.createOrders ?? true,
        canTransferTable: w.canTransferTable ?? w.transferTable ?? true,
        canApplyDiscount: w.canApplyDiscount ?? w.applyDiscount ?? false,
        maxDiscountPercent: w.maxDiscountPercent ?? w.maxDiscountPercentage ?? 5,
        canCancelItem: w.canCancelItem ?? w.cancelUnsentItems ?? true,
        canCloseAccount: w.canCloseAccount ?? w.closeTable ?? true,
        canViewPrices: w.canViewPrices ?? w.viewFinancialTotals ?? true,
        commissionType: w.commissionType || 'PERCENTAGE',
        commissionValue: w.commissionValue ?? w.commissionRate ?? 10
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
        compensationType: d.compensationType || d.remunerationType || 'FIXED_PER_DELIVERY',
        compensationValue: d.compensationValue ?? d.remunerationValue ?? 7.50,
        availability: d.availability || d.availabilityStatus || 'OFFLINE',
        locationSharingEnabled: d.locationSharingEnabled ?? d.locationSharing ?? true,
        deliveryAreas: d.deliveryAreas || [],
        deliveryRadiusKm: d.deliveryRadiusKm ?? 8,
        operationalNotes: d.operationalNotes || ''
      };
    }

    case 'CASHIER': {
      const c = opConfig.cashierConfig || formData.cashierConfig || formData;
      const pin = c.criticalActionPinRequired || c.pinCode || formData.pinCode || '';
      return {
        authorizedRegisters: c.authorizedRegisters || ['Caixa 01'],
        canOpenRegister: c.canOpenRegister ?? true,
        canCloseRegister: c.canCloseRegister ?? true,
        canCreateWithdrawal: c.canCreateWithdrawal ?? c.canSangria ?? true,
        canCreateSupply: c.canCreateSupply ?? c.canSuprimento ?? true,
        canApplyDiscount: c.canApplyDiscount ?? true,
        maxDiscountPercent: c.maxDiscountPercent ?? c.maxDiscountPercentage ?? 10,
        canCancelSale: c.canCancelSale ?? true,
        canRefundPayment: c.canRefundPayment ?? c.canRefund ?? true,
        allowedPaymentMethods: c.allowedPaymentMethods || ['Dinheiro', 'Cartão Crédito', 'Cartão Débito', 'Pix'],
        criticalActionPinRequired: pin,
        pinCode: pin
      };
    }

    case 'KITCHEN': {
      const k = opConfig.kitchenConfig || formData.kitchenConfig || formData;
      return {
        productionStations: k.productionStations || ['Cozinha Principal'],
        visibleProductCategories: k.visibleProductCategories || k.viewedCategories || [],
        canAcceptOrder: k.canAcceptOrder ?? true,
        canStartPreparation: k.canStartPreparation ?? k.canStartPrep ?? true,
        canCompleteItem: k.canCompleteItem ?? k.canFinishItem ?? true,
        canChangePriority: k.canChangePriority ?? true,
        canViewFinancialValues: k.canViewFinancialValues ?? k.canViewValues ?? false,
        soundAlertsEnabled: k.soundAlertsEnabled ?? k.soundAlerts ?? true,
        printerId: k.printerId || '',
        kdsId: k.kdsId || k.associatedKdsPrinter || 'KDS Kitchen'
      };
    }

    case 'MANAGER': {
      const m = opConfig.managerConfig || formData.managerConfig || formData;
      return {
        managedEnvironments: m.managedEnvironments || [],
        maxDiscountPercent: m.maxDiscountPercent ?? m.maxDiscountPercentage ?? 15,
        canApproveDiscounts: m.canApproveDiscounts ?? m.allowDiscounts ?? true,
        canApproveCancellations: m.canApproveCancellations ?? m.allowCancellations ?? true,
        canOpenRegister: m.canOpenRegister ?? m.allowRegisterOpenClose ?? true,
        canCloseRegister: m.canCloseRegister ?? m.allowRegisterOpenClose ?? true,
        canManageInventory: m.canManageInventory ?? m.manageStock ?? true,
        canManageOrders: m.canManageOrders ?? m.manageOrders ?? true,
        canManageTeam: m.canManageTeam ?? m.manageTeam ?? false
      };
    }

    case 'RESTAURANT_ADMIN': {
      const a = opConfig.adminConfig || formData.adminConfig || formData;
      return {
        administrativeScopes: a.administrativeScopes || ['all'],
        criticalActionsEnabled: a.criticalActionsEnabled ?? true,
        canManageTeam: a.canManageTeam ?? a.accessTeam ?? true,
        canManageFinancial: a.canManageFinancial ?? a.accessFinancial ?? true,
        canManageSettings: a.canManageSettings ?? a.accessSettings ?? true,
        canManageProducts: a.canManageProducts ?? a.accessProducts ?? true,
        canManageInventory: a.canManageInventory ?? a.accessStock ?? true,
        canViewAudit: a.canViewAudit ?? a.accessReports ?? true
      };
    }

    case 'OWNER': {
      const o = opConfig.ownerConfig || formData.ownerConfig || formData;
      return {
        primaryOwner: false,
        recoveryContact: o.recoveryContact || o.recoveryEmail || o.recoveryPhone || '',
        enhancedConfirmationEnabled: o.enhancedConfirmationEnabled ?? o.confirmationRequired ?? true
      };
    }

    default:
      return {};
  }
}

export function checkServerProfileCompleteness(role: string, data: any) {
  const missingFields: string[] = [];
  const reasons: string[] = [];
  const normRole = (role || '').toUpperCase();

  const roleData = data?.roleSpecificData || data || {};
  const common = data?.commonOperationalData || data || {};

  switch (normRole) {
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
        reasons.push('Tipo de veículo é obrigatório para entregadores.');
      }
      break;
    }

    case 'CASHIER': {
      break;
    }

    case 'KITCHEN': {
      break;
    }

    case 'MANAGER': {
      break;
    }

    case 'RESTAURANT_ADMIN': {
      break;
    }

    case 'OWNER': {
      break;
    }

    default:
      break;
  }

  return {
    isComplete: missingFields.length === 0,
    profileComplete: missingFields.length === 0,
    missingFields,
    reasons
  };
}
