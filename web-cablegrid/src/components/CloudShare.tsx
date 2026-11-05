import { Check, CloudOff, Copy, Link2, RefreshCw, Share2, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Peer, projectInfo, regenerateShare, renameMe, shareUrl, syncNow, useCloud } from "@/lib/cloud";
import { useT } from "@/lib/i18n";
import { getMe, initials } from "@/lib/me";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONES = ["#FF5A1F", "#2563EB", "#1F9D63", "#0B1F33", "#D9430E", "#7A8B99"];
const tone = (s: string) => {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
};

const ROLE_LABEL: Record<Peer["role"], string> = { owner: "Owner", editor: "Invited manager", crew: "Crew link", client: "Client link" };

const Face = ({ name, id, size = 32, ring = true }: { name: string; id: string; size?: number; ring?: boolean }) => (
  <span
    className={cn("grid shrink-0 place-items-center rounded-full font-bold text-white", ring && "ring-2 ring-white")}
    style={{ width: size, height: size, background: tone(id), fontSize: size * 0.36 }}
  >
    {initials(name || "?")}
  </span>
);

const usePeers = (pid: string) => {
  const peers = useCloud((s) => s.peers[pid]);
  const me = getMe().client;
  const seen = new Set<string>();
  return (peers ?? []).filter((x) => {
    if (x.client === me || seen.has(x.client)) return false;
    seen.add(x.client);
    return true;
  });
};

const SyncPill = ({ p }: { p: Project }) => {
  const t = useT();
  const status = useCloud((s) => s.status[p.id]);
  const upload = useCloud((s) => s.upload[p.id]);
  if (!p.cloud || p.cloud.off)
    return (
      <span className="hidden items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold text-sub md:inline-flex">
        <CloudOff className="h-3.5 w-3.5" /> {t("This device only")}
      </span>
    );
  const map = {
    live: { dot: "bg-ok", label: t("Synced") },
    syncing: { dot: "bg-brand animate-pulse", label: upload !== undefined ? t("Uploading {n}%", { n: Math.round(upload * 100) }) : t("Saving…") },
    connecting: { dot: "bg-fiber animate-pulse", label: t("Connecting…") },
    offline: { dot: "bg-sub", label: t("Offline — changes wait") },
  } as const;
  const m = map[status ?? "connecting"];
  return (
    <span className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border bg-white px-2.5 py-1 text-xs font-semibold text-ink md:inline-flex">
      <span className={cn("h-2 w-2 rounded-full", m.dot)} /> {m.label}
    </span>
  );
};

