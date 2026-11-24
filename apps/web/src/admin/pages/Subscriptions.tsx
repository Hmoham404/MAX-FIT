import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, CreditCard, Eye, MessageCircle, PauseCircle, PlayCircle, Plus, Printer, RefreshCw, Repeat, Tag, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, money, toMillimes, todayISO, waLink } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Tabs, Textarea, useUI, type Tone } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { METHOD_LABEL, receiptPDF } from '@/lib/docs';
import { useAuth } from '../auth';
import { useOptions } from '../Resource';

export const validityBadge: Record<string, [string, Tone]> = {
  valid: ['Valide', 'green'], expired: ['Expiré', 'red'], suspended: ['Suspendu', 'amber'], upcoming: ['À venir', 'blue'], cancelled: ['Annulé', 'zinc'], replaced: ['Remplacé', 'zinc'],
};
export const payBadge: Record<string, [string, Tone]> = { paid: ['Payé', 'green'], partial: ['Partiel', 'amber'], unpaid: ['Impayé', 'red'] };
export const VB = ({ v }: { v: string }) => <Badge tone={validityBadge[v]?.[1]}>{validityBadge[v]?.[0] ?? v}</Badge>;
export const PB = ({ v }: { v: string }) => <Badge tone={payBadge[v]?.[1]}>{payBadge[v]?.[0] ?? v}</Badge>;

export function MethodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Select value={value} onChange={(e) => onChange(e.target.value)}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>;
}

