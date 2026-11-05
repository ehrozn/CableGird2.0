import { Asterisk, ChevronDown, Columns3, Fingerprint, Flag, Link2, Lock, Sigma } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { formulaError } from "@/lib/auto";
import type { Column, ColumnType, Project, Sheet as RSheet } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ColumnRow, SuggestionChips } from "./ColumnDraftEditor";

const Toggle = ({ on, onClick, icon, label, title }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string; title: string }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    title={title}
    onClick={onClick}
    className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition", on ? "border-ink bg-ink text-white" : "bg-white text-sub hover:text-ink")}
  >
    {icon}
    {label}
  </button>
);

/** Checks, read-only and formula of one column. */
const ColumnExtras = ({ p, sheet, col }: { p: Project; sheet: RSheet; col: Column }) => {
  const t = useT();
  const { updateColumn } = useStore.getState();
  const [open, setOpen] = useState(!!col.formula);
  const [f, setF] = useState(col.formula ?? "");
  useEffect(() => setF(col.formula ?? ""), [col.formula]);
  const err = f.trim() ? formulaError(f) : null;
  const names = [...new Set(p.sheets.flatMap((s) => s.columns).filter((c) => c.id !== col.id).map((c) => c.name))];
  const commit = () => {
    if (err) return;
    const v = f.trim() || undefined;
    if (v !== col.formula) updateColumn(p.id, sheet.id, col.id, { formula: v });
  };
  const flags = [col.required && t("Required"), col.unique && t("Unique"), col.locked && t("Read-only"), col.formula && t("Formula")].filter(Boolean);
  return (
    <div className="pl-9">
      <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-sub hover:text-ink">
        <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
        {flags.length ? flags.join(" · ") : t("Checks and formula")}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-lg border bg-muted/40 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            <Toggle on={!!col.required} onClick={() => updateColumn(p.id, sheet.id, col.id, { required: !col.required || undefined })} icon={<Asterisk className="h-3 w-3" />} label={t("Required")} title={t("Data checks flag cables with an empty value.")} />
            <Toggle on={!!col.unique} onClick={() => updateColumn(p.id, sheet.id, col.id, { unique: !col.unique || undefined })} icon={<Fingerprint className="h-3 w-3" />} label={t("Unique")} title={t("Data checks flag repeated values, e.g. the same panel port twice.")} />
            <Toggle on={!!col.locked} onClick={() => updateColumn(p.id, sheet.id, col.id, { locked: !col.locked || undefined })} icon={<Lock className="h-3 w-3" />} label={t("Read-only here")} title={t("Values can be changed only on other sheets or by rules.")} />
          </div>
          {!col.progress && (
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sub">
                <Sigma className="h-3 w-3" /> {t("Formula")}
              </label>
              <input
                value={f}
                onChange={(e) => setF(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && commit()}
                placeholder='ROUND({Length} * 1.1, 0)  ·  {A-end} & " → " & {B-end}'
                className={cn("h-9 w-full rounded-md border bg-white px-2 font-mono text-[12.5px] outline-none focus:border-brand", err && "border-bad")}
              />
              {err ? (
                <div className="mt-1 text-[11px] text-bad">{t(err)}</div>
              ) : (
                <div className="mt-1 text-[11px] text-sub">{t("Leave empty for a normal column. A formula column is calculated and read-only.")}</div>
              )}
              {names.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {names.slice(0, 24).map((n) => (
                    <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setF((x) => `${x}{${n}}`)} className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px] text-ink hover:border-brand">
                      {`{${n}}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ColumnManager = ({
  p,
  sheet,
  open,
  onOpenChange,
}: {
  p: Project;
  sheet: RSheet;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) => {
  const t = useT();
  const { addColumn, updateColumn, deleteColumn, moveColumn } = useStore.getState();
  const sharedIn = (colId: string) => p.sheets.filter((s) => s.id !== sheet.id && s.columns.some((c) => c.id === colId)).map((s) => s.name);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Columns3 className="h-5 w-5 text-brand" /> {t("Columns of “{name}”", { name: sheet.name })}
          </SheetTitle>
          <SheetDescription>
            {t("Changes apply instantly. Columns with the same name on several sheets are one shared column — values stay in sync.")}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-3">
          {sheet.columns.map((c, i) => {
            const shared = sharedIn(c.id);
            return (
              <div key={c.id}>
                <ColumnRow
                  index={i}
                  col={c}
                  onChange={(patch) =>
                    updateColumn(p.id, sheet.id, c.id, {
                      ...patch,
                      type: (patch.type as ColumnType | undefined) ?? c.type,
                      options: patch.options ? patch.options.map((o) => o) : c.options,
                    })
                  }
                  onUp={i > 0 ? () => moveColumn(p.id, sheet.id, c.id, -1) : undefined}
                  onDown={i < sheet.columns.length - 1 ? () => moveColumn(p.id, sheet.id, c.id, 1) : undefined}
                  onDelete={() => {
                    const msg = shared.length
                      ? t("Remove column “{name}” from this sheet? Values stay on the other sheets.", { name: c.name })
                      : t("Delete column “{name}” and all its values?", { name: c.name });
                    if (confirm(msg)) deleteColumn(p.id, sheet.id, c.id);
                  }}
                />
                <ColumnExtras p={p} sheet={sheet} col={c} />
                {shared.length > 0 && (
                  <div className="mt-1 flex items-center gap-1 pl-9 text-[11px] text-cat">
                    <Link2 className="h-3 w-3" /> {t("Shared with: {s}", { s: shared.join(", ") })}
                  </div>
                )}
              </div>
            );
          })}
          <Button variant="outline" className="w-full border-dashed" onClick={() => addColumn(p.id, sheet.id, { name: t("New column"), type: "text" })}>
            + {t("Add column")}
          </Button>

          <div className="flex items-start gap-2 rounded-lg border border-cat/30 bg-cat-soft/40 p-3 text-xs text-sub">
            <Flag className="mt-0.5 h-4 w-4 shrink-0 text-cat" />
            <span>{t("Turn on “Progress” for columns that track work (e.g. Pulled, Terminated, Tested): crews will see them in their reports.")} {t("The column keeps its type — text, list, number, date or checkbox. Crews can edit only progress columns; other changes go through an RFI.")}</span>
          </div>

          <SuggestionChips
            kind={p.kind}
            existing={sheet.columns.map((c) => c.name)}
            onAdd={(c) => addColumn(p.id, sheet.id, { ...c })}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
