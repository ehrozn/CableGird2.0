import { AlertTriangle, FileText, Hand, ImageIcon, Loader2, Paperclip, Plus, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Field, NativeSelect } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { activeClaims } from "@/lib/board";
import { MAX_FILE, fileSize, saveTaskFile } from "@/lib/files";
import { CableSelectField } from "@/components/CablePicker";
import { parseCodes } from "@/lib/cable-search";
import { normCode } from "@/lib/ids";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Priority, Project, Severity, Task, TaskFile, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Re-exported for older imports; lives in the shared cable search now. */
export { parseCodes };

/** Pick employees with a quick "add new person" input. */
export const PeoplePicker = ({ p, value, onChange }: { p: Project; value: string[]; onChange: (ids: string[]) => void }) => {
  const t = useT();
  const addEmployee = useStore((s) => s.addEmployee);
  const [name, setName] = useState("");
  const active = p.employees.filter((e) => e.active || value.includes(e.id));
  const add = () => {
    if (!name.trim()) return;
    const id = addEmployee(p.id, { name: name.trim(), role: "technician", access: ["tasks", "reports"], active: true });
    onChange([...value, id]);
    setName("");
  };
  return (
    <div className="space-y-2">
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.map((e) => {
            const on = value.includes(e.id);
            return (
              <button
                type="button"
                key={e.id}
                onClick={() => onChange(on ? value.filter((x) => x !== e.id) : [...value, e.id])}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition",
                  on ? "border-brand bg-brand-soft text-brand-deep" : "bg-white text-ink hover:border-ink/30",
                )}
              >
                <span className={cn("grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold", on ? "bg-brand text-white" : "bg-[#EEF1EC] text-sub")}>
                  {e.name.slice(0, 1).toUpperCase()}
                </span>
                {e.name}
                {e.crew && <span className="text-xs text-sub">· {e.crew}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("Add a new person by name")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={!name.trim()}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

type AssignMode = "free" | "crew" | "people";

export const TaskDialog = ({
  p,
  open,
  onOpenChange,
  task,
  presetCodes,
  presetMode,
}: {
  p: Project;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task?: Task;
  presetCodes?: string[];
  presetMode?: AssignMode;
}) => {
  const t = useT();
  const navigate = useNavigate();
  const { addTask, updateTask } = useStore.getState();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [start, setStart] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [codes, setCodes] = useState<string[]>([]);
  const [mode, setMode] = useState<AssignMode>("people");
  const [slots, setSlots] = useState(1);
  const [crewId, setCrewId] = useState("");
  const [location, setLocation] = useState("");
  const [criteria, setCriteria] = useState("");
  const [requirements, setRequirements] = useState("");
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const crews = p.links.filter((l) => l.type === "crew" && (l.active !== false || l.id === task?.crewLinkId));

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDesc(task?.description ?? "");
    setAssignees(task?.assigneeIds ?? []);
    setDue(task?.due ?? "");
    setStart(task?.start ?? "");
    setPriority(task?.priority ?? "normal");
    setStatus(task?.status ?? "todo");
    setCodes(task?.cableCodes ?? presetCodes ?? []);
    setMode(task ? (task.free ? "free" : task.crewLinkId ? "crew" : "people") : (presetMode ?? "free"));
    setSlots(task?.slots ?? 1);
    setCrewId(task?.crewLinkId ?? "");
    setLocation(task?.location ?? "");
    setCriteria(task?.criteria ?? "");
    setRequirements(task?.requirements ?? "");
    setFiles(task?.files ?? []);
  }, [open, task, presetCodes, presetMode]);

  // people already took it: changing who does it ends their part (history stays)
  const taken = task ? activeClaims(task) : [];
  const willEnd = taken.length > 0 && mode !== "free";

  const announce = (linkIds: string[]) => {
    if (!linkIds.length) return;
    const names = useStore
      .getState()
      .projects.find((x) => x.id === p.id)
      ?.links.filter((l) => linkIds.includes(l.id))
      .map((l) => l.name)
      .join(", ");
    toast.success(t("Personal link created for {n}", { n: names ?? "" }), {
      description: t("Share it so they can see tasks and send reports."),
      action: { label: t("Open links"), onClick: () => navigate(`/p/${p.id}/links`) },
    });
  };

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) {
        if (f.size > MAX_FILE) {
          toast.error(t("“{n}” is too big (max 6 MB)", { n: f.name }));
          continue;
        }
        const tf = await saveTaskFile(p, f);
        setFiles((x) => [...x, tf]);
      }
    } catch {
      toast.error(t("Couldn't upload the file — check the connection"));
    } finally {
      setUploading(false);
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || (mode === "crew" && !crewId)) return;
    const data = {
      title: title.trim(),
      description: desc.trim(),
      assigneeIds: mode === "people" ? assignees : [],
      due: due || undefined,
      start: start || undefined,
      priority,
      status,
      cableCodes: codes,
      free: mode === "free" ? true : undefined,
      slots: mode === "free" ? Math.max(1, slots) : undefined,
      crewLinkId: mode === "crew" ? crewId : undefined,
      location: location.trim() || undefined,
      criteria: criteria.trim() || undefined,
      requirements: requirements.trim() || undefined,
      files: files.length ? files : undefined,
    };
    if (task) {
      announce(updateTask(p.id, task.id, { ...data, free: mode === "free" }));
      toast.success(t("Task saved"));
    } else {
      const r = addTask(p.id, data);
      toast.success(t("Task created"));
      announce(r.newLinks);
    }
    onOpenChange(false);
  };

  const MODES: { id: AssignMode; label: string; hint: string; icon: typeof Hand }[] = [
    { id: "free", label: "Free task", hint: "Anyone takes it with the board QR", icon: Hand },
    { id: "crew", label: "Crew task", hint: "Only the chosen crew works on it", icon: Users },
    { id: "people", label: "People", hint: "Named people with personal links", icon: UserPlus },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? t("Edit task") : t("New task")}</DialogTitle>
          <DialogDescription>{t("Free tasks show up on the work board for anyone to take; crew tasks stay with their crew.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label={t("Title")}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. Pull Cat6 on floor 2")} />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Who does it")}</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((m) => (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
                    mode === m.id ? "border-brand bg-brand-soft ring-1 ring-brand" : "bg-white hover:border-ink/30",
                  )}
                >
                  <m.icon className={cn("mt-0.5 h-4 w-4 shrink-0", mode === m.id ? "text-brand" : "text-sub")} />
                  <span>
                    <span className="block text-[13.5px] font-bold">{t(m.label)}</span>
                    <span className="block text-[11.5px] leading-snug text-sub">{t(m.hint)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          {mode === "free" && (
            <Field label={t("Places")} hint={t("How many people can take it at once")}>
              <Input type="number" min={1} max={50} value={slots} onChange={(e) => setSlots(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-28" />
            </Field>
          )}
          {mode === "crew" && (
            <Field label={t("Crew")} hint={crews.length ? t("Only this crew's foreman link sees it; it can't be taken by QR.") : undefined}>
              {crews.length ? (
                <NativeSelect value={crewId} onChange={setCrewId}>
                  <option value="">{t("Choose a crew…")}</option>
                  {crews.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <div className="rounded-lg border border-dashed p-3 text-sm text-sub">{t("No crew links yet — create one on the Links page.")}</div>
              )}
            </Field>
          )}
          {mode === "people" && (
            <Field label={t("Assign to")} hint={t("Assigned people automatically get a personal link if they don't have one.")}>
              <PeoplePicker p={p} value={assignees} onChange={setAssignees} />
            </Field>
          )}
          {willEnd && (
            <div className="flex gap-2.5 rounded-xl border border-fiber/60 bg-fiber-soft p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-fiber-deep" />
              <span>
                <b>{t("Already taken by {names}.", { names: taken.map((c) => `${c.name} (${c.linkName})`).join(", ") })}</b>{" "}
                {t("Saving ends their part of the task. The history is kept.")}
              </span>
            </div>
          )}
          <Field label={t("Description")}>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder={t("What needs to be done")} />
          </Field>
          <Field label={t("Location")}>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("e.g. Floor 2, room 214")} />
          </Field>
          <Field label={t("Related cables")} hint={t("Type an ID, paste a list or a range like C-001..C-040, or browse the registry with filters")}>
            <CableSelectField p={p} value={codes} onChange={setCodes} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label={t("Start")}>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={t("Due date")}>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field label={t("Priority")}>
              <NativeSelect value={priority} onChange={(v) => setPriority(v as Priority)}>
                <option value="low">{t("Low")}</option>
                <option value="normal">{t("Normal")}</option>
                <option value="high">{t("High")}</option>
              </NativeSelect>
            </Field>
            <Field label={t("Status")}>
              <NativeSelect value={status} onChange={(v) => setStatus(v as TaskStatus)}>
                <option value="todo">{t("To do")}</option>
                <option value="progress">{t("In progress")}</option>
                <option value="done">{t("Done")}</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Done when")}>
              <Textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} placeholder={t("e.g. Both ends terminated and tested")} />
            </Field>
            <Field label={t("Requirements")}>
              <Textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={2} placeholder={t("Tools, access, permits…")} />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-ink">{t("Photos & documents")}</span>
            <div className="flex flex-wrap gap-2">
              {files.map((f) => (
                <span key={f.id} className="inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg border bg-white pl-2.5 pr-1 text-[12.5px]">
                  {f.type.startsWith("image/") ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sub" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-sub" />}
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-sub">{fileSize(f.size)}</span>
                  <button type="button" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} className="grid h-6 w-6 place-items-center rounded text-sub hover:bg-bad-soft hover:text-bad" aria-label={t("Remove")}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed px-3 text-[12.5px] font-semibold text-sub hover:border-brand hover:text-brand-deep">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {t("Attach")}
                <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => (void addFiles(e.target.files), (e.target.value = ""))} />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim() || uploading || (mode === "crew" && !crewId)}>
              {task ? t("Save") : (
                <>
                  <Plus className="h-4 w-4" /> {t("Create task")}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export const IssueDialog = ({ p, open, onOpenChange, presetCode }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; presetCode?: string }) => {
  const t = useT();
  const addIssue = useStore((s) => s.addIssue);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [sev, setSev] = useState<Severity>("medium");
  const [code, setCode] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDesc("");
    setSev("medium");
    setCode(presetCode ?? "");
  }, [open, presetCode]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    addIssue(p.id, { title: title.trim(), description: desc.trim(), severity: sev, code: code.trim() || undefined, source: "manager", reportedBy: t("Manager") });
    toast.success(t("Issue opened"));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Report an issue")}</DialogTitle>
          <DialogDescription>{t("Cables with open issues are highlighted red in the registry.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <Field label={t("What's wrong?")}>
            <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("e.g. No conduit to the outlet")} />
          </Field>
          <Field label={t("Details")}>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Cable ID (optional)")}>
              <CableSelectField p={p} single value={code ? [code] : []} onChange={(v) => setCode(v[0] ?? "")} />
            </Field>
            <Field label={t("Severity")}>
              <NativeSelect value={sev} onChange={(v) => setSev(v as Severity)}>
                <option value="low">{t("Low")}</option>
                <option value="medium">{t("Medium")}</option>
                <option value="high">{t("Critical")}</option>
              </NativeSelect>
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={!title.trim()} className="bg-bad hover:bg-bad/90">
              {t("Open issue")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
