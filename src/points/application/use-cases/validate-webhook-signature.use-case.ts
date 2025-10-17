import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface ValidateSignatureRequest {
  rawBody: string;
  signature: string;
  headers?: Record<string, string>;
}

export interface ValidateSignatureResponse {
  isValid: boolean;
  reason?: string;
  algorithm: string;
}

@Injectable()
export class ValidateWebhookSignatureUseCase {
  constructor(private readonly configService: ConfigService) {}

  execute(request: ValidateSignatureRequest): ValidateSignatureResponse {
    try {
      const webhookSecret = this.configService.get<string>('ALFRED_PAY_WEBHOOK_SECRET');
      
      if (!webhookSecret) {
        console.warn('[ValidateWebhookSignature] ALFRED_PAY_WEBHOOK_SECRET not configured');
        
        // Em desenvolvimento, permitir sem secret (configurável)
        const allowUnsigned = this.configService.get<boolean>('WEBHOOK_ALLOW_UNSIGNED', false);
        if (allowUnsigned) {
          console.warn('[ValidateWebhookSignature] Allowing unsigned webhook in development mode');
          return {
            isValid: true,
            reason: 'Development mode - signature validation skipped',
            algorithm: 'none'
          };
        }
        
        return {
          isValid: false,
          reason: 'Webhook secret not configured',
          algorithm: 'hmac-sha256'
        };
      }

      // Normalizar assinatura (remover prefixo se presente)
      const normalizedSignature = this.normalizeSignature(request.signature);
      
      if (!normalizedSignature) {
        return {
          isValid: false,
          reason: 'Invalid signature format',
          algorithm: 'hmac-sha256'
        };
      }

      // Calcular HMAC esperado
      const expectedSignature = this.calculateHMAC(request.rawBody, webhookSecret);
      
      // Comparação segura contra timing attacks
      const isValid = this.secureCompare(normalizedSignature, expectedSignature);
      
      if (!isValid) {
        console.warn('[ValidateWebhookSignature] Signature mismatch', {
          provided: normalizedSignature.substring(0, 10) + '...',
          expected: expectedSignature.substring(0, 10) + '...',
          bodyLength: request.rawBody.length
        });
      }

      return {
        isValid,
        reason: isValid ? 'Signature valid' : 'Signature mismatch',
        algorithm: 'hmac-sha256'
      };

    } catch (error) {
      console.error('[ValidateWebhookSignature] Error validating signature', {
        error: error.message,
        bodyLength: request.rawBody?.length
      });

      return {
        isValid: false,
        reason: `Validation error: ${error.message}`,
        algorithm: 'hmac-sha256'
      };
    }
  }

  private normalizeSignature(signature: string): string | null {
    if (!signature || typeof signature !== 'string') {
      return null;
    }

    // Remover prefixos comuns (sha256=, sha1=, etc.)
    const cleanSignature = signature.replace(/^(sha256=|sha1=|hmac-sha256=)/, '');
    
    // Verificar se é um hash válido (hex string)
    if (!/^[a-fA-F0-9]+$/.test(cleanSignature)) {
      return null;
    }

    return cleanSignature.toLowerCase();
  }

  private calculateHMAC(data: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(data, 'utf8')
      .digest('hex')
      .toLowerCase();
  }

  private secureCompare(provided: string, expected: string): boolean {
    try {
      // Converter para buffers para comparação segura
      const providedBuffer = Buffer.from(provided, 'hex');
      const expectedBuffer = Buffer.from(expected, 'hex');

      // Verificar se têm o mesmo tamanho
      if (providedBuffer.length !== expectedBuffer.length) {
        return false;
      }

      // Comparação constante contra timing attacks
      return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch (error) {
      console.error('[ValidateWebhookSignature] Error in secure compare', {
        error: error.message
      });
      return false;
    }
  }

  // Método auxiliar para debug (apenas em desenvolvimento)
  generateTestSignature(data: string): string {
    const secret = this.configService.get<string>('ALFRED_PAY_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error('Webhook secret not configured');
    }
    return 'sha256=' + this.calculateHMAC(data, secret);
  }

  // Validação adicional de headers se necessário
  validateHeaders(headers: Record<string, string>): boolean {
    // Verificar se headers obrigatórios estão presentes
    const requiredHeaders = ['content-type', 'user-agent'];
    
    for (const header of requiredHeaders) {
      if (!headers[header] && !headers[header.toLowerCase()]) {
        console.warn('[ValidateWebhookSignature] Missing required header', { header });
        return false;
      }
    }

    // Verificar Content-Type
    const contentType = headers['content-type'] || headers['Content-Type'];
    if (contentType && !contentType.includes('application/json')) {
      console.warn('[ValidateWebhookSignature] Invalid content type', { contentType });
      return false;
    }

    return true;
  }
}