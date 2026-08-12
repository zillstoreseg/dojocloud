-- Coach-refers-coach. `referralCode` is nullable and every existing row is
-- NULL, so the unique index is safe to add in place: Postgres treats NULLs as
-- distinct.
ALTER TABLE "TrainerProfile" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "TrainerProfile" ADD COLUMN "referredById" TEXT;
ALTER TABLE "TrainerProfile" ADD COLUMN "referralRewardedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "TrainerProfile_referralCode_key" ON "TrainerProfile"("referralCode");
CREATE INDEX "TrainerProfile_referredById_idx" ON "TrainerProfile"("referredById");

ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_referredById_fkey"
  FOREIGN KEY ("referredById") REFERENCES "TrainerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
