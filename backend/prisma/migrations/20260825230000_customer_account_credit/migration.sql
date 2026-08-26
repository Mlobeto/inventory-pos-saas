-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CustomerPayment" ADD COLUMN "cashShiftId" TEXT;
ALTER TABLE "CustomerPayment" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "CustomerPayment" ALTER COLUMN "receivableId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "CustomerPayment_cashShiftId_idx" ON "CustomerPayment"("cashShiftId");
