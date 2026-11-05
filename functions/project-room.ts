import { DurableObject } from "cloudflare:workers";

/**
 * One CableGrid project in the cloud.
 *
 * Storage (SQLite):
 *  - items(f, id, v, seq)  — entities of collections (cables, sheets, tasks…); v NULL = deleted
 *  - fields(k, v, seq)     — plain project fields (name, materials, stageFlow…)
 *  - orders(f, ids, seq)   — order of a collection (not kept for cables)
 *  - tokens(link, token…)  — crew / client link tokens, mirrored from the "links" collection
 *  - blobs(k, part, v)     — registry revision snapshots (chunked)
 *  - meta(k, v)            — owner key, manager share token, seq counter
 *
 * Every accepted batch of ops gets the next seq; peers receive it over the
 * WebSocket and anyone who was offline catches up with GET /since?seq=N.
 */

type Env = { DO: Fetcher };
type Role = "owner" | "editor" | "crew" | "client" | "board" | "take";
/** read-only work board (TV) and the QR take page */
const VIEWER = new Set<Role>(["board", "take"]);
type Json = Record<string, unknown>;

type CablePatch = {
  set?: Json;
  values?: Record<string, string | null>;
  done?: Record<string, string | null>;
  hist?: { id: string }[];
};
type Op =
  | { k: "i"; f: string; id: string; v: Json | null }
  | { k: "c"; id: string; p: CablePatch }
  | { k: "f"; n: string; v: unknown }
  | { k: "o"; f: string; ids: string[] };

type Peer = { client: string; name: string; role: Role; at: number };

const MAX_ROW = 1_900_000;
const CHUNK = 900_000;
/** collections an invited manager may not delete from */
const EDITOR_NO_DELETE = new Set(["cables", "sheets", "books", "actions", "employees", "links"]);
/** what a crew / client link may write */
const EXTERNAL_ITEMS = new Set(["reports", "threads", "messages", "tasks", "activity", "issues", "rfis", "cables"]);
const EXTERNAL_FIELDS = new Set(["reportSeq", "threadSeq", "rfiSeq", "updatedAt"]);
/** numbered collections: two people sending at the same moment must not get the same number */
const NUMBERED: Record<string, string> = { reports: "reportSeq", rfis: "rfiSeq", threads: "threadSeq" };
const SEQ_FIELDS = new Set(Object.values(NUMBERED));
const LOG_PREFIX: Record<string, string> = { reports: "Report #", rfis: "RFI #", threads: "Conversation #" };

const rnd = (n = 24) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
};

const err = (status: number, error: string) => Response.json({ error }, { status });

type Claim = { id: string; empId?: string; name: string; linkId: string; linkName: string; at: string; endedAt?: string; outcome?: string; note?: string };
type Ev = { id: string; at: string };

/**
 * A device writes a whole task. Somebody may have taken it via the QR page
 * meanwhile (the writer's copy lacks that claim): keep every claim and history
 * line, an ended claim stays ended, and a task with people on it is not "to do".
 */
export const mergeTask = (cur: Json | null, inc: Json): { v: Json; changed: boolean } => {
  if (!cur) return { v: inc, changed: false };
  let changed = false;
  const cc = (cur.claims as Claim[] | undefined) ?? [];
  const ic = (inc.claims as Claim[] | undefined) ?? [];
  const have = new Set(ic.map((c) => c.id));
  const claims = ic.map((c) => {
    const o = cc.find((x) => x.id === c.id);
    if (o?.endedAt && !c.endedAt) {
      changed = true;
      return o;
    }
    return c;
  });
  const missing = cc.filter((c) => !have.has(c.id));
  if (missing.length) changed = true;
  const allClaims = [...claims, ...missing].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const cl = (cur.log as Ev[] | undefined) ?? [];
  const il = (inc.log as Ev[] | undefined) ?? [];
  const lhave = new Set(il.map((e) => e.id));
  const lmiss = cl.filter((e) => !lhave.has(e.id));
  if (lmiss.length) changed = true;
  const log = [...il, ...lmiss].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const v: Json = { ...inc };
  if (allClaims.length) v.claims = allClaims;
  if (log.length) v.log = log;
  const active = allClaims.some((c) => !c.endedAt);
  if (missing.some((c) => !c.endedAt) && v.status === "done") {
    v.status = "progress";
    delete v.completedAt;
    delete v.completedBy;
    changed = true;
  }
  if (active && v.status === "todo") {
    v.status = "progress";
    changed = true;
  }
  return { v, changed };
};

