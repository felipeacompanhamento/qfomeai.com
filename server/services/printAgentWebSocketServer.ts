import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import crypto from 'crypto';
import { URL } from 'url';
import { logger } from '../utils/logger';

export interface ConnectedPrintAgent {
  ws: WebSocket;
  deviceId: string;
  restaurantId: string;
  restaurantName: string;
  deviceDocRef: FirebaseFirestore.DocumentReference;
  connectedAt: number;
  lastSeenAt: number;
  isAlive: boolean;
  remoteAddress?: string;
}

// Registro em memória de agentes conectados centralizado em globalThis (garante singleton único compartilhado no processo)
declare global {
  // eslint-disable-next-line no-var
  var __qfomeai_active_print_agents__: Map<string, ConnectedPrintAgent> | undefined;
  // eslint-disable-next-line no-var
  var __qfomeai_pending_test_acks__: Map<string, PendingTestRequest> | undefined;
}

const activeAgents: Map<string, ConnectedPrintAgent> =
  globalThis.__qfomeai_active_print_agents__ || (globalThis.__qfomeai_active_print_agents__ = new Map());

interface PendingTestRequest {
  resolve: (res: { success: true; deviceId: string; acknowledgedAt: string; latencyMs: number }) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
  sentAt: number;
}

const pendingTestAcks: Map<string, PendingTestRequest> =
  globalThis.__qfomeai_pending_test_acks__ || (globalThis.__qfomeai_pending_test_acks__ = new Map());

let wssInstance: WebSocketServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

const WS_PATHS = ['/ws/print-agent', '/api/print-agent/ws'];
const HEARTBEAT_INTERVAL_MS = 30000; // 30 segundos
const AUTH_TIMEOUT_MS = 10000; // 10 segundos para enviar mensagem de auth se não enviada no handshake

/**
 * Valida as credenciais do dispositivo no Firestore
 */
