-- CreateEnum
CREATE TYPE "AfipInvoiceStatus" AS ENUM ('AUTHORIZED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "AfipInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "invoiceType" INTEGER NOT NULL,
    "pointOfSale" INTEGER NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "concept" INTEGER NOT NULL DEFAULT 1,
    "invoiceDate" TEXT NOT NULL,
    "docType" INTEGER NOT NULL,
    "docNumber" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "cae" TEXT,
    "caeExpiry" TEXT,
    "status" "AfipInvoiceStatus" NOT NULL,
    "observations" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfipInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AfipInvoice_saleId_key" ON "AfipInvoice"("saleId");

-- CreateIndex
CREATE INDEX "AfipInvoice_tenantId_idx" ON "AfipInvoice"("tenantId");

-- CreateIndex
CREATE INDEX "AfipInvoice_tenantId_status_idx" ON "AfipInvoice"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "AfipInvoice" ADD CONSTRAINT "AfipInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfipInvoice" ADD CONSTRAINT "AfipInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
