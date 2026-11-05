import { useCallback } from "react";

import { ES, RU } from "./i18n-dict";
import { useStore } from "./store";
import type { Lang } from "./types";

const DICTS: Record<Lang, Record<string, string> | null> = { en: null, es: ES, ru: RU };

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "en", label: "English", short: "EN" },
  { id: "es", label: "Español", short: "ES" },
  { id: "ru", label: "Русский", short: "RU" },
];

export const translate = (lang: Lang, key: string, vars?: Record<string, string | number>): string => {
  const d = DICTS[lang];
  let s = (d && d[key]) || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
};

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export const useT = (): TFn => {
  const lang = useStore((s) => s.lang);
  return useCallback((k: string, vars?: Record<string, string | number>) => translate(lang, k, vars), [lang]);
};

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-ES", ru: "ru-RU" };

export const useFmt = () => {
  const lang = useStore((s) => s.lang);
  const loc = LOCALE[lang];
  return {
    date: (iso?: string) => {
      if (!iso) return "—";
      const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
      return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });
    },
    short: (iso?: string) => {
      if (!iso) return "—";
      const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
      return d.toLocaleDateString(loc, { day: "numeric", month: "short" });
    },
    dateTime: (iso?: string) => {
      if (!iso) return "—";
      return new Date(iso).toLocaleString(loc, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    },
    time: (iso: string) => new Date(iso).toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }),
    num: (n: number) => n.toLocaleString(loc),
    /** "HH:MM" in the user's clock style */
    hm: (hm: string) => {
      const [h, m] = hm.split(":").map(Number);
      const d = new Date(2000, 0, 1, h || 0, m || 0);
      return d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    },
    /** short weekday name, 0 = Sunday */
    weekday: (n: number, style: "short" | "long" = "short") => new Date(2024, 0, 7 + n).toLocaleDateString(loc, { weekday: style }),
  };
};
