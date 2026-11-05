/**
 * Live feed for the TV board and the QR take page: snapshot over HTTP, then a
 * WebSocket that only says "changed" → refetch. On a lost connection the page
 * keeps the last data, shows when it was updated, and reloads on reconnect.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { BoardData } from "./board";
import { API, CloudError, api, lookupToken, roomPath } from "./cloud-api";
import type { Task } from "./types";

export type FeedStatus = "connecting" | "live" | "offline" | "revoked";

export interface BoardFeed {
  pid: string;
  data: BoardData | null;
  status: FeedStatus;
  updatedAt: number | null;
  reload: () => Promise<void>;
  /** put a task the server just returned into the data right away */
  patchTask: (t: Task) => void;
}

export const useBoardFeed = (token: string, client: string): BoardFeed => {
  const [pid, setPid] = useState("");
  const [data, setData] = useState<BoardData | null>(null);
  const [status, setStatus] = useState<FeedStatus>("connecting");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const pidRef = useRef("");
  const wsOpen = useRef(false);
  const dead = useRef(false);

  const load = useCallback(async () => {
    const id = pidRef.current;
    if (!id || dead.current) return;
    try {
      const d = await api<BoardData>(roomPath(id, "/board", token));
      setData(d);
      setUpdatedAt(Date.now());
      if (wsOpen.current) setStatus("live");
    } catch (e) {
      if (e instanceof CloudError && (e.status === 403 || e.status === 404 || e.status === 410)) {
        dead.current = true;
        setStatus("revoked");
      } else setStatus("offline");
    }
  }, [token]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    dead.current = false;

    const connect = () => {
      if (stopped || dead.current || !pidRef.current) return;
      const url = new URL(`${API}${roomPath(pidRef.current, "/ws", token, `&client=${encodeURIComponent(client)}`)}`, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      try {
        ws = new WebSocket(url);
      } catch {
        schedule();
        return;
      }
      const sock = ws;
      let heard = Date.now();
      sock.onmessage = (e) => {
        heard = Date.now();
        if (typeof e.data !== "string" || e.data === "pong") return;
        let msg: { t?: string };
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.t === "hello") {
          retry = 0;
          wsOpen.current = true;
          setStatus("live");
          void load();
        } else if (msg.t === "changed") {
          clearTimeout(debounce);
          debounce = setTimeout(() => void load(), 350);
        }
      };
      sock.onopen = () => {
        clearInterval(ping);
        ping = setInterval(() => {
          if (sock.readyState !== WebSocket.OPEN) return;
          if (Date.now() - heard > 70_000) {
            sock.onclose = null;
            sock.close();
            lost();
            return;
          }
          sock.send("ping");
        }, 25_000);
      };
      sock.onclose = (e) => {
        if (e.code === 4003 || e.code === 4004) {
          dead.current = true;
          wsOpen.current = false;
          setStatus("revoked");
          return;
        }
        lost();
      };
    };
    const lost = () => {
      clearInterval(ping);
      wsOpen.current = false;
      ws = null;
      if (stopped || dead.current) return;
      setStatus("offline");
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      retry++;
      timer = setTimeout(connect, Math.min(30_000, 1500 * 2 ** Math.min(retry, 5)));
    };
    const now = () => {
      if (ws || stopped || dead.current) return;
      retry = 0;
      clearTimeout(timer);
      connect();
    };

    (async () => {
      try {
        const r = await lookupToken(token);
        if (stopped) return;
        pidRef.current = r.pid;
        setPid(r.pid);
        await load();
        connect();
      } catch (e) {
        if (stopped) return;
        if (e instanceof CloudError && e.status === 404) {
          dead.current = true;
          setStatus("revoked");
        } else {
          setStatus("offline");
          // retry the whole start later
          timer = setTimeout(() => window.location.reload(), 15_000);
        }
      }
    })();
    // safety net: refetch every minute even if a "changed" was missed
    const safety = setInterval(() => void load(), 60_000);
    const vis = () => {
      if (document.visibilityState === "visible") {
        now();
        void load();
      }
    };
    window.addEventListener("online", now);
    document.addEventListener("visibilitychange", vis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(debounce);
      clearInterval(ping);
      clearInterval(safety);
      window.removeEventListener("online", now);
      document.removeEventListener("visibilitychange", vis);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [token, client, load]);

  const patchTask = useCallback((t: Task) => setData((d) => (d ? { ...d, tasks: d.tasks.some((x) => x.id === t.id) ? d.tasks.map((x) => (x.id === t.id ? t : x)) : [t, ...d.tasks] } : d)), []);

  return { pid, data, status, updatedAt, reload: load, patchTask };
};

export const claimTask = (pid: string, token: string, body: { taskId: string; linkId: string; empId?: string; name: string; rid: string }) =>
  api<{ ok: true; claimId: string; seq: number; task: Task }>(roomPath(pid, "/claim", token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const addClaimNote = (pid: string, token: string, body: { taskId: string; claimId: string; text: string; nid: string }) =>
  api<{ ok: true }>(roomPath(pid, "/note", token), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
