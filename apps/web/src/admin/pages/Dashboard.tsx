import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Baby, Banknote, CalendarX, Coins, CreditCard, Dumbbell, FileSpreadsheet, FileText, PiggyBank, Receipt, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, Users, Wallet, Activity, UserRound, Footprints, Briefcase } from 'lucide-react';
import { api } from '@/lib/api';
import { addDays, money, moneyShort, todayISO } from '@/lib/format';
import { Button, Card, ErrorBox, Input, Select, Skeleton, Stat } from '@/components/ui';
import { exportExcel, tablePDF } from '@/lib/docs';
import { usePrefs } from '@/lib/prefs';

const COLORS = ['#BEF264', '#38BDF8', '#F97316', '#A855F7', '#EF4444', '#14B8A6', '#EAB308', '#EC4899', '#22C55E', '#64748B'];

function rangeFor(p: string): [string, string] {
  const t = todayISO();
  const y = t.slice(0, 4), m = Number(t.slice(5, 7));
  switch (p) {
    case 'day': return [t, t];
    case 'week': return [addDays(t, -6), t];
    case 'quarter': { const q = Math.floor((m - 1) / 3) * 3 + 1; return [`${y}-${String(q).padStart(2, '0')}-01`, t]; }
    case 'year': return [`${y}-01-01`, t];
    default: return [t.slice(0, 7) + '-01', t];
  }
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="h-64">{children}</div>
    </Card>
  );
}
const tip = { contentStyle: { background: '#171A20', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, color: '#fff' }, labelStyle: { color: '#BEF264' } };

