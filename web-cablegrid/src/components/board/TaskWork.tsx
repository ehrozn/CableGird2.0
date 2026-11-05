import { AlertOctagon, FileText, GitMerge, Hand, History, ImageIcon, LockOpen, Lock, Users, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { STAGE_LABEL, STAGE_STATE_LABEL, STOP_REASONS, activeClaims, reasonLabel, slotsOf, statusOf, tagsOf, taskMode } from "@/lib/board";
import { fileSize, openTaskFile } from "@/lib/files";
import { useFmt, useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, StopReason, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

import { StageBar, StatusPill, TagChip, fmtLog } from "./bits";

const H = ({ children }: { children: React.ReactNode }) => <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-sub">{children}</div>;

const OUTCOME: Record<string, string> = { done: "Done", partial: "Partly done", not_done: "Not done", reassigned: "Reassigned", released: "Released" };

/** Work-board part of the task sheet: who does it, claims, stages, blocks, history. */
export const TaskWork = ({ p, task }: { p: Project; task: Task }) => {
  const t = useT();
  const f = useFmt();
  const { assignTask, blockTask, unblockTask, releaseClaim, linkWork, clearConflicts } = useStore.getState();
  const [panel, setPanel] = useState<"" | "free" | "crew" | "block" | "link">("");
  const [slots, setSlots] = useState(slotsOf(task));
  const [crew, setCrew] = useState(task.crewLinkId ?? "");
  const [reason, setReason] = useState<StopReason>("material");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const mode = taskMode(task);
  const act = activeClaims(task);
  const crews = p.links.filter((l) => l.type === "crew" && l.active !== false);
  const crewName = p.links.find((l) => l.id === task.crewLinkId)?.name;
  const others = p.tasks.filter((x) => x.id !== task.id && x.status !== "done");
  const stages = task.stagesReported?.stages ?? task.stages;
  const ended = (task.claims ?? []).filter((c) => c.endedAt);

  const doAssignCrew = () => {
    if (!crew) return;
    if (act.length && !confirm(t("{names} already took this task. Their part ends; the history is kept. Continue?", { names: act.map((c) => c.name).join(", ") }))) return;
    assignTask(p.id, task.id, { crewLinkId: crew });
    setPanel("");
    toast.success(t("Assigned to {c}", { c: p.links.find((l) => l.id === crew)?.name ?? "" }));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-[#F7F9F5] p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill s={statusOf(task)} />
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-white px-2.5 text-xs font-bold text-ink ring-1 ring-ink/10">
            {mode === "free" ? <Hand className="h-3.5 w-3.5 text-brand" /> : <Users className="h-3.5 w-3.5 text-sub" />}
            {mode === "free"
              ? t("Free task · {n} of {m} taken", { n: act.length, m: slotsOf(task) })
              : mode === "crew"
                ? t("Crew: {c}", { c: crewName ?? "—" })
                : mode === "people"
                  ? t("Assigned to people")
                  : t("Not assigned")}
          </span>
          {tagsOf(task).map((g) => (
            <TagChip key={g.id} tag={g} />
          ))}
        </div>
        {task.origin && (
          <div className="mt-2 text-[12.5px] text-sub">
            {t("Found in report #{n} from {crew}", { n: task.origin.reportNumber, crew: task.origin.linkName })}
          </div>
        )}
        {task.status !== "done" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {mode !== "free" && (
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "free" ? "" : "free")}>
                <Hand className="h-3.5 w-3.5" /> {t("Make free")}
              </Button>
            )}
            {mode === "free" && (
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "free" ? "" : "free")}>
                {t("Places")}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setPanel(panel === "crew" ? "" : "crew")}>
              <Users className="h-3.5 w-3.5" /> {mode === "crew" ? t("Change crew") : t("Assign to crew")}
            </Button>
            {task.stop?.blocked ? (
              <Button size="sm" variant="outline" className="border-ok/40 text-ok" onClick={() => unblockTask(p.id, task.id)}>
                <LockOpen className="h-3.5 w-3.5" /> {t("Unblock")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="text-bad" onClick={() => setPanel(panel === "block" ? "" : "block")}>
                <Lock className="h-3.5 w-3.5" /> {t("Block")}
              </Button>
            )}
            {(task.origin || task.workKey) && others.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setPanel(panel === "link" ? "" : "link")}>
                <GitMerge className="h-3.5 w-3.5" /> {t("Link to a task")}
              </Button>
            )}
          </div>
        )}
        {panel === "free" && (
          <div className="mt-3 flex items-end gap-2">
            <label className="text-[12.5px] font-semibold">
              {t("Places")}
              <Input type="number" min={1} max={50} value={slots} onChange={(e) => setSlots(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="mt-1 h-9 w-24" />
            </label>
            <Button
              size="sm"
              className="h-9"
              onClick={() => {
                if (mode === "free") useStore.getState().updateTask(p.id, task.id, { slots });
                else assignTask(p.id, task.id, { free: true, slots });
                setPanel("");
              }}
            >
              {t("Save")}
            </Button>
          </div>
        )}
        {panel === "crew" && (
          <div className="mt-3 flex gap-2">
            <NativeSelect value={crew} onChange={setCrew} className="h-9">
              <option value="">{t("Choose a crew…")}</option>
              {crews.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
            <Button size="sm" className="h-9" disabled={!crew || crew === task.crewLinkId} onClick={doAssignCrew}>
              {t("Assign")}
            </Button>
          </div>
        )}
        {panel === "block" && (
          <div className="mt-3 space-y-2">
            <NativeSelect value={reason} onChange={(v) => setReason(v as StopReason)} className="h-9">
              {STOP_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {t(r.label)}
                </option>
              ))}
            </NativeSelect>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t("What blocks it")} />
            <Button
              size="sm"
              className="bg-bad hover:bg-bad/90"
              onClick={() => {
                blockTask(p.id, task.id, { reason, note: note.trim() || undefined });
                setNote("");
                setPanel("");
              }}
            >
              <Lock className="h-3.5 w-3.5" /> {t("Block task")}
            </Button>
          </div>
        )}
        {panel === "link" && (
          <div className="mt-3 space-y-2">
            <div className="text-[12.5px] text-sub">{t("This work is merged into the chosen task: its cables, notes and history move there.")}</div>
            <div className="flex gap-2">
              <NativeSelect value={target} onChange={setTarget} className="h-9">
                <option value="">{t("Choose a task…")}</option>
                {others.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </NativeSelect>
              <Button
                size="sm"
                className="h-9"
                disabled={!target}
                onClick={() => {
                  linkWork(p.id, task.id, target);
                  toast.success(t("Merged"));
                }}
              >
                {t("Merge")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {task.stop && (
        <div className={cn("rounded-xl border p-3.5 text-sm", task.stop.blocked ? "border-bad/30 bg-bad-soft/60" : "border-fiber/50 bg-fiber-soft")}>
          <div className="flex items-center gap-1.5 font-bold">
            {task.stop.blocked && <AlertOctagon className="h-4 w-4 text-bad" />}
            {task.stop.blocked ? t("Blocked") : t("Stopped — can continue")}: {t(reasonLabel(task.stop.reason))}
          </div>
          {task.stop.note && <div className="mt-1">{task.stop.note}</div>}
          {task.stop.needs && (
            <div className="mt-1">
              <b>{t("Needed")}:</b> {task.stop.needs}
            </div>
          )}
          <div className="mt-1 text-xs text-sub">
            {task.stop.by} · {f.dateTime(task.stop.at)}
          </div>
        </div>
      )}

      {(task.progressDone || task.remaining) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {task.progressDone && (
            <div className="rounded-lg border p-3 text-sm">
              <H>{t("Done so far")}</H>
              {task.progressDone}
            </div>
          )}
          {task.remaining && (
            <div className="rounded-lg border p-3 text-sm">
              <H>{t("Left")}</H>
              {task.remaining}
            </div>
          )}
        </div>
      )}

      {stages && (
        <div>
          <H>{t("Cable stages")}</H>
          <StageBar st={stages} />
          <ul className="mt-2 grid grid-cols-2 gap-1 text-[12.5px]">
            {(Object.keys(stages) as (keyof typeof stages)[]).map((k) => (
              <li key={k}>
                <span className="text-sub">{t(STAGE_LABEL[k])}:</span> {t(STAGE_STATE_LABEL[stages[k]!.state])}
                {stages[k]!.pct != null && ` · ${stages[k]!.pct}%`}
                {stages[k]!.len != null && ` · ${stages[k]!.len} ${p.units}`}
              </li>
            ))}
          </ul>
          {task.stagesReported && (
            <div className="mt-1.5 text-xs text-cat">{t("Reported in #{n} — waiting for your approval in Reports", { n: task.stagesReported.number })}</div>
          )}
        </div>
      )}

      {((task.conflicts?.length ?? 0) > 0 || (task.ambiguous?.length ?? 0) > 0) && (
        <div className="rounded-xl border border-fiber/60 bg-fiber-soft p-3.5 text-sm">
          {(task.conflicts ?? []).map((c, i) => (
            <div key={i}>
              {t("Report #{n} says {stage} is “{state}”, but it was already confirmed done. The confirmed result is kept.", {
                n: c.reportNumber,
                stage: t(STAGE_LABEL[c.stage]),
                state: t(STAGE_STATE_LABEL[c.reported]),
              })}
            </div>
          ))}
          {(task.ambiguous ?? []).map((a, i) => (
            <div key={i} className="mt-1">
              {t("Cable {c} from report #{n} matches several tasks:", { c: a.code, n: a.number })}{" "}
              {a.taskIds.map((id) => {
                const x = p.tasks.find((y) => y.id === id);
                return x ? (
                  <button key={id} onClick={() => linkWork(p.id, task.id, id)} className="mr-1.5 font-semibold text-brand-deep underline-offset-2 hover:underline">
                    {t("merge into “{n}”", { n: x.title })}
                  </button>
                ) : null;
              })}
            </div>
          ))}
          <button onClick={() => clearConflicts(p.id, task.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sub hover:text-ink">
            <X className="h-3 w-3" /> {t("Dismiss")}
          </button>
        </div>
      )}

      {(act.length > 0 || ended.length > 0) && (
        <div>
          <H>{t("People on the task")}</H>
          <ul className="space-y-1.5">
            {[...act, ...ended.slice().reverse()].map((c) => (
              <li key={c.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", c.endedAt && "bg-[#F7F9F5] text-sub")}>
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white", c.endedAt ? "bg-sub/60" : "bg-cat")}>{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">
                    {c.name} <span className="font-normal text-sub">· {c.linkName}</span>
                  </span>
                  <span className="block text-xs">
                    {t("Took {t}", { t: f.dateTime(c.at) })}
                    {c.endedAt && ` · ${t(OUTCOME[c.outcome ?? "released"])} ${f.dateTime(c.endedAt)}`}
                  </span>
                </span>
                {!c.endedAt && (
                  <button
                    onClick={() => confirm(t("Take {n} off this task? The history is kept.", { n: c.name })) && releaseClaim(p.id, task.id, c.id)}
                    className="shrink-0 text-xs font-semibold text-sub hover:text-bad"
                  >
                    {t("Release")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(task.location || task.start || task.criteria || task.requirements) && (
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {task.location && (
            <div>
              <H>{t("Location")}</H>
              {task.location}
            </div>
          )}
          {task.start && (
            <div>
              <H>{t("Start")}</H>
              {f.date(task.start)}
            </div>
          )}
          {task.criteria && (
            <div className="sm:col-span-2">
              <H>{t("Done when")}</H>
              <p className="whitespace-pre-wrap">{task.criteria}</p>
            </div>
          )}
          {task.requirements && (
            <div className="sm:col-span-2">
              <H>{t("Requirements")}</H>
              <p className="whitespace-pre-wrap">{task.requirements}</p>
            </div>
          )}
        </dl>
      )}

      {(task.files?.length ?? 0) > 0 && (
        <div>
          <H>{t("Photos & documents")}</H>
          <div className="flex flex-wrap gap-1.5">
            {task.files!.map((x) => (
              <button
                key={x.id}
                onClick={async () => {
                  const ok = await openTaskFile(p.id, p.cloud?.key, x);
                  if (!ok) toast.error(t("This file isn't available on this device yet"));
                }}
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border bg-white px-2.5 text-[12.5px] hover:border-brand/50"
              >
                {x.type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5 text-sub" /> : <FileText className="h-3.5 w-3.5 text-sub" />}
                <span className="truncate">{x.name}</span>
                <span className="text-sub">{fileSize(x.size)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(task.log?.length ?? 0) > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sub">
            <History className="h-3.5 w-3.5" /> {t("History")} ({task.log!.length})
          </summary>
          <ol className="mt-2 space-y-2 border-l-2 border-ink/10 pl-3">
            {task.log!
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className="text-[13px]">
                  <div className="text-[11.5px] text-sub">
                    {f.dateTime(e.at)} · {e.by === "Manager" ? t("Manager") : e.by}
                  </div>
                  <div className={cn(e.kind === "blocked" || e.kind === "conflict" ? "text-bad" : "text-ink")}>{fmtLog(t, e.kind, e.text)}</div>
                </li>
              ))}
          </ol>
        </details>
      )}
    </div>
  );
};
