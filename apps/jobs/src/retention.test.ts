import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем @jazu/db с управляемыми тестовыми "таблицами".
// Каждая таблица — массив { id, createdAt }; findMany возвращает по `lt: cutoff`,
// deleteMany удаляет по `id: { in: [...] }`.

type Row = { id: string; createdAt: Date };

const waMessages: Row[] = [];
const llmCallLogs: Row[] = [];

function makeModelMock(rows: Row[]) {
  return {
    findMany: vi.fn((args: { where: { createdAt: { lt: Date } }; take: number }) => {
      const cutoff = args.where.createdAt.lt;
      return Promise.resolve(
        rows
          .filter((r) => r.createdAt < cutoff)
          .slice(0, args.take)
          .map((r) => ({ id: r.id }))
      );
    }),
    deleteMany: vi.fn((args: { where: { id: { in: string[] } } }) => {
      const ids = new Set(args.where.id.in);
      const before = rows.length;
      // Удаляем in-place чтобы повторные вызовы видели новый state.
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row && ids.has(row.id)) rows.splice(i, 1);
      }
      return Promise.resolve({ count: before - rows.length });
    })
  };
}

const waMock = makeModelMock(waMessages);
const llmMock = makeModelMock(llmCallLogs);

vi.mock("@jazu/db", () => ({
  prisma: {
    waMessage: waMock,
    llmCallLog: llmMock
  }
}));

vi.mock("@jazu/observability", () => ({
  captureError: vi.fn()
}));

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const { runRetention } = await import("./retention.js");

beforeEach(() => {
  waMessages.length = 0;
  llmCallLogs.length = 0;
  waMock.findMany.mockClear();
  waMock.deleteMany.mockClear();
  llmMock.findMany.mockClear();
  llmMock.deleteMany.mockClear();
});

const day = 24 * 3600 * 1000;
const now = Date.now();

describe("runRetention", () => {
  it("noop when retentionDays <= 0", async () => {
    waMessages.push({ id: "old", createdAt: new Date(now - 365 * day) });

    const res = await runRetention(0);
    expect(res).toEqual({ waMessageDeleted: 0, llmCallLogDeleted: 0 });
    expect(waMock.findMany).not.toHaveBeenCalled();
    expect(waMock.deleteMany).not.toHaveBeenCalled();
    // ничего не удалили
    expect(waMessages).toHaveLength(1);
  });

  it("deletes only rows older than cutoff and leaves fresh rows alone", async () => {
    // 3 старые, 2 свежие.
    waMessages.push(
      { id: "wa-old-1", createdAt: new Date(now - 100 * day) },
      { id: "wa-old-2", createdAt: new Date(now - 95 * day) },
      { id: "wa-old-3", createdAt: new Date(now - 91 * day) },
      { id: "wa-fresh-1", createdAt: new Date(now - 5 * day) },
      { id: "wa-fresh-2", createdAt: new Date(now - 1 * day) }
    );

    const res = await runRetention(90, { chunkSize: 10, pauseMs: 0 });

    expect(res.waMessageDeleted).toBe(3);
    expect(waMessages.map((r) => r.id).sort()).toEqual(["wa-fresh-1", "wa-fresh-2"]);
  });

  it("processes large tables in multiple chunks until empty", async () => {
    // 12 строк, chunkSize=5 → 3 chunk'а (5, 5, 2).
    for (let i = 0; i < 12; i++) {
      waMessages.push({ id: `r-${i}`, createdAt: new Date(now - 200 * day) });
    }

    const res = await runRetention(90, { chunkSize: 5, pauseMs: 0 });

    expect(res.waMessageDeleted).toBe(12);
    expect(waMessages).toHaveLength(0);
    // findMany вызвалась минимум 3 раза для итерации + 1 раз чтобы убедиться
    // что ничего больше не осталось (последний раз вернул [] → break).
    expect(waMock.findMany.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("works for LlmCallLog table independently", async () => {
    llmCallLogs.push(
      { id: "llm-old", createdAt: new Date(now - 200 * day) },
      { id: "llm-fresh", createdAt: new Date(now - 1 * day) }
    );

    const res = await runRetention(30, { chunkSize: 10, pauseMs: 0 });

    expect(res.llmCallLogDeleted).toBe(1);
    expect(llmCallLogs.map((r) => r.id)).toEqual(["llm-fresh"]);
  });

  it("aborts the loop on chunk error but does not throw — also tries the other table", async () => {
    // wa упадёт, llm должен всё равно отработать.
    waMessages.push({ id: "wa-old", createdAt: new Date(now - 200 * day) });
    llmCallLogs.push({ id: "llm-old", createdAt: new Date(now - 200 * day) });

    waMock.findMany.mockRejectedValueOnce(new Error("boom"));

    const res = await runRetention(30, { chunkSize: 10, pauseMs: 0 });

    // wa должен сломаться (0 удалений), но не упасть наружу.
    expect(res.waMessageDeleted).toBe(0);
    // llm всё равно отработает.
    expect(res.llmCallLogDeleted).toBe(1);
  });

  it("respects safety limit (does not loop forever on misbehaving DB)", async () => {
    // findMany возвращает ровно 1 строку каждый раз, deleteMany не удаляет
    // (имитация бага). Должны выйти не позже safety=200.
    for (let i = 0; i < 1000; i++) {
      waMessages.push({ id: `r-${i}`, createdAt: new Date(now - 200 * day) });
    }
    // переопределяем deleteMany чтобы он "удалил" 0
    waMock.deleteMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    waMock.findMany.mockImplementation(() => Promise.resolve([{ id: "x" }]));

    const res = await runRetention(30, { chunkSize: 1, pauseMs: 0 });
    // Должно либо завершиться по safety, либо по removed === 0 (мы вернули 0).
    // В обоих случаях НЕ виснем.
    expect(typeof res.waMessageDeleted).toBe("number");
  });
});