export async function validateDeviceCredentials(
  db: FirebaseFirestore.Firestore,
  deviceId: string,
  token: string,
  optionalRestaurantId?: string | null
): Promise<{
  valid: boolean;
  error?: string;
  restaurantId?: string;
  restaurantName?: string;
  deviceDocRef?: FirebaseFirestore.DocumentReference;
  deviceData?: any;
}> {
  const cleanDeviceId = (deviceId || '').trim();
  const cleanToken = (token || '').trim();
  const cleanRestaurantId = (optionalRestaurantId || '').trim() || null;

  if (!cleanDeviceId || !cleanToken) {
    return { valid: false, error: 'Credenciais incompletas (deviceId e token são obrigatórios).' };
  }

  // 1. Localizar o dispositivo
  let deviceDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  let resolvedRestaurantId = cleanRestaurantId;

  if (!resolvedRestaurantId) {
    // Tentar localizar pelo registro direto printAgentRegistry (leitura O(1) sem necessidade de índice composto)
    try {
      const regSnap = await db.collection('printAgentRegistry').doc(cleanDeviceId).get();
      if (regSnap.exists) {
        resolvedRestaurantId = regSnap.data()?.restaurantId || null;
      }
    } catch {
      // ignore
    }
  }

  if (resolvedRestaurantId) {
    const directRef = db.collection('restaurants').doc(resolvedRestaurantId).collection('printAgentDevices').doc(cleanDeviceId);
    const directSnap = await directRef.get();
    if (directSnap.exists) {
      deviceDoc = directSnap;
    }
  }

  if (!deviceDoc) {
    try {
      const querySnap = await db.collectionGroup('printAgentDevices')
        .where('deviceId', '==', cleanDeviceId)
        .limit(1)
        .get();

      if (!querySnap.empty) {
        deviceDoc = querySnap.docs[0];
      }
    } catch (cgErr: any) {
      logger.warn('[PRINT_AGENT_WS] Consulta collectionGroup printAgentDevices indisponível', { error: cgErr?.message });
    }
  }

  if (!deviceDoc || !deviceDoc.exists) {
    logger.warn('[PRINT_AGENT_WS] Dispositivo não localizado para autenticação', { deviceId: cleanDeviceId });
    return { valid: false, error: 'Dispositivo não encontrado ou não autorizado.' };
  }

  const deviceData = deviceDoc.data() || {};

  // 2. Calcular o hash do token recebido (SHA-256)
  const receivedTokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

  // 3. Comparar com o tokenHash salvo de forma segura em tempo constante
  const savedTokenHash = deviceData.tokenHash;
  if (!savedTokenHash || typeof savedTokenHash !== 'string') {
    logger.warn('[PRINT_AGENT_WS] Dispositivo sem tokenHash cadastrado', { deviceId: cleanDeviceId });
    return { valid: false, error: 'Credenciais inválidas.' };
  }

  let hashesMatch = false;
  try {
    const bufReceived = Buffer.from(receivedTokenHash, 'hex');
    const bufSaved = Buffer.from(savedTokenHash, 'hex');
    hashesMatch = bufReceived.length === bufSaved.length && crypto.timingSafeEqual(bufReceived, bufSaved);
  } catch {
    hashesMatch = false;
  }

  if (!hashesMatch) {
    logger.warn('[PRINT_AGENT_WS] Token inválido para o dispositivo', { deviceId: cleanDeviceId });
    return { valid: false, error: 'Credenciais inválidas.' };
  }

  // 4. Confirmar que o dispositivo está ativo
  if (deviceData.status !== 'active') {
    logger.warn('[PRINT_AGENT_WS] Dispositivo não está com status active', {
      deviceId: cleanDeviceId,
      status: deviceData.status
    });
    return { valid: false, error: 'Dispositivo inativo ou revogado.' };
  }

  // 5. Confirmar que pertence ao restaurantId correto
  const restaurantId = deviceData.restaurantId || deviceDoc.ref.parent.parent?.id;
  if (!restaurantId || typeof restaurantId !== 'string') {
    logger.warn('[PRINT_AGENT_WS] Dispositivo sem vínculo com restaurante', { deviceId: cleanDeviceId });
    return { valid: false, error: 'Dispositivo não vinculado a um restaurante válido.' };
  }

  if (cleanRestaurantId && cleanRestaurantId !== restaurantId) {
    logger.warn('[PRINT_AGENT_WS] Divergência de restaurante para o dispositivo', {
      deviceId: cleanDeviceId,
      expected: restaurantId,
      received: cleanRestaurantId
    });
    return { valid: false, error: 'Acesso negado.' };
  }

  const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
  if (!restaurantDoc.exists) {
    logger.warn('[PRINT_AGENT_WS] Restaurante vinculado não localizado ou inativo', { restaurantId, deviceId: cleanDeviceId });
    return { valid: false, error: 'Restaurante não encontrado ou inativo.' };
  }

  const restaurantData = restaurantDoc.data() || {};
  const restaurantName = restaurantData.nome || restaurantData.name || 'Restaurante';

  return {
    valid: true,
    restaurantId,
    restaurantName,
    deviceDocRef: deviceDoc.ref,
    deviceData
  };
}

/**
 * Inicializa o servidor WebSocket persistente para os QFomeAI Print Agents
 */
