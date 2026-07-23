import { 
  collection, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp, 
  query, 
  where,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

export interface PrestadorServico {
  id: string;
  nome: string;
  telefone: string;
  categoria: string;
  subcategoria?: string;
  subcategoriaOutro?: string;
  titulo: string;
  descricao: string;
  cidade: string;
  cidade_id: string;
  estado: string;
  estado_id: string;
  bairro?: string;
  logoUrl?: string;
  userId: string;
  ativo: boolean;
  formaAtendimento?: string[]; // ['domicilio', 'local', 'online']
  formasPagamento?: string[]; // ['pix', 'dinheiro', 'cartao']
  modeloPreco?: string; // 'orcamento', 'a_partir', 'gratuito'
  valorInicial?: string;
  registroProfissional?: string;
  totalWhatsappClicks?: number;
  uniqueWhatsappInterests?: number;
  lastWhatsappClickAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface ServicoInteresseEvent {
  id?: string;
  serviceId: string;
  serviceTitle: string;
  serviceOwnerId: string;
  clickedAt: any;
  source: string;
  pagePath: string;
  visitorUserId?: string | null;
  anonymousSessionId?: string;
  approximateCity?: string;
  deviceType?: string;
  serviceStatus?: boolean;
}

export function getOrCreateSessionId(): string {
  try {
    let sessionId = localStorage.getItem('qfome_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now();
      localStorage.setItem('qfome_session_id', sessionId);
    }
    return sessionId;
  } catch (e) {
    return 'sess_fallback_' + Date.now();
  }
}

function isDuplicateClickWithinWindow(serviceId: string, windowMs = 30000): boolean {
  try {
    const key = `qfome_wa_click_${serviceId}`;
    const lastClick = localStorage.getItem(key);
    const now = Date.now();
    if (lastClick) {
      const elapsed = now - parseInt(lastClick, 10);
      if (elapsed < windowMs) {
        return true;
      }
    }
    localStorage.setItem(key, now.toString());
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Fetch all service provider listings
 */
export async function getPrestadoresServicos(): Promise<PrestadorServico[]> {
  try {
    const qRef = collection(db, 'prestadores_servicos');
    const querySnapshot = await getDocs(qRef);

    const items: PrestadorServico[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        nome: data.nome || '',
        telefone: data.telefone || '',
        categoria: data.categoria || 'outros',
        subcategoria: data.subcategoria || '',
        subcategoriaOutro: data.subcategoriaOutro || '',
        titulo: data.titulo || '',
        descricao: data.descricao || '',
        cidade: data.cidade || '',
        cidade_id: data.cidade_id || '',
        estado: data.estado || '',
        estado_id: data.estado_id || '',
        bairro: data.bairro || '',
        logoUrl: data.logoUrl || '',
        userId: data.userId || data.user_id || data.cliente_id || '',
        ativo: data.ativo !== false,
        formaAtendimento: Array.isArray(data.formaAtendimento) ? data.formaAtendimento : [],
        formasPagamento: Array.isArray(data.formasPagamento) ? data.formasPagamento : [],
        modeloPreco: data.modeloPreco || 'orcamento',
        valorInicial: data.valorInicial || '',
        registroProfissional: data.registroProfissional || '',
        totalWhatsappClicks: typeof data.totalWhatsappClicks === 'number' ? data.totalWhatsappClicks : 0,
        uniqueWhatsappInterests: typeof data.uniqueWhatsappInterests === 'number' ? data.uniqueWhatsappInterests : 0,
        lastWhatsappClickAt: data.lastWhatsappClickAt || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      });
    });

    items.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });

    return items;
  } catch (err: any) {
    console.error("Error loading services:", err);
    handleFirestoreError(err, OperationType.LIST, 'prestadores_servicos');
    return [];
  }
}

/**
 * Fetch services owned by a specific provider/user
 */
