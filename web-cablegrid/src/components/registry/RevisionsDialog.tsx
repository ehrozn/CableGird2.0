import { Download, GitCompareArrows, Loader2, Minus, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFmt, useT } from "@/lib/i18n";
import { natCmp } from "@/lib/ids";
import { loadRevision, useStore } from "@/lib/store";
import type { Project, RevisionData } from "@/lib/types";
import { cn } from "@/lib/utils";

const CURRENT = "__now";

const snapshotNow = (p: Project): RevisionData => {
  const columns: Record<string, string> = {};
  for (const s of p.sheets) for (const c of s.columns) columns[c.id] ??= c.name;
  const data: Record<string, Record<string, string>> = {};
  for (const c of p.cables) data[c.code] = c.values;
  return { data, columns };
};

interface Diff {
  added: string[];
  removed: string[];
  changed: { code: string; column: string; from: string; to: string }[];
}

export const diffRevisions = (a: RevisionData, b: RevisionData): Diff => {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Diff["changed"] = [];
  const name = (id: string) => b.columns[id] ?? a.columns[id] ?? id;
  for (const code of Object.keys(b.data)) {
    const va = a.data[code];
    if (!va) {
      added.push(code);
      continue;
    }
    const vb = b.data[code];
    const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
    for (const k of keys) {
      const x = (va[k] ?? "").trim();
      const y = (vb[k] ?? "").trim();
      if (x !== y) changed.push({ code, column: name(k), from: x, to: y });
    }
  }
  for (const code of Object.keys(a.data)) if (!b.data[code]) removed.push(code);
  added.sort(natCmp);
  removed.sort(natCmp);
  changed.sort((p, q) => natCmp(p.code, q.code) || p.column.localeCompare(q.column));
  return { added, removed, changed };
};

