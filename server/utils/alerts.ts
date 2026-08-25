import { logger } from './logger';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertPayload {
  type: string;
  severity: AlertSeverity;
  environment: string;
  timestamp: string;
  requestId?: string;
  restaurantId?: string;
  routeOrModule: string;
  summary: string;
  occurrences: number;
  durationOrLatency?: number;
  recommendedAction: string;
}

class AlertManager {
  private cooldowns: Map<string, number> = new Map();
  private occurrencesBuffer: Map<string, { count: number; firstTimestamp: number; data: any }> = new Map();
  private defaultCooldownMs = 60000; // 1 minute cooldown per alert type

  public triggerAlert(params: {
    type: string;
    severity: AlertSeverity;
    routeOrModule: string;
    summary: string;
    requestId?: string;
    restaurantId?: string;
    durationOrLatency?: number;
    recommendedAction: string;
    threshold?: number;
    windowMs?: number;
    cooldownMs?: number;
  }) {
    try {
      const now = Date.now();
      const alertKey = `${params.type}:${params.restaurantId || 'global'}`;
      const cooldownMs = params.cooldownMs || this.defaultCooldownMs;

      // Check cooldown
      const lastSent = this.cooldowns.get(alertKey) || 0;
      if (now - lastSent < cooldownMs) {
        return; // Suppressed by cooldown
      }

      // Track occurrences in window if threshold is specified
      const windowMs = params.windowMs || 60000;
      let buf = this.occurrencesBuffer.get(alertKey);
      if (!buf || now - buf.firstTimestamp > windowMs) {
        buf = { count: 1, firstTimestamp: now, data: params };
        this.occurrencesBuffer.set(alertKey, buf);
        if (params.threshold && params.threshold > 1) {
          return; // Wait until threshold is reached
        }
      } else {
        buf.count++;
        if (params.threshold && buf.count < params.threshold) {
          return; // Threshold not met yet
        }
      }

      const occurrences = buf.count;
      this.occurrencesBuffer.delete(alertKey);
      this.cooldowns.set(alertKey, now);

      const payload: AlertPayload = {
        type: params.type,
        severity: params.severity,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        restaurantId: params.restaurantId,
        routeOrModule: params.routeOrModule,
        summary: params.summary,
        occurrences,
        durationOrLatency: params.durationOrLatency,
        recommendedAction: params.recommendedAction
      };

      // Log structured
      if (payload.severity === 'CRITICAL') {
        logger.error(`[ALERT_CRITICAL] ${payload.type}: ${payload.summary}`, payload);
      } else if (payload.severity === 'WARNING') {
        logger.warn(`[ALERT_WARNING] ${payload.type}: ${payload.summary}`, payload);
      } else {
        logger.info(`[ALERT_INFO] ${payload.type}: ${payload.summary}`, payload);
      }

      // Send to webhook if configured
      const webhookUrl = process.env.ALERT_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(err => {
          logger.error('Failed to dispatch alert webhook', { error: err });
        });
      }
    } catch (err) {
      logger.error('Error in AlertManager.triggerAlert', { error: err });
    }
  }
}

export const alertManager = new AlertManager();
