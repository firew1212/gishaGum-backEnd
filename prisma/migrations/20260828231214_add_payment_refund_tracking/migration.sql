/*
  Warnings:

  - You are about to drop the column `refundAmount` on the `Payment` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Payment_refundReference_idx";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "refundAmount",
ADD COLUMN     "gatewayReference" TEXT,
ADD COLUMN     "refundStatus" TEXT;

-- CreateIndex
CREATE INDEX "Payment_refundStatus_idx" ON "Payment"("refundStatus");
