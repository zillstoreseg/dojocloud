-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "MealVerdict" AS ENUM ('FITS', 'OVER', 'UNDER', 'OFF_PLAN');

-- CreateTable
CREATE TABLE "FoodScan" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbUrl" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "mealType" "MealType",
    "title" TEXT,
    "items" JSONB,
    "kcal" INTEGER,
    "protein" INTEGER,
    "carbs" INTEGER,
    "fat" INTEGER,
    "confidence" DECIMAL(3,2),
    "verdict" "MealVerdict",
    "verdictReasonAr" TEXT,
    "verdictReasonEn" TEXT,
    "calorieBudgetAtScan" INTEGER,
    "consumedBeforeScan" INTEGER,
    "nutritionPlanId" TEXT,
    "aiUsageId" TEXT,
    "errorMessage" TEXT,
    "loggedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodScan_traineeId_createdAt_idx" ON "FoodScan"("traineeId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodScan_traineeId_loggedAt_idx" ON "FoodScan"("traineeId", "loggedAt");

-- CreateIndex
CREATE INDEX "FoodScan_trainerId_createdAt_idx" ON "FoodScan"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "FoodScan_status_idx" ON "FoodScan"("status");

-- AddForeignKey
ALTER TABLE "FoodScan" ADD CONSTRAINT "FoodScan_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
