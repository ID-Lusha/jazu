import type { prisma as Prisma } from "@jazu/db";

type PrismaClient = typeof Prisma;

/**
 * Биллинг: квоты диалогов и пакеты.
 *
 * Модель оплаты — pre-paid пакеты, без подписки:
 *  - free trial: 35 диалогов сразу после регистрации;
 *  - пакеты: +N диалогов к балансу (basic 150, pro 500, max 1000) или custom;
 *  - 1 диалог = 1 уникальный клиент (chatId) в рамках периода (YYYY-MM).
 *
 * Counting: на каждый inbound от нового chatId создаётся UsageEvent с
 * composite unique (userId, chatId, periodKey). Если запись новая —
 * списываем 1 с quotaTotal через quotaUsed++. В новом месяце тот же chatId
 * становится "новым клиентом" и списывается заново.
 *
 * При quotaUsed >= quotaTotal бот блокируется полностью (block_all).
 */

export const PRICE_PER_DIALOG_KZT = 45;

export const FREE_TRIAL_DIALOGS = 35;

export type PlanId = "free" | "basic" | "pro" | "max" | "custom";

export type Plan = {
  id: PlanId;
  label: string;
  description: string;
  conversations: number | null;
  pricePerOne: number;
  totalPrice: number | null;
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "basic",
    label: "Старт",
    description: "Для индивидуальных предпринимателей и небольших магазинов.",
    conversations: 150,
    pricePerOne: PRICE_PER_DIALOG_KZT,
    totalPrice: 150 * PRICE_PER_DIALOG_KZT
  },
  {
    id: "pro",
    label: "Бизнес",
    description: "Самый популярный для активных продаж в WhatsApp.",
    conversations: 500,
    pricePerOne: PRICE_PER_DIALOG_KZT,
    totalPrice: 500 * PRICE_PER_DIALOG_KZT,
    popular: true
  },
  {
    id: "max",
    label: "Масштаб",
    description: "Когда диалогов реально много и нужен запас.",
    conversations: 1000,
    pricePerOne: PRICE_PER_DIALOG_KZT,
    totalPrice: 1000 * PRICE_PER_DIALOG_KZT
  },
  {
    id: "custom",
    label: "Свой объём",
    description: "Выберите ползунком сколько диалогов хотите купить.",
    conversations: null,
    pricePerOne: PRICE_PER_DIALOG_KZT,
    totalPrice: null
  }
];

export const CUSTOM_MIN = 100;
export const CUSTOM_MAX = 5000;
export const CUSTOM_STEP = 2;

export function currentPeriodKey(d: Date = new Date()): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export type UsageView = {
  total: number;
  used: number;
  remaining: number;
  exhausted: boolean;
  trialActive: boolean;
  periodKey: string;
};

export function buildUsageView(user: { quotaTotal: number; quotaUsed: number }, totalPurchased: number): UsageView {
  const remaining = Math.max(0, user.quotaTotal - user.quotaUsed);
  return {
    total: user.quotaTotal,
    used: user.quotaUsed,
    remaining,
    exhausted: remaining <= 0,
    trialActive: totalPurchased === 0,
    periodKey: currentPeriodKey()
  };
}

export type TrackResult =
  | { ok: true; counted: boolean; usage: UsageView }
  | { ok: false; reason: "no_owner" | "exhausted"; usage?: UsageView };

export async function trackConversationUsage(
  prisma: PrismaClient,
  params: { agentOwnerUserId: string | null; agentId: string; chatId: string }
): Promise<TrackResult> {
  const { agentOwnerUserId, agentId, chatId } = params;

  if (!agentOwnerUserId) {
    return {
      ok: true,
      counted: false,
      usage: { total: 0, used: 0, remaining: 0, exhausted: false, trialActive: true, periodKey: currentPeriodKey() }
    };
  }

  const periodKey = currentPeriodKey();

  const existing = await prisma.usageEvent.findUnique({
    where: {
      userId_chatId_periodKey: { userId: agentOwnerUserId, chatId, periodKey }
    }
  });

  if (existing) {
    const user = await prisma.user.findUnique({
      where: { id: agentOwnerUserId },
      select: { quotaTotal: true, quotaUsed: true }
    });
    if (!user) return { ok: false, reason: "no_owner" };
    return {
      ok: true,
      counted: false,
      usage: buildUsageView(user, await sumPurchased(prisma, agentOwnerUserId))
    };
  }

  try {
    const result = await prisma.$transaction(async (tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]) => {
      const user = await tx.user.findUnique({
        where: { id: agentOwnerUserId },
        select: { quotaTotal: true, quotaUsed: true }
      });
      if (!user) {
        return { kind: "no_owner" as const };
      }
      if (user.quotaUsed >= user.quotaTotal) {
        return { kind: "exhausted" as const, user };
      }
      const updated = await tx.user.updateMany({
        where: { id: agentOwnerUserId, quotaUsed: { lt: user.quotaTotal } },
        data: { quotaUsed: { increment: 1 } }
      });
      if (updated.count === 0) {
        return { kind: "exhausted" as const, user };
      }
      await tx.usageEvent.create({
        data: { userId: agentOwnerUserId, chatId, periodKey, agentId }
      });
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: agentOwnerUserId },
        select: { quotaTotal: true, quotaUsed: true }
      });
      return { kind: "ok" as const, user: fresh };
    });

    if (result.kind === "no_owner") return { ok: false, reason: "no_owner" };

    const totalPurchased = await sumPurchased(prisma, agentOwnerUserId);

    if (result.kind === "exhausted") {
      return {
        ok: false,
        reason: "exhausted",
        usage: buildUsageView(result.user, totalPurchased)
      };
    }
    return { ok: true, counted: true, usage: buildUsageView(result.user, totalPurchased) };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      const user = await prisma.user.findUnique({
        where: { id: agentOwnerUserId },
        select: { quotaTotal: true, quotaUsed: true }
      });
      if (!user) return { ok: false, reason: "no_owner" };
      return {
        ok: true,
        counted: false,
        usage: buildUsageView(user, await sumPurchased(prisma, agentOwnerUserId))
      };
    }
    throw err;
  }
}

async function sumPurchased(prisma: PrismaClient, userId: string): Promise<number> {
  const agg = await prisma.purchase.aggregate({
    where: { userId, status: "paid" },
    _sum: { conversations: true }
  });
  return agg._sum.conversations ?? 0;
}

export async function getUsageView(
  prisma: PrismaClient,
  userId: string
): Promise<UsageView | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { quotaTotal: true, quotaUsed: true }
  });
  if (!user) return null;
  const totalPurchased = await sumPurchased(prisma, userId);
  return buildUsageView(user, totalPurchased);
}