export async function getPrestadoresServicosByOwner(userId: string): Promise<PrestadorServico[]> {
  try {
    if (!userId) return [];
    
    const itemsMap = new Map<string, PrestadorServico>();

    const parseDoc = (docSnap: any) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        nome: data.nome || '',
        telefone: data.telefone || '',
        categoria: data.categoria || 'outros',
        subcategoria: data.subcategoria || '',
        subcategoriaOutro: data.subcategoriaOutro || '',
        titulo: data.titulo || '',
        descricao: data.descricao || '',
        cidade: data.cidade || '',
        cidade_id: data.cidade_id || '',
        estado: data.estado || '',
        estado_id: data.estado_id || '',
        bairro: data.bairro || '',
        logoUrl: data.logoUrl || '',
        userId: data.userId || data.user_id || data.cliente_id || userId,
        ativo: data.ativo !== false,
        formaAtendimento: Array.isArray(data.formaAtendimento) ? data.formaAtendimento : [],
        formasPagamento: Array.isArray(data.formasPagamento) ? data.formasPagamento : [],
        modeloPreco: data.modeloPreco || 'orcamento',
        valorInicial: data.valorInicial || '',
        registroProfissional: data.registroProfissional || '',
        totalWhatsappClicks: typeof data.totalWhatsappClicks === 'number' ? data.totalWhatsappClicks : 0,
        uniqueWhatsappInterests: typeof data.uniqueWhatsappInterests === 'number' ? data.uniqueWhatsappInterests : 0,
        lastWhatsappClickAt: data.lastWhatsappClickAt || null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
    };

    const q1 = query(collection(db, 'prestadores_servicos'), where('userId', '==', userId));
    const snap1 = await getDocs(q1);
    snap1.forEach((docSnap) => {
      itemsMap.set(docSnap.id, parseDoc(docSnap));
    });

    try {
      const q2 = query(collection(db, 'prestadores_servicos'), where('user_id', '==', userId));
      const snap2 = await getDocs(q2);
      snap2.forEach((docSnap) => {
        if (!itemsMap.has(docSnap.id)) {
          itemsMap.set(docSnap.id, parseDoc(docSnap));
        }
      });
    } catch (e) {
      // Ignore fallback query failure
    }

    const items = Array.from(itemsMap.values());

    items.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });

    return items;
  } catch (err: any) {
    console.error("Error loading owner services:", err);
    handleFirestoreError(err, OperationType.LIST, 'prestadores_servicos');
    return [];
  }
}

/**
 * Create a new service listing
 */
