/* eslint-disable no-restricted-globals */

// Importar scripts do Firebase para suporte a notificações em segundo plano
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Configuração do Firebase (deve ser a mesma do app)
firebase.initializeApp({
  apiKey: "AIzaSyCkcyoP2jhvxSmYEeWE6aYA_jHx0O3J1HM",
  authDomain: "flutterflow-buscando-sheets.firebaseapp.com",
  projectId: "flutterflow-buscando-sheets",
  storageBucket: "flutterflow-buscando-sheets.firebasestorage.app",
  messagingSenderId: "69884977812",
  appId: "1:69884977812:web:ea500e8e177dab500d8a81"
});

const messaging = firebase.messaging();

// Handler para mensagens em segundo plano
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Mensagem em segundo plano recebida:', payload);
  
  // Se a mensagem já tiver um objeto 'notification', o browser já vai mostrar automaticamente
  // Não precisamos chamar showNotification manualmente a menos que seja uma mensagem de 'data' pura
  if (payload.notification) {
    console.log('[service-worker.js] Browser deve mostrar notificação automaticamente.');
    return;
  }

  const notificationTitle = payload.data?.title || 'Qfomeai';
  const notificationOptions = {
    body: payload.data?.body || 'Você tem uma nova atualização.',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.data?.orderId || 'general-notification',
    renotify: true,
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handler para clique na notificação
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  // Tenta extrair a URL do payload data ou do fcmOptions.link
  let urlPath = '/';
  if (event.notification.data?.url) {
    urlPath = event.notification.data.url;
  } else if (event.notification.data?.FCM_MSG?.data?.url) {
    urlPath = event.notification.data.FCM_MSG.data.url;
  } else if (event.notification.data?.FCM_MSG?.notification?.fcmOptions?.link) {
    urlPath = event.notification.data.FCM_MSG.notification.fcmOptions.link;
  }

  // Garantir que a URL seja absoluta
  const targetUrl = new URL(urlPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Tenta encontrar uma janela já aberta para o mesmo domínio
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            return client.focus().then(focusedClient => {
              // Navegar para a URL alvo dentro da janela focada
              return focusedClient.navigate(targetUrl);
            });
          }
        }
        // Se não encontrar, abre uma nova janela
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
  );
});

// --- Lógica de SPA e Cache ---

const CACHE_NAME = 'qfomeai-v1';
const OFFLINE_URL = '/index.html';

// Instalação: Cachear o App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([OFFLINE_URL]);
    })
  );
  self.skipWaiting();
});

// Ativação: Limpar caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições (Fetch)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Se a requisição for para navegação (request.mode === 'navigate')
  // Retornar index.html (App Shell) para garantir que o SPA carregue corretamente
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // 2. Não tentar fazer fetch direto de rotas do frontend (SPA)
  // Se a URL for do mesmo domínio e parecer uma rota de navegação mas não for request.mode === 'navigate'
  // (ex: links clicados que o browser tenta buscar como fetch em alguns cenários ou erros de lógica)
  if (url.origin === self.location.origin) {
    const spaRoutes = ['/restaurant', '/admin', '/profile', '/orders', '/favorites', '/cart', '/checkout', '/onboarding'];
    const isSpaRoute = spaRoutes.some(route => url.pathname.startsWith(route));
    
    // Se for um fetch direto para uma rota de SPA que não deveria ser um fetch de recurso
    if (isSpaRoute && request.mode !== 'navigate' && !url.pathname.includes('.')) {
      // Retornamos uma resposta vazia ou o index.html para evitar erro de rede
      event.respondWith(caches.match(OFFLINE_URL));
      return;
    }
  }

  // Ignorar requisições para extensões ou domínios externos que não queremos cachear/interceptar
  if (!url.protocol.startsWith('http')) return;

  // 3. Adicionar tratamento de erro no fetch com try/catch
  // 4. Garantir fallback seguro caso a requisição falhe
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        
        // Opcional: Cachear assets estáticos bem-sucedidos
        if (response.status === 200 && (request.destination === 'script' || request.destination === 'style' || request.destination === 'image')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        
        return response;
      } catch (error) {
        console.error('[service-worker.js] Erro no fetch:', error);

        // Tentar buscar do cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;

        // Fallback seguro para evitar "Failed to fetch" não tratado
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }

        // Fallback para imagens
        if (request.destination === 'image') {
          return caches.match('/logo.png');
        }

        return new Response('Erro de conexão. Verifique sua internet.', {
          status: 408,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })()
  );
});
