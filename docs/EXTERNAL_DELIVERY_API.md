# API Externa de Integração para Aplicativo de Entregadores (QFomeAI)

## Visão Geral

Esta documentação descreve a infraestrutura e especificações da **API Externa do QFomeAI (v1)** destinada à integração com plataformas independentes e aplicativos de entregadores Android.

### Princípios de Arquitetura e Segurança
- **Desconexão Total:** O aplicativo Android não acessa o Firestore do QFomeAI diretamente. Toda a comunicação ocorre exclusivamente via API HTTPS.
- **Não Confiabilidade em Segredos no APK:** Nenhum segredo ou chave privada é armazenada no aplicativo Android. A autenticação com o QFomeAI é feita de servidor para servidor via JWT assinado pelo backend da plataforma externa.
- **Autenticação Descentralizada:** O aplicativo Android autentica-se em seu próprio backend. O backend da plataforma externa emite um JWT temporário assinado e o envia ao QFomeAI no cabeçalho `Authorization: Bearer <JWT>`.

---

## Fluxo de Autenticação

```text
[Aplicativo Android de Entregas]
           │
           │ (1) Autenticação e Login próprio
           ▼
[Backend da Plataforma Externa]
           │
           │ (2) Assina JWT de curta duração (máx 15 min) com Chave Privada / HMAC
           ▼
[API Externa QFomeAI (/api/v1/external)]
           │
           │ (3) Valida Assinatura (Chave Pública / HMAC Hash), Claims, Escopos e Status
           ▼
   [Sucesso / Resposta Sanitizada]
```

---

## Estrutura do JWT

### Algoritmos Suportados
1. **`JWT_PUBLIC_KEY` (Recomendado para Produção):** Assinatura assimétrica (`RS256` ou `ES256`). O QFomeAI armazena apenas a chave pública PEM da plataforma externa.
2. **`JWT_HMAC` (Para Ambientes Controlados):** Assinatura simétrica (`HS256`). O QFomeAI armazena somente o hash HMAC do segredo (nunca o segredo puro).

### Claims Obrigatórias do Payload
```json
{
  "iss": "https://auth.minhaplataforma.com",
  "aud": "qfomeai-external-delivery-api",
  "sub": "driver_ext_98765",
  "appId": "minha_plataforma_entregas",
  "externalDriverId": "driver_ext_98765",
  "driverDisplayName": "João Silva",
  "scopes": [
    "delivery:read",
    "delivery:preview",
    "delivery:claim",
    "delivery:start",
    "delivery:complete",
    "delivery:fail"
  ],
  "credentialVersion": 1,
  "iat": 1774100000,
  "exp": 1774100900,
  "jti": "jwt_id_unique_12345"
}
```

---

## Escopos Disponíveis

| Escopo | Descrição |
| :--- | :--- |
| `delivery:read` | Consulta de integridade/saúde e leitura de entregas ativas do entregador. |
| `delivery:preview` | Consulta de prévia limitada de pedido via token do QR Code. |
| `delivery:claim` | Captura definitiva de entrega vinculada ao entregador. |
| `delivery:start` | Sinalização de início do deslocamento/entrega. |
| `delivery:complete` | Confirmação de entrega concluída. |
| `delivery:fail` | Registro de falha ou impossibilidade de entrega. |

---

## Cabeçalhos Recomendados e Obrigatórios

- `Authorization: Bearer <JWT>` *(Obrigatório)*
- `X-Request-Id: <UUID>` *(Opcional - gerado automaticamente se ausente)*
- `Idempotency-Key: <STRING>` *(Opcional para rotas idempotentes)*
- `Content-Type: application/json`

---

## Formato Padrão de Respostas

### Resposta de Sucesso (`200 OK`)
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "authenticated": true,
    "appId": "minha_plataforma_entregas",
    "externalDriverId": "driver_ext_98765",
    "serverTime": "2026-07-21T20:38:00.000Z"
  },
  "requestId": "4c9d722e-13a8-4357-a360-128f74e62a1b"
}
```

### Resposta de Erro
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "Escopo insuficiente para realizar esta ação."
  },
  "requestId": "4c9d722e-13a8-4357-a360-128f74e62a1b"
}
```

### Códigos de Erro Mapeados
- `UNAUTHENTICATED` (401)
- `INVALID_EXTERNAL_TOKEN` (401)
- `TOKEN_EXPIRED` (401)
- `INVALID_ISSUER` (403)
- `INVALID_AUDIENCE` (403)
- `INVALID_APP` (403)
- `APP_SUSPENDED` (403)
- `APP_REVOKED` (403)
- `CREDENTIAL_VERSION_MISMATCH` (403)
- `INSUFFICIENT_SCOPE` (403)
- `RATE_LIMITED` (429)
- `VALIDATION_ERROR` (400)
- `IDEMPOTENCY_CONFLICT` (409)
- `INTERNAL_ERROR` (500)

---

## Endpoints Disponíveis (Fase 1)

### `GET /api/v1/external/health`
Valida a integridade da conexão e o token JWT emitido pela plataforma externa.

- **Autenticação:** Requerida (`Authorization: Bearer <JWT>`)
- **Escopo Exigido:** `delivery:read`
- **Exemplo de Resposta (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "authenticated": true,
    "appId": "minha_plataforma_entregas",
    "externalDriverId": "driver_ext_98765",
    "serverTime": "2026-07-21T20:38:00.000Z"
  },
  "requestId": "e1f2a3b4-5678-90ab-cdef-1234567890ab"
}
```

---

## Cadastro de Plataformas Externa (CLI Administrativo)

O cadastro e gerenciamento de aplicações externas é feito exclusivamente via script administrativo no servidor QFomeAI:

```bash
# Exemplo 1: Cadastrar aplicação com chave pública RSA (Recomendado)
npx tsx scripts/createExternalDeliveryApp.ts \
  --appId=flash_deliveries \
  --name="Flash Deliveries App" \
  --mode=JWT_PUBLIC_KEY \
  --issuer=https://auth.flashdeliveries.com \
  --publicKey="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE...\n-----END PUBLIC KEY-----" \
  --scopes="delivery:read,delivery:preview,delivery:claim,delivery:start,delivery:complete,delivery:fail" \
  --rateLimit=120

# Exemplo 2: Cadastrar aplicação com segredo HMAC (Exibe o segredo puro apenas 1x na tela)
npx tsx scripts/createExternalDeliveryApp.ts \
  --appId=demo_delivery \
  --name="Demo Delivery" \
  --mode=JWT_HMAC \
  --issuer=https://auth.demodelivery.com
```

---

## Estrutura do Firestore (Coleções Preparadas)

1. **`externalDeliveryApps/{appId}`**: Configurações de plataformas de entrega autorizadas.
2. **`deliveryApiAuditLogs/{logId}`**: Histórico de auditoria sanitizado (sem tokens, sem senhas e sem dados pessoais sensíveis em texto puro).
3. **`externalApiIdempotency/{idempotencyHash}`**: Registros de controle de concorrência e idempotência via `Idempotency-Key`.

---

## Próximas Fases (Roadmap)

- **Fase 2:** Geração de Token Temporário e Impressão do QR Code seguro nos cupons dos restaurantes.
- **Fase 3:** Endpoints `/preview` e `/claim` para prévia limitada e captura de pedidos com trava contra dupla captura.
- **Fase 4:** Endpoints `/start`, `/complete`, `/fail` para atualização de status de entrega em tempo real.
