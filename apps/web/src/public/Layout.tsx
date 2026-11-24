import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock, Menu, MessageCircle, Moon, Sun, X, MapPin, Phone, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { usePrefs, type Lang } from '@/lib/prefs';
import { Logo, SocialIcon, SocialLinks } from '@/components/Logo';
import { cx, waLink } from '@/lib/format';

export function useSite() {
  const preview = new URLSearchParams(window.location.search).get('preview') === '1';
  return useQuery({
    queryKey: ['public-site', preview],
    queryFn: () => api('/public/site', { query: preview ? { preview: 1 } : undefined }),
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  return m ? `${parseInt(m[1], 16)} ${parseInt(m[2], 16)} ${parseInt(m[3], 16)}` : null;
}
/** Applies the brand color and picks a readable text color (white or black) for content placed on it. */
export function applyBrandColor(hex?: string) {
  const rgb = hexToRgb(hex || '');
  if (!rgb) return;
  const [r, g, b] = rgb.split(' ').map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  document.documentElement.style.setProperty('--brand', rgb);
  document.documentElement.style.setProperty('--brand-fg', lum > 0.6 ? '11 13 16' : '255 255 255');
}
export function useBrandColor(site: any) {
  useEffect(() => applyBrandColor(site?.site?.colors?.primary), [site?.site?.colors?.primary]);
}

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = usePrefs();
  return (
    <div className={cx('flex items-center rounded-full border border-current/20 p-0.5 text-xs font-bold', className)}>
      {(['fr', 'en', 'ar'] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} className={cx('rounded-full px-2.5 py-1 uppercase transition', lang === l ? 'bg-brand text-brand-fg' : 'opacity-70 hover:opacity-100')} aria-label={l}>
          {l === 'ar' ? 'ع' : l}
        </button>
      ))}
    </div>
  );
}
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = usePrefs();
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={cx('grid h-9 w-9 place-items-center rounded-full border border-current/20 transition hover:bg-current/10', className)} aria-label="theme">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

const links = [
  ['/', 'nav.home'], ['/about', 'nav.about'], ['/activities', 'nav.activities'], ['/planning', 'nav.planning'],
  ['/pricing', 'nav.pricing'], ['/coaches', 'nav.coaches'], ['/gallery', 'nav.gallery'], ['/contact', 'nav.contact'],
] as const;

