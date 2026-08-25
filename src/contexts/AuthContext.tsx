import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cache } from '../utils/cache';
import { canonicalUserService } from '../services/canonicalUserService';
import { resolveUserDestination } from '../utils/authResolution';
import { AccountType, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
  isRestaurant: boolean;
  isDriver: boolean;
  refreshUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (newData: any) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isRestaurant: false,
  isDriver: false,
  refreshUser: async () => {},
  refreshProfile: async () => {},
  updateProfile: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string) => {
    try {
      const canonicalUser = await canonicalUserService.getUserByUid(uid, 3500);
      if (canonicalUser) {
        setProfile(canonicalUser);
        if (canonicalUser.lgpdAccepted) {
          localStorage.setItem('lgpdAccepted', 'true');
        }
        return canonicalUser;
      } else {
        setProfile(null);
        return null;
      }
    } catch (error) {
      console.warn("[AuthContext] Erro controlado ao buscar perfil:", error);
      setProfile(null);
      return null;
    }
  }, []);

  const updateProfile = useCallback((newData: any) => {
    setProfile(prev => prev ? { ...prev, ...newData } : newData);
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Watchdog: se onAuthStateChanged não responder em até 5 segundos, libera loading
    const watchdogTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 5000);

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(watchdogTimer);
      if (!isMounted) return;
      setUser(firebaseUser);
      
      try {
        if (firebaseUser) {
          // Fetch profile once on auth state change (com timeout e fallback controlado)
          await fetchProfile(firebaseUser.uid);
        } else {
          cache.clearUserCache('');
          localStorage.removeItem('lgpdAccepted');
          setProfile(null);
        }
      } catch (err) {
        console.warn('[AuthContext] Erro ao processar perfil na mudança de auth:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(watchdogTimer);
      unsubscribeAuth();
    };
  }, [fetchProfile]);

  const refreshUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      setUser({ ...auth.currentUser });
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.accountType === AccountType.ADMIN || profile?.role === UserRole.ADMIN || user?.email === 'felipeacompanhamento@gmail.com',
    isRestaurant: profile?.accountType === AccountType.RESTAURANT,
    isDriver: profile?.accountType === AccountType.DRIVER || profile?.role === UserRole.DRIVER,
    refreshUser,
    refreshProfile,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
