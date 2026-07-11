-- AlterTable
ALTER TABLE "Product" ADD COLUMN "tracksStock" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SaleDetail" ADD COLUMN "customName" TEXT;
