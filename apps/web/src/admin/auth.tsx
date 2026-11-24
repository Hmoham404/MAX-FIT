import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, session } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { LangSwitch, ThemeSwitch } from '@/public/Layout';

export interface Me { id: number; display_name: string; role: string; employee_id: number | null; permissions: string[] }
const Ctx = createContext<{ me: Me; can: (p: string) => boolean; logout: () => Promise<void> }>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(session.get());
  const qc = useQueryClient();
  useEffect(() => {
    const h = () => { setToken(null); qc.clear(); };
    window.addEventListener('maxfit:logout', h);
    return () => window.removeEventListener('maxfit:logout', h);
  }, [qc]);
  const { data: me, isLoading, error } = useQuery<Me>({ queryKey: ['me', token], queryFn: () => api('/auth/me'), enabled: !!token, retry: false });
  if (!token || error) return <Login onLogin={(t) => { session.set(t); setToken(t); }} />;
  if (isLoading || !me) return <div className="grid min-h-screen place-items-center bg-ink"><Loader2 className="h-8 w-8 animate-spin text-brand" /></div>;
  const perms = new Set(me.permissions);
  const logout = async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); session.clear(); qc.clear(); setToken(null); };
  return <Ctx.Provider value={{ me, can: (p) => perms.has(p), logout }}>{children}</Ctx.Provider>;
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const { t } = usePrefs();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const r = await api<{ token: string }>('/auth/login', { body: { code: code.trim().toUpperCase() } });
      onLogin(r.token);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="grain relative grid min-h-screen place-items-center overflow-hidden bg-ink p-4 text-white">
      <img src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1800&q=60" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
      <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink/90 to-brand/25" />
      <div className="absolute right-4 top-4 flex gap-2"><LangSwitch /><ThemeSwitch /></div>
      <motion.form onSubmit={submit} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
        <Link to="/"><Logo forceTheme="dark" /></Link>
        <h1 className="mt-8 font-display text-5xl uppercase tracking-wide">{t('adm.login.title')}</h1>
        <p className="mt-1 text-sm text-zinc-400">{t('adm.login.sub')}</p>
        <label className="mt-8 block">
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">{t('adm.login.code')}</span>
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/15 bg-black/30 px-4 focus-within:border-brand">
            <KeyRound className="h-5 w-5 text-brand" />
            <input autoFocus type="password" autoComplete="current-password" inputMode="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX"
              className="h-14 flex-1 bg-transparent font-mono text-lg tracking-[0.25em] outline-none placeholder:text-zinc-600" dir="ltr" />
          </div>
        </label>
        {err && <motion.p initial={{ x: -10 }} animate={{ x: 0 }} className="mt-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300">{err}</motion.p>}
        <Button type="submit" size="lg" loading={loading} disabled={code.trim().length < 6} className="mt-6 w-full">{t('adm.login.btn')}</Button>
        <p className="mt-6 flex items-start gap-2 text-xs text-zinc-500"><ShieldCheck className="h-4 w-4 shrink-0" />{t('adm.login.help')}</p>
        <p className="mt-6 text-center text-[10px] text-zinc-600">SMART GYM 360 — Designed &amp; Developed by GM LAC.</p>
      </motion.form>
    </div>
  );
}
