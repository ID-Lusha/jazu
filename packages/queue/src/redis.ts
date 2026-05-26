import { Redis, type RedisOptions } from "ioredis";

/**
 * Singleton Redis connections для BullMQ.
 *
 * BullMQ требует ОТДЕЛЬНЫХ connection-объектов для Queue/QueueEvents и для
 * Worker — иначе блокирующие BRPOPLPUSH-команды воркера повесят все остальные
 * операции на той же connection. Поэтому фабрика возвращает либо общий пул
 * для writer'ов (Queue.add), либо новый dedicated connection для воркера.
 *
 * `maxRetriesPerRequest: null` обязателен для воркеров — иначе ioredis
 * убьёт долгие BRPOPLPUSH с ошибкой "Reached the max retries per request limit".
 */

const DEFAULT_URL = "redis://127.0.0.1:6379";

let sharedWriter: Redis | undefined;

function buildOptions(workerSafe: boolean): RedisOptions {
  return {
    lazyConnect: false,
    enableReadyCheck: true,
    // Воркерам BullMQ нужен бесконечный retry — они держат blocking-команду.
    maxRetriesPerRequest: workerSafe ? null : 20,
    retryStrategy: (times) => Math.min(1000 * Math.pow(2, times), 30_000)
  };
}

/** Общий Redis для Queue.add / Queue.getJob / QueueEvents-publisher. */
export function getRedisWriter(): Redis {
  if (sharedWriter) return sharedWriter;
  const url = process.env.REDIS_URL || DEFAULT_URL;
  sharedWriter = new Redis(url, buildOptions(false));
  sharedWriter.on("error", (err) => {
    console.error("[queue] redis writer error:", err.message);
  });
  return sharedWriter;
}

/** Dedicated Redis для каждого BullMQ Worker / QueueEvents-subscriber. */
export function buildRedisForWorker(): Redis {
  const url = process.env.REDIS_URL || DEFAULT_URL;
  const conn = new Redis(url, buildOptions(true));
  conn.on("error", (err) => {
    console.error("[queue] redis worker conn error:", err.message);
  });
  return conn;
}

export async function closeRedisWriter(): Promise<void> {
  if (sharedWriter) {
    await sharedWriter.quit().catch(() => undefined);
    sharedWriter = undefined;
  }
}
