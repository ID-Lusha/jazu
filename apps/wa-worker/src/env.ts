import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  API_ORIGIN: z.string().url().default("http://localhost:3001"),
  API_INTERNAL_TOKEN: z.string().min(16).default("jazu-internal-token"),
  /**
   * Опциональный OLD-токен для бесшовной ротации. Когда API катят с новым
   * CURRENT, worker'ы продолжают слать OLD до своей выкатки.
   */
  API_INTERNAL_TOKEN_OLD: z.string().min(16).optional(),
  // BullMQ-pipeline: если выставлено — voркер кладёт inbound в Redis вместо
  // синхронного HTTP-вызова /api/whatsapp/inbound и consume'ит wa:outbound.
  // Без REDIS_URL воркер автоматически фолбэкается на legacy HTTP-путь.
  REDIS_URL: z.string().optional(),
  /** Минимальный интервал между outgoing-сообщениями ОДНОМУ чату (мс). */
  WA_PER_CHAT_MIN_INTERVAL_MS: z.coerce.number().int().positive().default(1_200),
  /** Параллельность consumer'а wa:outbound в одном процессе. */
  WA_OUTBOUND_CONCURRENCY: z.coerce.number().int().positive().default(8),
  SENTRY_DSN: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  RELEASE_VERSION: z.string().optional()
});

export const env = envSchema.parse(process.env);