export const mergeCable = (cur: Json | null, p: CablePatch): Json => {
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
    const hist = ((c.history as { id: string }[]) ?? []).slice();
    const have = new Set(hist.map((h) => h.id));
    c.history = [...p.hist.filter((h) => !have.has(h.id)), ...hist];
  }
  return c;
};

export class ProjectRoom extends DurableObject<Env> {
  private seqCache: number | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = this.ctx.storage.sql;
    sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS items (f TEXT NOT NULL, id TEXT NOT NULL, v TEXT, seq INTEGER NOT NULL, PRIMARY KEY (f, id));
      CREATE INDEX IF NOT EXISTS items_seq ON items (seq);
      CREATE TABLE IF NOT EXISTS fields (k TEXT PRIMARY KEY, v TEXT, seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (f TEXT PRIMARY KEY, ids TEXT NOT NULL, seq INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS tokens (link TEXT PRIMARY KEY, token TEXT NOT NULL, type TEXT NOT NULL, active INTEGER NOT NULL, exp TEXT);
      CREATE TABLE IF NOT EXISTS blobs (k TEXT NOT NULL, part INTEGER NOT NULL, v TEXT NOT NULL, PRIMARY KEY (k, part));
    `);
  }

  private get pid() {
    return this.ctx.id.name ?? "";
  }

  private meta(k: string): string | null {
    const r = this.ctx.storage.sql.exec("SELECT v FROM meta WHERE k = ?", k).toArray()[0];
    return r ? (r.v as string) : null;
  }
  private setMeta(k: string, v: string) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)", k, v);
  }
  private get seq() {
    if (this.seqCache == null) this.seqCache = Number(this.meta("seq") ?? 0);
    return this.seqCache;
  }
  private bumpSeq() {
    const n = this.seq + 1;
    this.seqCache = n;
    this.setMeta("seq", String(n));
    return n;
  }

  private roleOf(key: string | null): Role | null {
    if (!key) return null;
    const owner = this.meta("owner");
    if (!owner) return null;
    if (key === owner) return "owner";
    if (key === this.meta("share")) return "editor";
    const r = this.ctx.storage.sql.exec("SELECT type, active, exp FROM tokens WHERE token = ?", key).toArray()[0];
    if (!r || !r.active) return null;
    if (r.exp && (r.exp as string) < new Date().toISOString().slice(0, 10)) return null;
    if (r.type === "board" || r.type === "take") return r.type;
    return r.type === "client" ? "client" : "crew";
  }

  private directory(body: Json) {
    const req = new Request(`https://internal/${body.drop ? "drop" : "sync"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Rork-DO-Class": "Directory", "X-Rork-DO-Id": "global" },
      body: JSON.stringify({ pid: this.pid, ...body }),
    });
    this.ctx.waitUntil(this.env.DO.fetch(req).catch((e: unknown) => console.warn("directory sync failed", e)));
  }

  private peers(): Peer[] {
    const out: Peer[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Peer | null;
      if (a && !VIEWER.has(a.role)) out.push(a);
    }
    return out;
  }
  private broadcast(msg: Json, except?: WebSocket) {
    const s = JSON.stringify(msg);
    const changed = JSON.stringify({ t: "changed", seq: msg.seq ?? this.seq });
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment() as Peer | null;
      // the TV and the QR page never receive project data over the socket — only "something changed"
      if (a && VIEWER.has(a.role)) {
        if (msg.t !== "ops") continue;
        try {
          ws.send(changed);
        } catch {
          /* closed */
        }
        continue;
      }
      try {
        ws.send(s);
      } catch {
        /* closed */
      }
    }
  }
  private sendPresence(except?: WebSocket) {
    const peers = this.peers().filter((p, i, a) => a.findIndex((x) => x.client === p.client) === i);
    this.broadcast({ t: "presence", peers }, except);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const key = url.searchParams.get("key");

    if (path === "/init" && request.method === "POST") {
      const body = (await request.json()) as { key?: string };
      if (!body.key || body.key.length < 16) return err(400, "bad key");
      const owner = this.meta("owner");
      if (owner && owner !== body.key) return err(409, "taken");
      if (!owner) {
        if (this.meta("deleted")) return err(410, "deleted");
        this.setMeta("owner", body.key);
        const share = rnd();
        this.setMeta("share", share);
        this.directory({ put: [share] });
      }
      return Response.json({ ok: true, role: "owner", share: this.meta("share"), seq: this.seq });
    }

    const role = this.roleOf(key);
    if (!role) return err(this.meta("deleted") ? 410 : 403, this.meta("deleted") ? "deleted" : "forbidden");

    if (path === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return err(426, "expected websocket");
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      const peer: Peer = {
        client: (url.searchParams.get("client") ?? rnd(8)).slice(0, 40),
        name: (url.searchParams.get("name") ?? "").slice(0, 60),
        role,
        at: Date.now(),
      };
      server.serializeAttachment(peer);
      server.send(JSON.stringify({ t: "hello", seq: this.seq, role }));
      if (!VIEWER.has(role)) this.sendPresence();
      return new Response(null, { status: 101, webSocket: client });
    }

    if (path === "/board" && request.method === "GET") return this.boardSnapshot(role);
    if (path === "/claim" && request.method === "POST") {
      if (role === "board" || role === "crew" || role === "client") return err(403, "forbidden");
      return this.claim((await request.json()) as Json);
    }
    if (path === "/note" && request.method === "POST") {
      if (role !== "take" && role !== "owner" && role !== "editor") return err(403, "forbidden");
      return this.note((await request.json()) as Json);
    }
    // task documents can be opened from the QR page
    const att = path.match(/^\/blob\/(att-[A-Za-z0-9_-]{1,80})$/);
    if (att && request.method === "GET" && role === "take") {
      const parts = this.ctx.storage.sql.exec("SELECT v FROM blobs WHERE k = ? ORDER BY part", att[1]).toArray();
      if (!parts.length) return err(404, "missing");
      return new Response(parts.map((r) => r.v as string).join(""), { headers: { "Content-Type": "text/plain" } });
    }
    // everything below is project data: never for the TV or the QR page
    if (VIEWER.has(role)) return err(403, "forbidden");

    if (path === "/info" && request.method === "GET") {
      const name = this.ctx.storage.sql.exec("SELECT v FROM fields WHERE k = 'name'").toArray()[0];
      return Response.json({
        role,
        seq: this.seq,
        name: name?.v ? JSON.parse(name.v as string) : "",
        share: role === "owner" ? this.meta("share") : undefined,
        peers: this.peers(),
      });
    }

    if (path === "/all" && request.method === "GET") return this.snapshot();

    if (path === "/since" && request.method === "GET") {
      const since = Number(url.searchParams.get("seq") ?? 0);
      return this.since(since);
    }

    if (path === "/ops" && request.method === "POST") {
      const body = (await request.json()) as { ops: Op[]; client?: string };
      return Response.json(this.applyOps(body.ops ?? [], role, body.client ?? ""));
    }

    if (path === "/share" && request.method === "POST") {
      if (role !== "owner") return err(403, "owner only");
      const old = this.meta("share");
      const share = rnd();
      this.setMeta("share", share);
      this.directory({ put: [share], del: old ? [old] : [] });
      // kick invited managers that used the old link
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Peer | null;
        if (a?.role === "editor") ws.close(4003, "revoked");
      }
      return Response.json({ share });
    }

    const b = path.match(/^\/blob\/([A-Za-z0-9_:.-]{1,120})$/);
    if (b) {
      const sql = this.ctx.storage.sql;
      if (request.method === "GET") {
        const parts = sql.exec("SELECT v FROM blobs WHERE k = ? ORDER BY part", b[1]).toArray();
        if (!parts.length) return err(404, "missing");
        return new Response(parts.map((r) => r.v as string).join(""), { headers: { "Content-Type": "application/json" } });
      }
      if (request.method === "PUT") {
        if (role === "crew" || role === "client") return err(403, "forbidden");
        const text = await request.text();
        sql.exec("DELETE FROM blobs WHERE k = ?", b[1]);
        for (let i = 0; i * CHUNK < text.length; i++) sql.exec("INSERT INTO blobs (k, part, v) VALUES (?, ?, ?)", b[1], i, text.slice(i * CHUNK, (i + 1) * CHUNK));
        return Response.json({ ok: true });
      }
      if (request.method === "DELETE") {
        if (role !== "owner") return err(403, "owner only");
        sql.exec("DELETE FROM blobs WHERE k = ?", b[1]);
        return Response.json({ ok: true });
      }
    }

    if (path === "/" && request.method === "DELETE") {
      if (role !== "owner") return err(403, "owner only");
      const sql = this.ctx.storage.sql;
      for (const tb of ["items", "fields", "orders", "tokens", "blobs", "meta"]) sql.exec(`DELETE FROM ${tb}`);
      this.seqCache = null;
      this.setMeta("deleted", "1");
      this.directory({ drop: true });
      for (const ws of this.ctx.getWebSockets()) ws.close(4004, "deleted");
      return Response.json({ ok: true });
    }

    return err(404, "not found");
  }

  private snapshot(): Response {
    const sql = this.ctx.storage.sql;
    const items: Record<string, Json[]> = {};
    const byId: Record<string, Map<string, Json>> = {};
    for (const r of sql.exec("SELECT f, id, v FROM items WHERE v IS NOT NULL ORDER BY rowid")) {
      const f = r.f as string;
      const v = JSON.parse(r.v as string) as Json;
      (items[f] ??= []).push(v);
      (byId[f] ??= new Map()).set(r.id as string, v);
    }
    // apply stored orders (cables keep insertion order)
    for (const r of sql.exec("SELECT f, ids FROM orders")) {
      const f = r.f as string;
      const m = byId[f];
      if (!m) continue;
      const ids = JSON.parse(r.ids as string) as string[];
      const out: Json[] = [];
      for (const id of ids) {
        const v = m.get(id);
        if (v) {
          out.push(v);
          m.delete(id);
        }
      }
      items[f] = [...out, ...m.values()];
    }
    const fields: Json = {};
    for (const r of sql.exec("SELECT k, v FROM fields WHERE v IS NOT NULL")) fields[r.k as string] = JSON.parse(r.v as string);
    return Response.json({ seq: this.seq, items, fields });
  }

  private since(since: number): Response {
    const sql = this.ctx.storage.sql;
    const ops: Op[] = [];
    for (const r of sql.exec("SELECT f, id, v FROM items WHERE seq > ? ORDER BY seq, rowid", since))
      ops.push({ k: "i", f: r.f as string, id: r.id as string, v: r.v == null ? null : (JSON.parse(r.v as string) as Json) });
    for (const r of sql.exec("SELECT k, v FROM fields WHERE seq > ?", since)) ops.push({ k: "f", n: r.k as string, v: r.v == null ? null : JSON.parse(r.v as string) });
    for (const r of sql.exec("SELECT f, ids FROM orders WHERE seq > ?", since)) ops.push({ k: "o", f: r.f as string, ids: JSON.parse(r.ids as string) as string[] });
    return Response.json({ seq: this.seq, ops });
  }

  private current(f: string, id: string): Json | null {
    const r = this.ctx.storage.sql.exec("SELECT v FROM items WHERE f = ? AND id = ?", f, id).toArray()[0];
    return r?.v ? (JSON.parse(r.v as string) as Json) : null;
  }

  private fieldNum(k: string): number {
    const r = this.ctx.storage.sql.exec("SELECT v FROM fields WHERE k = ?", k).toArray()[0];
    const n = r?.v ? Number(JSON.parse(r.v as string)) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  private trackLink(id: string, v: Json | null, dirPut: string[], dirDel: string[]) {
    const sql = this.ctx.storage.sql;
    const old = sql.exec("SELECT token FROM tokens WHERE link = ?", id).toArray()[0]?.token as string | undefined;
    if (!v || typeof v.token !== "string") {
      sql.exec("DELETE FROM tokens WHERE link = ?", id);
      if (old) dirDel.push(old);
      return;
    }
    sql.exec(
      "INSERT OR REPLACE INTO tokens (link, token, type, active, exp) VALUES (?, ?, ?, ?, ?)",
      id,
      v.token,
      v.type === "client" ? "client" : "crew",
      v.active === false ? 0 : 1,
      typeof v.expiresAt === "string" ? v.expiresAt : null,
    );
    if (old !== v.token) {
      if (old) dirDel.push(old);
      dirPut.push(v.token);
    }
  }

  /** TV / QR tokens live in the project field "board"; mirror them into the token table. */
  private trackBoard(v: Json | null, dirPut: string[], dirDel: string[]) {
    const sql = this.ctx.storage.sql;
    for (const [link, type, key] of [["__board", "board", "token"], ["__take", "take", "takeToken"]] as const) {
      const old = sql.exec("SELECT token FROM tokens WHERE link = ?", link).toArray()[0]?.token as string | undefined;
      const tok = v && typeof v[key] === "string" ? (v[key] as string) : null;
      if (!tok) {
        sql.exec("DELETE FROM tokens WHERE link = ?", link);
        if (old) dirDel.push(old);
        continue;
      }
      sql.exec("INSERT OR REPLACE INTO tokens (link, token, type, active, exp) VALUES (?, ?, ?, ?, NULL)", link, tok, type, v?.active === false ? 0 : 1);
      if (old !== tok) {
        if (old) dirDel.push(old);
        dirPut.push(tok);
      }
    }
    if (v?.active === false) {
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment() as Peer | null;
        if (a && VIEWER.has(a.role)) ws.close(4003, "revoked");
      }
    }
  }

  private items(f: string): Json[] {
    const out: Json[] = [];
    for (const r of this.ctx.storage.sql.exec("SELECT v FROM items WHERE f = ? AND v IS NOT NULL ORDER BY rowid", f)) out.push(JSON.parse(r.v as string) as Json);
    return out;
  }
  private field(k: string): unknown {
    const r = this.ctx.storage.sql.exec("SELECT v FROM fields WHERE k = ?", k).toArray()[0];
    return r?.v ? JSON.parse(r.v as string) : undefined;
  }

  /** What the TV and the QR page may see: tasks, crews (no tokens), people, open issues. */
  private boardSnapshot(role: Role): Response {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const crews = this.items("links")
      .filter((l) => l.type === "crew")
      .map((l) => ({
        id: l.id,
        name: l.name,
        memberIds: l.memberIds ?? [],
        active: l.active !== false && !(typeof l.expiresAt === "string" && l.expiresAt < today),
      }));
    const people = this.items("employees").map((e) => ({ id: e.id, name: e.name, crew: e.crew, active: e.active !== false }));
    const issues = this.items("issues")
      .filter((i) => i.status !== "resolved")
      .map((i) => ({ id: i.id, title: i.title, code: i.code, severity: i.severity, createdAt: i.createdAt, status: i.status }));
    const tasks = this.items("tasks");
    const order = this.ctx.storage.sql.exec("SELECT ids FROM orders WHERE f = 'tasks'").toArray()[0];
    if (order) {
      const ids = JSON.parse(order.ids as string) as string[];
      const pos = new Map(ids.map((id, i) => [id, i]));
      tasks.sort((a, b) => (pos.get(a.id as string) ?? 1e9) - (pos.get(b.id as string) ?? 1e9));
    }
    return Response.json({
      seq: this.seq,
      role,
      now: new Date().toISOString(),
      name: this.field("name") ?? "",
      cableStages: this.field("cableStages") ?? null,
      takeToken: role === "board" ? ((this.field("board") as Json | undefined)?.takeToken ?? null) : null,
      tasks,
      crews,
      people,
      issues,
      // announcements: only the ones turned on; the screen checks the dates in its own time zone
      notices: ((this.field("notices") as Json[] | undefined) ?? [])
        .filter((n) => n && n.active !== false && !(typeof n.until === "string" && n.until < yesterday))
        .slice(0, 40)
        .map((n) => ({
          id: n.id,
          kind: n.kind,
          title: typeof n.title === "string" ? n.title.slice(0, 160) : "",
          text: typeof n.text === "string" ? n.text.slice(0, 400) : undefined,
          from: n.from,
          until: n.until,
          active: true,
          createdAt: n.createdAt,
        })),
      schedules: (() => {
        const hm = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v : undefined);
        const list = this.field("schedules") as Json[] | undefined;
        const legacy = this.field("schedule") as Json | undefined;
        const src: Json[] = Array.isArray(list) ? list : legacy ? [{ ...legacy, id: legacy.id ?? "main" }] : [];
        return src.filter((s) => s && hm(s.start) && hm(s.end)).slice(0, 12).map((s) => ({
          id: s.id,
          name: typeof s.name === "string" ? s.name.slice(0, 40) : undefined,
          crewIds: Array.isArray(s.crewIds) ? (s.crewIds as unknown[]).filter((x) => typeof x === "string").slice(0, 40) : undefined,
          start: s.start,
          end: s.end,
          days: Array.isArray(s.days) ? (s.days as unknown[]).filter((d) => typeof d === "number" && d >= 0 && d <= 6) : [1, 2, 3, 4, 5],
          items: (Array.isArray(s.items) ? (s.items as Json[]) : [])
            .filter((x) => x && hm(x.start))
            .slice(0, 12)
            .map((x) => ({
              id: x.id,
              kind: x.kind,
              label: typeof x.label === "string" ? x.label.slice(0, 40) : undefined,
              start: x.start,
              end: hm(x.end),
            })),
        }));
      })(),
      // who to call: the manager chose to show these on the board
      contacts: ((this.field("contacts") as Json[] | undefined) ?? [])
        .filter((c) => c && typeof c.phone === "string" && c.phone.trim())
        .slice(0, 24)
        .map((c) => ({
          id: c.id,
          role: c.role,
          label: typeof c.label === "string" ? c.label.slice(0, 60) : undefined,
          name: typeof c.name === "string" ? c.name.slice(0, 80) : "",
          phone: (c.phone as string).slice(0, 40),
          note: typeof c.note === "string" ? c.note.slice(0, 120) : undefined,
        })),
    });
  }

  private writeTask(task: Json) {
    const seq = this.bumpSeq();
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO items (f, id, v, seq) VALUES ('tasks', ?, ?, ?)", task.id as string, JSON.stringify(task), seq);
    this.broadcast({ t: "ops", seq, from: "server", ops: [{ k: "i", f: "tasks", id: task.id, v: task }] });
    return seq;
  }

  /** QR page: one person takes a free task. Safe to repeat (same rid / same person = same claim). */
  private claim(body: Json): Response {
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const linkId = typeof body.linkId === "string" ? body.linkId : "";
    const rid = typeof body.rid === "string" && body.rid.length >= 6 ? body.rid.slice(0, 40) : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    const empId = typeof body.empId === "string" && body.empId ? body.empId : undefined;
    if (!taskId || !linkId || !rid || !name) return err(400, "bad request");
    const today = new Date().toISOString().slice(0, 10);
    const link = this.current("links", linkId);
    if (!link || link.type !== "crew" || link.active === false || (typeof link.expiresAt === "string" && link.expiresAt < today)) return err(409, "crew");
    const task = this.current("tasks", taskId);
    if (!task) return err(404, "missing");
    const claims = ((task.claims as Claim[] | undefined) ?? []).slice();
    const same = claims.find(
      (c) => c.id === rid || (!c.endedAt && c.linkId === linkId && (empId ? c.empId === empId : !c.empId && c.name.toLowerCase() === name.toLowerCase())),
    );
    if (same) return Response.json({ ok: true, claimId: same.id, seq: this.seq, task });
    if (task.status === "done") return err(409, "done");
    if (!task.free) return err(409, "not_free");
    if ((task.stop as Json | undefined)?.blocked) return err(409, "blocked");
    const slots = Math.max(1, Number(task.slots ?? 1) || 1);
    if (claims.filter((c) => !c.endedAt).length >= slots) return err(409, "full");
    const at = new Date().toISOString();
    const linkName = String(link.name ?? "");
    claims.push({ id: rid, empId, name, linkId, linkName, at });
    const log = ((task.log as Json[] | undefined) ?? []).slice();
    log.push({ id: rnd(10), at, by: name, kind: "claimed", text: `${name} · ${linkName}` });
    const next: Json = { ...task, claims, log, status: task.status === "todo" ? "progress" : task.status };
    const seq = this.writeTask(next);
    try {
      this.taskToCables(next, { id: rnd(10), at, kind: "task", by: name, employee: linkName, taskId, outcome: "taken", note: String(task.title ?? "").slice(0, 200) });
    } catch {
      // the claim itself is saved; the cable history line is a bonus
    }
    return Response.json({ ok: true, claimId: rid, seq, task: next });
  }

  /** A task was taken on the QR page: add a line to the history of each cable it lists. */
  private taskToCables(task: Json, ev: Json) {
    const codes = Array.isArray(task.cableCodes) ? (task.cableCodes as unknown[]).filter((x): x is string => typeof x === "string") : [];
    if (!codes.length) return;
    const norm = (c: string) => c.normalize("NFKC").toUpperCase().replace(/[^\p{L}\p{N}]+/gu, "") || c.trim().toUpperCase();
    const want = new Set(codes.slice(0, 500).map(norm));
    const sql = this.ctx.storage.sql;
    const ids: string[] = [];
    for (const row of sql.exec("SELECT id, json_extract(v, '$.code') AS code FROM items WHERE f = 'cables'"))
      if (typeof row.code === "string" && want.has(norm(row.code))) ids.push(row.id as string);
    if (!ids.length) return;
    const seq = this.bumpSeq();
    const ops: Op[] = [];
    for (const id of ids) {
      const cur = this.current("cables", id);
      if (!cur) continue;
      const p: CablePatch = { hist: [ev as { id: string }], set: { updatedAt: ev.at } };
      const text = JSON.stringify(mergeCable(cur, p));
      if (text.length > MAX_ROW) continue;
      sql.exec("INSERT OR REPLACE INTO items (f, id, v, seq) VALUES ('cables', ?, ?, ?)", id, text, seq);
      ops.push({ k: "c", id, p });
    }
    if (ops.length) this.broadcast({ t: "ops", seq, from: "server", ops });
  }

  /** QR page: a person adds a note to the task they took. */
  private note(body: Json): Response {
    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const claimId = typeof body.claimId === "string" ? body.claimId : "";
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
    const nid = typeof body.nid === "string" && body.nid.length >= 6 ? body.nid.slice(0, 40) : rnd(10);
    if (!taskId || !claimId || !text) return err(400, "bad request");
    const task = this.current("tasks", taskId);
    if (!task) return err(404, "missing");
    const c = ((task.claims as Claim[] | undefined) ?? []).find((x) => x.id === claimId);
    if (!c) return err(403, "not yours");
    const log = ((task.log as Json[] | undefined) ?? []).slice();
    if (log.some((e) => e.id === nid)) return Response.json({ ok: true, seq: this.seq });
    log.push({ id: nid, at: new Date().toISOString(), by: c.name, kind: "note", text });
    const seq = this.writeTask({ ...task, log });
    return Response.json({ ok: true, seq });
  }

  private applyOps(ops: Op[], role: Role, from: string) {
    const sql = this.ctx.storage.sql;
    const external = role === "crew" || role === "client";
    const accepted: Op[] = [];
    const fixes: Op[] = [];
    const dirPut: string[] = [];
    const dirDel: string[] = [];
    const renumbered: { prefix: string; from: number; to: number }[] = [];
    if (!ops.length) return { seq: this.seq, fixes };
    const seq = this.bumpSeq();
    const revert = (f: string, id: string) => {
      const cur = this.current(f, id);
      fixes.push({ k: "i", f, id, v: cur });
    };

    for (const op of ops) {
      if (!op || typeof op !== "object") continue;
      if (op.k === "i") {
        if (typeof op.f !== "string" || typeof op.id !== "string") continue;
        if (external && !EXTERNAL_ITEMS.has(op.f)) {
          revert(op.f, op.id);
          continue;
        }
        if (op.v === null) {
          const blocked = external || (role === "editor" && EDITOR_NO_DELETE.has(op.f));
          if (blocked) {
            revert(op.f, op.id);
            continue;
          }
          const exists = sql.exec("SELECT 1 FROM items WHERE f = ? AND id = ? AND v IS NOT NULL", op.f, op.id).toArray().length;
          if (!exists) continue;
          sql.exec("UPDATE items SET v = NULL, seq = ? WHERE f = ? AND id = ?", seq, op.f, op.id);
          if (op.f === "links") this.trackLink(op.id, null, dirPut, dirDel);
          accepted.push(op);
          continue;
        }
        const seqField = NUMBERED[op.f];
        if (seqField && typeof op.v.number === "number") {
          const isNew = !sql.exec("SELECT 1 FROM items WHERE f = ? AND id = ? AND v IS NOT NULL", op.f, op.id).toArray().length;
          if (isNew) {
            const taken = sql
              .exec("SELECT 1 FROM items WHERE f = ? AND id != ? AND v IS NOT NULL AND json_extract(v, '$.number') = ? LIMIT 1", op.f, op.id, op.v.number)
              .toArray().length;
            if (taken) {
              const max = Number(sql.exec("SELECT MAX(json_extract(v, '$.number')) AS m FROM items WHERE f = ? AND v IS NOT NULL", op.f).toArray()[0]?.m ?? 0);
              const fixed: Op = { k: "i", f: op.f, id: op.id, v: { ...op.v, number: max + 1 } };
              renumbered.push({ prefix: LOG_PREFIX[op.f], from: op.v.number as number, to: max + 1 });
              op.v = (fixed as { v: Json }).v;
              fixes.push(fixed);
            }
            const n = op.v.number as number;
            if (n > this.fieldNum(seqField)) {
              sql.exec("INSERT OR REPLACE INTO fields (k, v, seq) VALUES (?, ?, ?)", seqField, JSON.stringify(n), seq);
              if (taken) fixes.push({ k: "f", n: seqField, v: n });
              else accepted.push({ k: "f", n: seqField, v: n });
            }
          }
        }
        if (op.f === "activity" && renumbered.length && typeof op.v.text === "string") {
          // keep the activity line in step with the renumbered report
          let t = op.v.text;
          for (const x of renumbered) t = t.replace(`${x.prefix}${x.from} `, `${x.prefix}${x.to} `);
          if (t !== op.v.text) {
            op.v = { ...op.v, text: t };
            fixes.push({ k: "i", f: "activity", id: op.id, v: op.v });
          }
        }
        if (op.f === "tasks") {
          const m = mergeTask(this.current("tasks", op.id), op.v);
          if (m.changed) {
            op.v = m.v;
            fixes.push({ k: "i", f: "tasks", id: op.id, v: m.v });
          }
        }
        const text = JSON.stringify(op.v);
        if (text.length > MAX_ROW) continue;
        sql.exec("INSERT OR REPLACE INTO items (f, id, v, seq) VALUES (?, ?, ?, ?)", op.f, op.id, text, seq);
        if (op.f === "links") this.trackLink(op.id, op.v, dirPut, dirDel);
        accepted.push(op);
      } else if (op.k === "c") {
        if (typeof op.id !== "string" || !op.p) continue;
        const cur = this.current("cables", op.id);
        if (!cur && !(op.p.set && typeof op.p.set.code === "string")) {
          // edit of a cable somebody deleted meanwhile
          fixes.push({ k: "i", f: "cables", id: op.id, v: null });
          continue;
        }
        const merged = mergeCable(cur, op.p);
        const text = JSON.stringify(merged);
        if (text.length > MAX_ROW) continue;
        sql.exec("INSERT OR REPLACE INTO items (f, id, v, seq) VALUES ('cables', ?, ?, ?)", op.id, text, seq);
        accepted.push(op);
      } else if (op.k === "f") {
        if (typeof op.n !== "string" || op.n === "id" || op.n === "cloud") continue;
        if (external && !EXTERNAL_FIELDS.has(op.n)) continue;
        if (op.n === "board") this.trackBoard(op.v as Json | null, dirPut, dirDel);
        // counters only grow: a device that missed somebody's report must not roll them back
        if (SEQ_FIELDS.has(op.n)) {
          const cur = this.fieldNum(op.n);
          if (typeof op.v !== "number" || op.v <= cur) {
            if (typeof op.v !== "number" || op.v < cur) fixes.push({ k: "f", n: op.n, v: cur });
            continue;
          }
        }
        const text = op.v === null || op.v === undefined ? null : JSON.stringify(op.v);
        if (text && text.length > MAX_ROW) continue;
        sql.exec("INSERT OR REPLACE INTO fields (k, v, seq) VALUES (?, ?, ?)", op.n, text, seq);
        accepted.push(op);
      } else if (op.k === "o") {
        if (typeof op.f !== "string" || !Array.isArray(op.ids) || op.f === "cables") continue;
        if (external && !EXTERNAL_ITEMS.has(op.f)) continue;
        sql.exec("INSERT OR REPLACE INTO orders (f, ids, seq) VALUES (?, ?, ?)", op.f, JSON.stringify(op.ids), seq);
        accepted.push(op);
      }
    }
    if (dirPut.length || dirDel.length) this.directory({ put: dirPut, del: dirDel });
    if (accepted.length) this.broadcast({ t: "ops", seq, from, ops: accepted });
    if (fixes.length) this.broadcast({ t: "ops", seq, from: "", ops: fixes });
    return { seq, fixes };
  }

  override webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    if (text === "ping") ws.send("pong");
  }

  override webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, "bye");
    } catch {
      /* already closed */
    }
    this.sendPresence(ws);
  }

  override webSocketError(ws: WebSocket): void {
    this.sendPresence(ws);
  }
}
