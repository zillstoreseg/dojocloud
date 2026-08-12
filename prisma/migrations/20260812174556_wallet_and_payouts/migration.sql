-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('CREDIT', 'HOLD_RELEASE', 'COMMISSION_FEE', 'PAYOUT', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK', 'INSTAPAY', 'VODAFONE_CASH', 'WISE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pendingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lifetimeEarned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lifetimeWithdrawn" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "balanceAfter" DECIMAL(14,2) NOT NULL,
    "pendingBalanceAfter" DECIMAL(14,2) NOT NULL,
    "availableAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "refType" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "method" "PayoutMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "proofUrl" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_trainerId_key" ON "Wallet"("trainerId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_availableAt_idx" ON "WalletTransaction"("type", "availableAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_refType_refId_idx" ON "WalletTransaction"("refType", "refId");

-- CreateIndex
CREATE INDEX "PayoutRequest_walletId_status_idx" ON "PayoutRequest"("walletId", "status");

-- CreateIndex
CREATE INDEX "PayoutRequest_status_createdAt_idx" ON "PayoutRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