/** Header block: sync state, who is online, share button and me. */
export const CloudBar = ({ p }: { p: Project }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const peers = usePeers(p.id);
  const me = getMe();
  const [, force] = useState(0);
  return (
    <>
      <SyncPill p={p} />
      {peers.length > 0 && (
        <div className="hidden items-center -space-x-2 sm:flex">
          {peers.slice(0, 4).map((x) => (
            <Tooltip key={x.client}>
              <TooltipTrigger asChild>
                <button onClick={() => setOpen(true)} className="rounded-full">
                  <Face name={x.name} id={x.client} size={30} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {x.name || t("Unnamed")} · {t(ROLE_LABEL[x.role])}
              </TooltipContent>
            </Tooltip>
          ))}
          {peers.length > 4 && <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-ink text-[11px] font-bold text-white ring-2 ring-white">+{peers.length - 4}</span>}
        </div>
      )}
      {p.cloud && !p.cloud.off && (p.cloud.role === "owner" || p.cloud.role === "editor") && (
        <Button size="sm" onClick={() => setOpen(true)} className="h-9">
          <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">{t("Share")}</span>
        </Button>
      )}
      <button onClick={() => setOpen(true)} className="hidden items-center gap-2.5 rounded-lg pl-1 text-left md:flex" disabled={!p.cloud || p.cloud.off}>
        <Face name={me.name || "PM"} id={me.client} size={36} ring={false} />
        <span className="leading-tight">
          <span className="block max-w-[140px] truncate text-sm font-semibold text-ink">{me.name || t("Manager")}</span>
          <span className="block text-[11px] text-sub">{p.cloud?.role === "editor" ? t("Invited manager") : t("Project manager")}</span>
        </span>
      </button>
      <ShareDialog p={p} open={open} onOpenChange={setOpen} onRenamed={() => force((n) => n + 1)} />
    </>
  );
};

const ShareDialog = ({ p, open, onOpenChange, onRenamed }: { p: Project; open: boolean; onOpenChange: (o: boolean) => void; onRenamed: () => void }) => {
  const t = useT();
  const peers = usePeers(p.id);
  const [name, setName] = useState(getMe().name);
  const [share, setShare] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const owner = p.cloud?.role === "owner";

  useEffect(() => {
    if (!open || !p.cloud || p.cloud.off) return;
    setName(getMe().name);
    setCopied(false);
    if (p.cloud.role === "editor") setShare(p.cloud.key);
    else
      projectInfo(p)
        .then((r) => setShare(r.share ?? null))
        .catch(() => setShare(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, p.id]);

  const saveName = () => {
    if (name.trim() === getMe().name) return;
    renameMe(name);
    onRenamed();
  };

  const url = share ? shareUrl(p.id, share) : "";
  const copy = async () => {
    saveName();
    if (!getMe().name) {
      toast.error(t("Enter your name first — it is shown next to your changes"));
      return;
    }
    await syncNow(p.id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(t("Copy the link"), url);
    }
    setCopied(true);
    toast.success(t("Link copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const regen = async () => {
    if (!confirm(t("Create a new link? Managers who use the old link lose access."))) return;
    setBusy(true);
    try {
      const r = await regenerateShare(p);
      setShare(r.share);
      toast.success(t("New link created — the old one no longer works"));
    } catch {
      toast.error(t("No connection. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const off = !p.cloud || p.cloud.off;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Work together")}</DialogTitle>
          <DialogDescription>{t("Everyone with the manager link edits the same project in real time — on any device.")}</DialogDescription>
        </DialogHeader>

        {off ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-sub">
            <CloudOff className="mb-2 h-5 w-5" />
            {t("This project is stored on this device only. Make a copy from a backup to share it.")}
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sub">{t("Your name")}</label>
              <Input
                value={name}
                autoFocus={!getMe().name}
                placeholder={t("e.g. Anna Petrova")}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <p className="mt-1 text-xs text-sub">{t("Shown next to every change you make, so the team knows who did what.")}</p>
            </div>

            <div className="rounded-xl border bg-background/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
                <Link2 className="h-4 w-4 text-brand" /> {t("Manager link")}
              </div>
              <div className="flex gap-2">
                <Input readOnly value={url} placeholder={t("Loading…")} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                <Button onClick={copy} disabled={!url} className="shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {t("Copy")}
                </Button>
              </div>
              <p className="mt-2 flex gap-2 text-xs text-sub">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-ok" />
                {t("Invited managers can edit everything, but cannot delete the project, sheets, books, columns, cables, people or links.")}
              </p>
              {owner && (
                <Button variant="ghost" size="sm" className="mt-2 h-8 px-2 text-sub" onClick={regen} disabled={busy}>
                  <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> {t("Create a new link (old one stops working)")}
                </Button>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sub">
                <Users className="h-3.5 w-3.5" /> {t("Online now")}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-3 rounded-lg px-1 py-1">
                  <Face name={name || "PM"} id={getMe().client} size={30} ring={false} />
                  <span className="flex-1 truncate text-sm font-semibold">
                    {name || t("Manager")} <span className="font-normal text-sub">({t("you")})</span>
                  </span>
                  <span className="text-xs text-sub">{t(ROLE_LABEL[p.cloud!.role])}</span>
                </div>
                {peers.map((x) => (
                  <div key={x.client} className="flex items-center gap-3 rounded-lg px-1 py-1">
                    <Face name={x.name} id={x.client} size={30} ring={false} />
                    <span className="flex-1 truncate text-sm font-semibold">{x.name || t("Unnamed")}</span>
                    <span className="text-xs text-sub">{t(ROLE_LABEL[x.role])}</span>
                  </div>
                ))}
                {peers.length === 0 && <p className="px-1 text-sm text-sub">{t("Nobody else is here right now.")}</p>}
              </div>
            </div>
            <p className="text-xs text-sub">{t("Crew and client links from the Links page work on any phone too — the project is in the cloud.")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
