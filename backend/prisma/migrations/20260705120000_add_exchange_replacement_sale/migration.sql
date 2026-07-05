-- AlterTable
ALTER TABLE "SaleReturn" ADD COLUMN "replacementSaleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SaleReturn_replacementSaleId_key" ON "SaleReturn"("replacementSaleId");

-- AddForeignKey
ALTER TABLE "SaleReturn" ADD CONSTRAINT "SaleReturn_replacementSaleId_fkey" FOREIGN KEY ("replacementSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
