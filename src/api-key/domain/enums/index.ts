// Domain Enums for API Key System

export enum UserType {
  MERCHANT = 'MERCHANT',
  CONSUMER = 'CONSUMER',
  PLATFORM = 'PLATFORM',
  ADMIN = 'ADMIN',
  WEBHOOK = 'WEBHOOK',
  PARTNER = 'PARTNER',
}

export enum ApiKeyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export enum RateLimitTier {
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM',
  ENTERPRISE = 'ENTERPRISE',
  UNLIMITED = 'UNLIMITED',
}

export enum ComplianceLevel {
  BASIC = 'BASIC',
  PCI_DSS = 'PCI_DSS',
  GDPR = 'GDPR',
  LGPD = 'LGPD',
  SOX = 'SOX',
  HIPAA = 'HIPAA',
}

// Marketplace-specific permissions
export enum MarketplacePermission {
  // Merchant Permissions
  COUPON_CREATE = 'coupon.create',
  COUPON_MANAGE = 'coupon.manage',
  INVENTORY_UPDATE = 'inventory.update',
  ANALYTICS_VIEW = 'analytics.view',
  STORE_PROFILE = 'store.profile',
  REVENUE_READ = 'revenue.read',
  STORE_SETTINGS = 'store.settings',
  BULK_UPLOAD = 'bulk.upload',

  // Consumer Permissions
  COUPON_SEARCH = 'coupon.search',
  COUPON_PURCHASE = 'coupon.purchase',
  COUPON_REDEEM = 'coupon.redeem',
  WALLET_VIEW = 'wallet.view',
  TRANSACTION_HISTORY = 'transaction.history',
  WISHLIST_MANAGE = 'wishlist.manage',
  PROFILE_UPDATE = 'profile.update',

  // Platform Permissions
  MARKETPLACE_ANALYTICS = 'marketplace.analytics',
  MERCHANT_MANAGE = 'merchant.manage',
  CONSUMER_SUPPORT = 'consumer.support',
  SYSTEM_CONFIG = 'system.config',
  FRAUD_DETECTION = 'fraud.detection',
  COMPLIANCE_AUDIT = 'compliance.audit',

  // Category-Specific Permissions
  ELECTRONICS_READ = 'electronics.read',
  ELECTRONICS_MANAGE = 'electronics.manage',
  FOOD_READ = 'food.read',
  FOOD_MANAGE = 'food.manage',
  TRAVEL_READ = 'travel.read',
  TRAVEL_BOOK = 'travel.book',
  FASHION_READ = 'fashion.read',
  FASHION_INVENTORY = 'fashion.inventory',

  // Webhook Permissions
  WEBHOOK_RECEIVE = 'webhook.receive',
  NOTIFICATION_SEND = 'notification.send',
  EVENT_PROCESS = 'event.process',

  // Admin Permissions
  ADMIN_ALL = 'admin.all',
  USER_MANAGE = 'user.manage',
  API_KEY_MANAGE = 'api_key.manage',
  SYSTEM_MAINTENANCE = 'system.maintenance',
}

// Rate limit configurations by tier and user type
export const RATE_LIMIT_CONFIGS = {
  [RateLimitTier.BASIC]: {
    [UserType.MERCHANT]: {
      requestsPerMinute: 30,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      burstLimit: 5,
    },
    [UserType.CONSUMER]: {
      requestsPerMinute: 20,
      requestsPerHour: 500,
      requestsPerDay: 5000,
      burstLimit: 3,
    },
    [UserType.WEBHOOK]: {
      requestsPerMinute: 60,
      requestsPerHour: 2000,
      requestsPerDay: 20000,
      burstLimit: 10,
    },
  },
  [RateLimitTier.PREMIUM]: {
    [UserType.MERCHANT]: {
      requestsPerMinute: 100,
      requestsPerHour: 5000,
      requestsPerDay: 50000,
      burstLimit: 20,
    },
    [UserType.CONSUMER]: {
      requestsPerMinute: 60,
      requestsPerHour: 2000,
      requestsPerDay: 20000,
      burstLimit: 10,
    },
    [UserType.WEBHOOK]: {
      requestsPerMinute: 200,
      requestsPerHour: 10000,
      requestsPerDay: 100000,
      burstLimit: 50,
    },
  },
  [RateLimitTier.ENTERPRISE]: {
    [UserType.MERCHANT]: {
      requestsPerMinute: 500,
      requestsPerHour: 20000,
      requestsPerDay: 200000,
      burstLimit: 100,
    },
    [UserType.CONSUMER]: {
      requestsPerMinute: 200,
      requestsPerHour: 10000,
      requestsPerDay: 100000,
      burstLimit: 50,
    },
    [UserType.WEBHOOK]: {
      requestsPerMinute: 1000,
      requestsPerHour: 50000,
      requestsPerDay: 500000,
      burstLimit: 200,
    },
  },
  [RateLimitTier.UNLIMITED]: {
    [UserType.ADMIN]: {
      requestsPerMinute: -1,
      requestsPerHour: -1,
      requestsPerDay: -1,
      burstLimit: -1,
    },
    [UserType.PLATFORM]: {
      requestsPerMinute: -1,
      requestsPerHour: -1,
      requestsPerDay: -1,
      burstLimit: -1,
    },
  },
} as const;

// Permission hierarchies
export const PERMISSION_HIERARCHIES = {
  [MarketplacePermission.ADMIN_ALL]: [
    ...Object.values(MarketplacePermission).filter(p => p !== MarketplacePermission.ADMIN_ALL),
  ],
  [MarketplacePermission.MERCHANT_MANAGE]: [
    MarketplacePermission.COUPON_CREATE,
    MarketplacePermission.COUPON_MANAGE,
    MarketplacePermission.INVENTORY_UPDATE,
    MarketplacePermission.STORE_PROFILE,
    MarketplacePermission.BULK_UPLOAD,
  ],
  [MarketplacePermission.CONSUMER_SUPPORT]: [
    MarketplacePermission.COUPON_SEARCH,
    MarketplacePermission.TRANSACTION_HISTORY,
    MarketplacePermission.WALLET_VIEW,
  ],
} as const;