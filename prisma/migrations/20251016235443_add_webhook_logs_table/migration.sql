-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('MERCHANT', 'CONSUMER', 'PLATFORM', 'ADMIN', 'WEBHOOK', 'PARTNER');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REVOKED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RateLimitTier" AS ENUM ('BASIC', 'PREMIUM', 'ENTERPRISE', 'UNLIMITED');

-- CreateEnum
CREATE TYPE "ComplianceLevel" AS ENUM ('BASIC', 'PCI_DSS', 'GDPR', 'LGPD', 'SOX', 'HIPAA');

-- CreateEnum
CREATE TYPE "PasswordResetMethod" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PointsTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'PENDING', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CARD', 'BANK_TRANSFER', 'CRYPTO', 'WISE', 'TICKET', 'USDT', 'PAYPAL', 'SWIFT', 'NOMAD');

-- CreateEnum
CREATE TYPE "ChangedBy" AS ENUM ('USER', 'SYSTEM', 'ADMIN', 'ALFRED_WEBHOOK', 'POLLING_SERVICE');

-- CreateTable
CREATE TABLE "usuarios" (
    "user_id" UUID NOT NULL,
    "nome" VARCHAR(255) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "telefone" VARCHAR(20) NOT NULL,
    "senhaHash" VARCHAR(255) NOT NULL,
    "data_criacao" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_login" TIMESTAMP(6),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_attempts" (
    "id" UUID NOT NULL,
    "identifier" VARCHAR(255) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_balances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "available_points" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pending_points" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_points" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "requested_amount" DECIMAL(15,2) NOT NULL,
    "fee_amount" DECIMAL(15,2) NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL,
    "points_amount" DECIMAL(15,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_method" "PaymentMethod" NOT NULL,
    "alfred_transaction_id" VARCHAR(255),
    "qr_code" TEXT,
    "qr_image_url" TEXT,
    "expires_at" TIMESTAMP(6),
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "type" "PointsTransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "previous_status" "OrderStatus",
    "new_status" "OrderStatus" NOT NULL,
    "changed_by" "ChangedBy" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL,
    "webhook_id" VARCHAR(255),
    "transaction_id" VARCHAR(255) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "previous_status" VARCHAR(50),
    "payload" JSONB NOT NULL,
    "signature" VARCHAR(255) NOT NULL,
    "processed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_valid" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "processing_time_ms" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

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

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_balances_user_id_key" ON "user_balances"("user_id");

-- CreateIndex
CREATE INDEX "user_balances_user_id_idx" ON "user_balances"("user_id");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_alfred_transaction_id_idx" ON "orders"("alfred_transaction_id");

-- CreateIndex
CREATE INDEX "orders_expires_at_idx" ON "orders"("expires_at");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "points_transactions_user_id_idx" ON "points_transactions"("user_id");

-- CreateIndex
CREATE INDEX "points_transactions_order_id_idx" ON "points_transactions"("order_id");

-- CreateIndex
CREATE INDEX "points_transactions_type_idx" ON "points_transactions"("type");

-- CreateIndex
CREATE INDEX "points_transactions_created_at_idx" ON "points_transactions"("created_at");

-- CreateIndex
CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history"("order_id");

-- CreateIndex
CREATE INDEX "order_status_history_new_status_idx" ON "order_status_history"("new_status");

-- CreateIndex
CREATE INDEX "order_status_history_changed_by_idx" ON "order_status_history"("changed_by");

-- CreateIndex
CREATE INDEX "order_status_history_created_at_idx" ON "order_status_history"("created_at");

-- CreateIndex
CREATE INDEX "webhook_logs_transaction_id_idx" ON "webhook_logs"("transaction_id");

-- CreateIndex
CREATE INDEX "webhook_logs_external_id_idx" ON "webhook_logs"("external_id");

-- CreateIndex
CREATE INDEX "webhook_logs_webhook_id_idx" ON "webhook_logs"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_logs_processed_at_idx" ON "webhook_logs"("processed_at");

-- CreateIndex
CREATE INDEX "webhook_logs_is_valid_idx" ON "webhook_logs"("is_valid");

-- CreateIndex
CREATE INDEX "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_permissions" ADD CONSTRAINT "api_key_permissions_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_usage_logs" ADD CONSTRAINT "api_key_usage_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_key_rate_limits" ADD CONSTRAINT "api_key_rate_limits_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_balances"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
