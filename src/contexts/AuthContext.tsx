import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { cache } from '../utils/cache';

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
      const docSnap = await getDoc(doc(db, 'users', uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile(data);
        if (data.lgpdAccepted) {
          localStorage.setItem('lgpdAccepted', 'true');
        }
        return data;
      } else {
        setProfile(null);
        return null;
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
      return null;
    }
  }, []);

  const updateProfile = useCallback((newData: any) => {
    setProfile(prev => prev ? { ...prev, ...newData } : newData);
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Fetch profile once on auth state change
        await fetchProfile(firebaseUser.uid);
      } else {
        cache.clearUserCache('');
        localStorage.removeItem('lgpdAccepted');
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
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
    isAdmin: profile?.tipo_usuario === 'admin' || user?.email === 'felipeacompanhamento@gmail.com',
    isRestaurant: profile?.tipo_usuario === 'restaurant' || profile?.tipo_usuario === 'restaurante',
    isDriver: profile?.tipo_usuario === 'delivery_driver' || profile?.tipo_usuario === 'entregador' || profile?.role === 'delivery_driver' || profile?.role === 'entregador',
    refreshUser,
    refreshProfile,
    updateProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div className="flex items-center justify-center h-screen font-sans text-emerald-600">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
