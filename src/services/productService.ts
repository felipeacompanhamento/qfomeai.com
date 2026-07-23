import { cache } from '../utils/cache';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  limit
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { invalidateRestaurantCache } from './restaurantService';

export interface ProductSize {
  nome: string;
  preco: number;
  aceita_metade: boolean;
}

export interface Product {
  id?: string;
  nome: string;
  descricao: string;
  categoria_id: string;
  categoria_nome: string;
  imagem_url: string;
  preco: number;
  min_extras: number;
  max_extras: number;
  status: 'ativo' | 'inativo';
  exibir_adicionais?: boolean;
  sizes?: ProductSize[];
  optionGroups?: {
    groupId: string;
    nome: string;
    ordem: number;
    obrigatorio: boolean;
    min: number;
    max: number;
  }[];
  created_at?: any;
}

export const productService = {
  async getCategoriesByRestaurant(restaurantId: string) {
    console.log(`[Firestore] getCategoriesByRestaurant - Buscando categorias do restaurante ${restaurantId} - ${new Date().toISOString()}`);
    const cacheKey = `categories_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'categories'),
        where('status', '==', 'ativo'),
        orderBy('nome', 'asc')
      );
      const querySnapshot = await getDocs(q);
      console.log(`[Firestore] getDocs - Query executada com sucesso - ${new Date().toISOString()}`);
      const categories = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cache.set(cacheKey, categories, 300); // 5 minutes
      return categories;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/categories`);
      return [];
    }
  },

  async getProducts(restaurantId: string) {
    const cacheKey = `products_${restaurantId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const q = query(
        collection(db, 'restaurants', restaurantId, 'products'),
        orderBy('created_at', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const products = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      cache.set(cacheKey, products, 300); // 5 minutes
      return products;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `restaurants/${restaurantId}/products`);
      return [];
    }
  },

  async uploadProductImage(restaurantId: string, productId: string, file: File) {
    try {
      const storageRef = ref(storage, `restaurants/${restaurantId}/products/${productId}.jpg`);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error("Error uploading product image:", error);
      throw error;
    }
  },

  async createProduct(restaurantId: string, productData: Omit<Product, 'id' | 'created_at'>, imageFile?: File) {
    try {
      const docRef = await addDoc(collection(db, 'restaurants', restaurantId, 'products'), {
        ...productData,
        created_at: serverTimestamp()
      });

      if (imageFile) {
        const imageUrl = await this.uploadProductImage(restaurantId, docRef.id, imageFile);
        await updateDoc(docRef, { imagem_url: imageUrl });
      }

      invalidateRestaurantCache(restaurantId);
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `restaurants/${restaurantId}/products`);
    }
  },

  async updateProduct(restaurantId: string, productId: string, productData: Partial<Product>, imageFile?: File) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'products', productId);
      
      let updatePayload = { ...productData };
      
      if (imageFile) {
        const imageUrl = await this.uploadProductImage(restaurantId, productId, imageFile);
        updatePayload.imagem_url = imageUrl;
      }

      await updateDoc(docRef, updatePayload);
      invalidateRestaurantCache(restaurantId);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `restaurants/${restaurantId}/products/${productId}`);
    }
  },

  async deleteProduct(restaurantId: string, productId: string) {
    try {
      const docRef = doc(db, 'restaurants', restaurantId, 'products', productId);
      await deleteDoc(docRef);
      invalidateRestaurantCache(restaurantId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `restaurants/${restaurantId}/products/${productId}`);
    }
  }
};
