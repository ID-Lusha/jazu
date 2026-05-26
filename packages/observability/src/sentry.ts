import * as Sentry from "@sentry/node";

let initialized = false;

export type SentryInitOptions = {
  /** Имя сервиса (api / jobs / wa-worker). Идёт в тег `service`. */
  service: string;
  /** Sentry DSN из env. Если пусто — init не выполняется (no-op). */
  dsn: string | undefined;
  /** prod / development. Идёт в Sentry environment. */
  environment: string;
  /** Версия релиза (git sha / тег). Опционально. */
  release?: string | undefined;
  /** Доля транзакций (0..1). Дефолт 0.05 = 5% — дёшево, но видно тренды. */
  tracesSampleRate?: number;
};

/**
 * Инициализирует Sentry для текущего процесса. Идемпотентна — повторный вызов
 * молча игнорируется (важно, потому что api/jobs/wa-worker могут шарить
 * подгрузку через одну общую функцию).
 *
 * Если DSN не задан — Sentry просто не подключается, и все `captureException`
 * становятся no-op. Это удобно для dev'а без облачного аккаунта.
 */
export function initSentry(opts: SentryInitOptions): void {
  if (initialized) return;
  if (!opts.dsn) {
    return;
  }
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    ...(opts.release ? { release: opts.release } : {}),
    tracesSampleRate: opts.tracesSampleRate ?? 0.05,
    initialScope: {
      tags: { service: opts.service }
    },
    // Не отправляем в Sentry health-check'и и happy-path 4xx — это шум.
    beforeSend(event) {
      const url = event.request?.url;
      if (typeof url === "string") {
        if (url.endsWith("/health") || url.endsWith("/healthz") || url.endsWith("/readyz")) {
          return null;
        }
      }
      return event;
    }
  });
  initialized = true;
}

/**
 * Безопасный wrapper над Sentry.captureException — работает даже если Sentry
 * не инициализирован (тогда просто логирует в stderr).
 */
export function captureError(
  err: unknown,
  context?: {
    userId?: string | null;
    agentId?: string | null;
    route?: string | null;
    requestId?: string | null;
    extra?: Record<string, unknown>;
  }
): void {
  if (!initialized) {
    console.error("[observability] uninitialized capture:", err, context ?? "");
    return;
  }
  Sentry.withScope((scope) => {
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.agentId) scope.setTag("agentId", context.agentId);
    if (context?.route) scope.setTag("route", context.route);
    if (context?.requestId) scope.setTag("requestId", context.requestId);
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    Sentry.captureException(err);
  });
}

/**
 * Закрывает Sentry-клиент, дожидаясь отправки оставшихся events. Вызывать
 * только из graceful shutdown handler'а.
 */
export async function closeSentry(timeoutMs: number = 5_000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.close(timeoutMs);
  } catch {
    // Не критично — Sentry упасть в shutdown не должен останавливать процесс.
  }
}

/**
 * Удобный шорткат для отлова unhandledRejection / uncaughtException.
 * Регистрирует process-handler'ы и шлёт в Sentry. Возвращает функцию-cleanup.
 */
export function installProcessErrorHandlers(serviceName: string): () => void {
  const onRejection = (reason: unknown) => {
    captureError(reason, { route: `${serviceName}:unhandledRejection` });
    console.error(`[${serviceName}] unhandledRejection:`, reason);
  };
  const onException = (err: Error) => {
    captureError(err, { route: `${serviceName}:uncaughtException` });
    console.error(`[${serviceName}] uncaughtException:`, err);
    // ВАЖНО: uncaughtException означает, что приложение в неопределённом
    // состоянии. После flush'а Sentry — выходим, пусть orchestrator поднимет
    // нас заново.
    Sentry.close(2_000)
      .catch(() => undefined)
      .finally(() => process.exit(1));
  };
  process.on("unhandledRejection", onRejection);
  process.on("uncaughtException", onException);
  return () => {
    process.off("unhandledRejection", onRejection);
    process.off("uncaughtException", onException);
  };
}
