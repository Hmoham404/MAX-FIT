import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, ArrowUpRight, Award, CalendarDays, ChevronLeft, ChevronRight, Clock, Dumbbell, Facebook, Instagram, MapPin, MessageCircle, Phone, Mail, Sparkles, Users, X, Zap, Timer, Tag } from 'lucide-react';
import { api, mediaUrl, resolveAsset } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { addDays, cx, money, startOfWeek, todayISO, waLink } from '@/lib/format';
import { Skeleton } from '@/components/ui';

const useSiteCtx = () => useOutletContext<any>();
const FALLBACK = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1200&q=70';
export const Img = ({ src, alt, className }: { src?: string; alt: string; className?: string }) => (
  <img src={resolveAsset(src) || FALLBACK} alt={alt} loading="lazy" className={className} onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK; }} />
);

function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}
function SectionTitle({ kicker, title, action, light }: { kicker: string; title: string; action?: ReactNode; light?: boolean }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <Reveal>
        <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-lime-600 dark:text-brand"><span className="h-px w-8 bg-current" />{kicker}</div>
        <h2 className={cx('max-w-3xl font-display text-5xl uppercase leading-[0.95] tracking-wide sm:text-6xl', light && 'text-white')}>{title}</h2>
      </Reveal>
      {action}
    </div>
  );
}
function PageHero({ title, subtitle, image }: { title: string; subtitle: string; image?: string }) {
  return (
    <section className="grain relative isolate overflow-hidden bg-ink py-24 text-white sm:py-32">
      <Img src={image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="font-display text-6xl uppercase tracking-wide sm:text-8xl">{title}</motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 max-w-xl text-lg text-zinc-300">{subtitle}</motion.p>
        <div className="mt-6 h-1.5 w-24 bg-brand" />
      </div>
    </section>
  );
}
const durLabel = (p: any, t: (k: string) => string) =>
  p.duration_unit === 'month' ? `${p.duration_value} ${p.duration_value > 1 ? t('dur.months') : t('dur.month')}` : `1 ${t('dur.' + p.duration_unit)}`;

// ======================= HOME =======================
export function HomePage() {
  const site = useSiteCtx();
  const { t, tl, tr } = usePrefs();
  const slogans: string[] = site?.site?.slogans ? tl(site.site.slogans) as any : [];
  const list = Array.isArray(slogans) && slogans.length ? slogans : [tl(site?.site?.slogan) || 'Dépasse tes limites.'];
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % list.length), 3200); return () => clearInterval(id); }, [list.length]);
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, 200]);
  const scale = useTransform(scrollY, [0, 800], [1.05, 1.2]);
  const acts: any[] = site?.activities ?? [];
  const adultPlans = (site?.plans ?? []).filter((p: any) => p.category_code === 'adult' && p.duration_unit === 'month').slice(0, 3);

  return (
    <>
      {/* HERO */}
      <section className="grain relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink pb-20 pt-32 text-white">
        <motion.div style={{ y, scale }} className="absolute inset-0 -z-20">
          {site?.site?.heroVideo ? (
            <video src={resolveAsset(site.site.heroVideo)} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          ) : (
            <Img src={site?.site?.heroImage} alt="MAX FIT" className="h-full w-full object-cover" />
          )}
        </motion.div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/60 to-ink/20" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink/80 via-transparent to-transparent rtl:bg-gradient-to-l" />
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> {t('hero.kicker')}
          </motion.div>
          <h1 className="font-display text-[17vw] uppercase leading-[0.82] tracking-wide sm:text-[11rem] lg:text-[13rem]" dir="ltr">
            <motion.span initial={{ opacity: 0, x: -60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="block">{(site?.site?.name || 'MAX FIT').split(' ')[0]}</motion.span>
            <motion.span initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="block text-brand">{(site?.site?.name || 'MAX FIT').split(' ').slice(1).join(' ') || 'FIT'}</motion.span>
          </h1>
          <div className="mt-6 h-12 overflow-hidden sm:h-14">
            <AnimatePresence mode="wait">
              <motion.p key={i + list[i]} initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} transition={{ duration: 0.45 }} className="text-2xl font-bold sm:text-4xl">
                {list[i]}
              </motion.p>
            </AnimatePresence>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-wrap gap-3">
            <Link to="/pricing" className="group inline-flex items-center gap-2 rounded-full bg-brand px-7 py-4 text-sm font-extrabold uppercase tracking-wider text-ink transition hover:shadow-[0_0_40px_-5px_rgb(var(--brand))]">
              {t('hero.cta1')} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1 rtl:rotate-180" />
            </Link>
            <Link to="/planning" className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-4 text-sm font-extrabold uppercase tracking-wider backdrop-blur transition hover:bg-white hover:text-ink">
              <CalendarDays className="h-4 w-4" /> {t('hero.cta2')}
            </Link>
          </motion.div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="overflow-hidden border-y border-ink bg-brand py-4 text-ink" dir="ltr">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap font-display text-3xl uppercase tracking-wider">
          {[...acts, ...acts, ...acts, ...acts].map((a, k) => (<span key={k} className="flex items-center gap-10">{tr(a, 'name')}<Zap className="h-6 w-6" /></span>))}
        </div>
      </div>

      {/* STATS */}
      <section className="bg-ink py-14 text-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 sm:px-6 md:grid-cols-4">
          {[[`${acts.length}+`, t('stat.activities')], [`${(site?.coaches ?? []).length}`, t('stat.coaches')], ['20+', t('stat.classes')], ['7/7', t('home.hours')]].map(([v, l], k) => (
            <Reveal key={k} delay={k * 0.08} className="border-s-2 border-brand ps-5">
              <div className="font-display text-6xl text-brand">{v}</div>
              <div className="text-sm uppercase tracking-widest text-zinc-400">{l}</div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ADVANTAGES */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionTitle kicker={t('home.why')} title={t('home.whyTitle')} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[Dumbbell, Award, Users, Clock].map((Icon, k) => (
            <Reveal key={k} delay={k * 0.08}>
              <div className="group h-full rounded-3xl border border-zinc-200 bg-zinc-50 p-7 transition hover:-translate-y-1 hover:border-brand hover:shadow-2xl dark:border-white/10 dark:bg-anthracite">
                <div className="mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-ink text-brand transition group-hover:rotate-6 group-hover:bg-brand group-hover:text-ink dark:bg-white/5"><Icon className="h-7 w-7" /></div>
                <h3 className="mb-2 text-xl font-extrabold">{t(`adv.${k + 1}.t`)}</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{t(`adv.${k + 1}.d`)}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ACTIVITIES */}
      <section className="bg-zinc-50 py-24 dark:bg-[#0e1014]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle kicker={t('home.activities')} title={t('home.activitiesTitle')} action={<Link to="/activities" className="inline-flex items-center gap-2 font-bold uppercase tracking-wider hover:text-brand">{t('home.seeAll')} <ArrowUpRight className="h-5 w-5" /></Link>} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {!site && Array.from({ length: 8 }).map((_, k) => <Skeleton key={k} className="aspect-[3/4]" />)}
            {acts.slice(0, 8).map((a, k) => <ActivityCard key={a.id} a={a} delay={(k % 4) * 0.06} tall={k % 3 === 0} />)}
          </div>
        </div>
      </section>

      {/* EQUIPMENT */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal className="relative">
          <div className="grid grid-cols-2 gap-4">
            <Img src={site?.gallery?.[1] ? mediaUrl(site.gallery[1]) : undefined} alt="" className="aspect-[3/4] w-full rounded-3xl object-cover" />
            <Img src={site?.gallery?.[2] ? mediaUrl(site.gallery[2]) : undefined} alt="" className="mt-12 aspect-[3/4] w-full rounded-3xl object-cover" />
          </div>
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 rounded-2xl bg-brand px-6 py-4 font-display text-3xl uppercase text-ink shadow-2xl">1000 m²</div>
        </Reveal>
        <div>
          <SectionTitle kicker={t('home.equipment')} title={t('home.equipmentTitle')} />
          <Reveal><p className="text-lg text-zinc-600 dark:text-zinc-400">{t('home.equipmentText')}</p></Reveal>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {(site?.rooms ?? []).map((r: any, k: number) => (
              <Reveal key={r.id} delay={k * 0.05}><div className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4 font-semibold dark:border-white/10"><Sparkles className="h-5 w-5 shrink-0 text-lime-600 dark:text-brand" />{r.name}</div></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="grain relative bg-ink py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle light kicker={t('home.pricing')} title={t('home.pricingTitle')} action={<Link to="/pricing" className="inline-flex items-center gap-2 font-bold uppercase tracking-wider hover:text-brand">{t('home.seeAll')} <ArrowUpRight className="h-5 w-5" /></Link>} />
          <div className="grid gap-5 md:grid-cols-3">{adultPlans.map((p: any, k: number) => <PlanCard key={p.id} p={p} promos={site?.promotions} delay={k * 0.08} dark />)}</div>
        </div>
      </section>

      {/* PLANNING PREVIEW */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionTitle kicker={t('home.planning')} title={t('home.planningTitle')} action={<Link to="/planning" className="inline-flex items-center gap-2 font-bold uppercase tracking-wider hover:text-brand">{t('home.seeAll')} <ArrowUpRight className="h-5 w-5" /></Link>} />
        <UpcomingSessions />
      </section>

      {/* COACHES */}
      {(site?.coaches ?? []).length > 0 && (
        <section className="bg-zinc-50 py-24 dark:bg-[#0e1014]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <SectionTitle kicker={t('home.coaches')} title={t('home.coachesTitle')} action={<Link to="/coaches" className="inline-flex items-center gap-2 font-bold uppercase tracking-wider hover:text-brand">{t('home.seeAll')} <ArrowUpRight className="h-5 w-5" /></Link>} />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{site.coaches.slice(0, 3).map((c: any, k: number) => <CoachCard key={c.id} c={c} delay={k * 0.08} />)}</div>
          </div>
        </section>
      )}

      {/* GALLERY + HOURS */}
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <SectionTitle kicker={t('home.gallery')} title={t('gal.subtitle')} action={<Link to="/gallery" className="inline-flex items-center gap-2 font-bold uppercase tracking-wider hover:text-brand">{t('home.seeAll')} <ArrowUpRight className="h-5 w-5" /></Link>} />
            <div className="grid grid-cols-3 gap-3">
              {(site?.gallery ?? []).slice(0, 6).map((g: any, k: number) => (
                <Reveal key={g.id} delay={k * 0.04} className={cx(k === 0 && 'col-span-2 row-span-2')}><Img src={mediaUrl(g)} alt={g.title} className="h-full w-full rounded-2xl object-cover transition duration-500 hover:scale-[1.03]" /></Reveal>
              ))}
            </div>
          </div>
          <Reveal className="self-end">
            <div className="rounded-3xl bg-brand p-8 text-ink">
              <Clock className="mb-4 h-10 w-10" />
              <h3 className="mb-6 font-display text-4xl uppercase">{t('home.hours')}</h3>
              <ul className="space-y-3">
                {(site?.contact?.hours ?? []).map((h: any, k: number) => (<li key={k} className="flex justify-between gap-3 border-b border-ink/20 pb-3 font-semibold"><span>{tl(h.days)}</span><span dir="ltr">{h.time}</span></li>))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 pb-24 sm:px-6">
        <Reveal className="grain relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-ink p-10 text-white sm:p-16">
          <Img src={site?.gallery?.[4] ? mediaUrl(site.gallery[4]) : undefined} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="relative max-w-2xl">
            <h2 className="font-display text-6xl uppercase leading-none sm:text-7xl">{t('home.ctaTitle')}</h2>
            <p className="mt-4 text-lg text-zinc-300">{t('home.ctaText')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              {site?.contact?.whatsapp && <a href={waLink(site.contact.whatsapp, 'Bonjour MAX FIT, je souhaite m’inscrire.')} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-4 font-extrabold uppercase tracking-wider text-white transition hover:scale-105"><MessageCircle className="h-5 w-5" />WhatsApp</a>}
              <Link to="/contact" className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-4 font-extrabold uppercase tracking-wider text-ink transition hover:scale-105">{t('nav.contact')} <ArrowRight className="h-4 w-4 rtl:rotate-180" /></Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function ActivityCard({ a, delay = 0, tall }: { a: any; delay?: number; tall?: boolean }) {
  const { tr } = usePrefs();
  return (
    <Reveal delay={delay}>
      <Link to="/planning" className={cx('group relative block overflow-hidden rounded-3xl bg-ink', tall ? 'aspect-[3/4]' : 'aspect-[3/4] lg:aspect-[3/4]')}>
        <Img src={a.image_url} alt={tr(a, 'name')} className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-110 group-hover:opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <div className="mb-2 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-ink" style={{ background: a.color || '#BEF264' }}>{a.category}</div>
          <h3 className="font-display text-4xl uppercase leading-none">{tr(a, 'name')}</h3>
          <p className="mt-2 line-clamp-2 max-h-0 text-sm text-zinc-300 opacity-0 transition-all duration-500 group-hover:max-h-20 group-hover:opacity-100">{tr(a, 'description')}</p>
        </div>
        <div className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition group-hover:rotate-45 group-hover:bg-brand group-hover:text-ink rtl:left-4 rtl:right-auto"><ArrowUpRight className="h-5 w-5" /></div>
      </Link>
    </Reveal>
  );
}

function PlanCard({ p, promos, delay = 0, dark }: { p: any; promos?: any[]; delay?: number; dark?: boolean }) {
  const { t, tr } = usePrefs();
  const promo = promos?.find((x) => x.plan_id === p.id);
  const promoPrice = promo ? (promo.discount_type === 'percent' ? Math.round(p.price * (100 - promo.discount_value) / 100) : p.price - promo.discount_value) : null;
  const featured = !!p.is_featured;
  return (
    <Reveal delay={delay}>
      <div className={cx('relative flex h-full flex-col overflow-hidden rounded-3xl border p-8 transition hover:-translate-y-1',
        featured ? 'border-brand bg-brand text-ink shadow-[0_30px_80px_-30px_rgb(var(--brand))]' : dark ? 'border-white/10 bg-white/5 text-white' : 'border-zinc-200 bg-white dark:border-white/10 dark:bg-anthracite')}>
        {featured && <div className="absolute right-6 top-6 rounded-full bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand rtl:left-6 rtl:right-auto">{t('price.popular')}</div>}
        {promo && <div className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white"><Tag className="h-3 w-3" />{promo.title}</div>}
        <div className="text-sm font-bold uppercase tracking-widest opacity-70">{durLabel(p, t)}</div>
        <h3 className="mt-1 font-display text-4xl uppercase">{tr(p, 'name')}</h3>
        <div className="mt-6 flex items-end gap-2">
          <span className="font-display text-7xl leading-none tabular-nums">{Math.round((promoPrice ?? p.price) / 1000)}</span>
          <span className="mb-2 text-lg font-bold">DT</span>
          {promoPrice != null && <span className="mb-2 text-lg line-through opacity-50">{Math.round(p.price / 1000)}</span>}
        </div>
        {p.registration_fee > 0 && <div className="mt-1 text-xs opacity-70">+ {t('price.fee')} : {money(p.registration_fee)}</div>}
        <ul className="my-6 flex-1 space-y-2 text-sm">
          {(p.benefits || '').split('•').filter(Boolean).map((b: string, k: number) => (<li key={k} className="flex gap-2"><Zap className={cx('h-4 w-4 shrink-0', featured ? 'text-ink' : 'text-brand')} />{b.trim()}</li>))}
        </ul>
        {p.conditions && <p className="mb-4 text-xs opacity-60">{p.conditions}</p>}
        <Link to="/contact" className={cx('rounded-full py-3.5 text-center text-sm font-extrabold uppercase tracking-wider transition', featured ? 'bg-ink text-brand hover:bg-black' : 'bg-brand text-ink hover:brightness-95')}>{t('price.contact')}</Link>
      </div>
    </Reveal>
  );
}

function CoachCard({ c, delay = 0 }: { c: any; delay?: number }) {
  const { t, tr } = usePrefs();
  return (
    <Reveal delay={delay}>
      <div className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-anthracite">
        <div className="relative aspect-[4/5] overflow-hidden bg-ink">
          {c.photo_url ? <Img src={c.photo_url} alt={c.name} className="h-full w-full object-cover grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0" />
            : <div className="grid h-full place-items-center font-display text-8xl text-brand">{c.name?.[0]}</div>}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink to-transparent p-6 pt-20 text-white">
            <h3 className="font-display text-4xl uppercase">{c.name}</h3>
            <p className="text-sm font-semibold text-brand">{tr(c, 'specialties')}</p>
          </div>
        </div>
        <div className="space-y-3 p-6">
          <div className="flex flex-wrap gap-2 text-xs">
            {c.experience_years > 0 && <span className="rounded-full bg-zinc-100 px-3 py-1 font-semibold dark:bg-white/10">{c.experience_years} {t('coach.years')}</span>}
            {c.certifications && <span className="rounded-full bg-brand/20 px-3 py-1 font-semibold text-lime-800 dark:text-brand">{c.certifications}</span>}
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{tr(c, 'bio')}</p>
        </div>
      </div>
    </Reveal>
  );
}

function UpcomingSessions() {
  const { tr, locale } = usePrefs();
  const from = todayISO();
  const { data, isLoading } = useQuery({ queryKey: ['pub-sched', from, 'up'], queryFn: () => api('/public/schedule', { query: { from, to: addDays(from, 2) } }), refetchInterval: 30_000 });
  const rows = (data?.data ?? []).filter((s: any) => s.status !== 'cancelled' && (s.session_date > from || s.end_time > new Date(Date.now() + 3600e3).toISOString().slice(11, 16))).slice(0, 8);
  if (isLoading) return <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }).map((_, k) => <Skeleton key={k} className="h-20" />)}</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((s: any, k: number) => (
        <Reveal key={s.id} delay={k * 0.04}>
          <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 p-4 transition hover:border-brand dark:border-white/10">
            <div className="w-20 shrink-0 text-center">
              <div className="text-xs font-bold uppercase text-zinc-500">{new Date(s.session_date + 'T00:00').toLocaleDateString(locale, { weekday: 'short' })}</div>
              <div className="font-display text-3xl" dir="ltr">{s.start_time}</div>
            </div>
            <div className="h-12 w-1 rounded-full" style={{ background: s.activity_color || '#BEF264' }} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-extrabold">{tr(s, 'activity_name')}</div>
              <div className="truncate text-sm text-zinc-500">{s.coach_name} · {s.room_name} · {s.age_category}</div>
            </div>
            <Timer className="h-5 w-5 shrink-0 text-zinc-400" />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

// ======================= ABOUT =======================
export function AboutPage() {
  const site = useSiteCtx();
  const { t, lang } = usePrefs();
  const about = site?.about?.[lang] || site?.about?.fr || {};
  return (
    <>
      <PageHero title={t('about.title')} subtitle={about.mission || ''} image={site?.gallery?.[0] ? mediaUrl(site.gallery[0]) : undefined} />
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <Reveal>
          <h2 className="mb-6 font-display text-5xl uppercase">{t('about.story')}</h2>
          <p className="whitespace-pre-line text-lg leading-relaxed text-zinc-600 dark:text-zinc-300">{about.story}</p>
        </Reveal>
        <div className="grid gap-4">
          {[['about.mission', about.mission], ['about.vision', about.vision]].map(([k, v], i) => (
            <Reveal key={k} delay={i * 0.1}><div className="rounded-3xl border-s-4 border-brand bg-zinc-50 p-8 dark:bg-anthracite"><h3 className="mb-2 font-display text-3xl uppercase">{t(k)}</h3><p className="text-zinc-600 dark:text-zinc-300">{v}</p></div></Reveal>
          ))}
        </div>
      </section>
      <section className="bg-ink py-24 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionTitle light kicker={t('about.values')} title={t('about.values')} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(about.values ?? []).map((v: string, i: number) => (
              <Reveal key={v} delay={i * 0.08}><div className="rounded-3xl border border-white/10 p-8"><div className="font-display text-6xl text-brand">0{i + 1}</div><div className="mt-4 text-2xl font-extrabold">{v}</div></div></Reveal>
            ))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
        <SectionTitle kicker={t('about.spaces')} title={t('home.equipmentTitle')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(site?.gallery ?? []).slice(0, 6).map((g: any, i: number) => (
            <Reveal key={g.id} delay={i * 0.05}><div className="group relative overflow-hidden rounded-3xl"><Img src={mediaUrl(g)} alt={g.title} className="aspect-[4/3] w-full object-cover transition duration-700 group-hover:scale-110" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink p-5 font-display text-2xl uppercase text-white">{g.title}</div></div></Reveal>
          ))}
        </div>
      </section>
      {(site?.coaches ?? []).length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <SectionTitle kicker={t('about.team')} title={t('home.coachesTitle')} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{site.coaches.map((c: any, k: number) => <CoachCard key={c.id} c={c} delay={(k % 3) * 0.08} />)}</div>
        </section>
      )}
    </>
  );
}

// ======================= ACTIVITIES =======================
export function ActivitiesPage() {
  const site = useSiteCtx();
  const { t } = usePrefs();
  const [cat, setCat] = useState('');
  const cats = [...new Set<string>((site?.activities ?? []).map((a: any) => a.category).filter(Boolean))];
  const list = (site?.activities ?? []).filter((a: any) => !cat || a.category === cat);
  return (
    <>
      <PageHero title={t('act.title')} subtitle={t('act.subtitle')} image={site?.activities?.[3]?.image_url} />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap gap-2">
          {['', ...cats].map((c) => (<button key={c} onClick={() => setCat(c)} className={cx('rounded-full border px-5 py-2 text-sm font-bold uppercase tracking-wide transition', cat === c ? 'border-brand bg-brand text-ink' : 'border-zinc-300 hover:border-brand dark:border-white/15')}>{c || t('act.all')}</button>))}
        </div>
        <motion.div layout className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a: any, k: number) => <ActivityCard key={a.id} a={a} delay={(k % 3) * 0.06} />)}
        </motion.div>
      </section>
    </>
  );
}

// ======================= PLANNING =======================
export function PlanningPage() {
  const site = useSiteCtx();
  const { t, tr, locale } = usePrefs();
  const [week, setWeek] = useState(startOfWeek(todayISO()));
  const [f, setF] = useState({ activity: '', coach: '', category: '', day: '' });
  const { data, isLoading } = useQuery({ queryKey: ['pub-sched', week], queryFn: () => api('/public/schedule', { query: { from: week, to: addDays(week, 6) } }), refetchInterval: 30_000 });
  const rows: any[] = data?.data ?? [];
  const coaches = [...new Map(rows.filter((r) => r.coach_id).map((r) => [r.coach_id, r.coach_name])).entries()];
  const ageCats = [...new Set(rows.map((r) => r.age_category).filter(Boolean))];
  const filtered = rows.filter((r) => (!f.activity || String(r.activity_id) === f.activity) && (!f.coach || String(r.coach_id) === f.coach) && (!f.category || r.age_category === f.category) && (!f.day || r.session_date === f.day));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const exc = new Map((data?.exceptions ?? []).map((e: any) => [e.exception_date, e]));
  const sel = 'rounded-full border border-zinc-300 bg-transparent px-4 py-2.5 text-sm font-semibold dark:border-white/15 [&>option]:text-ink';
  const statusTxt: Record<string, string> = { cancelled: t('plan.cancelled'), full: t('plan.full'), scheduled: t('plan.scheduled'), done: t('plan.done') };
  return (
    <>
      <PageHero title={t('plan.title')} subtitle={t('plan.subtitle')} image={site?.activities?.[1]?.image_url} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setWeek(addDays(week, -7))} className="grid h-11 w-11 place-items-center rounded-full border border-zinc-300 hover:bg-brand hover:text-ink dark:border-white/15" aria-label={t('plan.prev')}><ChevronLeft className="rtl:rotate-180" /></button>
            <button onClick={() => setWeek(startOfWeek(todayISO()))} className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-bold dark:border-white/15">{t('plan.today')}</button>
            <button onClick={() => setWeek(addDays(week, 7))} className="grid h-11 w-11 place-items-center rounded-full border border-zinc-300 hover:bg-brand hover:text-ink dark:border-white/15" aria-label={t('plan.next')}><ChevronRight className="rtl:rotate-180" /></button>
            <span className="ms-2 font-display text-2xl">{new Date(week + 'T00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' })} — {new Date(addDays(week, 6) + 'T00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <select className={sel} value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })}><option value="">{t('plan.allActivities')}</option>{(site?.activities ?? []).map((a: any) => <option key={a.id} value={a.id}>{tr(a, 'name')}</option>)}</select>
            <select className={sel} value={f.coach} onChange={(e) => setF({ ...f, coach: e.target.value })}><option value="">{t('plan.allCoaches')}</option>{coaches.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
            <select className={sel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">{t('plan.allCategories')}</option>{ageCats.map((c) => <option key={c}>{c}</option>)}</select>
            <select className={sel} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}><option value="">{t('plan.allDays')}</option>{days.map((d) => <option key={d} value={d}>{new Date(d + 'T00:00').toLocaleDateString(locale, { weekday: 'long' })}</option>)}</select>
          </div>
        </div>
        {isLoading ? <Skeleton className="h-96" /> : (
          <div className="grid gap-3 md:grid-cols-7">
            {days.filter((d) => !f.day || d === f.day).map((d) => {
              const list = filtered.filter((r) => r.session_date === d);
              const ex: any = exc.get(d);
              const isToday = d === todayISO();
              return (
                <div key={d} className={cx('rounded-2xl border p-2', isToday ? 'border-brand' : 'border-zinc-200 dark:border-white/10')}>
                  <div className={cx('mb-2 rounded-xl px-3 py-2 text-center', isToday ? 'bg-brand text-ink' : 'bg-zinc-100 dark:bg-white/5')}>
                    <div className="text-xs font-bold uppercase tracking-wider">{new Date(d + 'T00:00').toLocaleDateString(locale, { weekday: 'long' })}</div>
                    <div className="font-display text-2xl">{d.slice(8)}</div>
                  </div>
                  {ex && <div className="mb-2 rounded-lg bg-red-500/15 p-2 text-center text-xs font-bold text-red-500">{t('plan.closed')} — {ex.label}</div>}
                  <div className="space-y-2">
                    {list.length === 0 && !ex && <div className="py-6 text-center text-xs text-zinc-400">—</div>}
                    {list.map((s) => (
                      <motion.div layout key={s.id} className={cx('rounded-xl border-s-4 bg-zinc-50 p-2.5 text-sm dark:bg-anthracite', s.status === 'cancelled' && 'opacity-50')} style={{ borderColor: s.activity_color || '#BEF264' }}>
                        <div className="font-bold tabular-nums" dir="ltr">{s.start_time}–{s.end_time}</div>
                        <div className={cx('font-extrabold leading-tight', s.status === 'cancelled' && 'line-through')}>{tr(s, 'activity_name')}</div>
                        <div className="text-xs text-zinc-500">{s.coach_name}</div>
                        <div className="text-xs text-zinc-500">{s.room_name} · {s.age_category}</div>
                        {s.status !== 'scheduled' && <div className={cx('mt-1 inline-block rounded px-1.5 text-[10px] font-bold uppercase', s.status === 'cancelled' ? 'bg-red-500 text-white' : 'bg-zinc-300 text-ink')}>{statusTxt[s.status]}</div>}
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!isLoading && filtered.length === 0 && <p className="mt-6 text-center text-zinc-500">{t('plan.empty')}</p>}
      </section>
    </>
  );
}

// ======================= PRICING =======================
export function PricingPage() {
  const site = useSiteCtx();
  const { t } = usePrefs();
  const plans: any[] = site?.plans ?? [];
  const cats = [...new Set(plans.map((p) => p.category_code).filter(Boolean))] as string[];
  const [cat, setCat] = useState<string>('adult');
  useEffect(() => { if (cats.length && !cats.includes(cat)) setCat(cats[0]); }, [cats.join()]);
  const list = plans.filter((p) => p.category_code === cat);
  return (
    <>
      <PageHero title={t('price.title')} subtitle={t('price.subtitle')} image={site?.gallery?.[0] ? mediaUrl(site.gallery[0]) : undefined} />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        {(site?.promotions ?? []).length > 0 && (
          <div className="mb-10 space-y-3">
            {site.promotions.map((p: any) => (
              <Reveal key={p.id}><div className="flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-red-500 to-orange-500 p-5 text-white"><Tag className="h-7 w-7" /><div className="flex-1"><div className="font-display text-3xl uppercase">{p.title}</div><div className="text-sm opacity-90">{p.description}</div></div>{p.end_date && <div className="rounded-full bg-white/20 px-4 py-1 text-sm font-bold">→ {p.end_date}</div>}</div></Reveal>
            ))}
          </div>
        )}
        <div className="mb-10 flex flex-wrap justify-center gap-2">
          {cats.map((c) => (<button key={c} onClick={() => setCat(c)} className={cx('rounded-full border px-6 py-3 font-display text-xl uppercase tracking-wider transition', cat === c ? 'border-brand bg-brand text-ink' : 'border-zinc-300 hover:border-brand dark:border-white/15')}>{t('cat.' + c)}</button>))}
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={cat} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p, k) => <PlanCard key={p.id} p={p} promos={site?.promotions} delay={(k % 3) * 0.05} />)}
          </motion.div>
        </AnimatePresence>
      </section>
    </>
  );
}

// ======================= COACHES =======================
export function CoachesPage() {
  const site = useSiteCtx();
  const { t } = usePrefs();
  return (
    <>
      <PageHero title={t('coach.title')} subtitle={t('coach.subtitle')} image={site?.activities?.[10]?.image_url} />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(site?.coaches ?? []).map((c: any, k: number) => <CoachCard key={c.id} c={c} delay={(k % 3) * 0.08} />)}</div>
      </section>
    </>
  );
}

// ======================= GALLERY =======================
export function GalleryPage() {
  const site = useSiteCtx();
  const { t } = usePrefs();
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const all: any[] = site?.gallery ?? [];
  const cats = [...new Set(all.map((g) => g.category).filter(Boolean))] as string[];
  const list = useMemo(() => all.filter((g) => !cat || g.category === cat), [all, cat]);
  return (
    <>
      <PageHero title={t('gal.title')} subtitle={t('gal.subtitle')} image={all[1] ? mediaUrl(all[1]) : undefined} />
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="mb-8 flex flex-wrap gap-2">
          {['', ...cats].map((c) => (<button key={c} onClick={() => setCat(c)} className={cx('rounded-full border px-5 py-2 text-sm font-bold uppercase transition', cat === c ? 'border-brand bg-brand text-ink' : 'border-zinc-300 dark:border-white/15')}>{c || t('gal.all')}</button>))}
        </div>
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {list.map((g, k) => (
            <Reveal key={g.id} delay={(k % 3) * 0.05} className="mb-4 break-inside-avoid">
              <button onClick={() => setOpen(k)} className="group relative block w-full overflow-hidden rounded-3xl">
                <Img src={mediaUrl(g)} alt={g.title} className="w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-ink p-4 text-start font-bold text-white transition group-hover:translate-y-0">{g.title}</div>
              </button>
            </Reveal>
          ))}
        </div>
      </section>
      <AnimatePresence>
        {open !== null && list[open] && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-4" onClick={() => setOpen(null)}>
            <button className="absolute right-4 top-4 text-white" aria-label="close"><X className="h-8 w-8" /></button>
            <button className="absolute left-4 text-white" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + list.length) % list.length); }} aria-label="prev"><ChevronLeft className="h-10 w-10" /></button>
            <motion.img key={open} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={mediaUrl(list[open])} alt={list[open].title} className="max-h-[85vh] max-w-full rounded-2xl" onClick={(e) => e.stopPropagation()} />
            <button className="absolute right-4 text-white" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % list.length); }} aria-label="next"><ChevronRight className="h-10 w-10" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ======================= CONTACT =======================
export function ContactPage() {
  const site = useSiteCtx();
  const { t, tl } = usePrefs();
  const c = site?.contact ?? {};
  const items = [
    [MapPin, t('contact.address'), c.address, c.address ? `https://maps.google.com/?q=${encodeURIComponent(c.address)}` : null],
    [Phone, t('contact.phone'), c.phone, c.phone ? `tel:${c.phone}` : null],
    [MessageCircle, 'WhatsApp', c.whatsapp, c.whatsapp ? waLink(c.whatsapp, 'Bonjour MAX FIT') : null],
    [Mail, t('contact.email'), c.email, c.email ? `mailto:${c.email}` : null],
    [Facebook, 'Facebook', c.facebook ? 'Facebook' : null, c.facebook],
    [Instagram, 'Instagram', c.instagram ? 'Instagram' : null, c.instagram],
  ].filter((x) => x[2]) as [any, string, string, string | null][];
  return (
    <>
      <PageHero title={t('contact.title')} subtitle={t('contact.subtitle')} image={site?.gallery?.[3] ? mediaUrl(site.gallery[3]) : undefined} />
      <section className="mx-auto grid max-w-7xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map(([Icon, label, value, href], k) => (
            <Reveal key={label} delay={k * 0.05}>
              <a href={href ?? undefined} target={href?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="group flex h-full flex-col gap-4 rounded-3xl border border-zinc-200 p-6 transition hover:border-brand hover:bg-brand hover:text-ink dark:border-white/10">
                <Icon className="h-8 w-8 text-lime-600 transition group-hover:text-ink dark:text-brand" />
                <div><div className="text-xs font-bold uppercase tracking-widest opacity-60">{label}</div><div className="mt-1 break-words text-lg font-bold" dir={label === t('contact.phone') || label === 'WhatsApp' ? 'ltr' : undefined}>{value}</div></div>
              </a>
            </Reveal>
          ))}
          <Reveal className="sm:col-span-2">
            <div className="rounded-3xl bg-ink p-6 text-white">
              <div className="mb-4 flex items-center gap-2 font-display text-2xl uppercase"><Clock className="text-brand" />{t('contact.hours')}</div>
              {(c.hours ?? []).map((h: any, k: number) => (<div key={k} className="flex justify-between border-b border-white/10 py-2"><span className="text-zinc-400">{tl(h.days)}</span><span className="font-bold" dir="ltr">{h.time}</span></div>))}
            </div>
          </Reveal>
        </div>
        <Reveal>
          <div className="h-full min-h-[420px] overflow-hidden rounded-3xl border border-zinc-200 dark:border-white/10">
            <iframe title="map" className="h-full min-h-[420px] w-full" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
              src={c.mapsEmbed && c.mapsEmbed.startsWith('https://www.google.com/maps/embed') ? c.mapsEmbed : `https://maps.google.com/maps?q=${encodeURIComponent(c.address || 'Tunis')}&z=14&output=embed`} />
          </div>
        </Reveal>
      </section>
    </>
  );
}
