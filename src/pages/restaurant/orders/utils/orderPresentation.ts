/**
 * Utilitários de apresentação e cálculo de tempos de etapa / atrasos
 */

export interface StageTimeInfo {
  elapsedMinutes: number;
  displayText: string;
  isDelayed: boolean;
  delayText?: string;
  badgeBg: string;
  badgeText: string;
}

/**
 * SLA padrão em minutos por etapa
 */
const STAGE_SLA_MINUTES: Record<string, number> = {
  novo: 5,        // Aceitar em até 5 min
  confirmado: 10, // Iniciar preparo em até 10 min
  cozinha: 25,    // Preparar em até 25 min
  entrega: 45     // Entregar em até 45 min
};

/**
 * Calcula o tempo decorrido e status de atraso da etapa atual do pedido
 */
export function getOrderStageTimeInfo(order: any, columnId: string, nowMs: number = Date.now()): StageTimeInfo {
  let referenceTimestampMs = nowMs;

  const dateStr = order.data_criacao || order.createdAt || order.created_at;
  if (dateStr) {
    const parsed = new Date(dateStr).getTime();
    if (!isNaN(parsed)) {
      referenceTimestampMs = parsed;
    }
  }

  // Tenta timestamps mais específicos de etapa se existirem
  if (columnId === 'confirmado' && order.confirmedAt) {
    const t = new Date(order.confirmedAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  } else if (columnId === 'cozinha' && order.preparingAt) {
    const t = new Date(order.preparingAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  } else if (columnId === 'entrega' && (order.readyAt || order.dispatchedAt)) {
    const t = new Date(order.readyAt || order.dispatchedAt).getTime();
    if (!isNaN(t)) referenceTimestampMs = t;
  }

  const diffMs = Math.max(0, nowMs - referenceTimestampMs);
  const elapsedMinutes = Math.floor(diffMs / 60000);

  let displayText = `${elapsedMinutes} min`;
  if (elapsedMinutes === 0) {
    displayText = 'Agora';
  } else if (elapsedMinutes >= 60) {
    const h = Math.floor(elapsedMinutes / 60);
    const m = elapsedMinutes % 60;
    displayText = `${h}h ${m}m`;
  }

  const slaMinutes = STAGE_SLA_MINUTES[columnId] || 30;
  const isDelayed = elapsedMinutes > slaMinutes;

  if (isDelayed) {
    const delayMins = elapsedMinutes - slaMinutes;
    return {
      elapsedMinutes,
      displayText: `Há ${displayText}`,
      isDelayed: true,
      delayText: `Atrasado +${delayMins}m`,
      badgeBg: 'bg-red-50 text-red-700 border-red-200',
      badgeText: 'text-red-700'
    };
  }

  if (elapsedMinutes > Math.floor(slaMinutes * 0.7)) {
    return {
      elapsedMinutes,
      displayText: `Há ${displayText}`,
      isDelayed: false,
      badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
      badgeText: 'text-amber-800'
    };
  }

  return {
    elapsedMinutes,
    displayText: `Há ${displayText}`,
    isDelayed: false,
    badgeBg: 'bg-stone-100 text-stone-600 border-stone-200',
    badgeText: 'text-stone-600'
  };
}
