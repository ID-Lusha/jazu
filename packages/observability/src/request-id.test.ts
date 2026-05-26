import { describe, it, expect } from "vitest";
import { extractOrGenerateRequestId, REQUEST_ID_HEADER } from "./request-id.js";

describe("extractOrGenerateRequestId", () => {
  it("returns the existing string X-Request-Id if present", () => {
    const id = extractOrGenerateRequestId({ "x-request-id": "abc-123" });
    expect(id).toBe("abc-123");
  });

  it("is case-sensitive on header name (we always pass through Fastify-lowercased headers)", () => {
    // Fastify нормализует ключи к lower-case до того как они попадут к нам.
    // Если кто-то ручно положит X-Request-Id с заглавной — мы его не увидим,
    // и это нормально для нашего use-case.
    const id = extractOrGenerateRequestId({ "X-Request-Id": "should-be-ignored" });
    expect(id).not.toBe("should-be-ignored");
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it("ignores empty string and generates a new UUID", () => {
    const id = extractOrGenerateRequestId({ "x-request-id": "" });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("ignores oversized values to prevent log injection / abuse", () => {
    const tooLong = "x".repeat(129);
    const id = extractOrGenerateRequestId({ "x-request-id": tooLong });
    expect(id).not.toBe(tooLong);
    expect(id).toMatch(/[0-9a-f-]{36}/);
  });

  it("accepts exactly 128 chars (boundary)", () => {
    const exactly128 = "a".repeat(128);
    expect(extractOrGenerateRequestId({ "x-request-id": exactly128 })).toBe(exactly128);
  });

  it("uses first item if header is an array (multiple X-Request-Id headers)", () => {
    const id = extractOrGenerateRequestId({ "x-request-id": ["first", "second"] });
    expect(id).toBe("first");
  });

  it("generates a fresh UUID when header is missing", () => {
    const a = extractOrGenerateRequestId({});
    const b = extractOrGenerateRequestId({});
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("exposes the canonical header name", () => {
    expect(REQUEST_ID_HEADER).toBe("x-request-id");
  });
});
