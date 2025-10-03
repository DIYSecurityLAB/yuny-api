import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ApiKeyValidationService } from '../../application/services/api-key-validation.service';
import { MarketplacePermission } from '../../domain/enums';

// Metadata key for required permissions
export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';

@Injectable()
export class ApiKeyPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyValidationService: ApiKeyValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Get required permissions from metadata
    const requiredPermissions = this.reflector.getAllAndOverride<{
      permissions: MarketplacePermission[];
      resourceType?: string;
    }>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no permissions required, allow access
    if (!requiredPermissions) {
      return true;
    }

    // Check if API key context exists (should be set by ApiKeyAuthGuard)
    if (!request.apiKeyContext) {
      throw new ForbiddenException('API key context not found');
    }

    // Get API key from validation service (we need the full entity for permission checking)
    const apiKeyHeader = request.headers['x-api-key'] as string;
    const validation = await this.apiKeyValidationService.validateApiKey(
      apiKeyHeader,
      {
        endpoint: request.path,
        method: request.method,
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
      }
    );

    // Check each required permission
    for (const permission of requiredPermissions.permissions) {
      const hasPermission = await this.apiKeyValidationService.checkPermission(
        validation.apiKey,
        permission,
        requiredPermissions.resourceType
      );

      if (!hasPermission) {
        throw new ForbiddenException(
          `Insufficient permissions. Required: ${permission}${
            requiredPermissions.resourceType ? ` for ${requiredPermissions.resourceType}` : ''
          }`
        );
      }
    }

    return true;
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
}