export default function PublicLayout() {
  const { t, tl } = usePrefs();
  const { data: site } = useSite();
  useBrandColor(site);
  const loc = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const isHome = loc.pathname === '/';
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    h();
    window.addEventListener('scroll', h, { passive: true });
    return () => window.removeEventListener('scroll', h);
  }, []);
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  useEffect(() => {
    if (site?.seo?.title) document.title = site.seo.title;
    if (site?.seo?.description) document.querySelector('meta[name="description"]')?.setAttribute('content', site.seo.description);
    if (site?.site?.favicon) document.querySelector('link[rel="icon"]')?.setAttribute('href', site.site.favicon);
  }, [site]);
  const contact = site?.contact ?? {};
  const transparent = isHome && !scrolled && !open;

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-ink dark:text-white">
      {site?.preview && <div className="fixed inset-x-0 top-0 z-[60] bg-amber-400 py-1 text-center text-xs font-bold text-ink">PRÉVISUALISATION — brouillon non publié</div>}
      <header className={cx('fixed inset-x-0 z-50 transition-all duration-300', site?.preview ? 'top-6' : 'top-0', transparent ? 'bg-transparent text-white' : 'border-b border-zinc-200/70 bg-white/85 text-zinc-900 backdrop-blur-xl dark:border-white/10 dark:bg-ink/85 dark:text-white')}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="shrink-0"><Logo site={site?.site} forceTheme={transparent ? 'dark' : undefined} /></Link>
          <nav className="ms-6 hidden flex-1 items-center gap-1 xl:flex">
            {links.map(([to, k]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cx('relative rounded-full px-3 py-2 text-sm font-semibold uppercase tracking-wide transition hover:text-brand', isActive && 'text-brand')}>
                {t(k)}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-2">
            <SocialLinks contact={contact} size="sm" className="hidden lg:flex" />
            <LangSwitch className="hidden sm:flex" />
            <ThemeSwitch />
            <Link to="/pricing" className="hidden rounded-full bg-brand px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide text-brand-fg transition hover:scale-105 hover:shadow-[0_0_30px_-5px_rgb(var(--brand))] md:inline-flex">{t('nav.join')}</Link>
            <button className="grid h-10 w-10 place-items-center rounded-full xl:hidden" onClick={() => setOpen(!open)} aria-label="menu">{open ? <X /> : <Menu />}</button>
          </div>
        </div>
        <AnimatePresence>
          {open && (
            <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-zinc-200 bg-white dark:border-white/10 dark:bg-ink xl:hidden">
              <div className="flex flex-col gap-1 px-4 py-4">
                {links.map(([to, k], i) => (
                  <motion.div key={to} initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
                    <NavLink to={to} end={to === '/'} className={({ isActive }) => cx('block rounded-xl px-4 py-3 font-display text-2xl tracking-wide', isActive ? 'bg-brand text-brand-fg' : 'hover:bg-zinc-100 dark:hover:bg-white/5')}>{t(k)}</NavLink>
                  </motion.div>
                ))}
                <LangSwitch className="mt-3 self-start sm:hidden" />
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className={cx(!isHome && 'pt-[72px]')}>
        <Outlet context={site} />
      </main>

      {contact.whatsapp && (
        <a href={waLink(contact.whatsapp, 'Bonjour MAX FIT, je souhaite des informations.')} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-5 right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-xl shadow-black/30 transition hover:scale-110 rtl:left-5 rtl:right-auto" aria-label="WhatsApp">
          <SocialIcon kind="whatsapp" className="h-7 w-7" />
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-[#25D366]/50" />
        </a>
      )}

      <footer className="relative overflow-hidden border-t border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-[#07080a]">
        <div className="pointer-events-none absolute -bottom-10 left-0 right-0 select-none text-center font-display text-[22vw] leading-none text-zinc-900/[0.03] dark:text-white/[0.03]" dir="ltr">{site?.site?.name || 'MAX FIT'}</div>
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
          <div className="space-y-4 md:col-span-1">
            <Logo site={site?.site} size="lg" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{tl(site?.footer?.text)}</p>
            <SocialLinks contact={contact} />
          </div>
          <div>
            <h4 className="mb-4 font-display text-xl tracking-wide">{t('footer.links')}</h4>
            <ul className="grid grid-cols-2 gap-2 text-sm text-zinc-600 dark:text-zinc-400 md:grid-cols-1">
              {links.map(([to, k]) => <li key={to}><Link to={to} className="hover:text-brand">{t(k)}</Link></li>)}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-display text-xl tracking-wide">{t('footer.info')}</h4>
            <ul className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              {contact.address && <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand" />{contact.address}</li>}
              {contact.phone && <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-brand" /><a href={`tel:${contact.phone}`} dir="ltr">{contact.phone}</a></li>}
              {contact.email && <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-brand" /><a href={`mailto:${contact.email}`}>{contact.email}</a></li>}
            </ul>
          </div>
          <div>
            <h4 className="mb-4 font-display text-xl tracking-wide">{t('home.hours')}</h4>
            <ul className="space-y-2 text-sm">
              {(contact.hours ?? []).map((h: any, i: number) => (
                <li key={i} className="flex justify-between gap-4 border-b border-dashed border-zinc-300 pb-2 dark:border-white/10"><span className="text-zinc-600 dark:text-zinc-400">{tl(h.days)}</span><span className="font-semibold" dir="ltr">{h.time}</span></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="relative border-t border-zinc-200 dark:border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6">
            <span>© {new Date().getFullYear()} {site?.site?.name || 'MAX FIT'}. {t('footer.rights')}</span>
            <span className="opacity-70" dir="ltr">SMART GYM 360 — Designed &amp; Developed by GM LAC.</span>
            <Link to="/admin" className="inline-flex items-center gap-1 hover:text-brand"><Lock className="h-3 w-3" />{t('footer.staff')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
