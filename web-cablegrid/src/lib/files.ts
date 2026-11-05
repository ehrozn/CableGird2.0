/**
 * Task documents and photos: kept in this browser (IndexedDB) and, for cloud
 * projects, uploaded as a blob `att-<id>` so crews, the QR page and other
 * managers can open them.
 */
import { get, set } from "idb-keyval";

import { getBlob, putBlob } from "./cloud-api";
import { uid } from "./ids";
import type { Project, TaskFile } from "./types";

export const MAX_FILE = 6 * 1024 * 1024;
const key = (pid: string, id: string) => `cg-att-${pid}-${id}`;

const toDataUrl = (f: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });

export const saveTaskFile = async (p: Project, f: File): Promise<TaskFile> => {
  const id = uid();
  const data = await toDataUrl(f);
  await set(key(p.id, id), data);
  if (p.cloud?.key && !p.cloud.off) await putBlob(p.id, p.cloud.key, `att-${id}`, data);
  return { id, name: f.name, size: f.size, type: f.type || "application/octet-stream", at: new Date().toISOString() };
};

/** Data URL of a file, from this device or from the cloud. */
export const loadTaskFile = async (pid: string, cloudKey: string | undefined, id: string): Promise<string | null> => {
  const local = await get<string>(key(pid, id)).catch(() => undefined);
  if (local) return local;
  if (!cloudKey) return null;
  const text = await getBlob(pid, cloudKey, `att-${id}`).catch(() => null);
  if (text) void set(key(pid, id), text).catch(() => undefined);
  return text;
};

export const openTaskFile = async (pid: string, cloudKey: string | undefined, f: TaskFile) => {
  // open the tab now (popup blockers), fill it when the data arrives
  const w = window.open("", "_blank");
  const data = await loadTaskFile(pid, cloudKey, f.id);
  if (!data) {
    w?.close();
    return false;
  }
  const blob = await (await fetch(data)).blob();
  const url = URL.createObjectURL(blob);
  if (w) w.location.href = url;
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = f.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};

export const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
