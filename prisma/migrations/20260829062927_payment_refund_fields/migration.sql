/*
  Warnings:

  - The `refundStatus` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('INITIATED', 'PROCESSING', 'REFUNDED', 'REVERSED');

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "refundStatus",
ADD COLUMN     "refundStatus" "RefundStatus";

-- CreateIndex
CREATE INDEX "Payment_refundStatus_idx" ON "Payment"("refundStatus");
