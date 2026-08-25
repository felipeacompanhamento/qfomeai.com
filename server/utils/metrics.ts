import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import { alertManager } from './alerts';

class MetricsRegistry {
  private totalRequests = 0;
  private status2xx = 0;
  private status4xx = 0;
  private status5xx = 0;
  private timeoutsCount = 0;

  private durations: number[] = [];
  private routeLatencies: Map<string, { total: number; count: number; max: number }> = new Map();

  private ordersCreated = 0;
  private duplicateOrdersBlocked = 0;
  private stockFailures = 0;
  private paymentsApproved = 0;
  private paymentsDeclined = 0;
  private refunds = 0;
  private financialFailures = 0;
  private duplicateActionsBlocked = 0;
  private rateLimitExceeded = 0;

  private whatsappSuccess = 0;
  private whatsappFailure = 0;
  private fcmSuccess = 0;
  private fcmFailure = 0;
  private mpWebhookReceived = 0;
  private mpWebhookInvalid = 0;
  private mpWebhookDuplicate = 0;
  private externalIntegrationFailures = 0;

  private driversOnline = 0;
  private ordersInPrep = 0;
  private ordersInDelivery = 0;
  private openCashRegisters = 0;
  private ongoingCleanups = 0;
  private failedAsyncTasks = 0;

  public recordHttpMetric(data: {
    method: string;
    route: string;
    statusCode: number;
    duration: number;
    restaurantId?: string;
    isTimeout?: boolean;
    requestId?: string;
  }) {
    try {
      this.totalRequests++;
      
      if (data.statusCode >= 200 && data.statusCode < 300) {
        this.status2xx++;
      } else if (data.statusCode >= 400 && data.statusCode < 500) {
        this.status4xx++;
      } else if (data.statusCode >= 500) {
        this.status5xx++;
        alertManager.triggerAlert({
          type: 'HTTP_5XX_ERROR',
          severity: 'WARNING',
          routeOrModule: `${data.method} ${data.route}`,
          summary: `HTTP 5xx server error detected on ${data.method} ${data.route}`,
          restaurantId: data.restaurantId,
          requestId: data.requestId,
          durationOrLatency: data.duration,
          recommendedAction: 'Verificar logs detalhados do servidor para a rota afetada',
          threshold: 3,
          windowMs: 60000
        });
      }

      if (data.isTimeout || data.duration > 5000) {
        this.timeoutsCount++;
        alertManager.triggerAlert({
          type: 'HIGH_LATENCY_OR_TIMEOUT',
          severity: 'WARNING',
          routeOrModule: `${data.method} ${data.route}`,
          summary: `Alta latência ou timeout detectado (${data.duration.toFixed(2)}ms)`,
          restaurantId: data.restaurantId,
          requestId: data.requestId,
          durationOrLatency: data.duration,
          recommendedAction: 'Verificar gargalos de banco de dados ou integração externa',
          threshold: 2,
          windowMs: 60000
        });
      }

      this.durations.push(data.duration);
      if (this.durations.length > 1000) {
        this.durations.shift();
      }

      const routeKey = `${data.method} ${data.route}`;
      let routeStat = this.routeLatencies.get(routeKey);
      if (!routeStat) {
        routeStat = { total: 0, count: 0, max: 0 };
        this.routeLatencies.set(routeKey, routeStat);
      }
      routeStat.total += data.duration;
      routeStat.count++;
      if (data.duration > routeStat.max) {
        routeStat.max = data.duration;
      }
    } catch (err) {
      logger.error('Failed to record HTTP metric', { error: err });
    }
  }

