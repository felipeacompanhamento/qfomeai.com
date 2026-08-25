import { staticDataCacheService } from './staticDataCacheService';

export interface Neighborhood {
  id?: string;
  nome: string;
  cidade_id: string;
  ativo: boolean;
}

export const neighborhoodService = {
  async getAllNeighborhoods(): Promise<Neighborhood[]> {
    return staticDataCacheService.getNeighborhoods();
  },

  async getNeighborhoodsByCity(cidadeId: string): Promise<Neighborhood[]> {
    return staticDataCacheService.getNeighborhoods(cidadeId);
  }
};

