/**
 * Cloud sync for CableGrid projects.
 *
 * Every project lives in a Durable Object room on the backend. This module
 * watches the local zustand store, finds what changed since the last sync by
 * comparing object references (immer keeps unchanged objects identical), sends
 * those changes as small ops and applies ops from other people that arrive
 * over a WebSocket. Cables are sent as patches (only the changed cells and new
 * history events) so two managers editing different cells of the same cable
 * never overwrite each other; other entities use "last write wins".
 */
import { del, get, set } from "idb-keyval";
import { create } from "zustand";

import { API, CloudError, type CloudRole, api, lookupToken, roomPath } from "./cloud-api";
import { getMe, setMyName } from "./me";
import { useStore } from "./store";
import type { Cable, CloudMeta, HistoryEvent, Project } from "./types";

const COLLECTIONS = [
  "cables",
  "sheets",
  "books",
  "rules",
  "views",
  "formats",
  "revisions",
  "actions",
  "employees",
  "tasks",
  "links",
  "reports",
  "issues",
  "rfis",
  "messages",
  "threads",
  "activity",
] as const;
const COLL = new Set<string>(COLLECTIONS);
const SKIP = new Set(["id", "cloud"]);

type Json = Record<string, unknown>;
type Obj = Json & { id: string };
type CablePatch = {
  set?: Json;
  values?: Record<string, string | null>;
  done?: Record<string, string | null>;
  hist?: HistoryEvent[];
};
type Op =
  | { k: "i"; f: string; id: string; v: Obj | null }
  | { k: "c"; id: string; p: CablePatch }
  | { k: "f"; n: string; v: unknown }
  | { k: "o"; f: string; ids: string[] };

export type SyncStatus = "connecting" | "live" | "syncing" | "offline";
export type Peer = { client: string; name: string; role: CloudRole; at: number };

interface CloudUi {
  status: Record<string, SyncStatus>;
  peers: Record<string, Peer[]>;
  /** upload progress 0..1 of the first upload */
  upload: Record<string, number>;
}
export const useCloud = create<CloudUi>(() => ({ status: {}, peers: {}, upload: {} }));
const setUi = <K extends keyof CloudUi>(k: K, pid: string, v: CloudUi[K][string] | undefined) =>
  useCloud.setState((s) => {
    const next = { ...s[k] } as Record<string, unknown>;
    if (v === undefined) delete next[pid];
    else next[pid] = v;
    return { [k]: next } as Partial<CloudUi>;
  });

/* ───────── cable patches ───────── */

