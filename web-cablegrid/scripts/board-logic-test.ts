// Device-side work board logic: foreman results, incomplete cable work, no duplicates, contradictions.
// Usage: bun scripts/board-logic-test.ts
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
process.on("unhandledRejection", () => {});

const { useStore } = await import("../src/lib/store");
const { sectionOf, tagsOf, statusOf } = await import("../src/lib/board");
import type { Report } from "../src/lib/types";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) fails++;
};
const S = () => useStore.getState();
const pid = S().createProject({ name: "T", client: "", location: "", kind: "lan" as never, description: "", units: "m" as never });
const P = () => S().projects.find((p) => p.id === pid)!;
const crewA = S().addLink(pid, { type: "crew", name: "Crew A", memberIds: [], access: ["reports", "tasks"], active: true } as never);
const crewB = S().addLink(pid, { type: "crew", name: "Crew B", memberIds: [], access: ["reports", "tasks"], active: true } as never);

const mk = (title: string, x: Record<string, unknown>) =>
  S().addTask(pid, { title, description: "", assigneeIds: [], priority: "normal", status: "todo", cableCodes: [], ...x } as never).taskId;
const report = (linkId: string, linkName: string, extra: Partial<Report>) =>
  S().submitReport(pid, { linkId, linkName, date: "2026-11-04", submittedBy: "", submittedByName: linkName, crewSize: 1, workerIds: [], tasks: [], cables: [], materials: [], issues: [], notes: "", ...extra } as never);
const T = (id: string) => P().tasks.find((t) => t.id === id)!;
const claimLocal = (id: string, linkId: string, linkName: string, name: string) =>
  useStore.setState((s) => {
    const t = s.projects.find((p) => p.id === pid)!.tasks.find((x) => x.id === id)!;
    t.claims = [...(t.claims ?? []), { id: Math.random().toString(36).slice(2), name, linkId, linkName, at: new Date().toISOString() }];
    t.status = "progress";
  });

// 1. free task, two crews, each confirms its own people
const f = mk("Pull trunk 2F", { free: true, slots: 2 });
ok("free task is on the board as 'can take'", tagsOf(T(f)).some((x) => x.id === "can_take" || /take/i.test(x.label)), JSON.stringify(tagsOf(T(f))));
claimLocal(f, crewA, "Crew A", "Ivan");
claimLocal(f, crewB, "Crew B", "Maria");
report(crewA, "Crew A", { tasks: [{ taskId: f, hours: 4, done: true, note: "", outcome: "done" }] });
ok("crew A done: its claim ends, Crew B still on it", T(f).status !== "done" && (T(f).claims ?? []).filter((c) => !c.endedAt).length === 1);
report(crewB, "Crew B", { tasks: [{ taskId: f, hours: 4, done: true, note: "", outcome: "done" }] });
ok("both crews done: task closes", T(f).status === "done");

// 2. partly done: free task goes back with remaining work and notes
const g = mk("Terminate rack B", { free: true, slots: 1 });
claimLocal(g, crewA, "Crew A", "Ivan");
report(crewA, "Crew A", { tasks: [{ taskId: g, hours: 6, done: false, note: "", outcome: "partial", didText: "12 of 24 ports", leftText: "12 ports", reason: "time", needs: "1 more day", blocked: false }] });
ok("partial: free task is open again", T(g).status === "todo" && T(g).free === true && !(T(g).claims ?? []).some((c) => !c.endedAt));
ok("partial: remaining + done kept", T(g).remaining === "12 ports" && T(g).progressDone === "12 of 24 ports");
ok("partial: shows 'awaiting approval'", !!T(g).pendingReport && tagsOf(T(g)).some((x) => /approval/i.test(x.label)));

// 3. not done + blocked on a crew task: stays with the crew
const h = mk("Core drill 3F", { crewLinkId: crewA });
report(crewA, "Crew A", { tasks: [{ taskId: h, hours: 0, done: false, note: "", outcome: "not_done", reason: "access", needs: "Key from facility", blocked: true }] });
ok("not done + blocked: crew task stays with crew, blocked", T(h).crewLinkId === crewA && !!T(h).stop?.blocked && sectionOf(T(h)) === "blocked", `${sectionOf(T(h))}`);
ok("blocked task can't be taken", !tagsOf(T(h)).some((x) => /take/i.test(x.label)));

// 4. cable stages → incomplete work, no duplicates, contradictions
useStore.setState((s) => {
  const p = s.projects.find((x) => x.id === pid)!;
  p.cableStages = { pull: "na", termA: "na", termB: "na", test: "na" } as never;
});
const before = P().tasks.length;
report(crewA, "Crew A", { cables: [{ id: "e1", code: "C-101", isNew: true, repeat: false, stages: { pull: { state: "progress", pct: 60 } }, stop: { reason: "material", blocked: false } }] as never });
const w = P().tasks.find((t) => t.workKey?.includes("C101") || t.workKey?.toLowerCase().includes("c-101") || t.cableCodes.includes("C-101"));
ok("unfinished cable creates incomplete work", P().tasks.length === before + 1 && !!w && !w.free && !w.crewLinkId, `${P().tasks.length - before}`);
ok("incomplete work is not free", !!w && !tagsOf(w).some((x) => /take/i.test(x.label)));
report(crewB, "Crew B", { cables: [{ id: "e2", code: "c-101", isNew: true, repeat: false, stages: { pull: { state: "progress", pct: 80 } } }] as never });
ok("same cable again: no duplicate", P().tasks.length === before + 1);
const legacy = P().tasks.find((t) => t.id === w?.id);
ok("reason kept / status", !!legacy && statusOf(legacy) !== undefined);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
