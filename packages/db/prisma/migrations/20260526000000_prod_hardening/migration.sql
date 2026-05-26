-- Session: добавляем колонки для управления жизненным циклом сессии.
ALTER TABLE "Session"
  ADD COLUMN "expiresAt"  TIMESTAMP(3),
  ADD COLUMN "revokedAt"  TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3);

-- Бэкап существующих сессий: даём им 30 дней жизни от сегодняшнего дня,
-- чтобы залогиненные пользователи не вылетели сразу после деплоя.
UPDATE "Session"
  SET "expiresAt"  = NOW() + INTERVAL '30 days',
      "lastSeenAt" = NOW();

-- MagicLinkToken: одноразовые токены магической ссылки.
CREATE TABLE "MagicLinkToken" (
  "id"        TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "nonce"     TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");
CREATE UNIQUE INDEX "MagicLinkToken_nonce_key" ON "MagicLinkToken"("nonce");
CREATE INDEX "MagicLinkToken_email_expiresAt_idx" ON "MagicLinkToken"("email", "expiresAt");

-- WaConnection: время последнего апдейта auth-state (для дебага и аналитики).
ALTER TABLE "WaConnection"
  ADD COLUMN "authStateUpdatedAt" TIMESTAMP(3);

-- WaMessage: уникальность пары (conversationId, waMsgId) для дедупликации входящих.
-- В Postgres NULL не уникальны (несколько NULL допускаются), поэтому исходящие
-- сообщения без waMsgId не конфликтуют между собой.
CREATE UNIQUE INDEX "WaMessage_conversationId_waMsgId_key"
  ON "WaMessage"("conversationId", "waMsgId");
