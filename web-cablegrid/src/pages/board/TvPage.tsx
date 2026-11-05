import { MonitorOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { ScaledStage, TvBoard } from "@/components/board/TvBoard";

import { cn } from "@/lib/utils";
import { useBoardFeed } from "@/lib/board-feed";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Lang } from "@/lib/types";

const clientId = () => {
  let id = localStorage.getItem("cg-tv-client");
  if (!id) {
    id = `tv-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("cg-tv-client", id);
  }
  return id;
};

/** Read-only TV board: /tv/:token (optional ?lang=en|es|ru). */
const TvPage = () => {
  const { token = "" } = useParams();
  const [qs] = useSearchParams();
  const t = useT();
  const setLang = useStore((s) => s.setLang);
  const client = useMemo(clientId, []);
  const feed = useBoardFeed(token, client);

  useEffect(() => {
    const l = qs.get("lang");
    if (l === "en" || l === "es" || l === "ru") setLang(l as Lang);
  }, [qs, setLang]);
  useEffect(() => {
    document.title = feed.data?.name ? `${feed.data.name} · ${t("Work board")}` : t("Work board");
  }, [feed.data?.name, t]);

  const takeUrl = feed.data?.takeToken ? `${window.location.origin}/take/${feed.data.takeToken}` : null;

  // in fullscreen the cursor hides after 3s, so the TV looks clean
  const [fsState, setFsState] = useState(0);
  useEffect(() => {
    const on = () => setFsState((n) => n + 1);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    let to: number | undefined;
    const arm = () => {
      setHide(false);
      clearTimeout(to);
      to = window.setTimeout(() => setHide(true), 3000);
    };
    const on = () => arm();
    arm();
    window.addEventListener("mousemove", on);
    window.addEventListener("pointerdown", on);
    return () => {
      clearTimeout(to);
      window.removeEventListener("mousemove", on);
      window.removeEventListener("pointerdown", on);
    };
  }, []);
  const [hide, setHide] = useState(false);
  const clean = hide && Boolean(document.fullscreenElement) && fsState >= 0;

  if (feed.status === "revoked" && !feed.data)
    return (
      <div className="blueprint grid h-dvh place-items-center bg-[#EEF1EC] p-8 text-center">
        <div className="max-w-md">
          <MonitorOff className="mx-auto h-14 w-14 text-sub" />
          <h1 className="mt-4 text-2xl font-extrabold text-ink">{t("This board link is turned off")}</h1>
          <p className="mt-2 text-sub">{t("Ask the project manager for a new board link.")}</p>
        </div>
      </div>
    );
  if (!feed.data)
    return (
      <div className="grid h-dvh place-items-center bg-ink">
        <img src="/logo-128.png" alt="" className="h-14 w-14 animate-pulse rounded-2xl" />
      </div>
    );
  return (
    <ScaledStage className={cn("h-dvh w-screen bg-[#EEF1EC]", clean && "cursor-none")}>
      <TvBoard data={feed.data} takeUrl={takeUrl} status={feed.status} updatedAt={feed.updatedAt} fullscreen />
      {feed.status === "revoked" && (
        <div className="absolute inset-0 grid place-items-center bg-ink/80 text-center text-white">
          <div>
            <MonitorOff className="mx-auto h-24 w-24 opacity-70" />
            <div className="mt-6 text-[56px] font-extrabold">{t("This board link is turned off")}</div>
            <div className="mt-2 text-[28px] text-white/70">{t("Ask the project manager for a new board link.")}</div>
          </div>
        </div>
      )}
    </ScaledStage>
  );
};

export default TvPage;
