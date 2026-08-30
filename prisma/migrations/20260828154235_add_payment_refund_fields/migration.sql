/*
  Warnings:

  - You are about to drop the column `gatewayReference` on the `Payment` table. All the data in the column will be lost.
  - Made the column `txRef` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "gatewayReference",
ADD COLUMN     "refundAmount" DECIMAL(10,2),
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ALTER COLUMN "txRef" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_refundReference_idx" ON "Payment"("refundReference");
