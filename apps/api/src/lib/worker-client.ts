import { env } from "../env.js";

type WorkerStatusResponse = {
  status: "disconnected" | "qr" | "pairing" | "connected" | "error";
  qrText: string | null;
  qrDataUrl: string | null;
  workerSessionId: string | null;
  phone: string | null;
  lastSeenAt: string | null;
};

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "x-internal-token": env.API_INTERNAL_TOKEN
  };
}

export async function startWorkerConnection(agentId: string): Promise<WorkerStatusResponse> {
  if (!env.WA_WORKER_URL) {
    return {
      status: "error",
      qrText: "WA_WORKER_URL is not configured",
      qrDataUrl: null,
      workerSessionId: null,
      phone: null,
      lastSeenAt: null
    };
  }

  const response = await fetch(new URL(`/connections/${agentId}/start`, env.WA_WORKER_URL), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ agentId })
  });

  if (!response.ok) {
    throw new Error(`Worker start failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as WorkerStatusResponse;
}

export async function getWorkerConnection(agentId: string): Promise<WorkerStatusResponse> {
  if (!env.WA_WORKER_URL) {
    return {
      status: "disconnected",
      qrText: null,
      qrDataUrl: null,
      workerSessionId: null,
      phone: null,
      lastSeenAt: null
    };
  }

  const response = await fetch(new URL(`/connections/${agentId}/status`, env.WA_WORKER_URL), {
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`Worker status failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as WorkerStatusResponse;
}

export async function stopWorkerConnection(agentId: string): Promise<WorkerStatusResponse> {
  if (!env.WA_WORKER_URL) {
    return {
      status: "disconnected",
      qrText: null,
      qrDataUrl: null,
      workerSessionId: null,
      phone: null,
      lastSeenAt: null
    };
  }

  const response = await fetch(new URL(`/connections/${agentId}`, env.WA_WORKER_URL), {
    method: "DELETE",
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`Worker stop failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as WorkerStatusResponse;
}

export type WorkerPairResponse = {
  code: string;
  phone: string;
};

export async function pairWorkerConnection(
  agentId: string,
  phoneDigits: string
): Promise<WorkerPairResponse> {
  if (!env.WA_WORKER_URL) {
    throw new Error("WA_WORKER_URL is not configured");
  }

  const response = await fetch(new URL(`/connections/${agentId}/pair`, env.WA_WORKER_URL), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ phone: phoneDigits })
  });

  const data = (await response.json()) as Partial<WorkerPairResponse> & { error?: string };
  if (!response.ok || !data.code) {
    throw new Error(data.error || `Worker pair failed: ${response.status}`);
  }
  return { code: data.code, phone: data.phone ?? `+${phoneDigits}` };
}

export async function sendWorkerMessage(agentId: string, payload: { chatId: string; text: string }): Promise<void> {
  if (!env.WA_WORKER_URL) {
    return;
  }

  const response = await fetch(new URL(`/connections/${agentId}/send`, env.WA_WORKER_URL), {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Worker send failed: ${response.status} ${await response.text()}`);
  }
}
