import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Baby, Banknote, Bell, BookOpen, Boxes, Briefcase, CalendarClock, CalendarDays, CalendarOff, ChevronsLeft, ChevronsRight, ClipboardList, Clock, CreditCard, Dumbbell,
  FileBarChart, FileCheck2, FileSignature, FileText, Globe, LayoutDashboard, LogOut, Menu, Receipt, Settings, Shield, ShoppingCart, Tags, Truck, User, UserCog, Users, UserRound, Wallet, WifiOff, Wrench, X, ExternalLink, Activity,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { cx } from '@/lib/format';
import { Logo } from '@/components/Logo';
import { LangSwitch, ThemeSwitch, useSite, useBrandColor } from '@/public/Layout';
import { useAuth } from './auth';

type Item = { to: string; k: string; icon: any; perm?: string };
const groups: { k: string; items: Item[] }[] = [
  { k: 'adm.g.main', items: [{ to: '/admin', k: 'adm.dashboard', icon: LayoutDashboard, perm: 'dashboard:read' }, { to: '/admin/me', k: 'adm.me', icon: User, perm: 'self:read' }, { to: '/admin/notifications', k: 'adm.notifications', icon: Bell, perm: 'notifications:read' }] },
  { k: 'adm.g.members', items: [
    { to: '/admin/clients', k: 'adm.clients', icon: Users, perm: 'clients:read' },
    { to: '/admin/clients?cat=adult', k: 'adm.adults', icon: UserRound, perm: 'clients:read' },
    { to: '/admin/clients?cat=junior', k: 'adm.juniors', icon: Activity, perm: 'clients:read' },
    { to: '/admin/clients?cat=child', k: 'adm.children', icon: Baby, perm: 'clients:read' },
    { to: '/admin/subscriptions', k: 'adm.subscriptions', icon: CalendarClock, perm: 'subscriptions:read' },
    { to: '/admin/plans', k: 'adm.plans', icon: Tags, perm: 'plans:read' },
  ] },
  { k: 'adm.g.activity', items: [
    { to: '/admin/planning', k: 'adm.planning', icon: CalendarDays, perm: 'schedules:read' },
    { to: '/admin/activities', k: 'adm.activities', icon: Dumbbell, perm: 'activities:write' },
    { to: '/admin/coaches', k: 'adm.coaches', icon: Briefcase, perm: 'coaches:read' },
  ] },
  { k: 'adm.g.hr', items: [
    { to: '/admin/staff', k: 'adm.staff', icon: UserCog, perm: 'employees:read' },
    { to: '/admin/attendance', k: 'adm.attendance', icon: Clock, perm: 'attendance:read' },
    { to: '/admin/leaves', k: 'adm.leaves', icon: CalendarOff, perm: 'leaves:read' },
    { to: '/admin/payroll', k: 'adm.payroll', icon: Banknote, perm: 'payroll:read' },
    { to: '/admin/payslips', k: 'adm.payslips', icon: FileCheck2, perm: 'payroll:read' },
  ] },
  { k: 'adm.g.finance', items: [
    { to: '/admin/cash', k: 'adm.cash', icon: Wallet, perm: 'cash:read' },
    { to: '/admin/payments', k: 'adm.payments', icon: CreditCard, perm: 'payments:read' },
    { to: '/admin/expenses', k: 'adm.expenses', icon: ShoppingCart, perm: 'expenses:read' },
  ] },
  { k: 'adm.g.sales', items: [
    { to: '/admin/quotations', k: 'adm.quotations', icon: FileSignature, perm: 'quotations:read' },
    { to: '/admin/invoices', k: 'adm.invoices', icon: FileText, perm: 'invoices:read' },
    { to: '/admin/receipts', k: 'adm.receipts', icon: Receipt, perm: 'receipts:read' },
    { to: '/admin/suppliers', k: 'adm.suppliers', icon: Truck, perm: 'suppliers:read' },
  ] },
  { k: 'adm.g.ops', items: [
    { to: '/admin/equipment', k: 'adm.equipment', icon: Boxes, perm: 'equipment:read' },
    { to: '/admin/maintenance', k: 'adm.maintenance', icon: Wrench, perm: 'maintenance:read' },
    { to: '/admin/documents', k: 'adm.documents', icon: BookOpen, perm: 'website:read' },
    { to: '/admin/reports', k: 'adm.reports', icon: FileBarChart, perm: 'reports:read' },
  ] },
  { k: 'adm.g.system', items: [
    { to: '/admin/website', k: 'adm.website', icon: Globe, perm: 'website:read' },
    { to: '/admin/users', k: 'adm.users', icon: Shield, perm: 'users:read' },
    { to: '/admin/settings', k: 'adm.settings', icon: Settings, perm: 'settings:read' },
  ] },
];

