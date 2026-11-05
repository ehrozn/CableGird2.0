import { ArrowRight, Check, MessageSquareWarning, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isFilled, uniqueColumns } from "@/lib/derive";
import { cleanCode, normCode, todayStr } from "@/lib/ids";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Cable, Column, PortalLink, Project, Rfi, RfiChange, RfiStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Typed input for one registry column (text, list, number, date, checkbox). */
export const FieldInput = ({
  col,
  value,
  onChange,
  placeholder,
  list,
  className,
}: {
  col: Column;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
  className?: string;
}) => {
  const t = useT();
  if (col.type === "checkbox") {
    const on = isFilled("checkbox", value);
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={col.name}
        onClick={() => onChange(on ? "" : "yes")}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition active:scale-95",
          on ? "border-ok bg-ok text-white" : "bg-white text-sub hover:border-ink/30",
          className,
        )}
      >
        <span className={cn("grid h-4 w-4 place-items-center rounded border", on ? "border-white" : "border-[#B9C1B6]")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
        {on ? t("Yes") : t("No")}
      </button>
    );
  }
  const opts = (col.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (col.type === "select" && opts.length)
    return (
      <NativeSelect value={value} onChange={onChange} className={cn("h-9 bg-white", className)} aria-label={col.name}>
        <option value="">{placeholder ? `${placeholder}` : "—"}</option>
        {value && !opts.includes(value) && <option value={value}>{value}</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    );
  if (col.type === "date")
    return (
      <div className={cn("flex gap-1.5", className)}>
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 min-w-0 flex-1 bg-white" aria-label={col.name} />
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => onChange(todayStr())}>
          {t("Today")}
        </Button>
      </div>
    );
  return (
    <Input
      type={col.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      list={list}
      className={cn("h-9 bg-white", className)}
      aria-label={col.name}
    />
  );
};

/** Human display of a stored value. */
export const useShowValue = () => {
  const t = useT();
  const f = useFmt();
  return (col: Column | undefined, v: string | undefined) => {
    if (!v) return "—";
    if (col?.type === "checkbox") return isFilled("checkbox", v) ? t("Yes") : t("No");
    if (col?.type === "date" && /^\d{4}-\d{2}-\d{2}/.test(v)) return f.date(v);
    return v;
  };
};

export const RfiStatusBadge = ({ s }: { s: RfiStatus }) => {
  const t = useT();
  const map: Record<RfiStatus, ["yellow" | "green" | "red", string]> = {
    pending: ["yellow", "Pending review"],
    approved: ["green", "Approved"],
    rejected: ["red", "Rejected"],
  };
  return <Badge t={map[s][0]}>{t(map[s][1])}</Badge>;
};

export const RfiChanges = ({ changes }: { changes: RfiChange[] }) => {
  const t = useT();
  return (
    <div className="divide-y rounded-lg border bg-white">
      {changes.map((c) => (
        <div key={c.colId} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-sm">
          <span className="truncate text-sub">{c.colId === "__code" ? t("Cable ID") : c.column}</span>
          <span className="truncate text-bad line-through decoration-bad/40">{c.from || "—"}</span>
          <ArrowRight className="h-3.5 w-3.5 text-sub" />
          <span className="truncate font-semibold text-ok">{c.to || "—"}</span>
        </div>
      ))}
    </div>
  );
};

/** Crew form: request a change of non-progress data (ID, IDF, …) with a mandatory reason. */
export const RfiDialog = ({
  p,
  link,
  cable,
  by,
  open,
  onOpenChange,
}: {
  p: Project;
  link: PortalLink;
  cable: Cable | null;
  by: { id: string; name: string };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const t = useT();
  const submitRfi = useStore((s) => s.submitRfi);
  const cols = useMemo(() => uniqueColumns(p).filter((c) => !c.progress), [p]);
  const [code, setCode] = useState(cable?.code ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() => ({ ...(cable?.values ?? {}) }));
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [key, setKey] = useState(cable?.id);
  if (cable?.id !== key) {
    setKey(cable?.id);
    setCode(cable?.code ?? "");
    setVals({ ...(cable?.values ?? {}) });
    setReason("");
    setTried(false);
  }
  if (!cable) return null;

  const changes: RfiChange[] = [];
  if (cleanCode(code) && cleanCode(code) !== cable.code.trim()) changes.push({ colId: "__code", column: "ID", from: cable.code, to: cleanCode(code) });
  for (const c of cols) {
    const from = cable.values[c.id] ?? "";
    const to = (vals[c.id] ?? "").trim();
    if (from.trim() !== to) changes.push({ colId: c.id, column: c.name, from, to });
  }
  const taken = changes.some((c) => c.colId === "__code") && p.cables.some((c) => c.id !== cable.id && normCode(c.code) === normCode(code));

  const send = () => {
    setTried(true);
    if (!changes.length) return void toast.error(t("Change at least one field"));
    if (!reason.trim()) return void toast.error(t("A reason is required"));
    const n = submitRfi(p.id, {
      linkId: link.id,
      linkName: link.name,
      submittedBy: by.id,
      submittedByName: by.name,
      cableId: cable.id,
      code: cable.code,
      changes,
      reason: reason.trim(),
    });
    toast.success(t("RFI #{n} sent", { n }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-brand" />
            {t("Request a change (RFI)")} · <span className="font-mono">{cable.code}</span>
          </DialogTitle>
          <DialogDescription>{t("Edit the fields that are wrong in the registry. The manager reviews the request; nothing changes until it is approved.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
          <label className="text-[13px]">
            <span className="mb-1 block font-semibold">{t("Cable ID")}</span>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={cn("h-9 font-mono", taken && "border-bad")} />
            {taken && <span className="mt-0.5 block text-xs text-bad">{t("This cable ID is already taken")}</span>}
          </label>
          {cols.map((c) => {
            const changed = (cable.values[c.id] ?? "").trim() !== (vals[c.id] ?? "").trim();
            return (
              <label key={c.id} className="text-[13px]">
                <span className={cn("mb-1 block truncate", changed ? "font-semibold text-brand-deep" : "text-sub")}>
                  {c.name}
                  {changed && " •"}
                </span>
                <FieldInput col={c} value={vals[c.id] ?? ""} onChange={(v) => setVals({ ...vals, [c.id]: v })} />
              </label>
            );
          })}
        </div>
        {changes.length > 0 && <RfiChanges changes={changes} />}
        <label className="text-[13px]">
          <span className="mb-1 block font-semibold">{t("Reason")} *</span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={t("Why should this be changed? E.g. the cable actually goes to IDF-3")}
            className={cn(tried && !reason.trim() && "border-bad ring-2 ring-bad/20")}
          />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={send} disabled={taken}>
            <Send className="h-4 w-4" /> {t("Send RFI")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Compact list of RFIs (crew view). */
export const RfiList = ({ rfis }: { rfis: Rfi[] }) => {
  const t = useT();
  const f = useFmt();
  return (
    <div className="space-y-3">
      {rfis.map((r) => (
        <div key={r.id} className="panel rise p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold">RFI #{r.number}</span>
            <span className="font-mono text-sm font-semibold text-cat">{r.code}</span>
            <span className="text-sm text-sub">· {r.submittedByName} · {f.dateTime(r.createdAt)}</span>
            <span className="ml-auto">
              <RfiStatusBadge s={r.status} />
            </span>
          </div>
          <p className="mt-2 text-sm">
            <span className="text-sub">{t("Reason")}:</span> {r.reason}
          </p>
          <div className="mt-2">
            <RfiChanges changes={r.changes} />
          </div>
          {r.managerComment && (
            <div className="mt-3 rounded-lg bg-[#F6F8F5] p-3 text-sm">
              <span className="font-semibold">{t("Manager")}:</span> {r.managerComment}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