const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const RevisionsDialog = ({ p, open, onOpenChange }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const f = useFmt();
  const revs = p.revisions ?? [];
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(CURRENT);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"changed" | "added" | "removed">("changed");

  useEffect(() => {
    if (!open) return;
    setDiff(null);
    setFrom((x) => (x && revs.some((r) => r.id === x) ? x : (revs[0]?.id ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, revs.length]);

  const compare = async () => {
    if (!from) return;
    setBusy(true);
    try {
      const load = async (id: string) => (id === CURRENT ? snapshotNow(p) : await loadRevision(p.id, id));
      const [a, b] = await Promise.all([load(from), load(to)]);
      if (!a || !b) {
        toast.error(t("This revision's data is missing on this device."));
        return;
      }
      const d = diffRevisions(a, b);
      setDiff(d);
      setTab(d.changed.length ? "changed" : d.added.length ? "added" : "removed");
    } finally {
      setBusy(false);
    }
  };

  const label = (id: string) => (id === CURRENT ? t("Current data") : (revs.find((r) => r.id === id)?.name ?? ""));

  const download = () => {
    if (!diff) return;
    const lines = [["Change", "Cable ID", "Column", "From", "To"].join(",")];
    for (const c of diff.added) lines.push(["added", c, "", "", ""].map(csvCell).join(","));
    for (const c of diff.removed) lines.push(["removed", c, "", "", ""].map(csvCell).join(","));
    for (const c of diff.changed) lines.push(["changed", c.code, c.column, c.from, c.to].map(csvCell).join(","));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${p.name} — ${label(from)} vs ${label(to)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const fromOk = !!from && from !== to;
  const LIMIT = 500;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompareArrows className="h-5 w-5 text-brand" /> {t("Revisions")}
          </DialogTitle>
          <DialogDescription>{t("Freeze the registry as it is now (for example, “Rev B — issued for construction”) and compare any two moments.")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || saving) return;
            setSaving(true);
            try {
              const id = await useStore.getState().saveRevision(p.id, name);
              setFrom(id);
              setName("");
              toast.success(t("Revision saved"));
            } finally {
              setSaving(false);
            }
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Rev B — issued for construction")} />
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />} {t("Save revision")}
          </Button>
        </form>

        {revs.length > 0 && (
          <ul className="max-h-36 divide-y overflow-y-auto rounded-lg border scrollbar-thin">
            {revs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <span className="tnum text-xs text-sub">{t("{n} cables", { n: f.num(r.cables) })}</span>
                <span className="text-xs text-sub">{f.dateTime(r.at)}</span>
                <button
                  className="grid h-7 w-7 place-items-center rounded text-sub hover:bg-bad-soft hover:text-bad"
                  onClick={() => {
                    useStore.getState().deleteRevision(p.id, r.id);
                    if (from === r.id) setFrom("");
                    if (to === r.id) setTo(CURRENT);
                  }}
                  aria-label={t("Delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {revs.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-[#F5F7F3] p-3">
            <label className="min-w-40 flex-1 text-xs font-semibold text-sub">
              {t("From")}
              <NativeSelect className="mt-1 h-9" value={from} onChange={setFrom}>
                {revs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="min-w-40 flex-1 text-xs font-semibold text-sub">
              {t("To")}
              <NativeSelect className="mt-1 h-9" value={to} onChange={setTo}>
                <option value={CURRENT}>{t("Current data")}</option>
                {revs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button onClick={compare} disabled={!fromOk || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <GitCompareArrows />} {t("Compare")}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-sub">{t("No revisions yet. Save one before issuing drawings or handing the list to a crew.")}</p>
        )}

        {diff && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["changed", t("Changed cells"), diff.changed.length, "text-cat"],
                  ["added", t("Added cables"), diff.added.length, "text-ok"],
                  ["removed", t("Removed cables"), diff.removed.length, "text-bad"],
                ] as const
              ).map(([k, l, n, c]) => (
                <button key={k} onClick={() => setTab(k)} className={cn("rounded-full border px-3 py-1 text-sm", tab === k ? "border-ink bg-ink text-white" : "bg-white hover:border-ink/30")}>
                  {l} <span className={cn("tnum font-bold", tab !== k && c)}>{f.num(n)}</span>
                </button>
              ))}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={download} disabled={!diff.changed.length && !diff.added.length && !diff.removed.length}>
                <Download /> CSV
              </Button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border scrollbar-thin">
              {tab === "changed" ? (
                diff.changed.length ? (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-[#F5F7F3] text-left text-xs text-sub">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("Cable ID")}</th>
                        <th className="px-3 py-2 font-semibold">{t("Column")}</th>
                        <th className="px-3 py-2 font-semibold">{t("From")}</th>
                        <th className="px-3 py-2 font-semibold">{t("To")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {diff.changed.slice(0, LIMIT).map((c, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5 font-mono text-[13px]">{c.code}</td>
                          <td className="px-3 py-1.5">{c.column}</td>
                          <td className="px-3 py-1.5 text-sub line-through decoration-sub/40">{c.from || "∅"}</td>
                          <td className="px-3 py-1.5 font-semibold">{c.to || "∅"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="p-6 text-center text-sm text-sub">{t("No cell changes.")}</p>
                )
              ) : (
                (() => {
                  const list = tab === "added" ? diff.added : diff.removed;
                  return list.length ? (
                    <div className="flex flex-wrap gap-1.5 p-3">
                      {list.slice(0, LIMIT).map((c) => (
                        <span key={c} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[13px]", tab === "added" ? "bg-ok/10 text-ok" : "bg-bad-soft text-bad")}>
                          {tab === "added" ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="p-6 text-center text-sm text-sub">{t("Nothing here.")}</p>
                  );
                })()
              )}
            </div>
            {Math.max(diff.changed.length, diff.added.length, diff.removed.length) > LIMIT && <p className="text-xs text-sub">{t("Showing the first {n}. Download CSV for the full list.", { n: LIMIT })}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
