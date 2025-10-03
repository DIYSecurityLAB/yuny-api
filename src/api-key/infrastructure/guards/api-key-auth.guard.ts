import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ApiKeyValidationService } from '../../application/services/api-key-validation.service';

// Extend Express Request to include API key context
declare global {
  namespace Express {
    interface Request {
      apiKeyContext?: {
        apiKeyId: string;
        userId: string;
        userType: string;
        tenantId?: string;
        storeId?: string;
        consumerId?: string;
        marketplaceContext?: string;
        permissions: string[];
      };
    }
  }
}

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly apiKeyValidationService: ApiKeyValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Extract API key from header
    const apiKeyHeader = request.headers['x-api-key'] as string;
    
    if (!apiKeyHeader) {
      throw new UnauthorizedException('API key is required');
    }

    try {
      // Validate API key
      const validation = await this.apiKeyValidationService.validateApiKey(
        apiKeyHeader,
        {
          endpoint: request.path,
          method: request.method,
          ipAddress: this.getClientIp(request),
          userAgent: request.headers['user-agent'],
          geographicLocation: this.getGeographicLocation(request),
        }
      );

      if (!validation.isValid) {
        throw new UnauthorizedException('Invalid API key');
      }

      // Attach API key context to request
      const apiKeyContext = this.apiKeyValidationService.getApiKeyContext(validation.apiKey);
      request.apiKeyContext = {
        apiKeyId: validation.apiKey.id,
        userId: apiKeyContext.userId,
        userType: apiKeyContext.userType,
        tenantId: apiKeyContext.tenantId,
        storeId: apiKeyContext.storeId,
        consumerId: apiKeyContext.consumerId,
        marketplaceContext: apiKeyContext.marketplaceContext,
        permissions: apiKeyContext.permissions,
      };

      // Log the API usage asynchronously
      this.logApiUsage(validation.apiKey, request, 200).catch(console.error);

      return true;
    } catch (error) {
      // Log failed authentication attempt
      this.logFailedAttempt(request, error.message).catch(console.error);
      throw error;
    }
  }

  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    const realIp = request.headers['x-real-ip'] as string;
    
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    
    if (realIp) {
      return realIp;
    }
    
    return request.connection.remoteAddress || 
           request.socket.remoteAddress || 
           (request.connection as any).socket?.remoteAddress || 
           'unknown';
  }

  private getGeographicLocation(request: Request): string | undefined {
    // Could integrate with IP geolocation service
    // For now, check if provided in headers
    return request.headers['x-user-location'] as string;
  }

  private async logApiUsage(apiKey: any, request: Request, statusCode: number): Promise<void> {
    try {
      await this.apiKeyValidationService.logUsage(apiKey, {
        endpoint: request.path,
        method: request.method,
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string,
        statusCode,
        responseTimeMs: undefined, // Will be set by middleware
        transactionValue: this.extractTransactionValue(request),
        currency: this.extractCurrency(request),
        merchantId: request.apiKeyContext?.storeId,
        couponCategory: this.extractCouponCategory(request),
        geographicLocation: this.getGeographicLocation(request),
      });
    } catch (error) {
      console.error('Failed to log API usage:', error);
    }
  }

  private async logFailedAttempt(request: Request, reason: string): Promise<void> {
    // Log failed authentication attempts for security monitoring
    console.warn('Failed API key authentication:', {
      ip: this.getClientIp(request),
      endpoint: request.path,
      method: request.method,
      userAgent: request.headers['user-agent'],
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  private extractTransactionValue(request: Request): number | undefined {
    // Extract transaction value from request body or query params
    const body = request.body;
    if (body && typeof body === 'object') {
      return body.amount || body.value || body.total || body.transactionValue;
    }
    return undefined;
  }

  private extractCurrency(request: Request): string | undefined {
    const body = request.body;
    if (body && typeof body === 'object') {
      return body.currency || body.currencyCode;
    }
    return request.headers['x-currency'] as string || 'BRL';
  }

  private extractCouponCategory(request: Request): string | undefined {
    const body = request.body;
    if (body && typeof body === 'object') {
      return body.category || body.couponCategory;
    }
    
    // Try to extract from URL path
    const pathMatch = request.path.match(/\/api\/coupons\/([^\/]+)/);
    return pathMatch ? pathMatch[1] : undefined;
  }
}