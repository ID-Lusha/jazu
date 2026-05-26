import { describe, it, expect, vi, beforeEach } from "vitest";

// Мокаем @jazu/db ДО импорта тестируемого модуля.
// `prisma.auditLog.create` — единственный side effect; ловим его через шпиона.
const createMock = vi.fn();
vi.mock("@jazu/db", () => ({
  prisma: {
    auditLog: {
      create: createMock
    }
  }
}));

const { recordAudit } = await import("./audit.js");

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ id: "audit-1" });
});

// Достаёт `data` из первого вызова prisma.auditLog.create.
// Если вызова не было — кидаем понятную ошибку, а не TS-error на индексе.
function firstCallData(): Record<string, unknown> {
  const call = createMock.mock.calls[0];
  if (!call) throw new Error("expected at least one auditLog.create call");
  return (call[0] as { data: Record<string, unknown> }).data;
}

describe("recordAudit", () => {
  it("writes a minimal event without request context", async () => {
    await recordAudit({ event: "login.success", userId: "user-1" });
    expect(createMock).toHaveBeenCalledTimes(1);
    const data = firstCallData();
    expect(data).toMatchObject({
      event: "login.success",
      userId: "user-1",
      ip: null,
      userAgent: null,
      requestId: null
    });
    // metadata должно отсутствовать (не быть undefined ни null), потому что мы
    // ставим её только если переданы данные.
    expect("metadata" in data).toBe(false);
  });

  it("captures ip, user-agent and request id from FastifyRequest", async () => {
    await recordAudit({
      event: "magic_link.issued",
      userId: null,
      request: {
        ip: "203.0.113.42",
        headers: { "user-agent": "Mozilla/5.0 test" },
        id: "req-abc-123"
      }
    });

    const data = firstCallData();
    expect(data).toMatchObject({
      event: "magic_link.issued",
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0 test",
      requestId: "req-abc-123",
      userId: null
    });
  });

  it("truncates oversized IP and UA to prevent log abuse", async () => {
    const longIp = "x".repeat(100);
    const longUa = "U".repeat(1000);

    await recordAudit({
      event: "login.failed",
      request: { ip: longIp, headers: { "user-agent": longUa }, id: "r" }
    });

    const data = firstCallData();
    expect((data.ip as string).length).toBe(64);
    expect((data.userAgent as string).length).toBe(256);
  });

  it("forwards metadata when present", async () => {
    await recordAudit({
      event: "wa.paired",
      userId: "user-1",
      metadata: { agentId: "a1", phone: "+77001234567" }
    });

    const data = firstCallData();
    expect(data.metadata).toEqual({ agentId: "a1", phone: "+77001234567" });
  });

  it("does not include metadata when it's undefined (Prisma rejects null for json + optional)", async () => {
    await recordAudit({ event: "logout" });
    const data = firstCallData();
    expect("metadata" in data).toBe(false);
  });

  it("treats array user-agent (rare proxy edge case) as null", async () => {
    await recordAudit({
      event: "login.failed",
      request: {
        ip: "127.0.0.1",
        // express/fastify под нагрузкой иногда отдаёт array headers; мы должны
        // не упасть и просто проигнорить.
        headers: { "user-agent": ["a", "b"] as unknown as string },
        id: "r"
      }
    });

    const data = firstCallData();
    expect(data.userAgent).toBeNull();
  });

  it("does NOT throw if prisma fails — audit must never break user flow", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    createMock.mockRejectedValueOnce(new Error("db down"));

    await expect(recordAudit({ event: "login.success" })).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
