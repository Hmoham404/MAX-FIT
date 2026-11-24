import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import fr, { type Dict } from '@/i18n/fr';
import en from '@/i18n/en';
import ar from '@/i18n/ar';

export type Lang = 'fr' | 'en' | 'ar';
export type Theme = 'dark' | 'light';
const dicts: Record<Lang, Dict> = { fr, en, ar };

interface Prefs {
  lang: Lang;
  setLang: (l: Lang) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  t: (k: keyof Dict | string) => string;
  /** pick localized field from a record: name / name_en / name_ar */
  tr: (obj: any, field: string) => string;
  /** pick a {fr,en,ar} object */
  tl: (v: any) => string;
  dir: 'ltr' | 'rtl';
  locale: string;
}
const Ctx = createContext<Prefs>(null as unknown as Prefs);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangS] = useState<Lang>(() => (localStorage.getItem('maxfit_lang') as Lang) || 'fr');
  const [theme, setThemeS] = useState<Theme>(() => (localStorage.getItem('maxfit_theme') as Theme) || 'dark');
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0D10' : '#FFFFFF');
  }, [theme]);
  const value = useMemo<Prefs>(() => {
    const d = dicts[lang];
    return {
      lang,
      theme,
      dir,
      locale: lang === 'ar' ? 'ar-TN' : lang === 'en' ? 'en-GB' : 'fr-FR',
      setLang: (l) => (localStorage.setItem('maxfit_lang', l), setLangS(l)),
      setTheme: (t) => (localStorage.setItem('maxfit_theme', t), setThemeS(t)),
      t: (k) => (d as any)[k] ?? (fr as any)[k] ?? k,
      tr: (obj, field) => (obj ? (lang !== 'fr' && obj[`${field}_${lang}`]) || obj[field] || '' : ''),
      tl: (v) => (v == null ? '' : typeof v === 'string' ? v : v[lang] || v.fr || ''),
    };
  }, [lang, theme, dir]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const usePrefs = () => useContext(Ctx);
