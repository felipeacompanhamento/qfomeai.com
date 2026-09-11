import { ref, deleteObject, StorageReference } from 'firebase/storage';
import { storage } from '../firebase';

export type StorageCategory = 'logo' | 'cover' | 'products';

export interface StorageCleanupResult {
  success: boolean;
  deletedPath?: string;
  reason?: string;
}

/**
 * Obtém a referência do Firebase Storage de forma segura a partir de uma URL ou path.
 * Se a URL for externa (Unsplash, placeholder, etc.) ou inválida, retorna null.
 */
export function getStorageRefFromUrl(urlOrPath: string): StorageReference | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  try {
    const storageRef = ref(storage, trimmed);
    if (!storageRef.fullPath || storageRef.fullPath === '/') {
      return null;
    }
    return storageRef;
  } catch (err: any) {
    // URL externa, inválida ou de outro serviço
    return null;
  }
}

/**
 * Apaga um arquivo do Firebase Storage com validações estritas de segurança:
 * 1. O arquivo DEVE pertencer estritamente ao restaurante informado (restaurants/${restaurantId}/...)
 * 2. Se especificada categoria ('logo', 'cover', 'products'), o arquivo deve pertencer a essa subpasta
 * 3. Se o arquivo não existir mais no Storage, não quebra o fluxo
 * 4. Nunca apaga arquivos de outros restaurantes, imagem nova ou arquivos compartilhados
 */
export async function deleteStorageFile(
  urlOrPath: string | null | undefined,
  restaurantId: string,
  category?: StorageCategory
): Promise<StorageCleanupResult> {
  if (!urlOrPath || typeof urlOrPath !== 'string' || !urlOrPath.trim()) {
    return { success: false, reason: 'URL ou caminho vazio' };
  }

  if (!restaurantId || typeof restaurantId !== 'string' || !restaurantId.trim()) {
    return { success: false, reason: 'ID do restaurante não fornecido' };
  }

  const storageRef = getStorageRefFromUrl(urlOrPath);
  if (!storageRef) {
    return { success: false, reason: 'URL não pertence ao Firebase Storage ou é inválida' };
  }

  const fullPath = storageRef.fullPath;
  const expectedPrefix = `restaurants/${restaurantId}/`;

  // REGRA DE SEGURANÇA 1: Deve pertencer estritamente a este restaurante
  if (!fullPath.startsWith(expectedPrefix)) {
    console.warn(
      `[Storage Cleanup] Violação de segurança: O path "${fullPath}" não pertence ao restaurante "${restaurantId}". Exclusão abortada.`
    );
    return { success: false, reason: 'Arquivo pertence a outro restaurante ou diretório' };
  }

  // REGRA DE SEGURANÇA 2: Se categoria for especificada, validar subpasta
  if (category) {
    const expectedCategoryPrefix = `restaurants/${restaurantId}/${category}/`;
    if (!fullPath.startsWith(expectedCategoryPrefix)) {
      console.warn(
        `[Storage Cleanup] Path "${fullPath}" não corresponde à categoria esperada "${category}". Exclusão abortada por segurança.`
      );
      return { success: false, reason: `Arquivo fora da pasta ${category}` };
    }
  }

  try {
    await deleteObject(storageRef);
    console.log(`[Storage Cleanup] Arquivo antigo apagado com sucesso do Storage: ${fullPath}`);
    return { success: true, deletedPath: fullPath };
  } catch (error: any) {
    // Se o arquivo antigo não existir mais no Storage: não quebrar o fluxo
    if (error?.code === 'storage/object-not-found' || error?.message?.includes('object-not-found')) {
      console.log(`[Storage Cleanup] Arquivo já não existia no Storage (ignorado): ${fullPath}`);
      return { success: true, deletedPath: fullPath, reason: 'Arquivo já não existia no Storage' };
    }

    console.warn(`[Storage Cleanup] Aviso ao apagar arquivo "${fullPath}":`, error);
    return { success: false, reason: error?.message || 'Erro ao apagar arquivo' };
  }
}

export const storageCleanupService = {
  getStorageRefFromUrl,
  deleteStorageFile,

  /**
   * Apaga a logo antiga do restaurante quando for trocada ou removida.
   * Não apaga se a nova logo for idêntica à antiga.
   */
  async deleteRestaurantOldLogo(
    restaurantId: string,
    oldLogoUrl?: string | null,
    newLogoUrl?: string | null
  ): Promise<StorageCleanupResult> {
    if (!oldLogoUrl || !oldLogoUrl.trim()) {
      return { success: false, reason: 'Logo antiga não informada' };
    }
    if (newLogoUrl && oldLogoUrl.trim() === newLogoUrl.trim()) {
      return { success: false, reason: 'Imagem não foi alterada' };
    }
    return deleteStorageFile(oldLogoUrl, restaurantId, 'logo');
  },

  /**
   * Apaga a capa antiga do restaurante quando for trocada ou removida.
   * Não apaga se a nova capa for idêntica à antiga.
   */
  async deleteRestaurantOldCover(
    restaurantId: string,
    oldCoverUrl?: string | null,
    newCoverUrl?: string | null
  ): Promise<StorageCleanupResult> {
    if (!oldCoverUrl || !oldCoverUrl.trim()) {
      return { success: false, reason: 'Capa antiga não informada' };
    }
    if (newCoverUrl && oldCoverUrl.trim() === newCoverUrl.trim()) {
      return { success: false, reason: 'Imagem não foi alterada' };
    }
    return deleteStorageFile(oldCoverUrl, restaurantId, 'cover');
  },

  /**
   * Apaga a imagem antiga de um produto quando for trocada ou quando o produto for excluído.
   * Não apaga se a nova imagem for idêntica à antiga.
   */
  async deleteProductOldImage(
    restaurantId: string,
    oldImageUrl?: string | null,
    newImageUrl?: string | null
  ): Promise<StorageCleanupResult> {
    if (!oldImageUrl || !oldImageUrl.trim()) {
      return { success: false, reason: 'Imagem antiga não informada' };
    }
    if (newImageUrl && oldImageUrl.trim() === newImageUrl.trim()) {
      return { success: false, reason: 'Imagem não foi alterada' };
    }
    return deleteStorageFile(oldImageUrl, restaurantId, 'products');
  }
};
