import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { staffProfileService } from '../services/staffProfileService';
import { StaffProfile, WaiterOperationalData } from '../types/staffProfile';
import { LoadingState } from '../components/ui/Feedback';

export interface WaiterContextType {
  staffProfile: StaffProfile | null;
  waiterConfig: WaiterOperationalData;
  attendedHalls: string[];
  assignedTables: string[];
  loading: boolean;
  error: string | null;
  refetchProfile: () => Promise<void>;
}

export function extractWaiterConfig(profile: StaffProfile | null): WaiterOperationalData {
  const defaultData: WaiterOperationalData = {
    environments: [],
    attendedHalls: [],
    assignedTables: [],
    shift: 'FULL_TIME',
    operationalPin: '',
    canOpenTab: true,
    canTransferTable: true,
    canApplyDiscount: false,
    maxDiscountPercent: 0,
    canCancelItem: true,
    canCloseAccount: false,
    canViewPrices: true,
    canViewOtherWaitersTabs: true,
    canAssignOtherWaitersTabs: true,
    commissionType: 'PERCENTAGE',
    commissionValue: 0
  };

  if (!profile || !profile.roleSpecificData) {
    return defaultData;
  }

  const rsd = profile.roleSpecificData as any;
  const envs = Array.isArray(rsd.environments) 
    ? rsd.environments 
    : (Array.isArray(rsd.attendedHalls) ? rsd.attendedHalls : []);

  return {
    ...defaultData,
    ...rsd,
    environments: envs,
    attendedHalls: envs,
    assignedTables: Array.isArray(rsd.assignedTables) ? rsd.assignedTables : [],
    canOpenTab: rsd.canOpenTab !== false,
    canTransferTable: rsd.canTransferTable !== false,
    canApplyDiscount: Boolean(rsd.canApplyDiscount),
    maxDiscountPercent: Number(rsd.maxDiscountPercent) || 0,
    canCancelItem: rsd.canCancelItem !== false,
    canCloseAccount: false,
    canViewPrices: rsd.canViewPrices !== false,
    canViewOtherWaitersTabs: rsd.canViewOtherWaitersTabs !== false,
    canAssignOtherWaitersTabs: rsd.canAssignOtherWaitersTabs !== false
  };
}

const WaiterContext = createContext<WaiterContextType | undefined>(undefined);

export const WaiterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    if (!user?.uid || !profile?.restaurantId) {
      setStaffProfile(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await staffProfileService.getOperationalProfile(user.uid, profile.restaurantId);
      setStaffProfile(res);
    } catch (err: any) {
      console.error('Erro ao carregar perfil operacional do garçom:', err);
      setError(err?.message || 'Erro ao carregar permissões do garçom');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user?.uid, profile?.restaurantId]);

  const waiterConfig = extractWaiterConfig(staffProfile);
  const attendedHalls = waiterConfig.environments;
  const assignedTables = waiterConfig.assignedTables;

  return (
    <WaiterContext.Provider
      value={{
        staffProfile,
        waiterConfig,
        attendedHalls,
        assignedTables,
        loading,
        error,
        refetchProfile: fetchProfile
      }}
    >
      {loading ? (
        <LoadingState message="Carregando permissões do garçom..." />
      ) : (
        children
      )}
    </WaiterContext.Provider>
  );
};

export const useWaiter = (): WaiterContextType => {
  const context = useContext(WaiterContext);
  if (!context) {
    throw new Error('useWaiter deve ser usado dentro de um WaiterProvider');
  }
  return context;
};
