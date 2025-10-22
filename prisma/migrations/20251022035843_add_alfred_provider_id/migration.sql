-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "alfred_provider_id" VARCHAR(255);

-- CreateIndex
CREATE INDEX "orders_alfred_provider_id_idx" ON "orders"("alfred_provider_id");
