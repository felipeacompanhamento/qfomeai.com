import { 
  collection, 
  query, 
  where, 
  getDocs
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface Neighborhood {
  id?: string;
  nome: string;
  cidade_id: string;
  ativo: boolean;
}

export const neighborhoodService = {
  async getAllNeighborhoods() {
    try {
      const q = query(
        collection(db, 'bairros'),
        where('ativo', '==', true)
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Neighborhood));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'bairros');
      return [];
    }
  }
};
