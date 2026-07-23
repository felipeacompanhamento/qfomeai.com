import { 
  collection, 
  collectionGroup, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  startAfter, 
  QueryDocumentSnapshot, 
  DocumentData 
} from 'firebase/firestore';
import { db } from '../firebase';

export interface OrderReportFilters {
  dataInicio?: string | Date;
  dataFim?: string | Date;
  restaurantId?: string;
  cidade?: string;
  estado?: string;
  status?: string;
}

// --- CONTROLE DE CUSTO E PERFORMANCE ---

interface CacheEntry {
  data: any[];
  timestamp: number;
}

// Tempo de vida do cache (ex: 5 minutos)
const CACHE_TTL = 5 * 60 * 1000; 

// Armazena os resultados cacheados por chave de filtro
const queryCache = new Map<string, CacheEntry>();

// Armazena as Promises de requisições em andamento para evitar chamadas simultâneas idênticas
const activeRequests = new Map<string, Promise<any[]>>();

/**
 * Limpa o cache de relatórios manualmente (útil para botões de "Atualizar" na UI)
 */
export const clearReportCache = () => {
  queryCache.clear();
  console.log("Cache de relatórios limpo.");
};

/**
 * Busca todos os pedidos filtrados com controle de custo:
 * 1. Impede buscas sem filtros
 * 2. Retorna do cache se os mesmos filtros foram usados recentemente
 * 3. Evita múltiplas requisições simultâneas para os mesmos filtros
 * 4. Usa paginação interna para buscar grandes volumes
 */
export const getPedidosFiltrados = async (filters: OrderReportFilters): Promise<any[]> => {
  // 1. Verificar se pelo menos 1 filtro está ativo (Evita full scan no banco)
  const hasFilter = Object.values(filters).some(value => value !== undefined && value !== null && value !== '');
  if (!hasFilter) {
    console.warn("Bloqueado: Pelo menos um filtro deve estar ativo para buscar os relatórios.");
    return [];
  }

  // Gerar uma chave única baseada na combinação exata de filtros
  const cacheKey = JSON.stringify(filters);

  // 2. Verificar Cache (Evita consultas repetidas)
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log("Retornando dados do CACHE para os filtros:", filters);
    return cached.data;
  }

  // 3. Verificar Requisições Simultâneas (Evita concorrência)
  if (activeRequests.has(cacheKey)) {
    console.log("Aguardando requisição já em andamento para estes filtros...");
    return activeRequests.get(cacheKey)!;
  }

  // 4. Iniciar a busca real e armazenar a Promise
  const fetchPromise = (async () => {
    try {
      console.log("Iniciando busca no Firestore para os filtros:", filters);
      const allOrders = await fetchAllPages(filters);
      
      // Salvar resultado no cache
      queryCache.set(cacheKey, {
        data: allOrders,
        timestamp: Date.now()
      });
      
      return allOrders;
    } finally {
      // Remover da lista de requisições ativas ao terminar (seja sucesso ou erro)
      activeRequests.delete(cacheKey);
    }
  })();

  // Registrar a requisição como ativa
  activeRequests.set(cacheKey, fetchPromise);
  
  return fetchPromise;
};

/**
 * Função auxiliar que realiza a paginação real no Firestore
 */
const fetchAllPages = async (filters: OrderReportFilters): Promise<any[]> => {
  const { dataInicio, dataFim, restaurantId, cidade, estado, status } = filters;
  const allOrders: any[] = [];

  // 1. Identificar os IDs dos restaurantes alvo se houver filtros de localização
  let targetRestaurantIds: string[] = [];

  if (restaurantId) {
    targetRestaurantIds = [restaurantId];
  } else if (cidade || estado) {
    try {
      let restQuery = query(collection(db, 'restaurants'));
      if (cidade) restQuery = query(restQuery, where('endereco.cidade', '==', cidade));
      if (estado) restQuery = query(restQuery, where('endereco.estado', '==', estado));
      
      const restSnap = await getDocs(restQuery);
      targetRestaurantIds = restSnap.docs.map(doc => doc.id);
      
      // Se filtros de localização foram usados e nenhum restaurante foi encontrado, retorna vazio
      if (targetRestaurantIds.length === 0) {
        console.log("Nenhum restaurante encontrado para os filtros de localização informados.");
        return [];
      }
    } catch (error) {
      console.error("Erro ao buscar restaurantes por localização:", error);
      throw error;
    }
  }

  // 2. Buscar pedidos
  // Se temos IDs específicos de restaurantes, buscamos em suas subcoleções
  if (targetRestaurantIds.length > 0) {
    for (const rid of targetRestaurantIds) {
      let lastVisible: QueryDocumentSnapshot<DocumentData> | null = null;
      let hasMore = true;

      while (hasMore) {
        let q = query(collection(db, 'restaurants', rid, 'orders'));
        
        if (status) q = query(q, where('status', '==', status));
        
        // Filtros de período
        if (dataInicio) q = query(q, where('data_criacao', '>=', dataInicio));
        if (dataFim) q = query(q, where('data_criacao', '<=', dataFim));
        
        // Ordenação obrigatória para filtros de desigualdade
        if (dataInicio || dataFim) {
          q = query(q, orderBy('data_criacao'));
        }

        // Paginação
        if (lastVisible) q = query(q, startAfter(lastVisible));
        q = query(q, limit(100));

        try {
          const snapshot = await getDocs(q);
          if (snapshot.empty) {
            hasMore = false;
            break;
          }

          snapshot.docs.forEach(doc => {
            allOrders.push({ id: doc.id, ...(doc.data() as any) });
          });

          lastVisible = snapshot.docs[snapshot.docs.length - 1];
          if (snapshot.docs.length < 100) hasMore = false;
        } catch (error) {
          console.error(`Erro ao buscar pedidos do restaurante ${rid}:`, error);
          throw error;
        }
      }
    }
  } else {
    // Busca global usando collectionGroup (quando não há filtro de restaurante/localização)
    let lastVisible: QueryDocumentSnapshot<DocumentData> | null = null;
    let hasMore = true;

    while (hasMore) {
      let q = query(collectionGroup(db, 'orders'));
      
      if (status) q = query(q, where('status', '==', status));
      if (dataInicio) q = query(q, where('data_criacao', '>=', dataInicio));
      if (dataFim) q = query(q, where('data_criacao', '<=', dataFim));
      
      if (dataInicio || dataFim) {
        q = query(q, orderBy('data_criacao'));
      }

      if (lastVisible) q = query(q, startAfter(lastVisible));
      q = query(q, limit(100));

      try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        snapshot.docs.forEach(doc => {
          allOrders.push({ id: doc.id, ...(doc.data() as any) });
        });

        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.docs.length < 100) hasMore = false;
      } catch (error) {
        console.error("Erro ao buscar pedidos globais:", error);
        throw error;
      }
    }
  }

  return allOrders;
};
