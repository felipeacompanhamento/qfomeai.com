import { useEffect, useRef } from 'react';
import { processKitchenAutoPrint } from '../services/kitchenAutoPrintService';

interface UseKitchenAutoPrintOptions {
  orders?: any[];
  restaurantProfile?: any;
  profile?: any;
  enabled?: boolean;
}

/**
 * Hook to automatically print new kitchen orders via QZ Tray
 * strictly for printers configured with "Produção da Cozinha".
 * 
 * Guarantees:
 * - Each order is printed ONLY ONCE per printer (orderId + printerId).
 * - Protected against re-renders, snapshot updates, and page reloads.
 * - If QZ Tray is offline, orders are NOT lost and NOT marked as printed.
 */
export function useKitchenAutoPrint({
  orders = [],
  restaurantProfile,
  profile,
  enabled = true
}: UseKitchenAutoPrintOptions) {
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!enabled || !Array.isArray(orders) || orders.length === 0) {
      return;
    }

    let isMounted = true;

    const runAutoPrint = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        await processKitchenAutoPrint(orders, restaurantProfile, profile);
      } catch (err) {
        console.error('[useKitchenAutoPrint] Erro ao processar impressão automática:', err);
      } finally {
        if (isMounted) {
          isProcessingRef.current = false;
        }
      }
    };

    runAutoPrint();

    return () => {
      isMounted = false;
    };
  }, [orders, restaurantProfile, profile, enabled]);
}
