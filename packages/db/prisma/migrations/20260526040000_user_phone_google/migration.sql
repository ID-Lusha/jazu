-- User: телефон + Google OAuth.
ALTER TABLE "User"
  ADD COLUMN "phone"           TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "googleId"        TEXT,
  ADD COLUMN "avatarUrl"       TEXT;

CREATE UNIQUE INDEX "User_phone_key"    ON "User"("phone");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- Сохраняем номер вместе с magic-link, чтобы при /auth/callback атомарно
-- записать его в User. До использования токена номер не виден никому.
ALTER TABLE "MagicLinkToken"
  ADD COLUMN "phoneSnapshot" TEXT;
