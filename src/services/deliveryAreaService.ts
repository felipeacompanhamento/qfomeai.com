import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

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
  async getDeliveryAreasByRestaurant(restaurantId: string) {
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'delivery_areas'),
        orderBy('created_at', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DeliveryArea));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/delivery_areas`);
      return [];
    }
  },

  async createDeliveryArea(restaurantId: string, areaData: Omit<DeliveryArea, 'id' | 'created_at'>) {
    try {
      return await addDoc(collection(db, 'restaurants', restaurantId, 'delivery_areas'), {
        ...areaData,
        created_at: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/delivery_areas`);
    }
  },

  async updateDeliveryArea(restaurantId: string, areaId: string, areaData: Partial<DeliveryArea>) {
    try {
      await updateDoc(doc(db, 'restaurants', restaurantId, 'delivery_areas', areaId), areaData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/delivery_areas/${areaId}`);
    }
  },

  async deleteDeliveryArea(restaurantId: string, areaId: string) {
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'delivery_areas', areaId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/delivery_areas/${areaId}`);
    }
  }
};