export async function createPrestadorServico(payload: Omit<PrestadorServico, 'id'>): Promise<string> {
  try {
    const dataToSave = {
      ...payload,
      userId: payload.userId || '',
      user_id: payload.userId || '',
      totalWhatsappClicks: 0,
      uniqueWhatsappInterests: 0,
      lastWhatsappClickAt: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    const docRef = await addDoc(collection(db, 'prestadores_servicos'), dataToSave);
    return docRef.id;
  } catch (err: any) {
    console.error("Error creating service:", err);
    handleFirestoreError(err, OperationType.CREATE, 'prestadores_servicos');
    throw err;
  }
}

/**
 * Update existing service listing
 */
export async function updatePrestadorServico(serviceId: string, payload: Partial<PrestadorServico>): Promise<void> {
  try {
    const docRef = doc(db, 'prestadores_servicos', serviceId);
    const dataToUpdate: any = {
      ...payload,
      updatedAt: Timestamp.now()
    };
    delete dataToUpdate.id;
    if (dataToUpdate.userId) {
      dataToUpdate.user_id = dataToUpdate.userId;
    }
    await updateDoc(docRef, dataToUpdate);
  } catch (err: any) {
    console.error("Error updating service:", err);
    handleFirestoreError(err, OperationType.UPDATE, `prestadores_servicos/${serviceId}`);
    throw err;
  }
}

/**
 * Set service status to paused (ativo: false)
 */
export async function pausePrestadorServico(serviceId: string): Promise<void> {
  return updatePrestadorServico(serviceId, { ativo: false });
}

/**
 * Set service status to active (ativo: true)
 */
export async function reactivatePrestadorServico(serviceId: string): Promise<void> {
  return updatePrestadorServico(serviceId, { ativo: true });
}

/**
 * Delete a service
 */
export async function deletePrestadorServico(serviceId: string): Promise<void> {
  try {
    if (!serviceId) {
      throw new Error("ID do serviço é necessário para exclusão.");
    }
    const docRef = doc(db, 'prestadores_servicos', serviceId);
    await deleteDoc(docRef);
  } catch (err: any) {
    console.error("Error deleting service:", err);
    handleFirestoreError(err, OperationType.DELETE, `prestadores_servicos/${serviceId}`);
    throw err;
  }
}

/**
 * Record a WhatsApp button click event
 * Safely increments counter and logs interest event without blocking user flow.
 */
export async function registerWhatsappClick(
  service: PrestadorServico,
  source: string = 'card_servicos',
  visitorUserId?: string | null,
  userCity?: string
): Promise<boolean> {
  try {
    if (!service || !service.id) return false;

    // Check anti-spam threshold (30 seconds)
    if (isDuplicateClickWithinWindow(service.id, 30000)) {
      console.log('Skipping duplicate interest registration within 30s window');
      return false;
    }

    const serviceRef = doc(db, 'prestadores_servicos', service.id);

    // 1. Increment totalWhatsappClicks on service doc
    updateDoc(serviceRef, {
      totalWhatsappClicks: increment(1),
      lastWhatsappClickAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    }).catch(err => {
      console.warn('Silent warning: Failed to update totalWhatsappClicks counter:', err);
    });

    // 2. Create interest event log in servicos_interesses_whatsapp
    const deviceType = window.innerWidth < 640 ? 'mobile' : window.innerWidth < 1024 ? 'tablet' : 'desktop';
    const eventPayload: Omit<ServicoInteresseEvent, 'id'> = {
      serviceId: service.id,
      serviceTitle: service.titulo || service.nome || 'Serviço',
      serviceOwnerId: service.userId || '',
      clickedAt: Timestamp.now(),
      source: source,
      pagePath: window.location.pathname || '/servicos',
      visitorUserId: visitorUserId || null,
      anonymousSessionId: getOrCreateSessionId(),
      approximateCity: userCity || service.cidade || '',
      deviceType: deviceType,
      serviceStatus: service.ativo !== false
    };

    addDoc(collection(db, 'servicos_interesses_whatsapp'), eventPayload).catch(err => {
      console.warn('Silent warning: Failed to log interest event record:', err);
    });

    return true;
  } catch (err) {
    console.error('Non-blocking error during registerWhatsappClick:', err);
    return false;
  }
}

/**
 * Fetch interest events for services owned by a provider
 */
export async function getInteressesByOwner(ownerUserId: string): Promise<ServicoInteresseEvent[]> {
  try {
    if (!ownerUserId) return [];
    const q = query(
      collection(db, 'servicos_interesses_whatsapp'), 
      where('serviceOwnerId', '==', ownerUserId)
    );
    const querySnapshot = await getDocs(q);

    const events: ServicoInteresseEvent[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      events.push({
        id: docSnap.id,
        serviceId: data.serviceId || '',
        serviceTitle: data.serviceTitle || '',
        serviceOwnerId: data.serviceOwnerId || '',
        clickedAt: data.clickedAt,
        source: data.source || 'card_servicos',
        pagePath: data.pagePath || '/servicos',
        visitorUserId: data.visitorUserId || null,
        anonymousSessionId: data.anonymousSessionId || '',
        approximateCity: data.approximateCity || '',
        deviceType: data.deviceType || 'desconhecido',
        serviceStatus: data.serviceStatus !== false
      });
    });

    events.sort((a, b) => {
      const timeA = a.clickedAt?.toMillis ? a.clickedAt.toMillis() : 0;
      const timeB = b.clickedAt?.toMillis ? b.clickedAt.toMillis() : 0;
      return timeB - timeA;
    });

    return events;
  } catch (err: any) {
    console.error("Error fetching service interests:", err);
    handleFirestoreError(err, OperationType.LIST, 'servicos_interesses_whatsapp');
    return [];
  }
}
