/**
 * Лёгкая валидация телефона KZ/RU без зависимостей.
 *
 * Принимаем что угодно содержащее цифры, чистим, нормализуем в E.164 +7XXXXXXXXXX.
 *
 * Правила:
 *  - 11 цифр начиная с 7 или 8 → +7 + последние 10.
 *  - 10 цифр (без префикса страны) → +7 + всё.
 *  - +7XXXXXXXXXX → пропускаем как есть.
 *
 * Для KZ/RU подходит, для остального возвращаем null.
 */

const E164_KZRU = /^\+7\d{10}$/;

export function normalizeKzRuPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (E164_KZRU.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D+/g, "");
  if (!digits) return null;

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }

  return null;
}

export function isValidKzRuPhone(input: string | undefined | null): boolean {
  return normalizeKzRuPhone(input) !== null;
}