export const mergeCable = (cur: Json | null | undefined, p: CablePatch): Obj => {
  const c: Json = { ...(cur ?? {}) };
  for (const [k, v] of Object.entries(p.set ?? {})) {
    if (v === null || v === undefined) delete c[k];
    else c[k] = v;
  }
  for (const key of ["values", "done"] as const) {
    const patch = p[key];
    if (!patch) continue;
    const obj: Record<string, string> = { ...((c[key] as Record<string, string>) ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete obj[k];
      else obj[k] = v;
    }
    c[key] = obj;
  }
  if (p.hist?.length) {
    const hist = ((c.history as HistoryEvent[]) ?? []).slice();
    const have = new Set(hist.map((h) => h.id));
    c.history = [...p.hist.filter((h) => !have.has(h.id)), ...hist];
  }
  return c as Obj;
};

const mapDiff = (a: Record<string, string> = {}, b: Record<string, string> = {}) => {
  let out: Record<string, string | null> | undefined;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (a[k] !== b[k]) (out ??= {})[k] = b[k] ?? null;
  return out;
};

const cableDiff = (b: Cable, x: Cable): CablePatch | null => {
  const p: CablePatch = {};
  const setv: Json = {};
  let any = false;
  const bo = b as unknown as Json;
  const xo = x as unknown as Json;
  for (const k of new Set([...Object.keys(bo), ...Object.keys(xo)])) {
    if (k === "values" || k === "done" || k === "history") continue;
    if (bo[k] !== xo[k]) {
      setv[k] = xo[k] ?? null;
      any = true;
    }
  }
  if (b.values !== x.values) {
    const d = mapDiff(b.values, x.values);
    if (d) {
      p.values = d;
      any = true;
    }
  }
  if (b.done !== x.done) {
    const d = mapDiff(b.done, x.done);
    if (d) {
      p.done = d;
      any = true;
    }
  }
  if (b.history !== x.history) {
    const old = new Map((b.history ?? []).map((h) => [h.id, h]));
    const now = new Set((x.history ?? []).map((h) => h.id));
    const rewritten = (b.history ?? []).some((h) => !now.has(h.id)) || (x.history ?? []).some((h) => old.has(h.id) && old.get(h.id) !== h);
    if (rewritten) {
      setv.history = x.history;
      any = true;
    } else {
      const nu = (x.history ?? []).filter((h) => !old.has(h.id));
      if (nu.length) {
        p.hist = nu;
        any = true;
      }
    }
  }
  if (Object.keys(setv).length) p.set = setv;
  return any ? p : null;
};

const combinePatch = (a: CablePatch, b: CablePatch): CablePatch => {
  const bs = b.set ?? {};
  return {
    set: a.set || b.set ? { ...(a.set ?? {}), ...bs } : undefined,
    values: "values" in bs ? b.values : a.values || b.values ? { ...(a.values ?? {}), ...(b.values ?? {}) } : undefined,
    done: "done" in bs ? b.done : a.done || b.done ? { ...(a.done ?? {}), ...(b.done ?? {}) } : undefined,
    hist: "history" in bs ? b.hist : a.hist || b.hist ? [...(b.hist ?? []), ...(a.hist ?? [])] : undefined,
  };
};

const opKey = (op: Op) => (op.k === "c" ? `i:cables:${op.id}` : op.k === "i" ? `i:${op.f}:${op.id}` : op.k === "f" ? `f:${op.n}` : `o:${op.f}`);

/* ───────── base: what the server is known to have ───────── */

interface Base {
  items: Map<string, Map<string, Obj>>;
  arrs: Map<string, unknown>;
  orders: Map<string, string>;
  fields: Map<string, unknown>;
}
const orderOf = (arr: Obj[]) => arr.map((x) => x.id).join("\n");
const emptyBase = (): Base => ({ items: new Map(COLLECTIONS.map((f) => [f, new Map()])), arrs: new Map(), orders: new Map(), fields: new Map() });
const baseOf = (p: Project): Base => {
  const b = emptyBase();
  const pj = p as unknown as Json;
  for (const f of COLLECTIONS) {
    const arr = (pj[f] as Obj[] | undefined) ?? [];
    b.items.set(f, new Map(arr.map((x) => [x.id, x])));
    b.arrs.set(f, pj[f]);
    if (f !== "cables") b.orders.set(f, orderOf(arr));
  }
  for (const [k, v] of Object.entries(pj)) if (!COLL.has(k) && !SKIP.has(k)) b.fields.set(k, v);
  return b;
};

/* ───────── rooms ───────── */

let applying = 0;
const rooms = new Map<string, Room>();
const obKey = (pid: string) => `cablegrid-outbox:${pid}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_CHUNK = 1_500_000;
/**
 * Every tab is its own sync client. The device id alone is not enough: a crew link opened in a second tab of
 * the owner's browser would send ops that the first tab took for its own echo and never applied.
 */
const TAB = `${getMe().client}.${Math.random().toString(36).slice(2, 8)}`;

const findP = (pid: string) => useStore.getState().projects.find((p) => p.id === pid);

const setCloudMeta = (pid: string, patch: Partial<CloudMeta> | CloudMeta) =>
  useStore.setState((s) => {
    const p = s.projects.find((x) => x.id === pid);
    if (p) p.cloud = { ...(p.cloud ?? { role: "owner", key: "", seq: 0, ready: false }), ...patch };
  });

class Room {
  base: Base | null = null;
  outbox = new Map<string, Op>();
  ws: WebSocket | null = null;
  stopped = false;
  busy = false;
  again = false;
  retry = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  wsTimer: ReturnType<typeof setTimeout> | undefined;
  ping: ReturnType<typeof setInterval> | undefined;
  q: Promise<void> = Promise.resolve();

  constructor(public pid: string) {}

  get cl() {
    return findP(this.pid)?.cloud;
  }

  status(s: SyncStatus) {
    if (!this.stopped) setUi("status", this.pid, s);
  }

  enqueue(fn: () => Promise<void> | void) {
    this.q = this.q.then(fn).catch((e: unknown) => this.fail(e));
    return this.q;
  }

  fail(e: unknown) {
    if (e instanceof CloudError && (e.status === 403 || e.status === 410)) return this.lost(e.status === 410 ? "deleted" : "revoked");
    console.warn("cloud sync", e);
    this.status("offline");
  }

  async boot() {
    const p = findP(this.pid);
    if (!p || this.stopped) return;
    if (!p.cloud) {
      // a project of this device: create its cloud room (this device = owner)
      const key = crypto.randomUUID().replace(/-/g, "") + Math.random().toString(36).slice(2, 10);
      try {
        await api(`/p/${encodeURIComponent(this.pid)}/init`, { method: "POST", body: JSON.stringify({ key }) });
        setCloudMeta(this.pid, { role: "owner", key, seq: 0, ready: false });
      } catch (e) {
        if (e instanceof CloudError && (e.status === 409 || e.status === 410 || e.status === 400)) {
          setCloudMeta(this.pid, { role: "owner", key, seq: 0, ready: false, off: true });
          return;
        }
        this.status("offline");
        this.timer = setTimeout(() => void this.boot(), 15_000);
        return;
      }
    }
    const cl = this.cl;
    if (!cl || cl.off) return;
    this.status("connecting");
    const saved = await get<Op[]>(obKey(this.pid)).catch(() => undefined);
    for (const op of saved ?? []) this.addOp(op);
    if (!cl.ready) this.base = emptyBase();
    else {
      // assume this device was in sync when it was closed; unsent changes were kept in the outbox
      this.base = baseOf(findP(this.pid)!);
      await this.enqueue(async () => {
        await this.send();
        await this.catchUp();
      });
    }
    await this.flush();
    this.connect();
  }

  /** local changes → outbox */
  diff() {
    const p = findP(this.pid);
    const base = this.base;
    if (!p || !base) return;
    const pj = p as unknown as Json;
    for (const f of COLLECTIONS) {
      if (base.arrs.get(f) === pj[f]) continue;
      const arr = (pj[f] as Obj[] | undefined) ?? [];
      const bm = base.items.get(f)!;
      const seen = new Set<string>();
      for (const x of arr) {
        if (!x || typeof x.id !== "string") continue;
        seen.add(x.id);
        const b = bm.get(x.id);
        if (b === x) continue;
        if (f === "cables") {
          if (!b) this.addOp({ k: "c", id: x.id, p: { set: x } });
          else {
            const d = cableDiff(b as unknown as Cable, x as unknown as Cable);
            if (d) this.addOp({ k: "c", id: x.id, p: d });
          }
        } else this.addOp({ k: "i", f, id: x.id, v: x });
        bm.set(x.id, x);
      }
      if (bm.size !== seen.size)
        for (const id of [...bm.keys()])
          if (!seen.has(id)) {
            this.addOp({ k: "i", f, id, v: null });
            bm.delete(id);
          }
      if (f !== "cables") {
        const o = orderOf(arr);
        if (base.orders.get(f) !== o) {
          this.addOp({ k: "o", f, ids: arr.map((x) => x.id) });
          base.orders.set(f, o);
        }
      }
      base.arrs.set(f, pj[f]);
    }
    for (const k of new Set([...Object.keys(pj), ...base.fields.keys()])) {
      if (COLL.has(k) || SKIP.has(k)) continue;
      const v = pj[k];
      if (v !== base.fields.get(k)) {
        this.addOp({ k: "f", n: k, v: v ?? null });
        base.fields.set(k, v);
      }
    }
  }

  addOp(op: Op) {
    const key = opKey(op);
    const prev = this.outbox.get(key);
    if (prev && op.k === "c") {
      if (prev.k === "c") {
        this.outbox.delete(key);
        this.outbox.set(key, { k: "c", id: op.id, p: combinePatch(prev.p, op.p) });
        return;
      }
      if (prev.k === "i" && prev.v) {
        this.outbox.delete(key);
        this.outbox.set(key, { k: "c", id: op.id, p: { set: mergeCable(prev.v, op.p) } });
        return;
      }
    }
    this.outbox.delete(key);
    this.outbox.set(key, op);
  }

  schedule(ms = 400) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  async flush() {
    if (!this.base || this.stopped) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    this.diff();
    if (!this.outbox.size) {
      if (this.cl && !this.cl.ready) this.markReady();
      return;
    }
    await this.enqueue(() => this.send());
  }

  /** send the outbox in chunks */
  async send() {
    const cl = this.cl;
    if (!cl || cl.off || this.stopped || !this.outbox.size) return;
    this.busy = true;
    this.status("syncing");
    const ops = [...this.outbox.values()];
    this.outbox.clear();
    const chunks: Op[][] = [];
    let cur: Op[] = [];
    let size = 0;
    for (const op of ops) {
      const n = JSON.stringify(op).length;
      if (cur.length && size + n > MAX_CHUNK) {
        chunks.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(op);
      size += n;
    }
    if (cur.length) chunks.push(cur);
    const first = !cl.ready;
    try {
      for (let i = 0; i < chunks.length; i++) {
        try {
          const res = await api<{ seq: number; fixes: Op[] }>(roomPath(this.pid, "/ops", cl.key), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client: TAB, ops: chunks[i] }),
          });
          if (res.fixes?.length) this.apply(res.fixes, 0);
        } catch (e) {
          for (const op of chunks.slice(i).flat()) if (!this.outbox.has(opKey(op))) this.outbox.set(opKey(op), op);
          if (e instanceof CloudError && (e.status === 403 || e.status === 410)) throw e;
          this.status("offline");
          this.retry++;
          this.schedule(Math.min(30_000, 1000 * 2 ** this.retry));
          return;
        }
        if (first && chunks.length > 1) setUi("upload", this.pid, (i + 1) / chunks.length);
      }
      this.retry = 0;
      void del(obKey(this.pid)).catch(() => undefined);
      if (first) {
        setUi("upload", this.pid, undefined);
        this.markReady();
      }
      this.status(this.ws?.readyState === WebSocket.OPEN ? "live" : "offline");
    } finally {
      this.busy = false;
      if (this.again) {
        this.again = false;
        this.schedule(50);
      }
    }
  }

  markReady() {
    setCloudMeta(this.pid, { ready: true });
  }

  async catchUp() {
    const cl = this.cl;
    if (!cl || cl.off) return;
    const r = await api<{ seq: number; ops: Op[] }>(roomPath(this.pid, "/since", cl.key, `&seq=${cl.seq}`));
    this.apply(r.ops, r.seq);
  }

  /** remote ops → local store (keeps local unsent changes on top) */
  apply(ops: Op[], seq: number) {
    const p0 = findP(this.pid);
    if (!p0) return;
    const pj = p0 as unknown as Json;
    const base = this.base;
    const work = new Map<string, (Obj | null)[]>();
    const idx = new Map<string, Map<string, number>>();
    const syncedOrder = new Map<string, boolean>();
    const arrOf = (f: string) => {
      let a = work.get(f);
      if (!a) {
        const src = (pj[f] as Obj[] | undefined) ?? [];
        a = [...src];
        work.set(f, a);
        idx.set(f, new Map(src.map((x, i) => [x.id, i])));
        syncedOrder.set(f, !base || base.orders.get(f) === orderOf(src));
      }
      return a;
    };
    const fields = new Map<string, unknown>();
    const arrived: { number: number; linkName: string }[] = [];
    for (const op of ops) {
      if (op.k === "i" || op.k === "c") {
        const f = op.k === "c" ? "cables" : op.f;
        if (!COLL.has(f)) continue;
        const arr = arrOf(f);
        const ix = idx.get(f)!;
        const i = ix.get(op.id);
        const local = i !== undefined ? (arr[i] ?? undefined) : undefined;
        const bm = base?.items.get(f);
        const b = bm?.get(op.id);
        const pending = base ? local !== b : false;
        if (f === "reports" && op.k === "i" && op.v && !local && !b && seq > 0 && op.v.status === "pending")
          arrived.push({ number: Number(op.v.number) || 0, linkName: String(op.v.linkName ?? "") });
        const server: Obj | null = op.k === "i" ? op.v : mergeCable((pending ? b : (local ?? b)) ?? null, op.p);
        let next: Obj | null;
        if (!pending) next = server;
        else if (f === "cables" && local && server && b) {
          const d = cableDiff(b as unknown as Cable, local as unknown as Cable);
          next = d ? mergeCable(server, d) : server;
        } else next = local ?? null;
        if (next) {
          if (i !== undefined) arr[i] = next;
          else {
            ix.set(op.id, arr.length);
            arr.push(next);
          }
        } else if (i !== undefined) arr[i] = null;
        if (bm) {
          if (server) bm.set(op.id, server);
          else bm.delete(op.id);
        }
      } else if (op.k === "o") {
        if (!COLL.has(op.f)) continue;
        const arr = arrOf(op.f);
        const pos = new Map(op.ids.map((id, i) => [id, i]));
        const sorted = arr
          .map((x, i) => ({ x, i }))
          .sort((a, b) => (pos.get(a.x?.id ?? "") ?? 1e9 + a.i) - (pos.get(b.x?.id ?? "") ?? 1e9 + b.i))
          .map((e) => e.x);
        arr.length = 0;
        arr.push(...sorted);
        idx.set(op.f, new Map(sorted.map((x, i) => [x?.id ?? "", i])));
        syncedOrder.set(op.f, true);
      } else if (op.k === "f") {
        if (COLL.has(op.n) || SKIP.has(op.n)) continue;
        const local = pj[op.n];
        const pending = base ? local !== base.fields.get(op.n) : false;
        const v = op.v ?? undefined;
        if (!pending) fields.set(op.n, v);
        base?.fields.set(op.n, v);
      }
    }
    const finals = new Map<string, Obj[]>();
    for (const [f, a] of work) finals.set(f, a.filter((x): x is Obj => !!x));
    applying++;
    try {
      useStore.setState((s) => {
        const d = s.projects.find((x) => x.id === this.pid);
        if (!d) return;
        const dj = d as unknown as Json;
        for (const [f, a] of finals) dj[f] = a;
        for (const [k, v] of fields) {
          if (v === undefined) delete dj[k];
          else dj[k] = v;
        }
        if (d.cloud && seq > d.cloud.seq) d.cloud.seq = seq;
      });
    } finally {
      applying--;
    }
    if (base) {
      const p1 = findP(this.pid) as unknown as Json | undefined;
      for (const [f] of finals) {
        base.arrs.delete(f);
        if (f !== "cables" && syncedOrder.get(f) && p1) base.orders.set(f, orderOf((p1[f] as Obj[]) ?? []));
      }
      // values that were frozen by the store keep their identity, so the base still matches
      for (const [k, v] of fields) base.fields.set(k, v);
    }
    const role = this.cl?.role;
    if (arrived.length && (role === "owner" || role === "editor"))
      window.dispatchEvent(new CustomEvent("cablegrid-report", { detail: { pid: this.pid, reports: arrived } }));
  }

  setSeq(seq: number) {
    const cl = this.cl;
    if (!cl || seq <= cl.seq) return;
    applying++;
    try {
      setCloudMeta(this.pid, { seq });
    } finally {
      applying--;
    }
  }

  connect() {
    const cl = this.cl;
    if (!cl || cl.off || this.stopped || this.ws) return;
    const me = getMe();
    const url = new URL(`${API}${roomPath(this.pid, "/ws", cl.key, `&client=${encodeURIComponent(me.client)}&name=${encodeURIComponent(me.name)}`)}`, window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.reconnect();
      return;
    }
    this.ws = ws;
    let heard = Date.now();
    ws.onmessage = (e) => {
      heard = Date.now();
      if (e.data === "pong" || typeof e.data !== "string") return;
      let msg: { t: string; seq?: number; ops?: Op[]; from?: string; peers?: Peer[]; role?: CloudRole };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg.t === "hello") {
        this.retry = 0;
        this.status("live");
        void this.enqueue(async () => {
          await this.send();
          if ((msg.seq ?? 0) > (this.cl?.seq ?? 0)) await this.catchUp();
        });
      } else if (msg.t === "presence") setUi("peers", this.pid, msg.peers ?? []);
      else if (msg.t === "ops") {
        const seq = msg.seq ?? 0;
        const ops = msg.ops ?? [];
        void this.enqueue(async () => {
          const have = this.cl?.seq ?? 0;
          if (msg.from === "") {
            this.apply(ops, 0);
            return;
          }
          if (seq <= have) return;
          if (seq > have + 1) {
            await this.send();
            await this.catchUp();
            return;
          }
          if (msg.from === TAB) this.setSeq(seq);
          else this.apply(ops, seq);
        });
      }
    };
    ws.onopen = () => {
      clearInterval(this.ping);
      // a socket can die silently (laptop asleep, mobile network switch): no pong for a while → reconnect and catch up
      this.ping = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - heard > 70_000) {
          clearInterval(this.ping);
          ws.onclose = null;
          ws.close();
          if (this.ws === ws) this.ws = null;
          this.status("offline");
          this.reconnect();
          return;
        }
        ws.send("ping");
      }, 25_000);
    };
    ws.onclose = (e) => {
      clearInterval(this.ping);
      if (this.ws === ws) this.ws = null;
      if (this.stopped) return;
      if (e.code === 4003) return void this.lost("revoked");
      if (e.code === 4004) return void this.lost("deleted");
      this.status("offline");
      setUi("peers", this.pid, []);
      this.reconnect();
    };
  }

  reconnect() {
    clearTimeout(this.wsTimer);
    this.retry++;
    this.wsTimer = setTimeout(
      () => {
        // the link may have been revoked: a failed info call tells us
        const cl = this.cl;
        if (!cl) return;
        api(roomPath(this.pid, "/info", cl.key))
          .then(() => this.connect())
          .catch((e: unknown) => {
            if (e instanceof CloudError && (e.status === 403 || e.status === 410)) this.lost(e.status === 410 ? "deleted" : "revoked");
            else this.reconnect();
          });
      },
      Math.min(30_000, 800 * 2 ** Math.min(this.retry, 6)),
    );
  }

  reconnectNow() {
    if (this.stopped) return;
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      ws.close();
    }
    this.retry = 0;
    this.connect();
  }

  lost(reason: "revoked" | "deleted") {
    const p = findP(this.pid);
    this.stop();
    if (!p?.cloud) return;
    if (p.cloud.role === "owner") setCloudMeta(this.pid, { off: true });
    else {
      applying++;
      try {
        useStore.setState((s) => {
          s.projects = s.projects.filter((x) => x.id !== this.pid);
        });
      } finally {
        applying--;
      }
      lostHandler?.(p.name, reason);
    }
  }

  /** the tab is being hidden / closed: keep unsent changes */
  persistOutbox() {
    this.diff();
    if (!this.outbox.size) return;
    const ops = [...this.outbox.values()];
    void set(obKey(this.pid), ops).catch(() => undefined);
    const cl = this.cl;
    const body = JSON.stringify({ client: TAB, ops });
    if (cl && !cl.off && body.length < 60_000)
      try {
        void fetch(`${API}${roomPath(this.pid, "/ops", cl.key)}`, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } })
          .then((r) => {
            if (r.ok) {
              for (const op of ops) if (this.outbox.get(opKey(op)) === op) this.outbox.delete(opKey(op));
              void del(obKey(this.pid));
            }
          })
          .catch(() => undefined);
      } catch {
        /* ignore */
      }
  }

  rebase() {
    const p = findP(this.pid);
    if (p && this.base) this.base = baseOf(p);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.wsTimer);
    clearInterval(this.ping);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    setUi("status", this.pid, undefined);
    setUi("peers", this.pid, undefined);
    setUi("upload", this.pid, undefined);
  }
}

let lostHandler: ((name: string, reason: "revoked" | "deleted") => void) | null = null;
export const onCloudLost = (fn: typeof lostHandler) => {
  lostHandler = fn;
};

const ensureRooms = (projects: Project[]) => {
  for (const p of projects) {
    if (rooms.has(p.id) || p.cloud?.off) continue;
    const r = new Room(p.id);
    rooms.set(p.id, r);
    void r.boot();
  }
};

let started = false;
let hydrating = false;

/** Start syncing every project of this device (call once, after the store is hydrated). */
export const startCloud = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  useStore.persist.onHydrate(() => {
    hydrating = true;
  });
  useStore.persist.onFinishHydration(() => {
    hydrating = false;
    // another tab saved: it synced those changes itself
    for (const r of rooms.values()) {
      r.rebase();
      // the other tab may have saved an older state than the one this tab had: pull what is missing
      if (r.base && r.cl?.ready && !r.cl.off) void r.enqueue(() => r.catchUp());
    }
    ensureRooms(useStore.getState().projects);
  });
  ensureRooms(useStore.getState().projects);
  useStore.subscribe((s, prev) => {
    if (s.projects === prev.projects || hydrating) return;
    const now = new Map(s.projects.map((p) => [p.id, p]));
    for (const pp of prev.projects) {
      if (now.has(pp.id)) continue;
      rooms.get(pp.id)?.stop();
      rooms.delete(pp.id);
      // the owner deleted the project: remove it from the cloud too
      if (!applying && pp.cloud?.role === "owner" && !pp.cloud.off && pp.cloud.key)
        void fetch(`${API}${roomPath(pp.id, "", pp.cloud.key)}`, { method: "DELETE" }).catch(() => undefined);
    }
    ensureRooms(s.projects);
    if (applying) return;
    const before = new Map(prev.projects.map((p) => [p.id, p]));
    for (const p of s.projects) if (p !== before.get(p.id)) rooms.get(p.id)?.schedule();
  });
  const hide = () => {
    for (const r of rooms.values()) r.persistOutbox();
  };
  window.addEventListener("pagehide", hide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hide();
    else for (const r of rooms.values()) if (!r.ws) r.reconnectNow();
  });
  window.addEventListener("online", () => {
    for (const r of rooms.values()) {
      r.reconnectNow();
      r.schedule(100);
    }
  });
};

/* ───────── joining & sharing ───────── */

const DEFAULTS = {
  client: "",
  location: "",
  kind: "other",
  description: "",
  units: "m",
  idPattern: "",
  rfiSeq: 0,
  threadSeq: 0,
  reportSeq: 0,
  materials: [],
};

/** Download a shared project with a secret key (manager share link, crew or client link). */
export const joinProject = async (pid: string, key: string): Promise<Project> => {
  const existing = findP(pid);
  if (existing?.cloud && !existing.cloud.off && (existing.cloud.role === "owner" || existing.cloud.key === key)) return existing;
  const info = await api<{ role: CloudRole }>(roomPath(pid, "/info", key));
  const snap = await api<{ seq: number; items: Record<string, Obj[]>; fields: Json }>(roomPath(pid, "/all", key));
  const t = new Date().toISOString();
  const p = {
    ...DEFAULTS,
    name: "Project",
    createdAt: t,
    updatedAt: t,
    ...Object.fromEntries(COLLECTIONS.map((f) => [f, []])),
    ...snap.fields,
    ...snap.items,
    id: pid,
    cloud: { role: info.role, key, seq: snap.seq, ready: true },
  } as unknown as Project;
  if (existing) {
    // an old local copy that lost its cloud: replace it
    rooms.get(pid)?.stop();
    rooms.delete(pid);
  }
  applying++;
  try {
    useStore.setState((s) => {
      s.projects = s.projects.filter((x) => x.id !== pid);
      if (info.role === "editor" || info.role === "owner") s.projects.unshift(p);
      else s.projects.push(p);
    });
  } finally {
    applying--;
  }
  ensureRooms(useStore.getState().projects);
  return findP(pid)!;
};

export const joinByLink = async (token: string) => {
  const { pid } = await lookupToken(token);
  return joinProject(pid, token);
};

export const projectInfo = (p: Project) =>
  api<{ role: CloudRole; share?: string; name: string; peers: Peer[] }>(roomPath(p.id, "/info", p.cloud?.key ?? ""));

export const regenerateShare = (p: Project) => api<{ share: string }>(roomPath(p.id, "/share", p.cloud?.key ?? ""), { method: "POST" });

export const shareUrl = (pid: string, token: string) => `${window.location.origin}/join/${pid}/${token}`;

/** Change my display name and tell everyone online. */
export const renameMe = (name: string) => {
  setMyName(name);
  for (const r of rooms.values()) r.reconnectNow();
};

/** Upload pending changes right now (before sharing a link). */
export const syncNow = async (pid: string) => {
  const r = rooms.get(pid);
  if (!r) return;
  await r.flush();
  while (r.busy) await sleep(80);
};

export const canDelete = (p?: Project) => !p?.cloud || p.cloud.role === "owner" || !!p.cloud.off;
