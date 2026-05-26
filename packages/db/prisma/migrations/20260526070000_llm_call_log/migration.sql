-- Sprint 2: per-user LLM budget + cost telemetry.

-- 1) Дневной лимит токенов для каждого юзера. Дефолт 50_000 — хватает на
--    ~10-15 полноценных диалогов с GPT-4.1.
ALTER TABLE "User" ADD COLUMN "dailyTokenLimit" INTEGER NOT NULL DEFAULT 50000;

-- 2) Лог каждого LLM-вызова. Источник истины для:
--    - подсчёта дневного бюджета (sum totalTokens за UTC-день);
--    - админ-дашборда «кто сжигает деньги»;
--    - алертов на аномалии.
CREATE TABLE "LlmCallLog" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT,
    "agentId"       TEXT,
    "route"         TEXT NOT NULL,
    "model"         TEXT NOT NULL,
    "inputTokens"   INTEGER NOT NULL DEFAULT 0,
    "outputTokens"  INTEGER NOT NULL DEFAULT 0,
    "totalTokens"   INTEGER NOT NULL DEFAULT 0,
    "costMicroUsd"  INTEGER NOT NULL DEFAULT 0,
    "latencyMs"     INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL,
    "errorCode"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCallLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LlmCallLog_userId_createdAt_idx"  ON "LlmCallLog" ("userId", "createdAt");
CREATE INDEX "LlmCallLog_agentId_createdAt_idx" ON "LlmCallLog" ("agentId", "createdAt");
CREATE INDEX "LlmCallLog_createdAt_idx"         ON "LlmCallLog" ("createdAt");

ALTER TABLE "LlmCallLog"
    ADD CONSTRAINT "LlmCallLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
