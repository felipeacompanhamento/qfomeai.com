import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { cache } from '../utils/cache';

export interface Report {
  id?: string;
  orderId: string;
  restaurantId: string;
  clientId: string;
  reporterId: string;
  reportedId: string;
  reporterType: 'restaurant' | 'client';
  message: string;
  status: 'pending' | 'resolved';
  createdAt: any;
}

export const submitReport = async (report: Omit<Report, 'createdAt' | 'status'>) => {
  try {
    const reportData: Report = {
      ...report,
      status: 'pending',
      createdAt: serverTimestamp(),
    };
    await addDoc(collection(db, 'reports'), reportData);
    cache.remove('reports_list'); // Invalidate cache on new report
    return { success: true };
  } catch (error) {
    console.error('Error submitting report:', error);
    return { success: false, error };
  }
};

export const getReports = async () => {
  const cacheKey = 'reports_list';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const q = query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    const reports = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cache.set(cacheKey, reports, 300); // 5 minutes cache
    return reports;
  } catch (error) {
    console.error('Error fetching reports:', error);
    return [];
  }
};
