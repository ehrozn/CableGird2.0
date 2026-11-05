import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type Problem, type ProblemKind } from "@/lib/auto";
import { useFmt, useT } from "@/lib/i18n";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

export const PROBLEM_LABEL: Record<ProblemKind, string> = {
  duplicate_id: "Duplicate ID",
  required: "Required value missing",
  unique: "Value must be unique",
  option: "Value not in the list",
  prefix: "ID does not match the project prefix",
  formula: "Formula error",
  orphan: "Cable is on no sheet",
};

const detail = (t: ReturnType<typeof useT>, x: Problem) => {
  switch (x.kind) {
    case "duplicate_id":
      return t("Same as {c}", { c: x.value ?? "" });
    case "unique":
      return `${x.column} · ${x.value}`;
    case "option":
      return `${x.column}: “${x.value}”`;
    case "prefix":
      return t("Expected prefix {p}", { p: x.value ?? "" });
    default:
      return x.column ?? "";
  }
};

export const ProblemsPanel = ({
  p,
  problems,
  open,
  onOpenChange,
  onShow,
  onAdoptOrphans,
}: {
  p: Project;
  problems: Problem[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** filter the registry to these cable IDs */
  onShow: (codes: string[]) => void;
  onAdoptOrphans: () => void;
}) => {
  const t = useT();
  const f = useFmt();
  const [kind, setKind] = useState<ProblemKind | "">("");
  const groups = useMemo(() => {
    const m = new Map<ProblemKind, Problem[]>();
    for (const x of problems) m.set(x.kind, [...(m.get(x.kind) ?? []), x]);
    return [...m.entries()];
  }, [problems]);
  const shown = kind ? problems.filter((x) => x.kind === kind) : problems;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-bad" /> {t("Data checks")}
          </SheetTitle>
          <SheetDescription>{t("Duplicates, required and unique columns, dropdown values and formulas across all sheets. Set the checks per column in Columns.")}</SheetDescription>
        </SheetHeader>
        {problems.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-ok" />
            <div className="font-semibold text-ink">{t("No problems found")}</div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 border-b p-3">
              <button onClick={() => setKind("")} className={cn("h-7 rounded-full border px-2.5 text-xs font-semibold", !kind ? "border-ink bg-ink text-white" : "bg-white")}>
                {t("All")} {f.num(problems.length)}
              </button>
              {groups.map(([k, xs]) => (
                <button key={k} onClick={() => setKind(k)} className={cn("h-7 rounded-full border px-2.5 text-xs font-semibold", kind === k ? "border-ink bg-ink text-white" : "bg-white")}>
                  {t(PROBLEM_LABEL[k])} {f.num(xs.length)}
                </button>
              ))}
            </div>
            <div className="flex gap-2 border-b px-3 py-2">
              <Button size="sm" variant="outline" onClick={() => onShow([...new Set(shown.map((x) => x.code))])}>
                {t("Show in table")}
              </Button>
              {kind === "orphan" && (
                <Button size="sm" onClick={onAdoptOrphans}>
                  {t("Add to this sheet")}
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {shown.slice(0, 400).map((x, i) => (
                <Link
                  key={i}
                  to={`/p/${p.id}/registry/cable/${x.cableId}`}
                  onClick={() => onOpenChange(false)}
                  className="flex items-center gap-3 border-b px-4 py-2.5 text-sm hover:bg-[#F7F9F5]"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-bad" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[13px] font-semibold text-ink">{x.code}</span>
                    <span className="block truncate text-xs text-sub">
                      {t(PROBLEM_LABEL[x.kind])}
                      {detail(t, x) ? ` · ${detail(t, x)}` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-sub" />
                </Link>
              ))}
              {shown.length > 400 && <div className="p-4 text-center text-xs text-sub">{t("and {n} more", { n: f.num(shown.length - 400) })}</div>}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
