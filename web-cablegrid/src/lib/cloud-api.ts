/** Thin HTTP client for the CableGrid cloud (same-origin /~api → Cloudflare Worker). */
export const API = "/~api";

export type CloudRole = "owner" | "editor" | "crew" | "client";

export class CloudError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const q = (key: string) => `key=${encodeURIComponent(key)}`;

export const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`${API}${path}`, init);
  if (!r.ok) {
    let code = "error";
    try {
      code = ((await r.json()) as { error?: string }).error ?? code;
    } catch {
      /* not json */
    }
    throw new CloudError(r.status, code);
  }
  return (await r.json()) as T;
};

export const roomPath = (pid: string, action: string, key: string, extra = "") => `/p/${encodeURIComponent(pid)}${action}?${q(key)}${extra}`;

export const putBlob = (pid: string, key: string, k: string, text: string) =>
  api<{ ok: true }>(roomPath(pid, `/blob/${k}`, key), { method: "PUT", body: text });

export const getBlob = async (pid: string, key: string, k: string) => {
  const r = await fetch(`${API}${roomPath(pid, `/blob/${k}`, key)}`);
  return r.ok ? await r.text() : null;
};

export const delBlob = (pid: string, key: string, k: string) =>
  fetch(`${API}${roomPath(pid, `/blob/${k}`, key)}`, { method: "DELETE" }).catch(() => undefined);

export const lookupToken = (token: string) => api<{ pid: string }>(`/t/${encodeURIComponent(token)}`);
