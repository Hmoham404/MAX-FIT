import { useEffect, useState } from 'react';
import { Apple, CheckCircle2, Download, MonitorDown, Share, Smartphone, SquarePlus } from 'lucide-react';
import { Logo } from '@/components/Logo';

/** Captures the browser "install app" prompt (Chrome/Edge/Android). */
let deferred: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; window.dispatchEvent(new Event('maxfit:installable')); });
}
export function useInstall() {
  const [can, setCan] = useState(!!deferred);
  const [installed, setInstalled] = useState(window.matchMedia('(display-mode: standalone)').matches);
  useEffect(() => {
    const a = () => setCan(true), b = () => setInstalled(true);
    window.addEventListener('maxfit:installable', a); window.addEventListener('appinstalled', b);
    return () => { window.removeEventListener('maxfit:installable', a); window.removeEventListener('appinstalled', b); };
  }, []);
  const install = async () => { if (!deferred) return false; deferred.prompt(); const r = await deferred.userChoice; deferred = null; setCan(false); return r.outcome === 'accepted'; };
  return { can, installed, install };
}

const APK = import.meta.env.BASE_URL + 'download/maxfit-admin.apk';

export default function AppPage() {
  const { can, installed, install } = useInstall();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div className="grain relative min-h-screen overflow-hidden bg-ink px-4 py-12 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink to-brand/25" />
      <div className="relative mx-auto max-w-3xl">
        <Logo forceTheme="dark" size="lg" />
        <h1 className="mt-8 text-5xl font-black uppercase italic sm:text-6xl">Application <span className="text-brand">MAX FIT</span></h1>
        <p className="mt-3 text-lg text-zinc-300">L’espace de gestion (administration, réception, coachs) installé comme une vraie application sur téléphone, tablette ou ordinateur.</p>
        {installed && <p className="mt-6 flex items-center gap-2 rounded-2xl bg-emerald-500/15 p-4 text-emerald-300"><CheckCircle2 />L’application est déjà installée sur cet appareil.</p>}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a href={APK} download className="group rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:border-brand hover:bg-brand/10">
            <Smartphone className="h-10 w-10 text-brand" />
            <h2 className="mt-4 text-2xl font-extrabold">Android — APK</h2>
            <p className="mt-1 text-sm text-zinc-400">Téléchargez puis ouvrez le fichier. Autorisez « Installer des applications inconnues » si Android le demande.</p>
            <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 font-bold text-brand-fg"><Download className="h-4 w-4" />Télécharger l’APK</span>
          </a>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <MonitorDown className="h-10 w-10 text-brand" />
            <h2 className="mt-4 text-2xl font-extrabold">Ordinateur / Android (PWA)</h2>
            <p className="mt-1 text-sm text-zinc-400">Installation directe depuis Chrome ou Edge, sans fichier. Mises à jour automatiques.</p>
            <button onClick={install} disabled={!can} className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-bold text-ink disabled:opacity-40"><Download className="h-4 w-4" />Installer l’application</button>
            {!can && !installed && <p className="mt-2 text-xs text-zinc-500">Si le bouton est grisé : menu du navigateur ⋮ → « Installer MAX FIT » / « Ajouter à l’écran d’accueil ».</p>}
          </div>
          <div className={`rounded-3xl border p-6 sm:col-span-2 ${ios ? 'border-brand bg-brand/10' : 'border-white/10 bg-white/5'}`}>
            <Apple className="h-10 w-10 text-brand" />
            <h2 className="mt-4 text-2xl font-extrabold">iPhone / iPad</h2>
            <ol className="mt-3 space-y-2 text-sm text-zinc-300">
              <li className="flex items-center gap-2">1. Ouvrez ce lien dans <b>Safari</b>.</li>
              <li className="flex items-center gap-2">2. Touchez <Share className="h-4 w-4" /> <b>Partager</b>.</li>
              <li className="flex items-center gap-2">3. Choisissez <SquarePlus className="h-4 w-4" /> <b>Sur l’écran d’accueil</b>.</li>
            </ol>
          </div>
        </div>
        <a href={import.meta.env.BASE_URL + 'admin'} className="mt-10 inline-block text-sm text-zinc-400 underline">Ouvrir l’administration dans le navigateur →</a>
        <p className="mt-12 text-center text-[11px] text-zinc-600">SMART GYM 360 — Designed &amp; Developed by GM LAC.</p>
      </div>
    </div>
  );
}
