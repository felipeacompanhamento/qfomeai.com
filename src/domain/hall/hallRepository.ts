import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query, 
  where,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Hall } from '../../types/mesas';
import { CreateHallInput, UpdateHallInput, createHallData } from './hall';
import { cache } from '../../utils/cache';

function validateRestaurantId(restaurantId: string): void {
  if (!restaurantId || typeof restaurantId !== 'string' || !restaurantId.trim()) {
    throw new Error('restaurantId é obrigatório para esta operação');
  }
}

function validateHallId(id: string): void {
  if (!id || typeof id !== 'string' || !id.trim()) {
    throw new Error('id do salão é obrigatório para esta operação');
  }
}

/**
 * Normaliza um documento de salão do Firestore para o tipo Hall canônico.
 * Compatibiliza campos legados sem alterar o banco de dados.
 */
export function normalizeHall(id: string, data: any): Hall {
  if (!data) {
    return {
      id,
      restaurantId: '',
      name: `Salão ${id}`,
      description: '',
      sortOrder: 0,
      active: true,
      createdAt: null,
      updatedAt: null
    };
  }

  const name = String(data.name || data.nome || id).trim();
  const description = data.description ?? data.descricao ?? '';

  const rawSortOrder = data.sortOrder ?? data.ordem;
  const sortOrder = typeof rawSortOrder === 'number' && !isNaN(rawSortOrder) ? rawSortOrder : 0;

  const rawActive = data.active ?? data.ativo;
  const active = rawActive !== false;

  const restaurantId = data.restaurantId || data.restaurante_id || data.restaurant_id || '';

  return {
    id,
    restaurantId,
    name,
    description: typeof description === 'string' ? description : String(description || ''),
    sortOrder,
    active,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null
  };
}

export async function listHalls(restaurantId: string): Promise<Hall[]> {
  validateRestaurantId(restaurantId);

  const cacheKey = `halls_${restaurantId.trim()}`;
  const cached = cache.get(cacheKey) as Hall[] | null;
  if (cached) {
    return cached;
  }

  const hallsRef = collection(db, 'halls');
  const q = query(
    hallsRef, 
    where('restaurantId', '==', restaurantId.trim())
  );
  
  const snapshot = await getDocs(q);
  const halls = snapshot.docs.map(docSnap => normalizeHall(docSnap.id, docSnap.data()));
  const sorted = halls.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  cache.set(cacheKey, sorted, 600); // 10 minutes cache
  return sorted;
}

export async function getHallById(id: string, restaurantId: string): Promise<Hall | null> {
  validateHallId(id);
  validateRestaurantId(restaurantId);

  const docRef = doc(db, 'halls', id.trim());
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  const hall = normalizeHall(docSnap.id, data);

  // Impedir acesso entre restaurantes diferente do informado
  if (hall.restaurantId && hall.restaurantId !== restaurantId.trim()) {
    throw new Error('Acesso negado: O salão não pertence ao restaurante informado');
  }

  return hall;
}

export async function createHall(input: CreateHallInput): Promise<Hall> {
  validateRestaurantId(input?.restaurantId);

  const hallData = createHallData(input);
  const hallsRef = collection(db, 'halls');
  const docRef = await addDoc(hallsRef, hallData);

  cache.remove(`halls_${input.restaurantId.trim()}`);

  return {
    id: docRef.id,
    ...hallData
  } as Hall;
}

export async function updateHall(id: string, restaurantId: string, input: UpdateHallInput): Promise<Hall> {
  validateHallId(id);
  validateRestaurantId(restaurantId);

  // Verificar existência e propriedade do restaurante
  const existingHall = await getHallById(id, restaurantId);
  if (!existingHall) {
    throw new Error('Salão não encontrado');
  }

  const updateData: Record<string, any> = {
    updatedAt: new Date()
  };

  if (input.name !== undefined) {
    if (!input.name || !input.name.trim()) {
      throw new Error('Nome do salão não pode ser vazio');
    }
    updateData.name = input.name.trim();
  }

  if (input.description !== undefined) {
    updateData.description = input.description ? input.description.trim() : '';
  }

  if (input.sortOrder !== undefined) {
    if (typeof input.sortOrder !== 'number' || isNaN(input.sortOrder)) {
      throw new Error('sortOrder deve ser um número válido');
    }
    updateData.sortOrder = input.sortOrder;
  }

  if (input.active !== undefined) {
    updateData.active = Boolean(input.active);
  }

  const docRef = doc(db, 'halls', id.trim());
  await updateDoc(docRef, updateData);

  cache.remove(`halls_${restaurantId.trim()}`);

  const updatedSnap = await getDoc(docRef);
  return normalizeHall(updatedSnap.id, updatedSnap.data());
}

export async function activateHall(id: string, restaurantId: string): Promise<Hall> {
  return updateHall(id, restaurantId, { active: true });
}

export async function deactivateHall(id: string, restaurantId: string): Promise<Hall> {
  // Desativação lógica (soft delete) com active=false, sem exclusão física
  return updateHall(id, restaurantId, { active: false });
}

export async function updateHallSortOrder(id: string, restaurantId: string, sortOrder: number): Promise<Hall> {
  if (sortOrder === undefined || typeof sortOrder !== 'number' || isNaN(sortOrder)) {
    throw new Error('sortOrder é obrigatório e deve ser um número válido');
  }
  return updateHall(id, restaurantId, { sortOrder });
}

export function subscribeHalls(
  restaurantId: string, 
  onNext: (halls: Hall[]) => void, 
  onError?: (error: Error) => void
): () => void {
  validateRestaurantId(restaurantId);

  const cacheKey = `halls_${restaurantId.trim()}`;
  const cached = cache.get(cacheKey) as Hall[] | null;
  if (cached && cached.length > 0) {
    onNext(cached);
  }

  const hallsRef = collection(db, 'halls');
  const q = query(
    hallsRef, 
    where('restaurantId', '==', restaurantId.trim())
  );

  return onSnapshot(
    q, 
    (snapshot) => {
      const hallsList = snapshot.docs.map(docSnap => normalizeHall(docSnap.id, docSnap.data()));
      hallsList.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      cache.set(cacheKey, hallsList, 600); // 10 minutes cache
      onNext(hallsList);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

export const hallRepository = {
  normalizeHall,
  listHalls,
  getHallById,
  createHall,
  updateHall,
  activateHall,
  deactivateHall,
  updateHallSortOrder,
  subscribeHalls
};

