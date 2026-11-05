import { Plus, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { previewRule, RULE_OPS } from "@/lib/auto";
import { useFmt, useT } from "@/lib/i18n";
import { uid } from "@/lib/ids";
import { useStore } from "@/lib/store";
import type { Column, Project, Rule } from "@/lib/types";
import { cn } from "@/lib/utils";

const blank = (name: string): Rule => ({
  id: uid(),
  name,
  enabled: true,
  match: "all",
  when: [{ field: "__code", op: "ends", value: "" }],
  then: [{ colId: "", value: "" }],
  overwrite: false,
});

const Preview = ({ p, rule }: { p: Project; rule: Rule }) => {
  const t = useT();
  const f = useFmt();
  const [r, setR] = useState<{ matches: number; changes: number } | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setR(previewRule(p, rule)), 250);
    return () => clearTimeout(h);
  }, [p, rule]);
  if (!r) return null;
  return (
    <span className="text-xs text-sub">
      {t("Matches {n} cables", { n: f.num(r.matches) })} · <span className={cn(r.changes && "font-semibold text-brand-deep")}>{t("{n} would change", { n: f.num(r.changes) })}</span>
    </span>
  );
};

export const RulesDialog = ({ p, open, onOpenChange }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void }) => {
  const t = useT();
  const [rules, setRules] = useState<Rule[]>([]);
  useEffect(() => {
    if (open) setRules(p.rules?.length ? structuredClone(p.rules) : [blank(t("Rule {n}", { n: 1 }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cols = useMemo(() => {
    const m = new Map<string, Column>();
    for (const s of p.sheets) for (const c of s.columns) if (!m.has(c.id)) m.set(c.id, c);
    return [...m.values()];
  }, [p.sheets]);
  const targets = cols.filter((c) => !c.formula);

  const upd = (i: number, patch: Partial<Rule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const clean = () =>
    rules
      .map((r) => ({ ...r, name: r.name.trim() || t("Rule"), when: r.when.filter((w) => w.field), then: r.then.filter((s) => s.colId) }))
      .filter((r) => r.when.length && r.then.length);

  const save = (apply: boolean) => {
    const st = useStore.getState();
    st.setRules(p.id, clean());
    if (apply) {
      const n = st.applyAutomation(p.id);
      toast.success(t("Rules applied: {n} cables changed", { n }));
    } else toast.success(t("Rules saved"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-brand" /> {t("Rules")}
          </DialogTitle>
          <DialogDescription>
            {t("If a cable matches the conditions, columns get values automatically — for new cables, imports and edits.")} {t("Use a|b for “any of”, {ID} or {Column} to insert values.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {rules.map((r, i) => (
            <div key={r.id} className={cn("rounded-xl border bg-white p-3", !r.enabled && "opacity-60")}>
              <div className="flex items-center gap-2">
                <Switch checked={r.enabled} onCheckedChange={(v) => upd(i, { enabled: v })} aria-label={t("Enabled")} />
                <Input className="h-9 flex-1 font-semibold" value={r.name} onChange={(e) => upd(i, { name: e.target.value })} placeholder={t("Rule name")} />
                <Button variant="ghost" size="icon" className="h-9 w-9 text-bad hover:text-bad" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label={t("Delete")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sub">
                {t("If")}
                {r.when.length > 1 && (
                  <NativeSelect className="h-7 w-auto px-2 text-xs normal-case" value={r.match} onChange={(v) => upd(i, { match: v as Rule["match"] })}>
                    <option value="all">{t("all conditions")}</option>
                    <option value="any">{t("any condition")}</option>
                  </NativeSelect>
                )}
              </div>
              <div className="mt-1.5 space-y-1.5">
                {r.when.map((w, k) => {
                  const needs = RULE_OPS.find((o) => o.op === w.op)?.needsValue ?? true;
                  const setW = (patch: Partial<typeof w>) => upd(i, { when: r.when.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                  return (
                    <div key={k} className="flex flex-wrap items-center gap-1.5">
                      <NativeSelect className="h-9 w-44" value={w.field} onChange={(v) => setW({ field: v })}>
                        <option value="__code">{t("Cable ID")}</option>
                        {cols.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </NativeSelect>
                      <NativeSelect className="h-9 w-44" value={w.op} onChange={(v) => setW({ op: v as typeof w.op })}>
                        {RULE_OPS.map((o) => (
                          <option key={o.op} value={o.op}>
                            {t(o.label)}
                          </option>
                        ))}
                      </NativeSelect>
                      {needs && <Input className="h-9 min-w-[120px] flex-1 font-mono text-[13px]" value={w.value} onChange={(e) => setW({ value: e.target.value })} placeholder={w.op === "regex" ? "^FO-\\d+" : "-F|-FO"} />}
                      {r.when.length > 1 && (
                        <button className="grid h-9 w-8 place-items-center text-sub hover:text-bad" onClick={() => upd(i, { when: r.when.filter((_, j) => j !== k) })} aria-label={t("Remove")}>
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button className="text-xs font-semibold text-cat hover:underline" onClick={() => upd(i, { when: [...r.when, { field: "__code", op: "contains", value: "" }] })}>
                  + {t("Condition")}
                </button>
              </div>

              <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-sub">{t("Then set")}</div>
              <div className="mt-1.5 space-y-1.5">
                {r.then.map((s, k) => {
                  const col = targets.find((c) => c.id === s.colId);
                  const setT = (patch: Partial<typeof s>) => upd(i, { then: r.then.map((x, j) => (j === k ? { ...x, ...patch } : x)) });
                  return (
                    <div key={k} className="flex flex-wrap items-center gap-1.5">
                      <NativeSelect className="h-9 w-44" value={s.colId} onChange={(v) => setT({ colId: v })}>
                        <option value="">{t("Column…")}</option>
                        {targets.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </NativeSelect>
                      <span className="text-sub">=</span>
                      {col?.type === "select" ? (
                        <NativeSelect className="h-9 min-w-[120px] flex-1" value={s.value} onChange={(v) => setT({ value: v })}>
                          <option value="">—</option>
                          {(col.options ?? []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Input className="h-9 min-w-[120px] flex-1" value={s.value} onChange={(e) => setT({ value: e.target.value })} placeholder={col?.type === "checkbox" ? "1" : t("Value")} />
                      )}
                      {r.then.length > 1 && (
                        <button className="grid h-9 w-8 place-items-center text-sub hover:text-bad" onClick={() => upd(i, { then: r.then.filter((_, j) => j !== k) })} aria-label={t("Remove")}>
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button className="text-xs font-semibold text-cat hover:underline" onClick={() => upd(i, { then: [...r.then, { colId: "", value: "" }] })}>
                  + {t("Value")}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input type="checkbox" className="accent-[#FF5A1F]" checked={r.overwrite} onChange={(e) => upd(i, { overwrite: e.target.checked })} />
                  {t("Overwrite filled values")}
                </label>
                <Preview p={p} rule={r} />
              </div>
            </div>
          ))}
          <Button variant="outline" className="w-full border-dashed" onClick={() => setRules([...rules, blank(t("Rule {n}", { n: rules.length + 1 }))])}>
            <Plus /> {t("Add rule")}
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button variant="outline" onClick={() => save(false)}>
            {t("Save")}
          </Button>
          <Button onClick={() => save(true)}>{t("Save and apply to existing")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
