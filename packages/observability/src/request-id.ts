import { randomUUID } from "node:crypto";

const HEADER = "x-request-id";

/**
 * Извлечь или сгенерировать request-id из входящего запроса. Используется в
 * Fastify-хуке `genReqId` и в любом месте, где нужно протянуть trace-id наружу.
 *
 * Источники в порядке приоритета:
 *  1. `X-Request-Id` от клиента (если он сам прокидывает).
 *  2. `X-Request-Id` от nginx/балансера (мы доверяем trustProxy).
 *  3. Свежий UUID.
 */
export function extractOrGenerateRequestId(headers: Record<string, unknown>): string {
  const raw = headers[HEADER];
  if (typeof raw === "string" && raw.length > 0 && raw.length <= 128) {
    return raw;
  }
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
    return raw[0];
  }
  return randomUUID();
}

export const REQUEST_ID_HEADER = HEADER;
