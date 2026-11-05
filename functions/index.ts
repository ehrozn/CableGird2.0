// CableGrid cloud backend: one ProjectRoom Durable Object per project
// (SQLite + live WebSocket peers) and a global Directory that maps the
// secret link tokens (manager share link, crew & client links) to a project.

export { ProjectRoom } from "./project-room";
export { Directory } from "./directory";

type Env = { DO: Fetcher };

const toDO = (request: Request, url: string, cls: string, id: string) => {
  const wrapped = new Request(url, request);
  wrapped.headers.set("X-Rork-DO-Class", cls);
  wrapped.headers.set("X-Rork-DO-Id", id);
  return wrapped;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/~api/, "");

    if (path === "/ping") return Response.json({ ok: true, now: new Date().toISOString() });

    // /t/:token → which project does a secret link belong to
    const t = path.match(/^\/t\/([A-Za-z0-9_-]{6,80})$/);
    if (t && request.method === "GET") {
      const u = new URL(url);
      u.pathname = "/get";
      u.search = `?token=${encodeURIComponent(t[1])}`;
      return env.DO.fetch(toDO(request, u.toString(), "Directory", "global"));
    }

    // /p/:pid/<action...> → the project's room
    const m = path.match(/^\/p\/([A-Za-z0-9_-]{4,64})(\/.*)?$/);
    if (m) {
      const u = new URL(url);
      u.pathname = m[2] || "/";
      return env.DO.fetch(toDO(request, u.toString(), "ProjectRoom", m[1]));
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
