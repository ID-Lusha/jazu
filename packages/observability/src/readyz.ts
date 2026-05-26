/**
 * Универсальный исполнитель health-check'ов. Каждый check — это пара
 * (имя, async-функция, бросает на ошибке). Возвращает 200 если все ок,
 * 503 если хотя бы один свалился. Используется в /readyz во всех сервисах.
 */
export type ReadinessCheck = {
  name: string;
  /** Кидает ошибку или возвращает promise. */
  check: () => Promise<void>;
  /** Сколько ждать одну проверку. Дефолт 2 секунды. */
  timeoutMs?: number;
};

export type ReadinessReport = {
  ok: boolean;
  service: string;
  checks: Array<{ name: string; ok: boolean; error?: string; elapsedMs: number }>;
};

export async function runReadiness(
  service: string,
  checks: ReadinessCheck[]
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (c) => {
      const started = Date.now();
      const timeoutMs = c.timeoutMs ?? 2_000;
      try {
        await Promise.race([
          c.check(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeoutMs)
          )
        ]);
        return { name: c.name, ok: true, elapsedMs: Date.now() - started };
      } catch (err) {
        return {
          name: c.name,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: Date.now() - started
        };
      }
    })
  );
  return {
    ok: results.every((r) => r.ok),
    service,
    checks: results
  };
}
