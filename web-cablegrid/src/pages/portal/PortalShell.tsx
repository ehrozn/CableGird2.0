import { Clock, KeyRound, Link2Off, Loader2, Lock } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { LanguageSwitcher } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinByLink } from "@/lib/cloud";
import { useT } from "@/lib/i18n";
import { setActor } from "@/lib/me";
import { useStore } from "@/lib/store";
import type { PortalLink, Project } from "@/lib/types";

export const usePortal = (): { p?: Project; link?: PortalLink } => {
  const { token } = useParams();
  const projects = useStore((s) => s.projects);
  return useMemo(() => {
    for (const p of projects) {
      const link = p.links.find((l) => l.token === token);
      if (link) return { p, link };
    }
    return {};
  }, [projects, token]);
};

export const Blocker = ({ icon, title, text }: { icon: ReactNode; title: string; text: string }) => (
  <div className="blueprint grid min-h-dvh place-items-center p-6">
    <div className="panel rise w-full max-w-sm p-8 text-center">
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand [&>svg]:h-7 [&>svg]:w-7">{icon}</div>
      <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-sub">{text}</p>
      <div className="mt-6 flex justify-center">
        <LanguageSwitcher />
      </div>
    </div>
  </div>
);

export const LinkGate = ({ children }: { children: (p: Project, link: PortalLink) => ReactNode }) => {
  const t = useT();
  const { p, link } = usePortal();
  const key = link ? `cg-pin-${link.id}` : "";
  const [ok, setOk] = useState(() => (key ? sessionStorage.getItem(key) === link?.pin : false));
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const { token } = useParams();
  const [cloud, setCloud] = useState<"idle" | "loading" | "failed">(link ? "idle" : "loading");

  // everything done in a portal is signed by the link, even in the owner's own browser
  const linkName = link?.name;
  useEffect(() => {
    if (!linkName) return;
    setActor(linkName);
    return () => {
      setActor(null);
      setActor(null, "person");
    };
  }, [linkName]);

  // not on this device: download the project from the cloud
  useEffect(() => {
    if (link || !token) return;
    let alive = true;
    setCloud("loading");
    joinByLink(token)
      .then(() => alive && setCloud("idle"))
      .catch(() => alive && setCloud("failed"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, !!link]);

  if ((!p || !link) && cloud === "loading")
    return <Blocker icon={<Loader2 className="animate-spin" />} title={t("Opening the project…")} text={t("Downloading the latest data. This takes a few seconds the first time.")} />;
  if (!p || !link) return <Blocker icon={<Link2Off />} title={t("Link not found")} text={t("This link does not exist or was replaced. Ask your project manager for a new one.")} />;
  if (!link.active) return <Blocker icon={<Lock />} title={t("Link disabled")} text={t("The project manager has turned this link off.")} />;
  if (link.expiresAt && link.expiresAt < new Date().toISOString().slice(0, 10))
    return <Blocker icon={<Clock />} title={t("Link expired")} text={t("This link is no longer valid. Ask your project manager to extend it.")} />;
  if (link.pin && !ok)
    return (
      <div className="blueprint grid min-h-dvh place-items-center p-6">
        <form
          className="panel rise w-full max-w-sm p-8 text-center"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin === link.pin) {
              sessionStorage.setItem(key, pin);
              setOk(true);
            } else {
              setErr(true);
              setPin("");
            }
          }}
        >
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold text-ink">{p.name}</h1>
          <p className="mt-1 text-sm text-sub">{t("Enter the PIN for {n}", { n: link.name })}</p>
          <Input
            autoFocus
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setErr(false);
              setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="mt-5 h-14 text-center font-mono text-2xl tracking-[0.5em]"
            aria-label="PIN"
          />
          {err && <p className="mt-2 text-sm text-bad">{t("Wrong PIN")}</p>}
          <Button type="submit" className="mt-4 w-full" size="lg" disabled={!pin}>
            {t("Continue")}
          </Button>
        </form>
      </div>
    );
  return <>{children(p, link)}</>;
};

export const PortalTop = ({ p, title, right }: { p: Project; title: string; right?: ReactNode }) => (
  <header className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur">
    <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-3 px-3 md:px-6">
      <img src="/logo-128.png" alt="" className="h-8 w-8 rounded-[8px]" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[15px] font-bold text-ink">{p.name}</div>
        <div className="truncate text-xs text-sub">{title}</div>
      </div>
      {right}
      <LanguageSwitcher />
    </div>
  </header>
);
