-- CreateEnum
CREATE TYPE "SportLevel" AS ENUM ('BEGINNER', 'CLUB', 'COMPETITIVE', 'PRO');

-- CreateEnum
CREATE TYPE "TrainingPlace" AS ENUM ('HOME', 'GYM', 'OUTDOOR');

-- CreateEnum
CREATE TYPE "DietPreference" AS ENUM ('NONE', 'VEGETARIAN', 'VEGAN', 'PESCATARIAN', 'KETO', 'LOW_CARB', 'HALAL_ONLY', 'GLUTEN_FREE', 'LACTOSE_FREE');

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "activeTraineesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approvedCertificatesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ratingAvg" DECIMAL(3,2),
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startingCurrency" TEXT,
ADD COLUMN     "startingPrice" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "TraineeIntake" (
    "id" TEXT NOT NULL,
    "traineeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "goal" "TrainingGoal" NOT NULL,
    "targetWeightKg" DECIMAL(5,1),
    "weightKg" DECIMAL(5,1) NOT NULL,
    "heightCm" DECIMAL(5,1) NOT NULL,
    "gender" "Gender" NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "activityLevel" "ActivityLevel" NOT NULL,
    "isAthlete" BOOLEAN NOT NULL DEFAULT false,
    "sportType" TEXT,
    "sportLevel" "SportLevel",
    "trainingDaysPerWeek" INTEGER NOT NULL DEFAULT 3,
    "sessionMinutes" INTEGER NOT NULL DEFAULT 60,
    "trainingPlace" "TrainingPlace" NOT NULL DEFAULT 'GYM',
    "equipment" "Equipment"[],
    "previousExperienceYears" INTEGER NOT NULL DEFAULT 0,
    "injuries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medicalConditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medications" TEXT,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dietPreference" "DietPreference" NOT NULL DEFAULT 'NONE',
    "dislikedFoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mealsPerDay" INTEGER NOT NULL DEFAULT 3,
    "sleepHours" INTEGER NOT NULL DEFAULT 7,
    "waterLiters" DECIMAL(3,1),
    "smokes" BOOLEAN NOT NULL DEFAULT false,
    "workSchedule" TEXT,
    "stressLevel" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    "bmi" DECIMAL(5,2) NOT NULL,
    "bmr" INTEGER NOT NULL,
    "tdee" INTEGER NOT NULL,
    "calorieTarget" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbsG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,

    CONSTRAINT "TraineeIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TraineeIntake_traineeId_submittedAt_idx" ON "TraineeIntake"("traineeId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TraineeIntake_traineeId_version_key" ON "TraineeIntake"("traineeId", "version");

-- CreateIndex
CREATE INDEX "TrainerProfile_approvalStatus_isListed_isFeatured_activeTra_idx" ON "TrainerProfile"("approvalStatus", "isListed", "isFeatured", "activeTraineesCount");

-- CreateIndex
CREATE INDEX "TrainerProfile_yearsExperience_idx" ON "TrainerProfile"("yearsExperience");

-- AddForeignKey
ALTER TABLE "TraineeIntake" ADD CONSTRAINT "TraineeIntake_traineeId_fkey" FOREIGN KEY ("traineeId") REFERENCES "Trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