export default function AdminLayout() {
  const { t } = usePrefs();
  const { me, can, logout } = useAuth();
  const { data: site } = useSite();
  useBrandColor(site);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('maxfit_sb') === '1');
  const [mobile, setMobile] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const loc = useLocation();
  useEffect(() => { setMobile(false); }, [loc.pathname, loc.search]);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const { data: notif } = useQuery({ queryKey: ['notif-count'], queryFn: () => api('/notifications'), enabled: can('notifications:read'), refetchInterval: 60_000 });
  const isActive = (to: string) => {
    const [path, qs] = to.split('?');
    if (qs) return loc.pathname === path && loc.search === '?' + qs;
    return path === '/admin' ? loc.pathname === '/admin' : loc.pathname.startsWith(path) && !(path === '/admin/clients' && loc.search.includes('cat='));
  };
  const nav = (
    <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
        if (!items.length) return null;
        return (
          <div key={g.k}>
            {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">{t(g.k)}</div>}
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} title={t(i.k)} className={() => cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition', isActive(i.to) ? 'bg-brand text-brand-fg shadow-[0_8px_24px_-12px_rgb(var(--brand))]' : 'text-zinc-400 hover:bg-white/5 hover:text-white', collapsed && 'justify-center px-0')}>
                  <i.icon className="h-[18px] w-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{t(i.k)}</span>}
                  {!collapsed && i.to === '/admin/notifications' && notif?.unread > 0 && <span className="ms-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{notif.unread}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
  const sidebarInner = (
    <>
      <div className={cx('flex h-16 items-center border-b border-white/10 px-4', collapsed && 'justify-center px-0')}>
        <Link to="/admin"><Logo site={site?.site} forceTheme="dark" compact={collapsed} /></Link>
      </div>
      {nav}
      <div className="border-t border-white/10 p-3">
        <button onClick={logout} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-red-500/15 hover:text-red-400', collapsed && 'justify-center')}>
          <LogOut className="h-[18px] w-[18px]" />{!collapsed && t('adm.logout')}
        </button>
      </div>
    </>
  );
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 dark:bg-ink dark:text-zinc-100">
      <aside className={cx('sticky top-0 hidden h-screen shrink-0 flex-col bg-ink text-white transition-all duration-300 dark:border-e dark:border-white/10 lg:flex', collapsed ? 'w-[72px]' : 'w-64')}>
        {sidebarInner}
        <button onClick={() => { setCollapsed(!collapsed); localStorage.setItem('maxfit_sb', collapsed ? '0' : '1'); }} className="absolute -end-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-ink text-zinc-400 hover:text-brand" aria-label="toggle">
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5 rtl:rotate-180" /> : <ChevronsLeft className="h-3.5 w-3.5 rtl:rotate-180" />}
        </button>
      </aside>
      <AnimatePresence>
        {mobile && (
          <motion.div className="fixed inset-0 z-[70] bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobile(false)}>
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 30 }} onClick={(e) => e.stopPropagation()} className="flex h-full w-72 flex-col bg-ink text-white rtl:ms-auto">
              <button className="absolute end-3 top-4 text-zinc-400" onClick={() => setMobile(false)}><X /></button>
              {sidebarInner}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex min-w-0 flex-1 flex-col">
        {!online && <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-bold text-ink"><WifiOff className="h-4 w-4" />{t('adm.offline')}</div>}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur-xl dark:border-white/10 dark:bg-ink/80 sm:px-6">
          <button className="lg:hidden" onClick={() => setMobile(true)} aria-label="menu"><Menu /></button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{me.display_name}</div>
            <div className="text-xs capitalize text-zinc-500">{me.role.replace('_', ' ')}</div>
          </div>
          <a href={import.meta.env.BASE_URL} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-brand sm:flex"><ExternalLink className="h-3.5 w-3.5" />Site public</a>
          <LangSwitch className="hidden sm:flex" />
          <ThemeSwitch />
          {can('notifications:read') && (
            <Link to="/admin/notifications" className="relative grid h-9 w-9 place-items-center rounded-full border border-current/20" aria-label="notifications">
              <Bell className="h-4 w-4" />
              {notif?.unread > 0 && <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{notif.unread > 99 ? '99+' : notif.unread}</span>}
            </Link>
          )}
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-6">
          <motion.div key={loc.pathname + loc.search} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Outlet />
          </motion.div>
        </main>
        <footer className="px-6 py-4 text-center text-[11px] text-zinc-500">SMART GYM 360 — Designed &amp; Developed by GM LAC.</footer>
      </div>
    </div>
  );
}

export const NavIcons = { ClipboardList };
