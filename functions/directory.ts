import { DurableObject } from "cloudflare:workers";

/** token → project id, for the secret links (manager share link, crew & client links). */
export class Directory extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, pid TEXT NOT NULL)");
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sql = this.ctx.storage.sql;
    if (request.method === "GET" && url.pathname === "/get") {
      const row = sql.exec("SELECT pid FROM tokens WHERE token = ?", url.searchParams.get("token") ?? "").toArray()[0];
      return row ? Response.json({ pid: row.pid }) : Response.json({ error: "unknown link" }, { status: 404 });
    }
    if (request.method === "POST" && url.pathname === "/sync") {
      const body = (await request.json()) as { pid: string; put?: string[]; del?: string[] };
      for (const tok of body.del ?? []) sql.exec("DELETE FROM tokens WHERE token = ? AND pid = ?", tok, body.pid);
      for (const tok of body.put ?? []) sql.exec("INSERT OR REPLACE INTO tokens (token, pid) VALUES (?, ?)", tok, body.pid);
      return Response.json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/drop") {
      const body = (await request.json()) as { pid: string };
      sql.exec("DELETE FROM tokens WHERE pid = ?", body.pid);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  }
}
