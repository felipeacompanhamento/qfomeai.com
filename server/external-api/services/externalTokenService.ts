import jwt from 'jsonwebtoken';
import { getExternalDeliveryApp } from './externalAppService.js';
import { ApiErrorCode, ExternalAuthenticatedIdentity, ExternalDeliveryApp, ExternalDriverJwtPayload } from '../types/externalApi.js';
import { hashSecret } from '../utils/cryptoUtils.js';

export interface TokenVerificationResult {
  valid: boolean;
  identity?: ExternalAuthenticatedIdentity;
  errorCode?: ApiErrorCode;
  errorMessage?: string;
  app?: ExternalDeliveryApp;
}

const DEFAULT_AUDIENCE = process.env.EXTERNAL_API_AUDIENCE || 'qfomeai-external-delivery-api';
const MAX_TOKEN_AGE_SECONDS = Number(process.env.EXTERNAL_API_MAX_TOKEN_AGE_SECONDS) || 900; // 15 minutes max
const CLOCK_SKEW_TOLERANCE_SECONDS = 60; // 1 minute tolerance for clock skew

/**
 * Decodes and verifies a JWT token issued by an external delivery platform.
 */
export async function verifyExternalToken(rawToken: string): Promise<TokenVerificationResult> {
  if (!rawToken || typeof rawToken !== 'string') {
    return {
      valid: false,
      errorCode: 'UNAUTHENTICATED',
      errorMessage: 'Token de autenticação ausente ou inválido.',
    };
  }

  // 1. Decode token header unverified to check structure & appId
  let unverifiedPayload: ExternalDriverJwtPayload | null = null;
  let decodedHeader: jwt.JwtHeader | null = null;

  try {
    const decoded = jwt.decode(rawToken, { complete: true });
    if (!decoded || typeof decoded !== 'object' || !decoded.header || !decoded.payload) {
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: 'Formato de token inválido.',
      };
    }
    decodedHeader = decoded.header;
    unverifiedPayload = decoded.payload as ExternalDriverJwtPayload;
  } catch (err) {
    return {
      valid: false,
      errorCode: 'INVALID_EXTERNAL_TOKEN',
      errorMessage: 'Falha ao decodificar estrutura do token.',
    };
  }

  // 2. Reject algorithm 'none'
  const alg = decodedHeader?.alg;
  if (!alg || alg.toLowerCase() === 'none') {
    return {
      valid: false,
      errorCode: 'INVALID_EXTERNAL_TOKEN',
      errorMessage: 'Algoritmo de assinatura não permitido.',
    };
  }

  // 3. Check required payload fields
  const appId = unverifiedPayload?.appId;
  const externalDriverId = unverifiedPayload?.externalDriverId || unverifiedPayload?.sub;

  if (!appId || typeof appId !== 'string') {
    return {
      valid: false,
      errorCode: 'INVALID_APP',
      errorMessage: 'Identificador de aplicação (appId) ausente no token.',
    };
  }

  if (!externalDriverId || typeof externalDriverId !== 'string') {
    return {
      valid: false,
      errorCode: 'INVALID_EXTERNAL_TOKEN',
      errorMessage: 'Identificador do entregador (externalDriverId) ausente no token.',
    };
  }

  // 4. Fetch application from Firestore
  const app = await getExternalDeliveryApp(appId);

  if (!app) {
    return {
      valid: false,
      errorCode: 'INVALID_APP',
      errorMessage: 'Plataforma externa não cadastrada.',
    };
  }

  if (app.status === 'SUSPENDED') {
    return {
      valid: false,
      errorCode: 'APP_SUSPENDED',
      errorMessage: 'Plataforma externa temporariamente suspensa.',
      app,
    };
  }

  if (app.status === 'REVOKED') {
    return {
      valid: false,
      errorCode: 'APP_REVOKED',
      errorMessage: 'Plataforma externa revogada.',
      app,
    };
  }

  if (app.status !== 'ACTIVE') {
    return {
      valid: false,
      errorCode: 'INVALID_APP',
      errorMessage: 'Status de plataforma externa inválido.',
      app,
    };
  }

  // 5. Verify algorithm based on app.authenticationMode
  if (app.authenticationMode === 'JWT_PUBLIC_KEY') {
    if (alg !== 'RS256' && alg !== 'ES256') {
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: `Algoritmo ${alg} incompatível com o modo JWT_PUBLIC_KEY (esperado RS256/ES256).`,
        app,
      };
    }

    if (!app.publicKeyPem) {
      return {
        valid: false,
        errorCode: 'INVALID_APP',
        errorMessage: 'Chave pública não configurada para esta aplicação.',
        app,
      };
    }

    try {
      jwt.verify(rawToken, app.publicKeyPem, {
        algorithms: [alg as jwt.Algorithm],
      });
    } catch (verifyErr: any) {
      if (verifyErr?.name === 'TokenExpiredError') {
        return {
          valid: false,
          errorCode: 'TOKEN_EXPIRED',
          errorMessage: 'Token de acesso expirado.',
          app,
        };
      }
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: 'Assinatura do token inválida.',
        app,
      };
    }
  } else if (app.authenticationMode === 'JWT_HMAC') {
    if (alg !== 'HS256' && alg !== 'HS384' && alg !== 'HS512') {
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: `Algoritmo ${alg} incompatível com o modo JWT_HMAC (esperado HS256/384/512).`,
        app,
      };
    }

    if (!app.secretHash) {
      return {
        valid: false,
        errorCode: 'INVALID_APP',
        errorMessage: 'Segredo HMAC não configurado para esta aplicação.',
        app,
      };
    }

    try {
      // In HMAC mode, verify using secret hash
      jwt.verify(rawToken, app.secretHash, {
        algorithms: [alg as jwt.Algorithm],
      });
    } catch (verifyErr: any) {
      if (verifyErr?.name === 'TokenExpiredError') {
        return {
          valid: false,
          errorCode: 'TOKEN_EXPIRED',
          errorMessage: 'Token de acesso expirado.',
          app,
        };
      }
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: 'Assinatura HMAC do token inválida.',
        app,
      };
    }
  } else {
    return {
      valid: false,
      errorCode: 'INVALID_APP',
      errorMessage: 'Modo de autenticação não suportado.',
      app,
    };
  }

  // 6. Validate Claims (iss, aud, exp, iat, credentialVersion)
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // Issuer check
  if (app.issuer && unverifiedPayload.iss !== app.issuer) {
    return {
      valid: false,
      errorCode: 'INVALID_ISSUER',
      errorMessage: 'Emissor (iss) do token não corresponde ao registrado para esta aplicação.',
      app,
    };
  }

  // Audience check
  const expectedAudience = app.audience || DEFAULT_AUDIENCE;
  const tokenAud = Array.isArray(unverifiedPayload.aud) ? unverifiedPayload.aud : [unverifiedPayload.aud];
  if (!tokenAud.includes(expectedAudience) && !tokenAud.includes(DEFAULT_AUDIENCE)) {
    return {
      valid: false,
      errorCode: 'INVALID_AUDIENCE',
      errorMessage: 'Audiência (aud) do token inválida.',
      app,
    };
  }

  // Expiration check
  if (!unverifiedPayload.exp || typeof unverifiedPayload.exp !== 'number') {
    return {
      valid: false,
      errorCode: 'INVALID_EXTERNAL_TOKEN',
      errorMessage: 'Token não possui expiração (exp).',
      app,
    };
  }

  if (unverifiedPayload.exp <= nowInSeconds - CLOCK_SKEW_TOLERANCE_SECONDS) {
    return {
      valid: false,
      errorCode: 'TOKEN_EXPIRED',
      errorMessage: 'Token de acesso expirado.',
      app,
    };
  }

  // Max Token Age check
  if (unverifiedPayload.iat && typeof unverifiedPayload.iat === 'number') {
    if (unverifiedPayload.iat > nowInSeconds + CLOCK_SKEW_TOLERANCE_SECONDS) {
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: 'Token emitido no futuro (iat inválido).',
        app,
      };
    }

    if (unverifiedPayload.exp - unverifiedPayload.iat > MAX_TOKEN_AGE_SECONDS) {
      return {
        valid: false,
        errorCode: 'INVALID_EXTERNAL_TOKEN',
        errorMessage: `Tempo de vida do token excede o máximo permitido de ${MAX_TOKEN_AGE_SECONDS} segundos.`,
        app,
      };
    }
  }

  // Credential Version check
  const tokenCredVer = typeof unverifiedPayload.credentialVersion === 'number' ? unverifiedPayload.credentialVersion : 1;
  if (tokenCredVer < app.credentialVersion) {
    return {
      valid: false,
      errorCode: 'CREDENTIAL_VERSION_MISMATCH',
      errorMessage: 'Versão de credencial do token está desatualizada.',
      app,
    };
  }

  const grantedScopes = Array.isArray(unverifiedPayload.scopes) ? unverifiedPayload.scopes : [];

  const identity: ExternalAuthenticatedIdentity = {
    appId: app.appId,
    externalDriverId,
    subject: unverifiedPayload.sub || externalDriverId,
    driverDisplayName: unverifiedPayload.driverDisplayName,
    scopes: grantedScopes,
    tokenId: unverifiedPayload.jti || `jti-${Date.now()}`,
    credentialVersion: tokenCredVer,
  };

  return {
    valid: true,
    identity,
    app,
  };
}
