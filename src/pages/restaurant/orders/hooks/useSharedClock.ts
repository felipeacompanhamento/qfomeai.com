import { useState, useEffect } from 'react';

/**
 * Hook centralizado de relógio que atualiza a cada 30 segundos
 * Evita a criação de múltiplos leitores de tempo por cartão
 */
export function useSharedClock(intervalMs: number = 30000): number {
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
