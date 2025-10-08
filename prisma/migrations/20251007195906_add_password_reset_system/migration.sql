-- CreateEnum
CREATE TYPE "PasswordResetMethod" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PasswordResetStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');

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

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuarios"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
