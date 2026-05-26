import { calcCostMicroUsd, type LlmCallTelemetry, type LlmTelemetryHooks } from "@jazu/ai";
import { prisma as defaultPrisma } from "@jazu/db";

type PrismaClient = typeof defaultPrisma;

/**
 * Телеметрия LLM-вызовов: пишем КАЖДЫЙ вызов OpenAI в LlmCallLog со стоимостью
 * в микро-долларах. Сами никого не блокируем — режим «только наблюдение»,
 * пока не накопим реальную статистику расходов на типичного юзера.
 *
 * Когда будем готовы ставить потолок:
 *   1. посмотрим на `SELECT userId, SUM(totalTokens) FROM "LlmCallLog"
 *      WHERE createdAt > now() - 7days GROUP BY userId` — увидим распределение;
 *   2. определим разумный дневной лимит для trial / платных;
 *   3. включим обратно `checkBudget` (код уже подготовлен в @jazu/ai —
 *      просто вернём опциональную проверку в этот файл).
 *
 * Сейчас `dailyTokenLimit` в БД хранится «на будущее», но не сравнивается.
 */

function startOfUtcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Сколько токенов потратил юзер за UTC-сегодня. Используется dashboard'ом
 * и будущими alert'ами. Поле `blocked` всегда false — блокировок пока нет,
 * но клиент может уже учитывать сравнение `used >= limit` для UI-индикатора.
 */
export async function getDailyTokenUsage(
  prisma: PrismaClient,
  userId: string
): Promise<{ used: number; limit: number; remaining: number; blocked: boolean; costMicroUsd: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { dailyTokenLimit: true }
  });
  if (!user) {
    return { used: 0, limit: 0, remaining: 0, blocked: false, costMicroUsd: 0 };
  }
  const since = startOfUtcDay();
  const agg = await prisma.llmCallLog.aggregate({
    where: { userId, createdAt: { gte: since } },
    _sum: { totalTokens: true, costMicroUsd: true }
  });
  const used = agg._sum.totalTokens ?? 0;
  const limit = user.dailyTokenLimit;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    blocked: false,
    costMicroUsd: agg._sum.costMicroUsd ?? 0
  };
}

/**
 * Конструктор `LlmTelemetryHooks` для конкретного user/agent/route.
 *
 * Сейчас умеет только одно — писать каждый исход вызова OpenAI в LlmCallLog
 * с инфой о токенах, стоимости и latency. Без блокировок.
 *
 * Когда придёт время вводить дневной потолок — добавим сюда `checkBudget`
 * (см. подготовленный фолбэк в @jazu/ai/openai.ts).
 */
export function buildLlmTelemetry(params: {
  prisma?: PrismaClient;
  route: string;
  userId: string | null;
  agentId: string | null;
}): LlmTelemetryHooks {
  const prisma = params.prisma ?? defaultPrisma;
  return {
    route: params.route,
    userId: params.userId,
    agentId: params.agentId,
    onCall: async (record: LlmCallTelemetry) => {
      const costMicroUsd = calcCostMicroUsd(record.model, record.usage);
      await prisma.llmCallLog.create({
        data: {
          ...(record.userId ? { userId: record.userId } : {}),
          ...(record.agentId ? { agentId: record.agentId } : {}),
          route: record.route,
          model: record.model,
          inputTokens: record.usage.promptTokens,
          outputTokens: record.usage.completionTokens,
          totalTokens: record.usage.totalTokens,
          costMicroUsd,
          latencyMs: record.latencyMs,
          status: record.status,
          ...(record.errorCode ? { errorCode: record.errorCode } : {})
        }
      });
    }
  };
}

/** Утилита для админ-дашборда: топ юзеров по расходу за период. */
export async function getTopSpenders(
  prisma: PrismaClient,
  options: { since: Date; limit?: number } = { since: startOfUtcDay() }
): Promise<Array<{ userId: string; totalTokens: number; costMicroUsd: number; calls: number }>> {
  const grouped = await prisma.llmCallLog.groupBy({
    by: ["userId"],
    where: { createdAt: { gte: options.since }, userId: { not: null } },
    _sum: { totalTokens: true, costMicroUsd: true },
    _count: { id: true },
    orderBy: { _sum: { totalTokens: "desc" } },
    take: options.limit ?? 20
  });
  return grouped
    .filter((g): g is typeof g & { userId: string } => g.userId !== null)
    .map((g) => ({
      userId: g.userId,
      totalTokens: g._sum.totalTokens ?? 0,
      costMicroUsd: g._sum.costMicroUsd ?? 0,
      calls: g._count.id
    }));
}