// ---------------- New subscription ----------------
export function NewSubscriptionModal({ open, onClose, clientId, renewFrom }: { open: boolean; onClose: () => void; clientId?: number; renewFrom?: any }) {
  const { toast } = useUI();
  const { can } = useAuth();
  const qc = useQueryClient();
  const plans = useOptions('/plans', (p) => `${p.category_name ?? ''} — ${p.name} (${money(p.price)})`);
  const promos = useOptions('/promotions', (p) => p.title);
  const clients = useOptions('/clients', (c) => `${c.matricule} — ${c.last_name} ${c.first_name}`);
  const [f, setF] = useState<any>({});
  useEffect(() => {
    if (open) setF({ client_id: clientId ?? '', plan_id: renewFrom?.plan_id ?? '', start_date: '', promotion_id: '', extra_discount: '', include_registration_fee: !renewFrom, initial_payment: '', method: 'cash', notes: '' });
  }, [open]);
  const body = () => ({
    client_id: Number(f.client_id), plan_id: Number(f.plan_id), start_date: f.start_date || undefined, promotion_id: f.promotion_id ? Number(f.promotion_id) : null,
    extra_discount: f.extra_discount ? toMillimes(f.extra_discount) : 0, include_registration_fee: !!f.include_registration_fee, initial_payment: f.initial_payment ? toMillimes(f.initial_payment) : 0, method: f.method, notes: f.notes || null,
  });
  const quote = useQuery({ queryKey: ['sub-quote', f.plan_id, f.promotion_id, f.extra_discount, f.include_registration_fee, f.start_date], queryFn: () => api('/subscriptions/quote', { body: body() }), enabled: !!f.plan_id && open, retry: false });
  const save = useMutation({
    mutationFn: () => renewFrom ? api(`/subscriptions/${renewFrom.id}/renew`, { body: { ...body(), client_id: undefined } }) : api('/subscriptions', { body: body() }),
    onSuccess: async (r: any) => {
      toast('success', `Abonnement ${r.subscription.reference} créé${r.receipt ? ` — reçu ${r.receipt.receipt_number}` : ''}`);
      qc.invalidateQueries();
      onClose();
      if (r.receipt) await receiptPDF(r.receipt.receipt_id, 'print').catch(() => {});
    },
    onError: (e: any) => toast('error', e.message),
  });
  return (
    <Modal open={open} onClose={onClose} title={renewFrom ? `Renouveler ${renewFrom.reference}` : 'Nouvel abonnement'} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={save.isPending} disabled={!f.plan_id || !f.client_id} onClick={() => save.mutate()}>Valider{f.initial_payment ? ' & encaisser' : ''}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!clientId && <Field label="Client" required className="sm:col-span-2"><Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">—</option>{clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>}
        <Field label="Formule" required className="sm:col-span-2"><Select value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Date de début" hint={renewFrom ? 'Par défaut : lendemain de la fin actuelle' : 'Par défaut : aujourd’hui'}><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} /></Field>
        <Field label="Promotion"><Select value={f.promotion_id} onChange={(e) => setF({ ...f, promotion_id: e.target.value })}><option value="">Aucune</option>{promos.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        {can('plans:write') && <Field label="Réduction exceptionnelle (DT)"><Input type="number" step="0.001" min="0" value={f.extra_discount} onChange={(e) => setF({ ...f, extra_discount: e.target.value })} /></Field>}
        <Field label="Frais d’inscription"><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-lime-400" checked={f.include_registration_fee} onChange={(e) => setF({ ...f, include_registration_fee: e.target.checked })} />Inclure</label></Field>
        <Field label="Paiement immédiat (DT)" hint="Laisser vide si non payé"><Input type="number" step="0.001" min="0" value={f.initial_payment} onChange={(e) => setF({ ...f, initial_payment: e.target.value })} /></Field>
        <Field label="Mode de paiement"><MethodSelect value={f.method} onChange={(v) => setF({ ...f, method: v })} /></Field>
        <Field label="Remarques" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {quote.data && (
        <Card className="mt-4 grid gap-2 bg-zinc-50 text-sm dark:bg-white/5 sm:grid-cols-3">
          <div>Prix : <b>{money(quote.data.base_price)}</b></div><div>Inscription : <b>{money(quote.data.registration_fee)}</b></div><div>Réduction : <b>-{money(quote.data.discount)}</b></div>
          <div>Du <b>{fmtDate(quote.data.start_date)}</b> au <b>{fmtDate(quote.data.end_date)}</b></div>
          <div className="text-lg sm:col-span-2">Total : <b className="text-lime-600 dark:text-brand">{money(quote.data.final_price)}</b>{f.initial_payment ? <> · Reste : <b>{money(quote.data.final_price - toMillimes(f.initial_payment))}</b></> : null}</div>
        </Card>
      )}
      {quote.error && <p className="mt-3 text-sm text-red-500">{(quote.error as Error).message}</p>}
    </Modal>
  );
}

// ---------------- Subscription detail with all actions ----------------
export function SubscriptionDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { toast, confirm } = useUI();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data: s, isLoading } = useQuery({ queryKey: ['subscription', id], queryFn: () => api(`/subscriptions/${id}`), enabled: !!id });
  const plans = useOptions('/plans', (p) => `${p.category_name ?? ''} — ${p.name} (${money(p.price)})`);
  const [panel, setPanel] = useState<'' | 'pay' | 'extend' | 'plan' | 'discount'>('');
  const [f, setF] = useState<any>({ amount: '', method: 'cash', days: '', reason: '', plan_id: '' });
  const [renew, setRenew] = useState(false);
  const run = async (path: string, body: any = {}, msg = 'Opération effectuée') => {
    try {
      const r = await api(`/subscriptions/${id}/${path}`, { body });
      toast('success', msg);
      qc.invalidateQueries();
      setPanel('');
      return r;
    } catch (e: any) { toast('error', e.message); }
  };
  const pay = async () => {
    const r = await run('pay', { amount: toMillimes(f.amount), method: f.method }, 'Paiement enregistré');
    if (r?.receipt) await receiptPDF(r.receipt.receipt_id, 'print').catch(() => {});
  };
  const wa = s && waLink(s.phone, s.validity === 'expired'
    ? `Bonjour ${s.first_name}, votre abonnement MAX FIT (${s.plan_name}) a expiré le ${fmtDate(s.end_date)}. Nous serions ravis de vous revoir ! Passez à l’accueil pour le renouveler.`
    : s.remaining > 0 ? `Bonjour ${s.first_name}, il reste ${money(s.remaining)} à régler sur votre abonnement MAX FIT (${s.plan_name}). Merci de passer à l’accueil.`
      : `Bonjour ${s.first_name}, votre abonnement MAX FIT (${s.plan_name}) expire le ${fmtDate(s.end_date)}. Pensez à le renouveler à l’accueil !`);
  return (
    <>
      <Modal open={!!id} onClose={onClose} title={s ? `${s.reference} — ${s.first_name} ${s.last_name}` : 'Abonnement'} size="lg">
        {isLoading || !s ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2"><VB v={s.validity} /><PB v={s.payment_status} />{s.days_remaining > 0 && <Badge tone="blue">{s.days_remaining} jour(s) restant(s)</Badge>}</div>
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <Info l="Formule" v={s.plan_name} /><Info l="Catégorie" v={s.category_name} /><Info l="Période" v={`${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`} />
              <Info l="Prix" v={money(s.base_price)} /><Info l="Inscription" v={money(s.registration_fee)} /><Info l="Réduction" v={money(s.discount)} />
              <Info l="Prix final" v={<b>{money(s.final_price)}</b>} /><Info l="Payé" v={<b className="text-emerald-600">{money(s.amount_paid)}</b>} /><Info l="Reste à payer" v={<b className="text-red-500">{money(s.remaining)}</b>} />
            </div>
            <div className="flex flex-wrap gap-2">
              {can('payments:write') && s.remaining > 0 && s.status !== 'cancelled' && <Button size="sm" onClick={() => (setF({ ...f, amount: (s.remaining / 1000).toFixed(3) }), setPanel('pay'))}><CreditCard className="h-4 w-4" />Encaisser</Button>}
              {can('subscriptions:write') && <>
                <Button size="sm" variant="outline" onClick={() => setRenew(true)}><RefreshCw className="h-4 w-4" />Renouveler</Button>
                {s.status === 'active' && <Button size="sm" variant="outline" onClick={async () => { const r = await confirm({ title: 'Suspendre l’abonnement ?', input: 'Motif' }); if (r) run('suspend', { reason: r }, 'Abonnement suspendu'); }}><PauseCircle className="h-4 w-4" />Suspendre</Button>}
                {s.status === 'suspended' && <Button size="sm" variant="outline" onClick={() => run('reactivate', {}, 'Abonnement réactivé (jours de suspension ajoutés)')}><PlayCircle className="h-4 w-4" />Réactiver</Button>}
                <Button size="sm" variant="outline" onClick={() => setPanel('extend')}><CalendarPlus className="h-4 w-4" />Prolonger</Button>
                <Button size="sm" variant="outline" onClick={() => setPanel('plan')}><Repeat className="h-4 w-4" />Changer formule</Button>
              </>}
              {can('plans:write') && <Button size="sm" variant="outline" onClick={() => setPanel('discount')}><Tag className="h-4 w-4" />Réduction</Button>}
              <a href={wa} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><MessageCircle className="h-4 w-4 text-emerald-500" />Relance WhatsApp</Button></a>
              {can('subscriptions:delete') && s.status !== 'cancelled' && <Button size="sm" variant="ghost" className="text-red-500" onClick={async () => { const r = await confirm({ title: 'Annuler cet abonnement ?', danger: true, input: 'Motif' }); if (r) run('cancel', { reason: r }, 'Abonnement annulé'); }}><XCircle className="h-4 w-4" />Annuler</Button>}
            </div>
            {panel && (
              <Card className="space-y-3 bg-zinc-50 dark:bg-white/5">
                {panel === 'pay' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Montant (DT)"><Input type="number" step="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Mode"><MethodSelect value={f.method} onChange={(v) => setF({ ...f, method: v })} /></Field><div className="flex items-end"><Button className="w-full" onClick={pay}>Encaisser & imprimer reçu</Button></div></div>}
                {panel === 'extend' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Jours"><Input type="number" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field><Field label="Motif"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field><div className="flex items-end"><Button className="w-full" onClick={() => run('extend', { days: Number(f.days), reason: f.reason }, 'Abonnement prolongé')}>Prolonger</Button></div></div>}
                {panel === 'plan' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Nouvelle formule" className="sm:col-span-2"><Select value={f.plan_id} onChange={(e) => setF({ ...f, plan_id: e.target.value })}><option value="">—</option>{plans.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field><div className="flex items-end"><Button className="w-full" onClick={() => run('change-plan', { plan_id: Number(f.plan_id) }, 'Formule modifiée')}>Changer</Button></div></div>}
                {panel === 'discount' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Réduction (DT)"><Input type="number" step="0.001" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field><Field label="Motif"><Input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field><div className="flex items-end"><Button className="w-full" onClick={() => run('discount', { amount: toMillimes(f.amount), reason: f.reason }, 'Réduction appliquée')}>Appliquer</Button></div></div>}
              </Card>
            )}
            <div>
              <h4 className="mb-2 text-sm font-bold uppercase text-zinc-500">Historique des paiements</h4>
              {s.payments.length === 0 ? <p className="text-sm text-zinc-500">Aucun paiement.</p> : (
                <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-white/5 dark:border-white/10">
                  {s.payments.map((p: any) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{p.receipt_number}</span><span>{fmtDateTime(p.paid_at)}</span><Badge>{METHOD_LABEL[p.method]}</Badge><span className="text-zinc-500">{p.user_name}</span>
                      <b className="ms-auto">{money(p.amount)}</b>
                      {p.receipt_id && <Button size="icon" variant="ghost" onClick={() => receiptPDF(p.receipt_id, 'print')} title="Imprimer le reçu"><Printer className="h-4 w-4" /></Button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-bold uppercase text-zinc-500">Historique</h4>
              <ul className="space-y-1 text-xs">
                {s.history.map((h: any) => <li key={h.id} className="flex gap-2"><span className="text-zinc-500">{fmtDateTime(h.created_at)}</span><b>{h.action}</b><span className="truncate text-zinc-500">{h.details}</span><span className="ms-auto text-zinc-500">{h.user_name}</span></li>)}
              </ul>
            </div>
          </div>
        )}
      </Modal>
      {s && <NewSubscriptionModal open={renew} onClose={() => setRenew(false)} clientId={s.client_id} renewFrom={s} />}
    </>
  );
}
const Info = ({ l, v }: { l: string; v: React.ReactNode }) => <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5"><div className="text-xs text-zinc-500">{l}</div><div className="font-semibold">{v ?? '—'}</div></div>;

// ---------------- Page ----------------
export default function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [validity, setValidity] = useState(params.get('validity') ?? 'current');
  const [payment, setPayment] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const { can } = useAuth();
  const detail = params.get('id') ? Number(params.get('id')) : null;
  useEffect(() => setPage(1), [search, validity, payment, category]);
  const query = { page, pageSize: 25, search, validity, payment, category, sort };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['subscriptions', query], queryFn: () => api('/subscriptions', { query }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">Abonnements</h1>
        {can('subscriptions:write') && <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" />Nouvel abonnement</Button>}
      </div>
      <Tabs value={validity} onChange={setValidity} items={[{ value: 'current', label: 'En cours' }, { value: 'valid', label: 'Valides' }, { value: 'expiring', label: 'Expirent sous 7 j' }, { value: 'expired', label: 'Expirés' }, { value: 'suspended', label: 'Suspendus' }, { value: '', label: 'Tous' }]} />
      <DataTable
        title="Abonnements"
        rows={data?.data ?? []} total={data?.total} page={page} onPage={setPage} search={search} onSearch={setSearch} sort={sort} onSort={setSort}
        loading={isLoading} error={error} onRetry={refetch}
        fetchAll={async () => (await api('/subscriptions', { query: { ...query, page: 1, pageSize: 500 } })).data}
        onRowClick={(r) => setParams({ id: String(r.id) })}
        toolbar={<>
          <Select value={payment} onChange={(e) => setPayment(e.target.value)} className="h-9 w-auto"><option value="">Paiement</option><option value="paid">Payés</option><option value="partial">Partiels</option><option value="unpaid">Impayés</option><option value="due">Reste à payer</option></Select>
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 w-auto"><option value="">Catégorie</option><option value="adult">Adultes</option><option value="junior">Juniors</option><option value="child">Enfants</option><option value="student">Étudiants</option><option value="family">Familles</option></Select>
        </>}
        columns={[
          { key: 'reference', label: 'Réf.', className: 'font-mono text-xs' },
          { key: 'client', label: 'Client', sortKey: 'name', render: (r) => <div><div className="font-semibold">{r.last_name} {r.first_name}</div><div className="text-xs text-zinc-500">{r.matricule}</div></div>, exportValue: (r) => `${r.last_name} ${r.first_name}` },
          { key: 'plan_name', label: 'Formule', render: (r) => <div>{r.plan_name}<div className="text-xs text-zinc-500">{r.category_name}</div></div> },
          { key: 'start_date', label: 'Début', sortKey: 'start_date', render: (r) => fmtDate(r.start_date), hideOnMobile: true },
          { key: 'end_date', label: 'Fin', sortKey: 'end_date', render: (r) => <div>{fmtDate(r.end_date)}{r.days_remaining > 0 && <div className="text-xs text-zinc-500">{r.days_remaining} j</div>}</div> },
          { key: 'final_price', label: 'Prix', money: true, sortKey: 'final_price', hideOnMobile: true },
          { key: 'remaining', label: 'Reste', money: true },
          { key: 'validity', label: 'Validité', render: (r) => <VB v={r.validity} /> },
          { key: 'payment_status', label: 'Paiement', render: (r) => <PB v={r.payment_status} /> },
        ]}
        actions={(r) => <Button size="icon" variant="ghost" onClick={() => setParams({ id: String(r.id) })}><Eye className="h-4 w-4" /></Button>}
      />
      <SubscriptionDetail id={detail} onClose={() => { params.delete('id'); setParams(params); }} />
      <NewSubscriptionModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

export { todayISO };
