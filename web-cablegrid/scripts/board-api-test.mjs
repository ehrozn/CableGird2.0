// Server-side checks of the work board: claims, limits, races, roles, link off / replace.
// Usage: node scripts/board-api-test.mjs [backendUrl]
const BASE = (process.argv[2] ?? "https://20-twd29hc-backend.rork.app").replace(/\/$/, "");
const rnd = (n = 24) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
const pid = `test${rnd(10)}`;
const owner = rnd(32);
let fails = 0;
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const call = async (path, key, init = {}) => {
  const r = await fetch(`${BASE}/p/${pid}${path}${path.includes("?") ? "&" : "?"}key=${key}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  let body = null;
  try {
    body = await r.json();
  } catch {
    /* text */
  }
  return { status: r.status, body };
};
const ops = (key, list) => call("/ops", key, { method: "POST", body: JSON.stringify({ ops: list, client: "test" }) });
const task = (id, x) => ({ k: "i", f: "tasks", id, v: { id, title: id, description: "", assigneeIds: [], priority: "normal", status: "todo", cableCodes: [], comments: [], createdAt: new Date().toISOString(), ...x } });
const claim = (key, taskId, name, rid = rnd(12), linkId = "crewA") => call("/claim", key, { method: "POST", body: JSON.stringify({ taskId, linkId, name, rid }) });

const boardTok = rnd(24);
const takeTok = rnd(24);
const crewTok = rnd(24);

await call("/init", "x", { method: "POST", body: JSON.stringify({ key: owner }) });
await ops(owner, [
  { k: "i", f: "links", id: "crewA", v: { id: "crewA", type: "crew", name: "Crew A", token: crewTok, memberIds: [], active: true } },
  { k: "i", f: "links", id: "crewB", v: { id: "crewB", type: "crew", name: "Crew B", token: rnd(24), memberIds: [], active: false } },
  { k: "f", n: "board", v: { token: boardTok, takeToken: takeTok, active: true } },
  task("free2", { free: true, slots: 2 }),
  task("free1", { free: true, slots: 1 }),
  task("crewT", { crewLinkId: "crewA" }),
  task("blocked", { free: true, slots: 1, stop: { blocked: true, reason: "material", at: "", by: "" } }),
  task("done", { free: true, status: "done" }),
]);
await call("/blob/att-file1", owner, { method: "PUT", body: "data:text/plain;base64,aGk=" });

// roles
const b = await call("/board", boardTok);
ok("TV link reads the board", b.status === 200 && b.body.tasks.length === 5);
ok("TV link knows the QR token", b.body?.takeToken === takeTok);
ok("TV link cannot read the project", (await call("/all", boardTok)).status === 403);
ok("TV link cannot take tasks", (await claim(boardTok, "free2", "Ivan")).status === 403);
ok("TV link cannot write", (await ops(boardTok, [task("x", {})])).status === 403);
const tk = await call("/board", takeTok);
ok("QR page reads the board, no TV token", tk.status === 200 && !tk.body.takeToken);
ok("QR page cannot read the project", (await call("/all", takeTok)).status === 403);
ok("QR page opens task files", (await fetch(`${BASE}/p/${pid}/blob/att-file1?key=${takeTok}`)).status === 200);
ok("QR page cannot read other blobs", (await call("/blob/report-1", takeTok)).status === 403);

// claims
const rid = rnd(12);
const c1 = await claim(takeTok, "free2", "Ivan", rid);
ok("take a free task", c1.status === 200 && c1.body.task.claims.length === 1);
const c1b = await claim(takeTok, "free2", "Ivan", rid);
ok("repeat with same request id = same claim", c1b.status === 200 && c1b.body.task.claims.length === 1);
const c1c = await claim(takeTok, "free2", "ivan");
ok("same person again = no duplicate", c1c.status === 200 && c1c.body.task.claims.length === 1);
ok("second place", (await claim(takeTok, "free2", "Maria")).status === 200);
const full = await claim(takeTok, "free2", "Pedro");
ok("limit of places", full.status === 409 && full.body?.error === "full", JSON.stringify(full.body));
const race = await Promise.all(["A", "B", "C", "D", "E", "F"].map((n) => claim(takeTok, "free1", n)));
ok("race for the last place: exactly one wins", race.filter((r) => r.status === 200).length === 1, race.map((r) => r.status).join(","));
const crewT = await claim(takeTok, "crewT", "Ivan");
ok("crew task can't be taken by QR", crewT.status === 409 && crewT.body?.error === "not_free");
const bl = await claim(takeTok, "blocked", "Ivan");
ok("blocked task can't be taken", bl.status === 409 && bl.body?.error === "blocked");
const dn = await claim(takeTok, "done", "Ivan");
ok("done task can't be taken", dn.status === 409 && dn.body?.error === "done");
const off = await claim(takeTok, "free2", "Olga", rnd(12), "crewB");
ok("inactive crew can't take", off.status === 409 && off.body?.error === "crew");
ok("crew link can't use the QR claim", (await claim(crewTok, "free2", "X")).status === 403);
const note = await call("/note", takeTok, { method: "POST", body: JSON.stringify({ taskId: "free2", claimId: rid, text: "Cable tray missing", nid: "note12345" }) });
await call("/note", takeTok, { method: "POST", body: JSON.stringify({ taskId: "free2", claimId: rid, text: "Cable tray missing", nid: "note12345" }) });
const after = await call("/board", takeTok);
const t2 = after.body.tasks.find((t) => t.id === "free2");
ok("note added once", note.status === 200 && t2.log.filter((e) => e.kind === "note").length === 1);

// a manager edit made from an old copy must not drop claims
await ops(owner, [task("free2", { free: true, slots: 3, title: "renamed" })]);
const merged = (await call("/board", takeTok)).body.tasks.find((t) => t.id === "free2");
ok("manager edit keeps server claims", merged.claims?.length === 2 && merged.title === "renamed", `${merged.claims?.length}`);

// turn off / replace
await ops(owner, [{ k: "f", n: "board", v: { token: boardTok, takeToken: takeTok, active: false } }]);
ok("links off: TV 403", (await call("/board", boardTok)).status === 403);
ok("links off: QR 403", (await call("/board", takeTok)).status === 403);
const nb = rnd(24);
const nt = rnd(24);
await ops(owner, [{ k: "f", n: "board", v: { token: nb, takeToken: nt, active: true } }]);
ok("replaced: old TV link dead", (await call("/board", boardTok)).status === 403);
ok("replaced: new TV link works", (await call("/board", nb)).status === 200);
ok("replaced: new QR works", (await call("/board", nt)).status === 200);

await call("/", owner, { method: "DELETE" });
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
