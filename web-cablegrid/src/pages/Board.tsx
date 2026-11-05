import QRCode from "qrcode";
import { Check, Copy, ExternalLink, Info, Loader2, MonitorPlay, Printer, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Qr } from "@/components/board/bits";
import { ContactsEditor } from "@/components/board/ContactsEditor";
import { ScheduleEditor } from "@/components/board/ScheduleEditor";
import { NoticesEditor } from "@/components/board/NoticesEditor";
import { ScaledStage, TvBoard } from "@/components/board/TvBoard";
import { NativeSelect, PageHeader, useProject } from "@/components/common";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { STAGE_KEYS, STAGE_LABEL, SECTIONS, boardDataFromProject, boardItems, localDay, stageMap } from "@/lib/board";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Project, StageKey } from "@/lib/types";
import { cn } from "@/lib/utils";

const tvUrl = (tok: string) => `${window.location.origin}/tv/${tok}`;
const takeUrl = (tok: string) => `${window.location.origin}/take/${tok}`;

const printQr = async (p: Project, url: string, t: (k: string) => string) => {
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0B1F33", light: "#FFFFFF" } });
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.name)} — QR</title>
<style>@page{size:A4;margin:18mm}body{font-family:Onest,system-ui,sans-serif;color:#0B1F33;text-align:center;margin:0}
.k{font-size:14px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#D9430E;margin-top:24px}
h1{font-size:30px;margin:6px 0 28px}.q{width:360px;height:360px;margin:0 auto;padding:18px;border:6px solid #FF5A1F;border-radius:24px}
.q svg{width:100%;height:100%}h2{font-size:34px;margin:28px 0 8px}p{font-size:18px;color:#5B6B78;margin:0}.u{font-family:monospace;font-size:13px;margin-top:22px;color:#5B6B78}</style></head>
<body><div class="k">${esc(t("Work board"))}</div><h1>${esc(p.name)}</h1><div class="q">${svg}</div>
<h2>${esc(t("Scan to take a free task"))}</h2><p>${esc(t("Pick your crew and your name — no login"))}</p><div class="u">${esc(url)}</div>
<script>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
};

const CopyBtn = ({ text }: { text: string }) => {
  const t = useT();
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text).catch(() => undefined);
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
      {ok ? t("Copied") : t("Copy")}
    </Button>
  );
};

const Board = () => {
  const p = useProject();
  const t = useT();
  const boardLinks = useStore((s) => s.boardLinks);
  const setCableStages = useStore((s) => s.setCableStages);
  const [regen, setRegen] = useState(false);
  const data = useMemo(() => (p ? boardDataFromProject(p) : null), [p]);
  const counts = useMemo(() => (data ? boardItems(data, localDay(new Date().toISOString())) : null), [data]);
  if (!p || !data || !counts) return null;

  const manager = !p.cloud || p.cloud.role === "owner" || p.cloud.role === "editor";
  const online = !!p.cloud && !p.cloud.off && p.cloud.ready;
  const b = p.board;
  const map = stageMap(p);

  return (
    <>
      <PageHeader
        title={t("Work board")}
        subtitle={t("A live TV screen for the site office, and a QR code to take free tasks without a login.")}
        actions={
          b?.active &&
          online && (
            <Button asChild>
              <a href={tvUrl(b.token)} target="_blank" rel="noreferrer">
                <MonitorPlay className="h-4 w-4" /> {t("Open TV board")}
              </a>
            </Button>
          )
        }
      />

      {!online && (
        <div className="mb-5 flex gap-3 rounded-xl border border-fiber/50 bg-fiber-soft p-4 text-sm">
          {p.cloud && !p.cloud.off ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-fiber-deep" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-fiber-deep" />}
          <span className="text-ink/80">
            {p.cloud && !p.cloud.off
              ? t("The project is still uploading to the cloud — board links will work once it's done.")
              : t("The board needs cloud sync: TVs and phones read the project from the cloud.")}
          </span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <section className="panel overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <MonitorPlay className="h-4 w-4 text-brand" /> {t("Preview")}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-sub">
              {SECTIONS.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.tone }} />
                  {counts[s.id].length}
                </span>
              ))}
            </div>
          </div>
          <ScaledStage className="aspect-video w-full bg-[#EEF1EC]">
            <TvBoard data={data} takeUrl={b ? takeUrl(b.takeToken) : null} status="live" updatedAt={null} />
          </ScaledStage>
          </section>
          <NoticesEditor p={p} manager={manager} />
          <ScheduleEditor p={p} manager={manager} />
          <ContactsEditor p={p} manager={manager} />
        </div>

        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold">
              <QrCode className="h-4 w-4 text-brand" /> {t("Board links")}
            </h2>
            {!b ? (
              <>
                <p className="mt-1.5 text-sm text-sub">{t("Create a read-only link for the TV and a QR code people scan to take free tasks.")}</p>
                <Button className="mt-4 w-full" disabled={!manager} onClick={() => boardLinks(p.id, "create")}>
                  {t("Create board links")}
                </Button>
              </>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-[#F4F6F2] px-3 py-2.5">
                  <div>
                    <div className="text-sm font-semibold">{b.active ? t("Links are on") : t("Links are off")}</div>
                    <div className="text-xs text-sub">{b.active ? t("The TV and the QR page work.") : t("The TV shows “turned off”, the QR page doesn't open.")}</div>
                  </div>
                  <Switch checked={b.active} disabled={!manager} onCheckedChange={(on) => boardLinks(p.id, on ? "on" : "off")} />
                </div>
                <div className={cn("mt-4 space-y-4", !b.active && "opacity-50")}>
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
                      <MonitorPlay className="h-3.5 w-3.5 text-sub" /> {t("TV link (view only)")}
                    </div>
                    <div className="truncate rounded-md border bg-white px-2.5 py-2 font-mono text-[12px]">{tvUrl(b.token)}</div>
                    <div className="mt-2 flex gap-2">
                      <CopyBtn text={tvUrl(b.token)} />
                      <Button variant="outline" size="sm" asChild>
                        <a href={tvUrl(b.token)} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" /> {t("Open")}
                        </a>
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold">
                      <Smartphone className="h-3.5 w-3.5 text-sub" /> {t("QR page — take free tasks")}
                    </div>
                    <div className="flex gap-3">
                      <Qr value={takeUrl(b.takeToken)} className="h-24 w-24 shrink-0 rounded-md border bg-white p-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate rounded-md border bg-white px-2.5 py-2 font-mono text-[12px]">{takeUrl(b.takeToken)}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <CopyBtn text={takeUrl(b.takeToken)} />
                          <Button variant="outline" size="sm" onClick={() => void printQr(p, takeUrl(b.takeToken), t)}>
                            <Printer className="h-4 w-4" /> {t("Print")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="mt-4 w-full text-bad hover:bg-bad-soft hover:text-bad" disabled={!manager} onClick={() => setRegen(true)}>
                  <RefreshCw className="h-4 w-4" /> {t("Replace links")}
                </Button>
              </>
            )}
          </section>

          <section className="panel p-5">
            <h2 className="text-[15px] font-bold">{t("Cable stages")}</h2>
            <p className="mt-1 text-sm text-sub">{t("Which progress column is each stage. Incomplete cable work is tracked by these stages.")}</p>
            <div className="mt-3 space-y-2.5">
              {STAGE_KEYS.map((k) => (
                <label key={k} className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm">
                  <span className="font-semibold">{t(STAGE_LABEL[k])}</span>
                  <NativeSelect
                    value={map[k] ?? ""}
                    disabled={!manager}
                    onChange={(v) => {
                      const next: Partial<Record<StageKey, string>> = { ...map };
                      if (v) next[k] = v;
                      else delete next[k];
                      setCableStages(p.id, next);
                    }}
                  >
                    <option value="">{t("— Not tracked —")}</option>
                    <option value="na">{t("Not required on this project")}</option>
                    {p.actions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
            </div>
            {!p.cableStages && Object.keys(map).length > 0 && <p className="mt-2 text-xs text-sub">{t("Guessed from column names — change it if it's wrong.")}</p>}
          </section>

          <section className="rounded-xl border border-dashed p-4 text-[13px] text-sub">
            {t("Free tasks, crew tasks and blocks are set on each task.")}{" "}
            <Link to={`/p/${p.id}/tasks`} className="font-semibold text-brand-deep underline-offset-2 hover:underline">
              {t("Open tasks")}
            </Link>
          </section>
        </div>
      </div>

      <AlertDialog open={regen} onOpenChange={setRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Replace board links?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("The old TV link and QR code stop working right away. You'll need to open the new link on the TV and print the new QR code.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-bad hover:bg-bad/90"
              onClick={() => {
                boardLinks(p.id, "regen");
                toast.success(t("New board links created"));
              }}
            >
              {t("Replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default Board;