  public increment(metric: string, count = 1, metadata?: { restaurantId?: string; requestId?: string }) {
    try {
      switch (metric) {
        case 'ordersCreated': this.ordersCreated += count; break;
        case 'duplicateOrdersBlocked': this.duplicateOrdersBlocked += count; break;
        case 'stockFailures':
          this.stockFailures += count;
          alertManager.triggerAlert({
            type: 'STOCK_FAILURE',
            severity: 'WARNING',
            routeOrModule: 'Inventory/Stock',
            summary: `Falha de estoque detectada (${count} ocorrência(s))`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Verificar estoque atual e movimentações recentes',
            threshold: 1
          });
          break;
        case 'paymentsApproved': this.paymentsApproved += count; break;
        case 'paymentsDeclined': this.paymentsDeclined += count; break;
        case 'refunds': this.refunds += count; break;
        case 'financialFailures':
          this.financialFailures += count;
          alertManager.triggerAlert({
            type: 'FINANCIAL_FAILURE',
            severity: 'CRITICAL',
            routeOrModule: 'Finance/Payment',
            summary: `Falha financeira crítica detectada`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Conferir transações no gateway de pagamento e conciliação de caixa',
            threshold: 1
          });
          break;
        case 'duplicateActionsBlocked': this.duplicateActionsBlocked += count; break;
        case 'rateLimitExceeded':
          this.rateLimitExceeded += count;
          alertManager.triggerAlert({
            type: 'RATE_LIMIT_EXCEEDED_ABUSE',
            severity: 'WARNING',
            routeOrModule: 'Security/RateLimit',
            summary: `Abuso de taxa detectado (${count} bloqueio(s) de rate limit)`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Monitorar requisições suspeitas e endereços IP',
            threshold: 5,
            windowMs: 60000
          });
          break;
        case 'whatsappSuccess': this.whatsappSuccess += count; break;
        case 'whatsappFailure':
          this.whatsappFailure += count;
          alertManager.triggerAlert({
            type: 'WHATSAPP_FAILURE',
            severity: 'WARNING',
            routeOrModule: 'Integrations/WhatsApp',
            summary: `Falha no envio de mensagem via WhatsApp`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Verificar status da API do WhatsApp e token do restaurante',
            threshold: 3,
            windowMs: 60000
          });
          break;
        case 'fcmSuccess': this.fcmSuccess += count; break;
        case 'fcmFailure':
          this.fcmFailure += count;
          alertManager.triggerAlert({
            type: 'FCM_FAILURE',
            severity: 'WARNING',
            routeOrModule: 'Integrations/FCM',
            summary: `Falha no envio de Push FCM`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Verificar credenciais do Firebase Cloud Messaging',
            threshold: 5,
            windowMs: 60000
          });
          break;
        case 'mpWebhookReceived': this.mpWebhookReceived += count; break;
        case 'mpWebhookInvalid':
          this.mpWebhookInvalid += count;
          alertManager.triggerAlert({
            type: 'MP_WEBHOOK_INVALID',
            severity: 'WARNING',
            routeOrModule: 'Integrations/MercadoPago',
            summary: `Webhook inválido recebido do Mercado Pago`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Verificar assinatura e payload dos webhooks recebidos',
            threshold: 3,
            windowMs: 60000
          });
          break;
        case 'mpWebhookDuplicate': this.mpWebhookDuplicate += count; break;
        case 'externalIntegrationFailures':
          this.externalIntegrationFailures += count;
          alertManager.triggerAlert({
            type: 'EXTERNAL_INTEGRATION_FAILURE',
            severity: 'WARNING',
            routeOrModule: 'Integrations/External',
            summary: `Falha em integração externa detectada`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Verificar disponibilidade do serviço externo',
            threshold: 3,
            windowMs: 60000
          });
          break;
        case 'failedAsyncTasks':
          this.failedAsyncTasks += count;
          alertManager.triggerAlert({
            type: 'ASYNC_TASK_FAILED',
            severity: 'WARNING',
            routeOrModule: 'Background/Async',
            summary: `Tarefa assíncrona falhou ou foi interrompida`,
            restaurantId: metadata?.restaurantId,
            requestId: metadata?.requestId,
            recommendedAction: 'Inspecionar logs da tarefa assíncrona correspondente',
            threshold: 1
          });
          break;
      }
    } catch (err) {
      logger.error('Failed to increment metric', { metric, error: err });
    }
  }

  public setGauge(gauge: string, value: number) {
    try {
      switch (gauge) {
        case 'driversOnline': this.driversOnline = value; break;
        case 'ordersInPrep': this.ordersInPrep = value; break;
        case 'ordersInDelivery': this.ordersInDelivery = value; break;
        case 'openCashRegisters': this.openCashRegisters = value; break;
        case 'ongoingCleanups': this.ongoingCleanups = value; break;
      }
    } catch (err) {
      logger.error('Failed to set gauge', { gauge, error: err });
    }
  }

