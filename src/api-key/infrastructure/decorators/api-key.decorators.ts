import { SetMetadata, applyDecorators, UseGuards } from '@nestjs/common';
import { ApiKeyAuthGuard } from '../guards/api-key-auth.guard';
import { ApiKeyPermissionGuard, REQUIRED_PERMISSIONS_KEY } from '../guards/api-key-permission.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { MarketplacePermission } from '../../domain/enums';

/**
 * Decorator to require API key authentication
 */
export const RequireApiKey = () => {
  return applyDecorators(
    UseGuards(ApiKeyAuthGuard)
  );
};

/**
 * Decorator to require specific permissions
 */
export const RequirePermissions = (
  permissions: MarketplacePermission[],
  resourceType?: string
) => {
  return applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, { permissions, resourceType }),
    UseGuards(ApiKeyAuthGuard, ApiKeyPermissionGuard)
  );
};

/**
 * Decorator to apply rate limiting
 */
export const RateLimit = () => {
  return applyDecorators(
    UseGuards(ApiKeyAuthGuard, RateLimitGuard)
  );
};

/**
 * Combined decorator for full API key protection
 */
export const ApiKeyProtected = (
  permissions?: MarketplacePermission[],
  resourceType?: string
) => {
  const decorators = [UseGuards(ApiKeyAuthGuard, RateLimitGuard)];

  if (permissions && permissions.length > 0) {
    decorators.unshift(
      SetMetadata(REQUIRED_PERMISSIONS_KEY, { permissions, resourceType }),
      UseGuards(ApiKeyPermissionGuard)
    );
  }

  return applyDecorators(...decorators);
};

/**
 * Decorator for merchant-only endpoints
 */
export const MerchantOnly = (resourceType?: string) => {
  return RequirePermissions([
    MarketplacePermission.COUPON_MANAGE,
    MarketplacePermission.STORE_PROFILE,
  ], resourceType);
};

/**
 * Decorator for consumer-only endpoints
 */
export const ConsumerOnly = (resourceType?: string) => {
  return RequirePermissions([
    MarketplacePermission.COUPON_SEARCH,
    MarketplacePermission.COUPON_PURCHASE,
  ], resourceType);
};

/**
 * Decorator for platform/admin endpoints
 */
export const PlatformOnly = () => {
  return RequirePermissions([
    MarketplacePermission.MARKETPLACE_ANALYTICS,
    MarketplacePermission.SYSTEM_CONFIG,
  ]);
};

/**
 * Decorator for webhook endpoints
 */
export const WebhookOnly = () => {
  return RequirePermissions([
    MarketplacePermission.WEBHOOK_RECEIVE,
    MarketplacePermission.EVENT_PROCESS,
  ]);
};

/**
 * Decorator for analytics endpoints
 */
export const AnalyticsAccess = (resourceType?: string) => {
  return RequirePermissions([
    MarketplacePermission.ANALYTICS_VIEW,
  ], resourceType);
};

/**
 * Decorator for high-value transaction endpoints
 */
export const HighValueTransaction = () => {
  return applyDecorators(
    RequirePermissions([MarketplacePermission.COUPON_PURCHASE]),
    UseGuards(ApiKeyAuthGuard, ApiKeyPermissionGuard, RateLimitGuard)
  );
};

/**
 * Decorator for bulk operations
 */
export const BulkOperation = () => {
  return RequirePermissions([
    MarketplacePermission.BULK_UPLOAD,
  ]);
};

/**
 * Decorator for category-specific access
 */
export const CategoryAccess = (category: string) => {
  const permission = `${category.toLowerCase()}.manage` as MarketplacePermission;
  return RequirePermissions([permission], category);
};

/**
 * Decorator for revenue/financial data access
 */
export const FinancialDataAccess = () => {
  return RequirePermissions([
    MarketplacePermission.REVENUE_READ,
    MarketplacePermission.TRANSACTION_HISTORY,
  ]);
};