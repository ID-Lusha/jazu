import {
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
  BufferJSON,
  initAuthCreds,
  proto
} from "@whiskeysockets/baileys";
import { env } from "./env.js";

/**
 * Хранилище auth state для Baileys в Postgres (через API).
 *
 * Все ключи и creds сериализуются одним JSON-блобом и кладутся в
 * WaConnection.authStateJson. API эндпоинты:
 *   GET  /internal/wa-auth/:agentId          → { creds, keys }
 *   PUT  /internal/wa-auth/:agentId          ← { creds, keys }
 *
 * Это даёт три плюса по сравнению с useMultiFileAuthState:
 *   1) воркер можно перезапускать/масштабировать без потери сессии;
 *   2) у воркера нет прямого доступа к Postgres (изоляция);
 *   3) переезд агента между нодами требует только смены WORKER_URL.
 */

type SerializedSignalKeys = Record<string, Record<string, unknown>>;

type SerializedAuthBlob = {
  creds: AuthenticationCreds;
  keys: SerializedSignalKeys;
};

function emptyBlob(): SerializedAuthBlob {
  return { creds: initAuthCreds(), keys: {} };
}

async function loadBlob(agentId: string): Promise<SerializedAuthBlob> {
  const response = await fetch(new URL(`/api/internal/wa-auth/${agentId}`, env.API_ORIGIN), {
    method: "GET",
    headers: { "x-internal-token": env.API_INTERNAL_TOKEN }
  });
  if (response.status === 404) {
    return emptyBlob();
  }
  if (!response.ok) {
    throw new Error(`wa-auth GET failed: ${response.status} ${await response.text()}`);
  }
  const text = await response.text();
  if (!text) return emptyBlob();
  const parsed = JSON.parse(text, BufferJSON.reviver) as Partial<SerializedAuthBlob>;
  return {
    creds: parsed.creds && Object.keys(parsed.creds).length > 0 ? parsed.creds : initAuthCreds(),
    keys: parsed.keys ?? {}
  };
}

async function saveBlob(agentId: string, blob: SerializedAuthBlob): Promise<void> {
  const body = JSON.stringify(blob, BufferJSON.replacer);
  const response = await fetch(new URL(`/api/internal/wa-auth/${agentId}`, env.API_ORIGIN), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-internal-token": env.API_INTERNAL_TOKEN
    },
    body
  });
  if (!response.ok) {
    throw new Error(`wa-auth PUT failed: ${response.status} ${await response.text()}`);
  }
}

export async function useDbAuthState(
  agentId: string,
  options: { fresh?: boolean } = {}
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  // fresh=true — игнорируем сохранённые creds и стартуем как новый клиент.
  // Нужно для pairing-code flow когда юзер перепривязывает номер (иначе
  // Baileys уйдёт в passive=true login и WhatsApp его отобьёт).
  const blob = options.fresh ? emptyBlob() : await loadBlob(agentId);
  if (options.fresh) {
    // Сразу затираем blob на сервере, чтобы старые ключи никак не утекли.
    await saveBlob(agentId, blob);
  }

  const persist = async () => {
    await saveBlob(agentId, blob);
  };

  const state: AuthenticationState = {
    creds: blob.creds,
    keys: {
      // Baileys ждёт async-сигнатуру; чтение полностью в памяти (без await),
      // но переписывать на sync-вариант нельзя — нарушим контракт SDK.
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const bucket = blob.keys[type] ?? {};
        const result: Record<string, SignalDataTypeMap[T]> = {};
        for (const id of ids) {
          const value = bucket[id];
          if (value !== undefined) {
            // app-state-sync-key хранится как plain object — Baileys ждёт
            // proto.Message.AppStateSyncKeyData. Восстанавливаем тип.
            if (type === "app-state-sync-key") {
              result[id] = proto.Message.AppStateSyncKeyData.fromObject(
                value as Record<string, unknown>
              ) as unknown as SignalDataTypeMap[T];
            } else {
              result[id] = value as SignalDataTypeMap[T];
            }
          }
        }
        return result;
      },
      set: async (data) => {
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const bucket = (blob.keys[category] ??= {});
          const incoming = data[category] as Record<string, unknown> | undefined;
          if (!incoming) continue;
          for (const [id, value] of Object.entries(incoming)) {
            if (value === null || value === undefined) {
              delete bucket[id];
            } else {
              bucket[id] = value;
            }
          }
        }
        await persist();
      }
    }
  };

  return {
    state,
    saveCreds: async () => {
      // creds мутируются по месту Baileys'ом, нам нужно только сохранить blob.
      blob.creds = state.creds;

      // КРИТИЧНО для pairing-flow: если pairing не завершён (registered=false),
      // в creds лежит { me, pairingCode, registered:false } — partial state,
      // который при следующем старте уведёт Baileys в passive=true login и
      // WhatsApp отобьёт с "Connection Failure". Поэтому в fresh-режиме мы
      // НЕ пишем такой partial blob — ждём успешной регистрации.
      if (options.fresh && !state.creds.registered) {
        return;
      }

      await persist();
    }
  };
}
