import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { staticDataCacheService } from './staticDataCacheService';

export interface DeliveryArea {
  id?: string;
  bairro_id: string;
  bairro_nome: string;
  taxa_entrega: number;
  tempo_entrega: string;
  status: 'ativo' | 'inativo';
  created_at?: any;
}

export const deliveryAreaService = {
  async getDeliveryAreasByRestaurant(restaurantId: string): Promise<DeliveryArea[]> {
    return staticDataCacheService.getDeliveryAreas(restaurantId);
  },

  async createDeliveryArea(restaurantId: string, areaData: Omit<DeliveryArea, 'id' | 'created_at'>) {
    try {
      const res = await addDoc(collection(db, 'restaurants', restaurantId, 'delivery_areas'), {
        ...areaData,
        created_at: serverTimestamp()
      });
      staticDataCacheService.invalidateDeliveryAreas(restaurantId);
      return res;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/delivery_areas`);
    }
  },

  async updateDeliveryArea(restaurantId: string, areaId: string, areaData: Partial<DeliveryArea>) {
    try {
      await updateDoc(doc(db, 'restaurants', restaurantId, 'delivery_areas', areaId), areaData);
      staticDataCacheService.invalidateDeliveryAreas(restaurantId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/delivery_areas/${areaId}`);
    }
  },

  async deleteDeliveryArea(restaurantId: string, areaId: string) {
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'delivery_areas', areaId));
      staticDataCacheService.invalidateDeliveryAreas(restaurantId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/delivery_areas/${areaId}`);
    }
  }
};

