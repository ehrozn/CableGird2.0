import { ArrowDown, ArrowUp, Flag, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n";
import type { ColumnType, ProjectKind } from "@/lib/types";
import { cn } from "@/lib/utils";

import { type ColDraft, suggestionsFor } from "./suggestions";

export const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  select: "Dropdown list",
  date: "Date",
  checkbox: "Checkbox",
};

/** Toggle that marks a column as a progress column. */
export const ProgressToggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => {
  const t = useT();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      title={t("Progress column: crews fill it in their reports; a filled value counts as done.")}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition",
        on ? "border-cat bg-cat text-white" : "bg-white text-sub hover:border-cat hover:text-cat",
      )}
    >
      <Flag className="h-3.5 w-3.5" />
      {t("Progress")}
    </button>
  );
};

export const ColumnRow = ({
  col,
  onChange,
  onUp,
  onDown,
  onDelete,
  index,
}: {
  col: ColDraft;
  onChange: (c: Partial<ColDraft>) => void;
  onUp?: () => void;
  onDown?: () => void;
  onDelete: () => void;
  index: number;
}) => {
  const t = useT();
  return (
    <div className={cn("rounded-lg border bg-white p-2.5", col.progress && "border-cat/40 bg-cat-soft/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid w-6 place-items-center font-mono text-xs text-sub">{index + 1}</span>
        <Input className="h-9 min-w-[140px] flex-1" value={col.name} placeholder={t("Column name")} onChange={(e) => onChange({ name: e.target.value })} />
        <NativeSelect className="h-9 w-[150px]" value={col.type} onChange={(v) => onChange({ type: v as ColumnType })}>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {t(v)}
            </option>
          ))}
        </NativeSelect>
        <ProgressToggle on={!!col.progress} onChange={(v) => onChange({ progress: v })} />
        <div className="flex">
          <Button type="button" size="icon" variant="ghost" className="h-9 w-8" onClick={onUp} disabled={!onUp} aria-label={t("Move up")}>
            <ArrowUp />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-8" onClick={onDown} disabled={!onDown} aria-label={t("Move down")}>
            <ArrowDown />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-8 text-bad hover:text-bad" onClick={onDelete} aria-label={t("Delete")}>
            <Trash2 />
          </Button>
        </div>
      </div>
      {col.type === "select" && (
        <div className="mt-2 pl-8">
          <Input
            className="h-9"
            value={(col.options ?? []).join(", ")}
            placeholder={t("Options, separated by commas")}
            onChange={(e) => onChange({ options: e.target.value.split(",").map((x) => x.trimStart()) })}
          />
        </div>
      )}
    </div>
  );
};

const Chip = ({ label, used, stage, onClick }: { label: string; used: boolean; stage?: boolean; onClick: () => void }) => (
  <button
    type="button"
    disabled={used}
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1 rounded-full border bg-white px-2.5 py-1 text-xs font-medium text-ink transition hover:border-brand hover:text-brand-deep",
      stage && "border-cat/40 text-cat hover:border-cat hover:text-cat",
      used && "cursor-default opacity-40 hover:border-border hover:text-ink",
    )}
  >
    {stage ? <Flag className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
    {label}
  </button>
);

export const SuggestionChips = ({
  kind,
  existing,
  onAdd,
}: {
  kind: ProjectKind;
  existing: string[];
  onAdd: (c: ColDraft) => void;
}) => {
  const t = useT();
  const [all, setAll] = useState(false);
  const list = suggestionsFor(kind);
  const shown = all ? list : list.slice(0, 12);
  const lower = existing.map((x) => x.toLowerCase());
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-sub">{t("Quick add (optional)")}</div>
      <div>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((c) => {
            const name = t(c.name);
            return <Chip key={c.name} label={name} used={lower.includes(name.toLowerCase())} onClick={() => onAdd({ ...c, name, options: c.options?.map((o) => t(o)) })} />;
          })}
          {!all && (
            <button type="button" onClick={() => setAll(true)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-cat hover:underline">
              {t("More…")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ColumnDraftEditor = ({
  kind,
  cols,
  setCols,
  shared = [],
}: {
  kind: ProjectKind;
  cols: ColDraft[];
  setCols: (c: ColDraft[]) => void;
  shared?: ColDraft[];
}) => {
  const t = useT();
  const move = (i: number, d: number) => {
    const n = [...cols];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x);
    setCols(n);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/50 px-3 py-2 text-sm">
        <span className="w-6 text-center font-mono text-xs text-sub">ID</span>
        <span className="font-semibold text-ink">{t("Cable ID")}</span>
        <span className="text-xs text-sub">— {t("always included, must be unique")}</span>
      </div>
      {cols.map((c, i) => (
        <ColumnRow
          key={i}
          index={i}
          col={c}
          onChange={(patch) => setCols(cols.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
          onUp={i > 0 ? () => move(i, -1) : undefined}
          onDown={i < cols.length - 1 ? () => move(i, 1) : undefined}
          onDelete={() => setCols(cols.filter((_, j) => j !== i))}
        />
      ))}
      <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setCols([...cols, { name: "", type: "text" }])}>
        <Plus /> {t("Add column")}
      </Button>
      {shared.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">{t("From other sheets (shared)")}</div>
          <div className="flex flex-wrap gap-1.5">
            {shared.map((c) => (
              <Chip
                key={c.name}
                label={c.name}
                stage={!!c.progress}
                used={cols.some((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase())}
                onClick={() => setCols([...cols, { ...c }])}
              />
            ))}
          </div>
        </div>
      )}
      <SuggestionChips kind={kind} existing={cols.map((c) => c.name)} onAdd={(c) => setCols([...cols, c])} />
      <p className="text-xs text-sub">
        {t("Turn on “Progress” for columns that track work (e.g. Pulled, Terminated, Tested): crews will see them in their reports.")}{" "}
        {t("A column with the same name as on another sheet becomes the same column — its values stay in sync on every sheet.")}
      </p>
    </div>
  );
};
