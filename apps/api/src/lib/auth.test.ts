import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAGIC_LINK_TTL_MS,
  createMagicLink,
  verifyInternalToken,
  verifyMagicLink
} from "./auth.js";

const ORIGIN = "https://jazu.example.com";
const SECRET_A = "secret-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SECRET_B = "secret-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("createMagicLink / verifyMagicLink", () => {
  it("creates a token and verifies it round-trip", () => {
    const { token, link } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(link).toContain(`${ORIGIN}/auth?token=`);

    const payload = verifyMagicLink(token, SECRET_A);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("user@example.com");
  });

  it("rejects a token signed with a different secret", () => {
    const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
    expect(verifyMagicLink(token, SECRET_B)).toBeNull();
  });

  it("accepts a token signed with OLD secret when OLD is passed (rotation phase)", () => {
    const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
    // Имитируем фазу 1 ротации: CURRENT=new (SECRET_B), OLD=old (SECRET_A).
    const payload = verifyMagicLink(token, SECRET_B, SECRET_A);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("user@example.com");
  });

  it("rejects a token signed with OLD secret after OLD is removed (rotation phase 3)", () => {
    const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
    // Фаза 3: только CURRENT=new, OLD убрали.
    expect(verifyMagicLink(token, SECRET_B)).toBeNull();
    expect(verifyMagicLink(token, SECRET_B, undefined)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyMagicLink("no-dot-just-garbage", SECRET_A)).toBeNull();
    expect(verifyMagicLink("", SECRET_A)).toBeNull();
    expect(verifyMagicLink(".justSignature", SECRET_A)).toBeNull();
    expect(verifyMagicLink("justPayload.", SECRET_A)).toBeNull();
  });

  it("rejects tokens whose signature has tampered payload", () => {
    const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
    const [payloadPart, signature] = token.split(".");
    expect(payloadPart).toBeTruthy();
    expect(signature).toBeTruthy();
    // Меняем payload — подпись не сойдётся.
    const tamperedPayload = Buffer.from('{"email":"hacker@evil.com","issuedAt":0,"nonce":"x"}', "utf8").toString("base64url");
    const tampered = `${tamperedPayload}.${signature ?? ""}`;
    expect(verifyMagicLink(tampered, SECRET_A)).toBeNull();
  });

  describe("TTL", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("accepts a freshly issued token", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
      vi.advanceTimersByTime(MAGIC_LINK_TTL_MS - 1000);
      expect(verifyMagicLink(token, SECRET_A)).not.toBeNull();
    });

    it("rejects a token past the 30-minute TTL", () => {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const { token } = createMagicLink("user@example.com", SECRET_A, ORIGIN);
      vi.advanceTimersByTime(MAGIC_LINK_TTL_MS + 1);
      expect(verifyMagicLink(token, SECRET_A)).toBeNull();
    });
  });
});

describe("verifyInternalToken (dual-key)", () => {
  it("accepts CURRENT token", () => {
    expect(verifyInternalToken("new-token", "new-token", undefined)).toBe(true);
  });

  it("rejects garbage", () => {
    expect(verifyInternalToken("garbage", "new-token", undefined)).toBe(false);
    expect(verifyInternalToken("", "new-token", undefined)).toBe(false);
  });

  it("rejects non-string", () => {
    expect(verifyInternalToken(undefined, "new-token", undefined)).toBe(false);
    expect(verifyInternalToken(null, "new-token", undefined)).toBe(false);
    expect(verifyInternalToken(12345, "new-token", undefined)).toBe(false);
    expect(verifyInternalToken({ token: "new-token" }, "new-token", undefined)).toBe(false);
  });

  it("during rotation: accepts both CURRENT and OLD", () => {
    expect(verifyInternalToken("new-token", "new-token", "old-token")).toBe(true);
    expect(verifyInternalToken("old-token", "new-token", "old-token")).toBe(true);
    expect(verifyInternalToken("other", "new-token", "old-token")).toBe(false);
  });

  it("after rotation: only CURRENT accepted", () => {
    expect(verifyInternalToken("old-token", "new-token", undefined)).toBe(false);
    expect(verifyInternalToken("new-token", "new-token", undefined)).toBe(true);
  });

  it("comparison is length-aware: a token equal to current but with extra suffix is rejected", () => {
    // timingSafeEqual требует одинаковую длину. Реальная защита от
    // length-extension здесь не нужна, но проверим что код не разрешает
    // суффикс/префикс.
    expect(verifyInternalToken("new-token-extra", "new-token", undefined)).toBe(false);
    expect(verifyInternalToken("ne", "new-token", undefined)).toBe(false);
  });
});