  public getAggregatedMetrics() {
    const sortedDurations = [...this.durations].sort((a, b) => a - b);
    const count = sortedDurations.length;

    let mean = 0;
    let p50 = 0;
    let p95 = 0;
    let p99 = 0;

    if (count > 0) {
      const sum = sortedDurations.reduce((acc, val) => acc + val, 0);
      mean = sum / count;
      p50 = sortedDurations[Math.floor(count * 0.5)];
      p95 = sortedDurations[Math.floor(count * 0.95)];
      p99 = sortedDurations[Math.floor(count * 0.99)];
    }

    const routeAvgs: Array<{ route: string; avgDuration: number; maxDuration: number; count: number }> = [];
    for (const [route, stat] of this.routeLatencies.entries()) {
      routeAvgs.push({
        route,
        avgDuration: stat.count > 0 ? stat.total / stat.count : 0,
        maxDuration: stat.max,
        count: stat.count
      });
    }
    routeAvgs.sort((a, b) => b.avgDuration - a.avgDuration);
    const slowestRoutes = routeAvgs.slice(0, 10);

    return {
      timestamp: new Date().toISOString(),
      architectureNote: 'In-memory counters per container instance. In multi-instance production environments, aggregated metrics represent individual container state unless exported to Cloud Monitoring.',
      http: {
        totalRequests: this.totalRequests,
        status2xx: this.status2xx,
        status4xx: this.status4xx,
        status5xx: this.status5xx,
        timeoutsCount: this.timeoutsCount
      },
      latency: {
        meanMs: parseFloat(mean.toFixed(2)),
        p50Ms: parseFloat(p50.toFixed(2)),
        p95Ms: parseFloat(p95.toFixed(2)),
        p99Ms: parseFloat(p99.toFixed(2)),
        slowestRoutes
      },
      criticalOperations: {
        ordersCreated: this.ordersCreated,
        duplicateOrdersBlocked: this.duplicateOrdersBlocked,
        stockFailures: this.stockFailures,
        paymentsApproved: this.paymentsApproved,
        paymentsDeclined: this.paymentsDeclined,
        refunds: this.refunds,
        financialFailures: this.financialFailures,
        duplicateActionsBlocked: this.duplicateActionsBlocked,
        rateLimitExceeded: this.rateLimitExceeded
      },
      integrations: {
        whatsappSuccess: this.whatsappSuccess,
        whatsappFailure: this.whatsappFailure,
        fcmSuccess: this.fcmSuccess,
        fcmFailure: this.fcmFailure,
        mpWebhookReceived: this.mpWebhookReceived,
        mpWebhookInvalid: this.mpWebhookInvalid,
        mpWebhookDuplicate: this.mpWebhookDuplicate,
        externalIntegrationFailures: this.externalIntegrationFailures
      },
      operation: {
        driversOnline: this.driversOnline,
        ordersInPrep: this.ordersInPrep,
        ordersInDelivery: this.ordersInDelivery,
        openCashRegisters: this.openCashRegisters,
        ongoingCleanups: this.ongoingCleanups,
        failedAsyncTasks: this.failedAsyncTasks
      }
    };
  }
}

export const metricsRegistry = new MetricsRegistry();

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const url = req.originalUrl || req.url;
  if (!url.startsWith('/api/')) {
    return next();
  }

  const start = process.hrtime();
  const method = req.method;
  const route = req.route?.path || url;

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = diff[0] * 1e3 + diff[1] * 1e-6;
    const statusCode = res.statusCode;
    const restaurantId = (req as any).user?.restaurantId;
    const requestId = (req as any).requestId || req.headers['x-request-id'];

    metricsRegistry.recordHttpMetric({
      method,
      route,
      statusCode,
      duration: durationMs,
      restaurantId,
      isTimeout: statusCode === 504 || durationMs > 10000,
      requestId
    });
  });

  next();
}
