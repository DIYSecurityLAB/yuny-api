-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('MERCHANT', 'CONSUMER', 'PLATFORM', 'ADMIN', 'WEBHOOK', 'PARTNER');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RateLimitTier" AS ENUM ('BASIC', 'PREMIUM', 'ENTERPRISE', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "ComplianceLevel" AS ENUM ('BASIC', 'PCI_DSS', 'GDPR', 'LGPD', 'SOX', 'HIPAA');

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "key_id" VARCHAR(36) NOT NULL,
    "secret_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "user_type" "UserType" NOT NULL,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "rate_limit_tier" "RateLimitTier" NOT NULL DEFAULT 'BASIC',
    "tenant_id" UUID,
    "store_id" UUID,
    "consumer_id" UUID,
    "marketplace_context" VARCHAR(100),
    "allowed_regions" TEXT[],
    "compliance_level" "ComplianceLevel" NOT NULL DEFAULT 'BASIC',
    "allowed_ips" TEXT[],
    "webhook_signature_secret" VARCHAR(255),
    "expires_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "last_used_at" TIMESTAMP(6),
    "user_id" UUID NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_permissions" (
    "id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "permission" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(50),
    "granted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_usage_logs" (
    "id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "endpoint" VARCHAR(255) NOT NULL,
    "http_method" VARCHAR(10) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_time_ms" INTEGER,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT,
    "request_id" VARCHAR(36),
    "transaction_value" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "merchant_id" UUID,
    "coupon_category" VARCHAR(50),
    "geographic_location" VARCHAR(100),
    "is_suspicious" BOOLEAN NOT NULL DEFAULT false,
    "fraud_score" REAL,
    "security_flags" TEXT[],
    "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_key_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_key_rate_limits" (
    "id" UUID NOT NULL,
    "api_key_id" UUID NOT NULL,
    "endpoint_pattern" VARCHAR(255) NOT NULL,
    "requests_per_minute" INTEGER NOT NULL DEFAULT 60,
    "requests_per_hour" INTEGER NOT NULL DEFAULT 1000,
    "requests_per_day" INTEGER NOT NULL DEFAULT 10000,
    "burst_limit" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "api_key_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_id_key" ON "api_keys"("key_id");

-- CreateIndex
CREATE INDEX "api_keys_key_id_idx" ON "api_keys"("key_id");

-- CreateIndex
CREATE INDEX "api_keys_user_type_tenant_id_idx" ON "api_keys"("user_type", "tenant_id");

-- CreateIndex
CREATE INDEX "api_keys_store_id_idx" ON "api_keys"("store_id");

-- CreateIndex
CREATE INDEX "api_keys_consumer_id_idx" ON "api_keys"("consumer_id");

-- CreateIndex
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys"("expires_at");

-- CreateIndex
CREATE INDEX "api_key_permissions_permission_idx" ON "api_key_permissions"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_permissions_api_key_id_permission_resource_type_key" ON "api_key_permissions"("api_key_id", "permission", "resource_type");

-- CreateIndex
CREATE INDEX "api_key_usage_logs_api_key_id_timestamp_idx" ON "api_key_usage_logs"("api_key_id", "timestamp");

-- CreateIndex
CREATE INDEX "api_key_usage_logs_endpoint_timestamp_idx" ON "api_key_usage_logs"("endpoint", "timestamp");

-- CreateIndex
CREATE INDEX "api_key_usage_logs_merchant_id_timestamp_idx" ON "api_key_usage_logs"("merchant_id", "timestamp");

-- CreateIndex
CREATE INDEX "api_key_usage_logs_is_suspicious_idx" ON "api_key_usage_logs"("is_suspicious");

-- CreateIndex
CREATE INDEX "api_key_usage_logs_timestamp_idx" ON "api_key_usage_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "api_key_rate_limits_api_key_id_endpoint_pattern_key" ON "api_key_rate_limits"("api_key_id", "endpoint_pattern");

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_permissions" ADD CONSTRAINT "api_key_permissions_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_usage_logs" ADD CONSTRAINT "api_key_usage_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_rate_limits" ADD CONSTRAINT "api_key_rate_limits_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
