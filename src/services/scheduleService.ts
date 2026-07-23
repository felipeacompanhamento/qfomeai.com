import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  setDoc, 
  addDoc,
  deleteDoc,
  orderBy,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface Schedule {
  id?: string;
  dia_semana: string;
  hora_abertura: string;
  hora_fechamento: string;
  status: 'aberto' | 'fechado';
  created_at?: any;
}

export const scheduleService = {
  async getSchedulesByRestaurant(restaurantId: string) {
    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'schedules'),
        orderBy('dia_semana', 'asc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/schedules`);
      return [];
    }
  },

  async createSchedule(restaurantId: string, scheduleData: Schedule) {
    try {
      await addDoc(collection(db, 'restaurants', restaurantId, 'schedules'), scheduleData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/schedules`);
    }
  },

  async updateSchedule(restaurantId: string, scheduleId: string, scheduleData: Partial<Schedule>) {
    try {
      await setDoc(doc(db, 'restaurants', restaurantId, 'schedules', scheduleId), scheduleData, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/schedules/${scheduleId}`);
    }
  },

  async deleteSchedule(restaurantId: string, scheduleId: string) {
    try {
      await deleteDoc(doc(db, 'restaurants', restaurantId, 'schedules', scheduleId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/schedules/${scheduleId}`);
    }
  }
};
