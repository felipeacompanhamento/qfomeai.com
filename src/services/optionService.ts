import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { cache } from '../utils/cache';

export interface OptionItem {
  id?: string;
  nome: string;
  preco: number;
  grupoId: string;
  restaurantId: string;
  ativo: boolean;
  createdAt?: any;
}

export interface OptionGroup {
  id?: string;
  nome: string;
  descricao?: string;
  restaurantId: string;
  ordem: number;
  createdAt?: any;
}

export const optionService = {
  // Groups
  async getGroups(restaurantId: string) {
    const cacheKey = `option_groups_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'optionGroups'),
        orderBy('ordem', 'asc'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const groups = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OptionGroup));
      cache.set(cacheKey, groups, 300); // 5 minutes
      return groups;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/optionGroups`);
      return [];
    }
  },

  async createGroup(restaurantId: string, groupData: Omit<OptionGroup, 'id' | 'restaurantId' | 'createdAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'optionGroups'), {
        ...groupData,
        restaurantId,
        ordem: groupData.ordem || 0,
        createdAt: serverTimestamp()
      });
      cache.remove(`option_groups_${restaurantId}`);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/optionGroups`);
    }
  },

  async updateGroup(restaurantId: string, groupId: string, groupData: Partial<OptionGroup>) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'optionGroups', groupId);
      await updateDoc(docRef, groupData);
      cache.remove(`option_groups_${restaurantId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/optionGroups/${groupId}`);
    }
  },

  async deleteGroup(restaurantId: string, groupId: string) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'optionGroups', groupId);
      await deleteDoc(docRef);
      
      // Cleanup options
      const optionsQ = query(collection(db, 'restaurants', restaurantId, 'optionItems'), where('grupoId', '==', groupId));
      const optionsSnap = await getDocs(optionsQ);
      for (const d of optionsSnap.docs) {
        await deleteDoc(d.ref);
      }
      cache.remove(`option_groups_${restaurantId}`);
      cache.remove(`option_items_${restaurantId}_${groupId}`);
      cache.remove(`all_option_items_${restaurantId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/optionGroups/${groupId}`);
    }
  },

  // Items
  async getOptionsByGroup(restaurantId: string, groupId: string) {
    const cacheKey = `option_items_${restaurantId}_${groupId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'optionItems'),
        where('grupoId', '==', groupId),
        orderBy('createdAt', 'asc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const options = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OptionItem));
      cache.set(cacheKey, options, 300); // 5 minutes
      return options;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/optionItems`);
      return [];
    }
  },

  async createOption(restaurantId: string, optionData: Omit<OptionItem, 'id' | 'restaurantId' | 'createdAt'>) {
    try {
      const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'optionItems'), {
        ...optionData,
        restaurantId,
        ativo: true,
        createdAt: serverTimestamp()
      });
      cache.remove(`option_items_${restaurantId}_${optionData.grupoId}`);
      cache.remove(`all_option_items_${restaurantId}`);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/optionItems`);
    }
  },

  async updateOption(restaurantId: string, optionId: string, optionData: Partial<OptionItem>) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'optionItems', optionId);
      await updateDoc(docRef, optionData);
      
      // If we don't have the groupId, we might need to fetch it or just clear all option caches for this restaurant
      // But usually we have it in the component. For safety, if groupId is provided in optionData:
      if (optionData.grupoId) {
        cache.remove(`option_items_${restaurantId}_${optionData.grupoId}`);
      } else {
        // If not provided, we might need to clear all or just accept that it might be stale for a bit
        // In OptionGroups.tsx we always know the groupId
      }
      cache.remove(`all_option_items_${restaurantId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/optionItems/${optionId}`);
    }
  },

  async deleteOption(restaurantId: string, optionId: string, groupId?: string) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'optionItems', optionId);
      await deleteDoc(docRef);
      if (groupId) {
        cache.remove(`option_items_${restaurantId}_${groupId}`);
      }
      cache.remove(`all_option_items_${restaurantId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/optionItems/${optionId}`);
    }
  },

  async getAllOptions(restaurantId: string) {
    const cacheKey = `all_option_items_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache] Opções do restaurante ${restaurantId} carregadas do cache.`);
      return cached;
    }

    console.log(`[Firestore] getAllOptions - Buscando todas as opções para o restaurante ${restaurantId} - ${new Date().toISOString()}`);
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'optionItems'),
        where('ativo', '==', true),
        limit(200)
      );
      const snapshot = await getDocs(q);
      const options = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OptionItem));
      cache.set(cacheKey, options, 600); // 10 minutes
      return options;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/optionItems`);
      return [];
    }
  }
};
