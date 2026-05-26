import { prisma } from "@jazu/db";
import { captureError } from "@jazu/observability";
import { logger } from "./logger.js";

/**
 * Daily retention sweep. Удаляет «болтологию» (WaMessage) и подробный LLM-лог
 * (LlmCallLog) старше `retentionDays`. AuditLog не трогаем — он маленький и
 * важен для compliance/инцидентов.
 *
 * Безопасность:
 *  - удаляем чанками по `chunkSize`, чтобы не блокировать таблицу на минуту;
 *  - используем `createdAt`-индексы;
 *  - между чанками — короткая пауза, чтобы пускать продакшеновые запросы.
 *
 * Идемпотентность: если cron перезапустится и наложатся 2 прогона —
 * deleteMany с тем же `lt` просто удалит 0 строк во втором.
 */
export async function runRetention(
  retentionDays: number,
  options: { chunkSize?: number; pauseMs?: number } = {}
): Promise<{ waMessageDeleted: number; llmCallLogDeleted: number }> {
  if (retentionDays <= 0) {
    return { waMessageDeleted: 0, llmCallLogDeleted: 0 };
  }
  const chunkSize = options.chunkSize ?? 5_000;
  const pauseMs = options.pauseMs ?? 250;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);

  const waMessageDeleted = await deleteInChunks(
    "WaMessage",
    chunkSize,
    pauseMs,
    () =>
      prisma.waMessage.deleteMany({
        where: { id: { in: [] } }
      }),
    async () => {
      const ids = await prisma.waMessage.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: chunkSize
      });
      if (ids.length === 0) return 0;
      const res = await prisma.waMessage.deleteMany({
        where: { id: { in: ids.map((i) => i.id) } }
      });
      return res.count;
    }
  );

  const llmCallLogDeleted = await deleteInChunks(
    "LlmCallLog",
    chunkSize,
    pauseMs,
    () => prisma.llmCallLog.deleteMany({ where: { id: { in: [] } } }),
    async () => {
      const ids = await prisma.llmCallLog.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true },
        take: chunkSize
      });
      if (ids.length === 0) return 0;
      const res = await prisma.llmCallLog.deleteMany({
        where: { id: { in: ids.map((i) => i.id) } }
      });
      return res.count;
    }
  );

  return { waMessageDeleted, llmCallLogDeleted };
}

async function deleteInChunks(
  label: string,
  _chunkSize: number,
  pauseMs: number,
  _unused: () => Promise<{ count: number }>,
  deleteChunk: () => Promise<number>
): Promise<number> {
  let total = 0;
  let safety = 200; // максимум 200 чанков за один прогон = 1M строк за раз
  while (safety-- > 0) {
    let removed: number;
    try {
      removed = await deleteChunk();
    } catch (err) {
      logger.error({ err, label }, "retention chunk failed");
      captureError(err, { route: "jobs:retention", extra: { label } });
      break;
    }
    if (removed === 0) break;
    total += removed;
    if (pauseMs > 0) {
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }
  return total;
}

/**
 * Планировщик retention: запускается раз в сутки в 03:00 UTC.
 * Возвращает функцию отмены (для graceful shutdown).
 */
export function startRetentionCron(retentionDays: number): () => void {
  if (retentionDays <= 0) {
    logger.info({ retentionDays }, "retention disabled");
    return () => undefined;
  }

  let stopped = false;
  const scheduleNext = () => {
    if (stopped) return;
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(3, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const ms = next.getTime() - now.getTime();
    const timer = setTimeout(async () => {
      if (stopped) return;
      const started = Date.now();
      try {
        const res = await runRetention(retentionDays);
        logger.info(
          { ...res, elapsedMs: Date.now() - started, retentionDays },
          "retention sweep done"
        );
      } catch (err) {
        logger.error({ err }, "retention sweep failed");
        captureError(err, { route: "jobs:retention" });
      } finally {
        scheduleNext();
      }
    }, ms);
    timer.unref();
    logger.info({ inMs: ms, retentionDays }, "retention next run scheduled");
  };

  scheduleNext();
  return () => {
    stopped = true;
  };
}
