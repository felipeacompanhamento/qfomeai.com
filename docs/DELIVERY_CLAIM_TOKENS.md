# Documentação da Infraestrutura de Tokens de Captura (Fase 2)

## 1. Visão Geral

A Fase 2 implementa a infraestrutura backend segura para **Tokens de Captura de Entrega** (`deliveryClaimTokens`). Esses tokens vinculam com segurança criptográfica o restaurante ao pedido impresso no cupom e, posteriormente, à captura da entrega pelo entregador externo.

Nenhum token em texto claro (raw token) é armazenado no banco de dados ou registrado em logs. Apenas o hash **SHA-256** do token é salvo no Firestore. O token em texto claro é retornado **uma única vez** no momento da geração para que o sistema de impressão do restaurante possa codificá-lo no QR Code do cupom.

---

## 2. Estrutura de Dados e Coleção no Firestore

### Coleção `/deliveryClaimTokens/{tokenHash}`
O ID de cada documento nesta coleção é o hash SHA-256 (64 caracteres hexadecimais em caixa baixa) do token gerado.

```json
{
  "tokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "restaurantId": "restaurante_123",
  "orderId": "pedido_789",
  "publicOrderNumber": "42",
  "purpose": "DELIVERY_CLAIM",
  "status": "ACTIVE",
  "version": 1,
  "createdAt": "2026-07-21T18:00:00.000Z",
  "expiresAt": "2026-07-22T18:00:00.000Z",
  "createdByUserId": "user_owner_456",
  "metadata": {
    "source": "RESTAURANT_PRINT"
  }
}
```

### Resumo no Documento do Pedido `/restaurants/{restaurantId}/orders/{orderId}`
Para rápido acesso e atomicidade transacional, o pedido mantém um sumário em `deliveryClaim`:

```json
{
  "publicOrderNumber": "42",
  "deliveryClaim": {
    "status": "ACTIVE",
    "activeTokenHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "activeTokenVersion": 1,
    "tokenExpiresAt": "2026-07-22T18:00:00.000Z",
    "updatedAt": "2026-07-21T18:00:00.000Z"
  }
}
```

---

## 3. Regras e Segurança do Ciclo de Vida do Token

1. **Geração Segura**: Gerado com 256 bits de entropia criptográfica via `crypto.randomBytes(32).toString('base64url')`.
2. **Reimpressão e Versionamento**: A reimpressão de um cupom invoca a reemissão do token. A transação do Firestore revoga o token anterior com motivo `REPRINT` e incrementa a versão (`version + 1`). Apenas 1 token ativo existe por pedido por vez.
3. **Expiração Passiva (Lazy Expiration)**: Caso o token esteja com status `ACTIVE` no banco porém com timestamp `expiresAt` ultrapassado, a validação ou consulta de status altera passivamente o documento para `EXPIRED`.
4. **Regras de Acesso no Firestore (`firestore.rules`)**:
   - A coleção `/deliveryClaimTokens` é bloqueada para acesso direto de clientes (`allow read, write: if false;`). Toda operação é executada exclusivamente via backend (Admin SDK).

---

## 4. Endpoints Internos do Restaurante

Todos os endpoints requerem autenticação do operador do restaurante via Firebase Auth ID Token (`Authorization: Bearer <idToken>`).

### 1. Gerar/Reemitir Token de Captura
* **POST** `/api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token`
* **Body Opcional**: `{ "source": "RESTAURANT_PRINT" }`
* **Resposta de Sucesso (201 Created)**:
```json
{
  "success": true,
  "data": {
    "claimToken": "v3_xK9mP..._raw_token",
    "publicOrderNumber": "42",
    "version": 1,
    "expiresAt": "2026-07-22T18:00:00.000Z"
  },
  "requestId": "req_123"
}
```

### 2. Consultar Estado do Token do Pedido
* **GET** `/api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token/status`
* **Resposta de Sucesso (200 OK)**:
```json
{
  "success": true,
  "data": {
    "hasActiveToken": true,
    "status": "ACTIVE",
    "version": 1,
    "expiresAt": "2026-07-22T18:00:00.000Z",
    "publicOrderNumber": "42"
  },
  "requestId": "req_123"
}
```

### 3. Revogar Token Manualmente
* **POST** `/api/v1/restaurants/:restaurantId/orders/:orderId/delivery-claim-token/revoke`
* **Body Opcional**: `{ "reason": "ORDER_CHANGED", "note": "Pedido alterado pelo cliente" }`
* **Resposta de Sucesso (200 OK)**:
```json
{
  "success": true,
  "data": {
    "revoked": true,
    "publicOrderNumber": "42"
  },
  "requestId": "req_123"
}
```

---

## 5. Auditoria Sanitizada (`deliveryApiAuditLogs`)

As seguintes ações relativas aos tokens de captura são auditadas com IPs anonimizados e sem expor dados sensíveis:

- `DELIVERY_CLAIM_TOKEN_CREATED`
- `DELIVERY_CLAIM_TOKEN_STATUS_READ`
- `DELIVERY_CLAIM_TOKEN_REVOKED`
- `DELIVERY_CLAIM_TOKEN_EXPIRED`
- `DELIVERY_CLAIM_TOKEN_GENERATION_DENIED`
