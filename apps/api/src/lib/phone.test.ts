import { describe, it, expect } from "vitest";
import { isValidKzRuPhone, normalizeKzRuPhone } from "./phone.js";

describe("normalizeKzRuPhone", () => {
  it("returns null for empty / nullish input", () => {
    expect(normalizeKzRuPhone(null)).toBeNull();
    expect(normalizeKzRuPhone(undefined)).toBeNull();
    expect(normalizeKzRuPhone("")).toBeNull();
    expect(normalizeKzRuPhone("   ")).toBeNull();
  });

  it("passes through already-normalized E.164", () => {
    expect(normalizeKzRuPhone("+77001234567")).toBe("+77001234567");
    expect(normalizeKzRuPhone("+79001234567")).toBe("+79001234567");
  });

  it("converts 11-digit starting with 7", () => {
    expect(normalizeKzRuPhone("77001234567")).toBe("+77001234567");
  });

  it("converts 11-digit starting with 8 (Russian local format)", () => {
    expect(normalizeKzRuPhone("87001234567")).toBe("+77001234567");
    expect(normalizeKzRuPhone("89001234567")).toBe("+79001234567");
  });

  it("converts 10-digit (no country code)", () => {
    expect(normalizeKzRuPhone("7001234567")).toBe("+77001234567");
    expect(normalizeKzRuPhone("9001234567")).toBe("+79001234567");
  });

  it("strips formatting characters", () => {
    expect(normalizeKzRuPhone("+7 (700) 123-45-67")).toBe("+77001234567");
    expect(normalizeKzRuPhone("8 (700) 123 45 67")).toBe("+77001234567");
    expect(normalizeKzRuPhone("8-700-123-45-67")).toBe("+77001234567");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeKzRuPhone("  +77001234567  ")).toBe("+77001234567");
  });

  it("rejects too short / too long", () => {
    expect(normalizeKzRuPhone("123")).toBeNull();
    expect(normalizeKzRuPhone("1234567")).toBeNull();
    expect(normalizeKzRuPhone("770012345671234")).toBeNull();
  });

  it("rejects 11-digit starting with anything other than 7/8", () => {
    // 1-явно не KZ/RU.
    expect(normalizeKzRuPhone("17001234567")).toBeNull();
    expect(normalizeKzRuPhone("97001234567")).toBeNull();
  });

  it("rejects input with no digits at all", () => {
    expect(normalizeKzRuPhone("not a phone")).toBeNull();
    expect(normalizeKzRuPhone("()-")).toBeNull();
  });
});

describe("isValidKzRuPhone", () => {
  it("matches normalizeKzRuPhone result", () => {
    expect(isValidKzRuPhone("+77001234567")).toBe(true);
    expect(isValidKzRuPhone("87001234567")).toBe(true);
    expect(isValidKzRuPhone("garbage")).toBe(false);
    expect(isValidKzRuPhone(undefined)).toBe(false);
  });
});