export default function Dashboard() {
  const { theme } = usePrefs();
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState<[string, string]>(rangeFor('month'));
  const [from, to] = period === 'custom' ? custom : rangeFor(period);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', from, to], queryFn: () => api('/dashboard', { query: { from, to } }), refetchInterval: 60_000 });
  const k = data?.kpis ?? {};
  const c = data?.charts ?? {};
  const axis = theme === 'dark' ? '#71717a' : '#a1a1aa';
  const grid = theme === 'dark' ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)';
  const tnd = (v: number) => moneyShort(v);

  const kpiList: [string, string | number, any, any, boolean?][] = [
    ['Clients total', k.clients_total, Users, 'zinc'], ['Clients actifs', k.clients_active, UserCheck, 'green'], ['Clients inactifs', k.clients_inactive, UserMinus, 'zinc'],
    ['Adultes actifs', k.adults_active, UserRound, 'blue'], ['Juniors actifs', k.juniors_active, Activity, 'blue'], ['Enfants actifs', k.children_active, Baby, 'blue'],
    ['Nouveaux clients', k.new_clients, UserPlus, 'brand'], ['Abonnements expirés', k.subs_expired, CalendarX, 'red'], ['Expirent sous 7 j', k.subs_expiring_7, AlertTriangle, 'amber'],
    ['Coachs', k.coaches, Briefcase, 'zinc'], ['Employés', k.employees, Users, 'zinc'], ['Fréquentation du jour', k.visits_today, Footprints, 'brand'],
  ];
  const finList: [string, number, any, any][] = data?.finance ? [
    ['Chiffre d’affaires (facturé)', k.revenue, TrendingUp, 'brand'], ['Recettes encaissées', k.collected, Wallet, 'green'], ['Dépenses', k.expenses, TrendingDown, 'red'],
    ['Résultat de gestion', k.result, PiggyBank, k.result >= 0 ? 'green' : 'red'], ['Total impayés', k.unpaid, Receipt, 'amber'], ['Masse salariale', k.payroll, Banknote, 'blue'],
  ] : [];

  const exportKpis = async (kind: 'xlsx' | 'pdf') => {
    const rows = [...kpiList.map(([l, v]) => ({ k: l, v: String(v ?? 0) })), ...finList.map(([l, v]) => ({ k: l, v: money(v) }))];
    const cols = [{ key: 'k', label: 'Indicateur' }, { key: 'v', label: 'Valeur' }];
    if (kind === 'xlsx') await exportExcel(`Dashboard ${from} ${to}`, cols, rows);
    else await tablePDF('Tableau de bord', cols, rows, `${from} → ${to}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-wide">Tableau de bord</h1>
          <p className="text-sm text-zinc-500">Données réelles · du {from} au {to}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-9 w-auto">
            <option value="day">Aujourd’hui</option><option value="week">7 derniers jours</option><option value="month">Mois en cours</option>
            <option value="quarter">Trimestre</option><option value="year">Année</option><option value="custom">Période personnalisée</option>
          </Select>
          {period === 'custom' && <>
            <Input type="date" value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} className="h-9 w-auto" />
            <Input type="date" value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} className="h-9 w-auto" />
          </>}
          <Button size="sm" variant="outline" onClick={() => exportKpis('xlsx')}><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel</Button>
          <Button size="sm" variant="outline" onClick={() => exportKpis('pdf')}><FileText className="h-4 w-4 text-red-500" />PDF</Button>
        </div>
      </div>
      {error && <ErrorBox error={error} onRetry={refetch} />}
      {isLoading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div> : (
        <>
          {finList.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {finList.map(([l, v, I, tone]) => <Stat key={l} label={l} value={money(v)} icon={<I className="h-5 w-5" />} tone={tone} />)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {kpiList.map(([l, v, I, tone]) => <Stat key={l} label={l} value={v ?? 0} icon={<I className="h-5 w-5" />} tone={tone} />)}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {c.revenue_monthly && (
              <ChartCard title="Évolution du chiffre d’affaires">
                <ResponsiveContainer><AreaChart data={c.revenue_monthly}>
                  <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#BEF264" stopOpacity={0.5} /><stop offset="100%" stopColor="#BEF264" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} tickFormatter={tnd} width={70} />
                  <Tooltip {...tip} formatter={(v: number) => money(v)} /><Area type="monotone" dataKey="billed" name="Facturé" stroke="#BEF264" fill="url(#g1)" strokeWidth={2} />
                </AreaChart></ResponsiveContainer>
              </ChartCard>
            )}
            {c.revenue_monthly && (
              <ChartCard title="Recettes vs dépenses">
                <ResponsiveContainer><BarChart data={c.revenue_monthly}>
                  <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} tickFormatter={tnd} width={70} />
                  <Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend /><Bar dataKey="collected" name="Recettes" fill="#BEF264" radius={[6, 6, 0, 0]} /><Bar dataKey="expenses" name="Dépenses" fill="#EF4444" radius={[6, 6, 0, 0]} />
                </BarChart></ResponsiveContainer>
              </ChartCard>
            )}
            <ChartCard title="Répartition des clients actifs par catégorie">
              <ResponsiveContainer><PieChart><Pie data={c.clients_by_category ?? []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3}>
                {(c.clients_by_category ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Répartition par type d’abonnement (actifs)">
              <ResponsiveContainer><BarChart data={c.subs_by_plan ?? []} layout="vertical">
                <CartesianGrid stroke={grid} horizontal={false} /><XAxis type="number" stroke={axis} fontSize={11} allowDecimals={false} /><YAxis type="category" dataKey="name" stroke={axis} fontSize={11} width={100} />
                <Tooltip {...tip} /><Bar dataKey="value" name="Abonnements" fill="#38BDF8" radius={[0, 6, 6, 0]} />
              </BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Taux de renouvellement">
              <ResponsiveContainer><LineChart data={(c.renewal ?? []).map((r: any) => ({ ...r, rate: r.ended ? Math.round((r.renewed / r.ended) * 100) : 0 }))}>
                <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} unit="%" domain={[0, 100]} />
                <Tooltip {...tip} formatter={(v: number) => `${v} %`} /><Line type="monotone" dataKey="rate" name="Renouvellement" stroke="#BEF264" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Évolution des inscriptions">
              <ResponsiveContainer><BarChart data={c.registrations ?? []}>
                <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} allowDecimals={false} />
                <Tooltip {...tip} /><Bar dataKey="value" name="Inscriptions" fill="#A855F7" radius={[6, 6, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Activités les plus populaires">
              <ResponsiveContainer><BarChart data={c.popular_activities ?? []}>
                <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="name" stroke={axis} fontSize={10} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis stroke={axis} fontSize={11} allowDecimals={false} />
                <Tooltip {...tip} /><Bar dataKey="value" name="Clients" radius={[6, 6, 0, 0]}>{(c.popular_activities ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Fréquentation par heure">
              <ResponsiveContainer><AreaChart data={Array.from({ length: 18 }, (_, i) => ({ hour: `${i + 6}h`, value: (c.attendance_by_hour ?? []).find((x: any) => x.hour === i + 6)?.value ?? 0 }))}>
                <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="hour" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} allowDecimals={false} />
                <Tooltip {...tip} /><Area type="monotone" dataKey="value" name="Entrées" stroke="#F97316" fill="#F97316" fillOpacity={0.25} strokeWidth={2} />
              </AreaChart></ResponsiveContainer>
            </ChartCard>
            {c.payroll_monthly && (
              <ChartCard title="Évolution de la masse salariale">
                <ResponsiveContainer><LineChart data={c.payroll_monthly}>
                  <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} tickFormatter={tnd} width={70} />
                  <Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend /><Line dataKey="gross" name="Brut" stroke="#38BDF8" strokeWidth={2} /><Line dataKey="net" name="Net à payer" stroke="#BEF264" strokeWidth={2} />
                </LineChart></ResponsiveContainer>
              </ChartCard>
            )}
            {c.collected_vs_unpaid && (
              <ChartCard title="Montants encaissés et impayés (abonnements)">
                <ResponsiveContainer><BarChart data={c.collected_vs_unpaid}>
                  <CartesianGrid stroke={grid} vertical={false} /><XAxis dataKey="month" stroke={axis} fontSize={11} /><YAxis stroke={axis} fontSize={11} tickFormatter={tnd} width={70} />
                  <Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend /><Bar dataKey="collected" stackId="a" name="Encaissé" fill="#22C55E" /><Bar dataKey="unpaid" stackId="a" name="Impayé" fill="#EF4444" radius={[6, 6, 0, 0]} />
                </BarChart></ResponsiveContainer>
              </ChartCard>
            )}
            {c.expenses_by_category && (
              <ChartCard title="Dépenses par catégorie">
                <ResponsiveContainer><PieChart><Pie data={c.expenses_by_category} dataKey="value" nameKey="name" outerRadius={95}>
                  {c.expenses_by_category.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend /></PieChart></ResponsiveContainer>
              </ChartCard>
            )}
            {c.payment_methods && (
              <ChartCard title="Encaissements par mode de paiement">
                <ResponsiveContainer><PieChart><Pie data={c.payment_methods} dataKey="value" nameKey="name" innerRadius={50} outerRadius={95}>
                  {c.payment_methods.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend /></PieChart></ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const DashIcons = { Coins, CreditCard, Dumbbell };