export function initPrintAgentWebSocketServer(
  httpServer: HttpServer,
  db: FirebaseFirestore.Firestore
): WebSocketServer {
  if (wssInstance) {
    return wssInstance;
  }

  // Criamos o WebSocketServer com noServer: true para interceptar upgrades seletivamente
  const wss = new WebSocketServer({ noServer: true });
  wssInstance = wss;

  // Interceptar requisições HTTP Upgrade
  httpServer.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const host = req.headers.host || 'localhost';
      const parsedUrl = new URL(req.url || '', `http://${host}`);
      const pathname = parsedUrl.pathname;

      // Verificar se a URL corresponde a um dos caminhos do Print Agent
      const matchesPath = WS_PATHS.some((p) => pathname === p || pathname === `${p}/`);
      if (!matchesPath) {
        // Não é rota do Print Agent, deixa outro handler ou Vite tratar
        return;
      }

      // Extrair credenciais do handshake HTTP (query params ou headers)
      const queryDeviceId = parsedUrl.searchParams.get('deviceId') || parsedUrl.searchParams.get('device_id');
      const queryToken = parsedUrl.searchParams.get('token');
      const queryRestaurantId = parsedUrl.searchParams.get('restaurantId') || parsedUrl.searchParams.get('restaurant_id');

      let headerToken: string | undefined;
      const authHeader = req.headers['authorization'];
      if (authHeader && typeof authHeader === 'string') {
        headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
      }
      if (!headerToken) {
        headerToken =
          (req.headers['x-device-token'] as string) ||
          (req.headers['x-token'] as string) ||
          (req.headers['x-print-agent-token'] as string);
      }

      const headerDeviceId = (req.headers['x-device-id'] as string) || (req.headers['device-id'] as string);
      const headerRestaurantId = req.headers['x-restaurant-id'] as string;

      const deviceId = (queryDeviceId || headerDeviceId || '').trim();
      const token = (queryToken || headerToken || '').trim();
      const restaurantId = (queryRestaurantId || headerRestaurantId || '').trim();

      // Se já possuir deviceId e token no handshake, valida antes de aceitar o upgrade
      if (deviceId && token) {
        const validation = await validateDeviceCredentials(db, deviceId, token, restaurantId);
        if (!validation.valid) {
          logger.warn('[PRINT_AGENT_WS] Handshake rejeitado por falha de autenticação', {
            deviceId,
            error: validation.error
          });
          socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nCredenciais invalidas');
          socket.destroy();
          return;
        }

        // Aceita o upgrade e anexa os dados autenticados à conexão
        wss.handleUpgrade(req, socket, head, (ws) => {
          (ws as any).preAuthenticated = {
            deviceId,
            restaurantId: validation.restaurantId!,
            restaurantName: validation.restaurantName!,
            deviceDocRef: validation.deviceDocRef!
          };
          wss.emit('connection', ws, req);
        });
        return;
      }

      // Caso contrário, aceita a conexão para aguardar o frame { type: 'auth' } no payload inicial
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (err: any) {
      logger.error('[PRINT_AGENT_WS] Erro inesperado no tratamento de upgrade HTTP', { error: err?.message });
      try {
        socket.destroy();
      } catch {
        // Ignora erro ao destruir socket corrompido
      }
    }
  });

  // Handler para novas conexões WebSocket
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const remoteAddress = req.socket.remoteAddress || req.headers['x-forwarded-for']?.toString();
    let currentAgent: ConnectedPrintAgent | null = null;
    let authTimeout: NodeJS.Timeout | null = null;

    /**
     * Registra o dispositivo como conectado, autenticado e online
     */
    const finalizeAuthentication = async (
      deviceId: string,
      restaurantId: string,
      restaurantName: string,
      deviceDocRef: FirebaseFirestore.DocumentReference
    ) => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }

      // Se houver conexão anterior ativa do mesmo deviceId, fecha com código 4000
      const existing = activeAgents.get(deviceId);
      if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
        logger.info('[PRINT_AGENT_WS] Fechando conexão anterior duplicada para o mesmo dispositivo', { deviceId });
        try {
          existing.ws.close(4000, 'Substituido por nova conexao');
        } catch {
          // ignore
        }
      }

      const now = Date.now();
      const agentRecord: ConnectedPrintAgent = {
        ws,
        deviceId,
        restaurantId,
        restaurantName,
        deviceDocRef,
        connectedAt: now,
        lastSeenAt: now,
        isAlive: true,
        remoteAddress
      };

      currentAgent = agentRecord;
      activeAgents.set(deviceId, agentRecord);

      // Atualizar status no Firestore: online e registrar lastSeenAt
      try {
        await deviceDocRef.update({
          connectionStatus: 'online',
          isOnline: true,
          lastSeenAt: now,
          connectedAt: now,
          remoteAddress: remoteAddress || null,
          updatedAt: new Date().toISOString()
        });
        logger.info('[PRINT_AGENT_REGISTRY] Dispositivo autenticado e registrado no WebSocket', {
          restaurantId,
          deviceId,
          connectedAgentsCount: activeAgents.size,
          registeredDeviceKeys: Array.from(activeAgents.keys())
        });
      } catch (err: any) {
        logger.error('[PRINT_AGENT_WS] Erro ao atualizar status online no Firestore', {
          deviceId,
          error: err?.message
        });
      }

      // Enviar confirmação de conexão e autenticação para o Agent
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'authenticated',
          connected: true,
          restaurantId,
          restaurantName,
          deviceId,
          serverTime: Date.now()
        }));
      }
    };

    // Caso o dispositivo tenha sido pré-autenticado no handshake HTTP Upgrade
    const preAuth = (ws as any).preAuthenticated;
    if (preAuth) {
      await finalizeAuthentication(
        preAuth.deviceId,
        preAuth.restaurantId,
        preAuth.restaurantName,
        preAuth.deviceDocRef
      );
    } else {
      // Definir timeout de 10s para autenticar via primeira mensagem
      authTimeout = setTimeout(() => {
        if (!currentAgent && ws.readyState === WebSocket.OPEN) {
          logger.warn('[PRINT_AGENT_WS] Conexão encerrada por timeout de autenticação', { remoteAddress });
          try {
            ws.send(JSON.stringify({
              type: 'error',
              code: 'AUTH_TIMEOUT',
              message: 'Tempo esgotado para envio de autenticação.'
            }));
            ws.close(4401, 'Authentication timeout');
          } catch {
            ws.terminate();
          }
        }
      }, AUTH_TIMEOUT_MS);
    }

    // Gerenciador de Heartbeat/Pong nativo
    ws.on('pong', () => {
      if (currentAgent) {
        currentAgent.isAlive = true;
        currentAgent.lastSeenAt = Date.now();
      }
    });

    // Tratamento de mensagens recebidas do client
    ws.on('message', async (data: Buffer | string) => {
      try {
        const rawString = typeof data === 'string' ? data : data.toString('utf-8');
        const message = JSON.parse(rawString);

        // 1. Mensagem de Autenticação inicial (se não pré-autenticado)
        if (message.type === 'auth' || message.action === 'authenticate') {
          const deviceId = (message.deviceId || message.device_id || '').trim();
          const token = (message.token || message.deviceToken || '').trim();
          const restaurantId = (message.restaurantId || message.restaurant_id || '').trim();

          const validation = await validateDeviceCredentials(db, deviceId, token, restaurantId);
          if (!validation.valid) {
            logger.warn('[PRINT_AGENT_WS] Falha na autenticação via mensagem', {
              deviceId,
              error: validation.error
            });
            ws.send(JSON.stringify({
              type: 'error',
              code: 'AUTH_FAILED',
              message: validation.error || 'Credenciais inválidas.'
            }));
            ws.close(4401, 'Authentication failed');
            return;
          }

          await finalizeAuthentication(
            deviceId,
            validation.restaurantId!,
            validation.restaurantName!,
            validation.deviceDocRef!
          );
          return;
        }

        // Se ainda não estiver autenticado, não processa outras mensagens
        if (!currentAgent) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'NOT_AUTHENTICATED',
            message: 'Envie as credenciais de autenticação primeiro.'
          }));
          return;
        }

        // 2. Heartbeat em nível de aplicação (JSON ping/pong)
        if (message.type === 'ping') {
          currentAgent.isAlive = true;
          currentAgent.lastSeenAt = Date.now();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          }
          return;
        }

        if (message.type === 'pong') {
          currentAgent.isAlive = true;
          currentAgent.lastSeenAt = Date.now();
          return;
        }

        // 3. Confirmação de recebimento do teste de comunicação enviado pelo servidor
        if (message.type === 'test_ack') {
          currentAgent.isAlive = true;
          currentAgent.lastSeenAt = Date.now();
          const acknowledged = handleTestAck(currentAgent.deviceId, message);
          logger.info('[PRINT_AGENT_WS] Confirmação test_ack recebida do Agent', {
            deviceId: currentAgent.deviceId,
            restaurantId: currentAgent.restaurantId,
            acknowledged
          });
          return;
        }

        // Outros tipos de mensagens futuras (impressão etc.) - NÃO processar nesta etapa conforme solicitado
      } catch (err: any) {
        logger.warn('[PRINT_AGENT_WS] Mensagem inválida recebida', { error: err?.message });
      }
    });

    // Tratamento de desconexão (socket fechado)
    ws.on('close', async (code: number, reason: Buffer) => {
      if (authTimeout) {
        clearTimeout(authTimeout);
        authTimeout = null;
      }

      if (currentAgent) {
        const agent = currentAgent;
        const currentActive = activeAgents.get(agent.deviceId);

        // Somente atualiza para offline se a conexão fechada for a conexão ativa no mapa
        if (currentActive && currentActive.ws === ws) {
          activeAgents.delete(agent.deviceId);

          const now = Date.now();
          try {
            await agent.deviceDocRef.update({
              connectionStatus: 'offline',
              isOnline: false,
              lastSeenAt: now,
              disconnectedAt: now,
              updatedAt: new Date().toISOString()
            });
            logger.info('[PRINT_AGENT_REGISTRY] Dispositivo desconectado e removido do WebSocket', {
              deviceId: agent.deviceId,
              restaurantId: agent.restaurantId,
              connectedAgentsCount: activeAgents.size,
              registeredDeviceKeys: Array.from(activeAgents.keys()),
              code,
              reason: reason?.toString('utf-8') || 'Normal'
            });
          } catch (err: any) {
            logger.error('[PRINT_AGENT_WS] Erro ao atualizar status offline no Firestore', {
              deviceId: agent.deviceId,
              error: err?.message
            });
          }
        }
      }
    });

    // Tratamento de erros no socket
    ws.on('error', (error: any) => {
      logger.warn('[PRINT_AGENT_WS] Erro no socket do cliente', {
        deviceId: currentAgent?.deviceId,
        error: error?.message
      });
    });
  });

  // Configurar loop de heartbeat no servidor para detectar desconexões e conexões zumbis
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }

  heartbeatTimer = setInterval(() => {
    const now = Date.now();

    for (const [deviceId, agent] of activeAgents.entries()) {
      if (!agent.isAlive) {
        logger.warn('[PRINT_AGENT_WS] Dispositivo não respondeu ao ping (timeout de heartbeat)', {
          deviceId,
          restaurantId: agent.restaurantId,
          lastSeenAt: agent.lastSeenAt
        });
        try {
          agent.ws.terminate();
        } catch {
          // ignore
        }
        continue;
      }

      // Prepara para próxima verificação
      agent.isAlive = false;

      // Envia ping nativo do protocolo WebSocket
      try {
        if (agent.ws.readyState === WebSocket.OPEN) {
          agent.ws.ping();
          // E também envia ping JSON caso o cliente processe frames de texto
          agent.ws.send(JSON.stringify({ type: 'ping', timestamp: now }));
        }
      } catch (err) {
        logger.warn('[PRINT_AGENT_WS] Falha ao enviar ping para dispositivo', { deviceId });
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  logger.info('[PRINT_AGENT_WS] Servidor WebSocket do Print Agent inicializado com sucesso', {
    paths: WS_PATHS,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS
  });

  return wss;
}

/**
 * Consulta se um dispositivo específico está com conexão WebSocket ativa no momento
 */
export function isPrintAgentOnline(deviceId: string): boolean {
  const agent = activeAgents.get(deviceId);
  return Boolean(agent && agent.ws.readyState === WebSocket.OPEN);
}

/**
 * Obtém os dados de um Print Agent ativo
 */
export function getConnectedPrintAgent(deviceId: string): ConnectedPrintAgent | undefined {
  return activeAgents.get(deviceId);
}

/**
 * Trata o recebimento de confirmação test_ack do Agent
 */
export function handleTestAck(deviceId: string, data?: any): boolean {
  const pending = pendingTestAcks.get(deviceId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingTestAcks.delete(deviceId);
    pending.resolve({
      success: true,
      deviceId,
      acknowledgedAt: new Date().toISOString(),
      latencyMs: Date.now() - pending.sentAt
    });
    return true;
  }
  return false;
}

/**
 * Envia mensagem de teste de comunicação para o Print Agent ONLINE do restaurante usando a conexão WebSocket existente.
 * Retorna sucesso SOMENTE se o Agent responder com {"type": "test_ack"}.
 */
export async function sendTestToPrintAgent(
  restaurantId: string,
  targetDeviceId?: string,
  timeoutMs = 8000
): Promise<{ success: boolean; deviceId: string; acknowledgedAt: string; latencyMs: number }> {
  const cleanRestId = (restaurantId || '').trim();
  const cleanDeviceId = (targetDeviceId || '').trim();

  // Log seguro do estado do registry no momento da busca
  logger.info('[PRINT_AGENT_REGISTRY] Buscando Print Agent conectado para envio de teste', {
    restaurantId: cleanRestId,
    deviceId: cleanDeviceId || 'any',
    connectedAgentsCount: activeAgents.size,
    registeredDeviceKeys: Array.from(activeAgents.keys())
  });

  if (!cleanRestId) {
    throw new Error('Identificador do restaurante é obrigatório.');
  }

  // 1. Localizar o Agent ONLINE do restaurante
  let agent: ConnectedPrintAgent | undefined;

  if (cleanDeviceId) {
    const candidate = activeAgents.get(cleanDeviceId);
    if (candidate && candidate.ws.readyState === WebSocket.OPEN) {
      if (
        !candidate.restaurantId ||
        candidate.restaurantId.trim().toLowerCase() === cleanRestId.toLowerCase()
      ) {
        agent = candidate;
      } else {
        logger.warn('[PRINT_AGENT_REGISTRY] Dispositivo conectado sob outro restaurantId', {
          requestedRestaurantId: cleanRestId,
          agentRestaurantId: candidate.restaurantId,
          deviceId: cleanDeviceId,
          connectedAgentsCount: activeAgents.size,
          registeredDeviceKeys: Array.from(activeAgents.keys())
        });
      }
    }
  }

  if (!agent) {
    for (const a of activeAgents.values()) {
      if (
        a.ws.readyState === WebSocket.OPEN &&
        a.restaurantId &&
        a.restaurantId.trim().toLowerCase() === cleanRestId.toLowerCase()
      ) {
        agent = a;
        break;
      }
    }
  }

  if (!agent || agent.ws.readyState !== WebSocket.OPEN) {
    logger.info('[PRINT_AGENT_REGISTRY] Nenhum Print Agent ativo encontrado no processo', {
      restaurantId: cleanRestId,
      deviceId: cleanDeviceId || 'any',
      connectedAgentsCount: activeAgents.size,
      registeredDeviceKeys: Array.from(activeAgents.keys())
    });
    throw new Error('Nenhum QFomeAI Print Agent online encontrado para este restaurante. Verifique se o aplicativo está aberto e conectado.');
  }

  const deviceId = agent.deviceId;
  const sentAt = new Date().toISOString();

  // Enviar SOMENTE:
  // {
  //   "type": "test",
  //   "message": "Teste de comunicação QFomeAI",
  //   "sentAt": "data/hora"
  // }
  const payload = {
    type: 'test',
    message: 'Teste de comunicação QFomeAI',
    sentAt
  };

  // Se já houver um teste aguardando resposta para este dispositivo, limpa
  const previous = pendingTestAcks.get(deviceId);
  if (previous) {
    clearTimeout(previous.timer);
    previous.reject(new Error('Novo teste de comunicação iniciado.'));
    pendingTestAcks.delete(deviceId);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingTestAcks.delete(deviceId);
      reject(new Error('O Print Agent não confirmou o recebimento (test_ack) dentro do tempo limite.'));
    }, timeoutMs);

    pendingTestAcks.set(deviceId, {
      resolve,
      reject,
      timer,
      sentAt: Date.now()
    });

    try {
      // Reutiliza o WebSocket já existente
      agent.ws.send(JSON.stringify(payload));
      logger.info('[PRINT_AGENT_WS] Mensagem de teste enviada ao Print Agent via WebSocket existente', {
        deviceId,
        restaurantId: cleanRestId,
        sentAt
      });
    } catch (err: any) {
      clearTimeout(timer);
      pendingTestAcks.delete(deviceId);
      reject(new Error(`Falha ao transmitir mensagem de teste pelo WebSocket: ${err?.message || err}`));
    }
  });
}

/**
 * Retorna todos os dispositivos conectados para um determinado restaurante
 */
export function getConnectedPrintAgentsForRestaurant(restaurantId: string): ConnectedPrintAgent[] {
  const result: ConnectedPrintAgent[] = [];
  for (const agent of activeAgents.values()) {
    if (agent.restaurantId === restaurantId && agent.ws.readyState === WebSocket.OPEN) {
      result.push(agent);
    }
  }
  return result;
}

/**
 * Encerra o servidor WebSocket e limpa timers (para shutdown ou testes)
 */
export async function closePrintAgentWebSocketServer(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  for (const [deviceId, agent] of activeAgents.entries()) {
    try {
      await agent.deviceDocRef.update({
        connectionStatus: 'offline',
        isOnline: false,
        lastSeenAt: Date.now(),
        disconnectedAt: Date.now(),
        updatedAt: new Date().toISOString()
      });
      agent.ws.close(1001, 'Servidor reiniciando');
    } catch {
      // ignore
    }
  }

  activeAgents.clear();

  if (wssInstance) {
    wssInstance.close();
    wssInstance = null;
  }
}
