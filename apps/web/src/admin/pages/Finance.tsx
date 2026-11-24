import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Ban, CheckCircle2, CreditCard, Download, Eye, FileOutput, Lock, Plus, Printer, Trash2, Unlock, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime, money, toMillimes, todayISO } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, Modal, Select, Spinner, Stat, Tabs, Textarea, useUI, type Tone } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { commercialPDF, METHOD_LABEL, receiptPDF, tablePDF } from '@/lib/docs';
import { useAuth } from '../auth';
import { Resource, useOptions } from '../Resource';
import { MethodSelect } from './Subscriptions';

// ======================= CASH =======================
export function CashPage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'current' | 'history'>('current');
  const [opening, setOpening] = useState('');
  const [mv, setMv] = useState({ direction: 'in', amount: '', justification: '' });
  const [actual, setActual] = useState('');
  const [view, setView] = useState<number | null>(null);
  const cur = useQuery({ queryKey: ['cash-current'], queryFn: () => api('/cash/current') });
  const hist = useQuery({ queryKey: ['cash-history'], queryFn: () => api('/cash/registers'), enabled: tab === 'history' });
  const detail = useQuery({ queryKey: ['cash-reg', view], queryFn: () => api(`/cash/registers/${view}`), enabled: !!view });
  const r = cur.data;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['cash-current'] }); qc.invalidateQueries({ queryKey: ['cash-history'] }); };
  const call = async (path: string, body: any, msg: string) => { try { await api(path, { body }); toast('success', msg); refresh(); return true; } catch (e: any) { toast('error', e.message); return false; } };
  const printClosure = (reg: any) => tablePDF('Clôture de caisse', [{ key: 'date', label: 'Date' }, { key: 'reference', label: 'Réf.' }, { key: 'sens', label: 'Sens' }, { key: 'mode', label: 'Mode' }, { key: 'amount', label: 'Montant', money: true }, { key: 'justification', label: 'Justification' }],
    reg.transactions.map((t: any) => ({ date: fmtDateTime(t.created_at), reference: t.reference, sens: t.direction === 'in' ? 'Entrée' : 'Sortie', mode: METHOD_LABEL[t.method], amount: t.amount, justification: t.justification })),
    `Caisse #${reg.id} — ${reg.opened_by_name} — théorique ${money(reg.theoretical_balance)}${reg.closure ? ` / réel ${money(reg.closure.actual_balance)} / écart ${money(reg.closure.difference)}` : ''}`);
  const Tx = ({ reg }: { reg: any }) => (
    <DataTable title={`Caisse ${reg.id}`} rows={reg.transactions} columns={[
      { key: 'created_at', label: 'Date', render: (t) => fmtDateTime(t.created_at) }, { key: 'reference', label: 'Référence', className: 'font-mono text-xs' },
      { key: 'direction', label: 'Sens', render: (t) => t.direction === 'in' ? <Badge tone="green">Entrée</Badge> : <Badge tone="red">Sortie</Badge> },
      { key: 'method', label: 'Mode', render: (t) => METHOD_LABEL[t.method] }, { key: 'amount', label: 'Montant', money: true }, { key: 'justification', label: 'Justification' }, { key: 'user_name', label: 'Utilisateur' },
    ]} />
  );
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">Caisse</h1>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'current', label: 'Ma caisse' }, { value: 'history', label: 'Historique & clôtures' }]} />
      {tab === 'current' && (cur.isLoading ? <Spinner /> : !r ? (
        <Card className="mx-auto max-w-md text-center">
          <Wallet className="mx-auto mb-3 h-12 w-12 text-brand" />
          <h2 className="text-xl font-bold">Aucune caisse ouverte</h2>
          <p className="mb-4 text-sm text-zinc-500">Ouvrez votre caisse avec le fond de caisse initial pour encaisser en espèces.</p>
          {can('cash:write') && <div className="flex gap-2"><Input type="number" step="0.001" placeholder="Solde initial (DT)" value={opening} onChange={(e) => setOpening(e.target.value)} /><Button onClick={() => call('/cash/open', { opening_balance: toMillimes(opening || 0) }, 'Caisse ouverte')}><Unlock className="h-4 w-4" />Ouvrir</Button></div>}
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Solde initial" value={money(r.opening_balance)} icon={<Wallet className="h-5 w-5" />} />
            <Stat label="Encaissements espèces" value={money(r.cash_in)} icon={<ArrowDownCircle className="h-5 w-5" />} tone="green" />
            <Stat label="Décaissements" value={money(r.cash_out)} icon={<ArrowUpCircle className="h-5 w-5" />} tone="red" />
            <Stat label="Autres modes (CB, virement…)" value={money(r.other_in)} icon={<CreditCard className="h-5 w-5" />} tone="blue" />
            <Stat label="Solde théorique" value={money(r.theoretical_balance)} icon={<Wallet className="h-5 w-5" />} tone="brand" sub={`Ouverte le ${fmtDateTime(r.opened_at)}`} />
          </div>
          {can('cash:write') && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-bold">Mouvement manuel</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select value={mv.direction} onChange={(e) => setMv({ ...mv, direction: e.target.value })}><option value="in">Encaissement</option><option value="out">Décaissement</option></Select>
                  <Input type="number" step="0.001" placeholder="Montant (DT)" value={mv.amount} onChange={(e) => setMv({ ...mv, amount: e.target.value })} />
                  <Input placeholder="Justification *" value={mv.justification} onChange={(e) => setMv({ ...mv, justification: e.target.value })} />
                </div>
                <Button className="mt-3" variant="secondary" onClick={async () => { if (await call('/cash/movement', { ...mv, amount: toMillimes(mv.amount) }, 'Mouvement enregistré')) setMv({ direction: 'in', amount: '', justification: '' }); }}>Enregistrer</Button>
              </Card>
              <Card>
                <h3 className="mb-3 font-bold">Clôture journalière</h3>
                <div className="flex gap-2"><Input type="number" step="0.001" placeholder="Solde réel compté (DT)" value={actual} onChange={(e) => setActual(e.target.value)} />
                  <Button variant="danger" onClick={async () => {
                    const diff = toMillimes(actual) - r.theoretical_balance;
                    if (await confirm({ title: 'Clôturer la caisse ?', text: `Théorique ${money(r.theoretical_balance)} — réel ${money(toMillimes(actual))} — écart ${money(diff)}`, danger: diff !== 0 })) {
                      if (await call('/cash/close', { actual_balance: toMillimes(actual) }, 'Caisse clôturée')) { setActual(''); printClosure({ ...r, closure: { actual_balance: toMillimes(actual), difference: diff } }); }
                    }
                  }}><Lock className="h-4 w-4" />Clôturer</Button></div>
                {actual && <p className="mt-2 text-sm">Écart : <b className={toMillimes(actual) - r.theoretical_balance === 0 ? 'text-emerald-600' : 'text-red-500'}>{money(toMillimes(actual) - r.theoretical_balance)}</b></p>}
              </Card>
            </div>
          )}
          <Tx reg={r} />
        </div>
      ))}
      {tab === 'history' && (
        <DataTable title="Historique des caisses" rows={hist.data?.data ?? []} loading={hist.isLoading} onRowClick={(x) => setView(x.id)} columns={[
          { key: 'id', label: '#' }, { key: 'opened_by_name', label: 'Caissier' }, { key: 'opened_at', label: 'Ouverture', render: (x) => fmtDateTime(x.opened_at) }, { key: 'closed_at', label: 'Clôture', render: (x) => fmtDateTime(x.closed_at) },
          { key: 'opening_balance', label: 'Initial', money: true }, { key: 'total_in', label: 'Entrées', money: true }, { key: 'total_out', label: 'Sorties', money: true },
          { key: 'actual_balance', label: 'Réel', money: true }, { key: 'difference', label: 'Écart', render: (x) => x.difference == null ? '—' : <b className={x.difference === 0 ? 'text-emerald-600' : 'text-red-500'}>{money(x.difference)}</b> },
          { key: 'status', label: 'Statut', render: (x) => <Badge tone={x.status === 'open' ? 'green' : 'zinc'}>{x.status === 'open' ? 'Ouverte' : 'Clôturée'}</Badge> },
        ]} />
      )}
      <Modal open={!!view} onClose={() => setView(null)} title={`Caisse #${view}`} size="xl" footer={detail.data && <Button variant="outline" onClick={() => printClosure(detail.data)}><Printer className="h-4 w-4" />Rapport PDF</Button>}>
        {detail.data ? <Tx reg={detail.data} /> : <Spinner />}
      </Modal>
    </div>
  );
}

// ======================= PAYMENTS =======================
export function PaymentsPage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [f, setF] = useState({ from: todayISO().slice(0, 8) + '01', to: todayISO(), method: '', source: '' });
  const [open, setOpen] = useState(false);
  const [n, setN] = useState<any>({ amount: '', method: 'cash', source: 'session', client_id: '', notes: '' });
  const clients = useOptions('/clients', (c) => `${c.matricule} — ${c.last_name} ${c.first_name}`);
  const query = { page, search, ...f };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['payments', query], queryFn: () => api('/payments', { query }) });
  const create = async () => {
    try {
      const r = await api('/payments', { body: { ...n, amount: toMillimes(n.amount), client_id: n.client_id ? Number(n.client_id) : null } });
      toast('success', `Encaissement enregistré — ${r.receipt_number}`);
      setOpen(false); qc.invalidateQueries();
      receiptPDF(r.receipt_id, 'print');
    } catch (e: any) { toast('error', e.message); }
  };
  const srcLbl: Record<string, string> = { subscription: 'Abonnement', registration: 'Inscription', session: 'Séance unique', coaching: 'Coaching privé', accessory: 'Accessoire', invoice: 'Facture', other: 'Autre' };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">Paiements</h1>
        {can('payments:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Autre recette</Button>}
      </div>
      <Card className="flex flex-wrap items-center gap-4 p-4"><div>Total encaissé sur la période : <b className="text-xl text-brand">{money(data?.sum)}</b></div><div className="text-sm text-zinc-500">{data?.total ?? 0} paiement(s)</div></Card>
      <DataTable title="Paiements" rows={data?.data ?? []} total={data?.total} page={page} onPage={setPage} search={search} onSearch={setSearch} loading={isLoading} error={error} onRetry={refetch}
        fetchAll={async () => (await api('/payments', { query: { ...query, page: 1, pageSize: 500 } })).data}
        toolbar={<>
          <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="h-9 w-auto" /><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="h-9 w-auto" />
          <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="h-9 w-auto"><option value="">Mode</option>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} className="h-9 w-auto"><option value="">Type</option>{Object.entries(srcLbl).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        </>}
        columns={[
          { key: 'paid_at', label: 'Date', render: (r) => fmtDateTime(r.paid_at) }, { key: 'receipt_number', label: 'Reçu', className: 'font-mono text-xs' },
          { key: 'client', label: 'Client', render: (r) => r.last_name ? `${r.last_name} ${r.first_name}` : '—', exportValue: (r) => r.last_name ? `${r.last_name} ${r.first_name}` : '' },
          { key: 'source', label: 'Type', render: (r) => srcLbl[r.source] ?? r.source }, { key: 'method', label: 'Mode', render: (r) => <Badge>{METHOD_LABEL[r.method]}</Badge>, exportValue: (r) => METHOD_LABEL[r.method] },
          { key: 'amount', label: 'Montant', money: true }, { key: 'user_name', label: 'Par', hideOnMobile: true },
        ]}
        actions={(r) => <>
          {r.receipt_id && <Button size="icon" variant="ghost" onClick={() => receiptPDF(r.receipt_id, 'print')} title="Reçu"><Printer className="h-4 w-4" /></Button>}
          {can('payments:delete') && <Button size="icon" variant="ghost" title="Annuler" onClick={async () => { const reason = await confirm({ title: 'Annuler ce paiement ?', danger: true, input: 'Motif (obligatoire)' }); if (reason) { try { await api(`/payments/${r.id}/cancel`, { body: { reason } }); toast('success', 'Paiement annulé'); qc.invalidateQueries(); } catch (e: any) { toast('error', e.message); } } }}><Ban className="h-4 w-4 text-red-500" /></Button>}
        </>}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="Nouvelle recette" footer={<Button onClick={create}>Encaisser & imprimer le reçu</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type"><Select value={n.source} onChange={(e) => setN({ ...n, source: e.target.value })}><option value="session">Séance unique</option><option value="coaching">Coaching privé</option><option value="accessory">Vente d’accessoire</option><option value="registration">Inscription</option><option value="other">Autre recette</option></Select></Field>
          <Field label="Montant (DT)" required><Input type="number" step="0.001" value={n.amount} onChange={(e) => setN({ ...n, amount: e.target.value })} /></Field>
          <Field label="Mode"><MethodSelect value={n.method} onChange={(v) => setN({ ...n, method: v })} /></Field>
          <Field label="Client (facultatif)"><Select value={n.client_id} onChange={(e) => setN({ ...n, client_id: e.target.value })}><option value="">—</option>{clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Désignation / justification" required className="sm:col-span-2"><Input value={n.notes} onChange={(e) => setN({ ...n, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

// ======================= EXPENSES =======================
export function ExpensesPage() {
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const { can } = useAuth();
  return (
    <Resource title="Dépenses" endpoint="/expenses" module="expenses" query={{ active: '1' }} defaultSort="t.spent_at:desc"
      header={<p className="text-sm text-zinc-500">Les dépenses en espèces sont automatiquement sorties de votre caisse ouverte. Les salaires payés depuis la paie apparaissent ici (catégorie Salaires) — ils ne sont jamais comptés deux fois.</p>}
      filters={[{ name: 'category_id', label: 'Catégorie', relation: { endpoint: '/expense-categories', label: (r) => r.name } }, { name: 'method', label: 'Mode', options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })) }, { name: 'from', label: 'Du', type: 'date' }, { name: 'to', label: 'Au', type: 'date' }]}
      editable={(r) => !r.payroll_record_id}
      columns={[
        { key: 'spent_at', label: 'Date', sortKey: 't.spent_at', render: (r) => fmtDate(r.spent_at) }, { key: 'reference', label: 'Réf.', className: 'font-mono text-xs' },
        { key: 'category_name', label: 'Catégorie', render: (r) => <Badge>{r.category_name}</Badge>, exportValue: (r) => r.category_name }, { key: 'label', label: 'Libellé' },
        { key: 'supplier_name', label: 'Fournisseur', hideOnMobile: true }, { key: 'method', label: 'Mode', render: (r) => METHOD_LABEL[r.method] }, { key: 'amount', label: 'Montant', money: true, sortKey: 't.amount' },
      ]}
      fields={[
        { name: 'category_id', label: 'Catégorie', type: 'relation', relation: { endpoint: '/expense-categories', label: (r) => r.name }, required: true },
        { name: 'label', label: 'Libellé', required: true, span: 2 }, { name: 'amount', label: 'Montant', type: 'money', required: true },
        { name: 'method', label: 'Mode', type: 'select', options: Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label })), required: true },
        { name: 'spent_at', label: 'Date', type: 'date', required: true }, { name: 'supplier_id', label: 'Fournisseur', type: 'relation', relation: { endpoint: '/suppliers', label: (r) => r.company_name } },
        { name: 'notes', label: 'Justification / notes', type: 'textarea', span: 3 },
      ]}
      defaults={{ method: 'cash', spent_at: todayISO() }}
      rowActions={(r) => can('expenses:delete') && !r.payroll_record_id ? <Button size="icon" variant="ghost" title="Annuler la dépense" onClick={async () => { const reason = await confirm({ title: 'Annuler cette dépense ?', danger: true, input: 'Motif' }); if (reason) { try { await api(`/expenses/${r.id}/cancel`, { body: { reason } }); toast('success', 'Dépense annulée'); qc.invalidateQueries({ queryKey: ['/expenses'] }); } catch (e: any) { toast('error', e.message); } } }}><Ban className="h-4 w-4 text-red-500" /></Button> : null}
    />
  );
}

// ======================= RECEIPTS =======================
export function ReceiptsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['receipts', page, search], queryFn: () => api('/receipts', { query: { page, search } }) });
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">Reçus</h1>
      <DataTable title="Reçus" rows={data?.data ?? []} total={data?.total} page={page} onPage={setPage} search={search} onSearch={setSearch} loading={isLoading} error={error} onRetry={refetch}
        columns={[
          { key: 'number', label: 'Numéro', className: 'font-mono text-xs' }, { key: 'issued_at', label: 'Date', render: (r) => fmtDateTime(r.issued_at) },
          { key: 'client', label: 'Client', render: (r) => r.last_name ? `${r.last_name} ${r.first_name}` : '—', exportValue: (r) => `${r.last_name ?? ''} ${r.first_name ?? ''}` },
          { key: 'method', label: 'Mode', render: (r) => METHOD_LABEL[r.method] }, { key: 'amount', label: 'Montant', money: true }, { key: 'remaining', label: 'Reste', money: true },
        ]}
        actions={(r) => <><Button size="icon" variant="ghost" onClick={() => receiptPDF(r.id, 'print')} title="Imprimer"><Printer className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => receiptPDF(r.id)} title="Télécharger"><Download className="h-4 w-4" /></Button></>}
      />
    </div>
  );
}

// ======================= QUOTATIONS & INVOICES =======================
const qStatus: Record<string, [string, Tone]> = { draft: ['Brouillon', 'zinc'], sent: ['Envoyé', 'blue'], accepted: ['Accepté', 'green'], refused: ['Refusé', 'red'], expired: ['Expiré', 'amber'], invoiced: ['Facturé', 'violet'] };
const iStatus: Record<string, [string, Tone]> = { unpaid: ['Impayée', 'red'], partial: ['Partielle', 'amber'], paid: ['Payée', 'green'], cancelled: ['Annulée', 'zinc'] };

function DocEditor({ kind, open, onClose, doc }: { kind: 'quotation' | 'invoice'; open: boolean; onClose: () => void; doc?: any }) {
  const { toast } = useUI();
  const qc = useQueryClient();
  const clients = useOptions('/clients', (c) => `${c.matricule} — ${c.last_name} ${c.first_name}`);
  const blank = { client_id: '', prospect_name: '', prospect_phone: '', customer_name: '', customer_phone: '', customer_tax_id: '', issue_date: todayISO(), valid_until: '', due_date: '', vat_rate: 0, conditions: '', notes: '', items: [{ designation: '', quantity: 1, unit_price: '', discount: 0 }] };
  const [f, setF] = useState<any>(blank);
  const [k, setK] = useState('');
  if (open && k !== String(doc?.id ?? 'new')) {
    setK(String(doc?.id ?? 'new'));
    setF(doc ? { ...blank, ...doc, client_id: doc.client_id ?? '', vat_rate: doc.vat_rate_bp / 100, items: doc.items.map((i: any) => ({ designation: i.designation, quantity: i.quantity, unit_price: (i.unit_price / 1000).toFixed(3), discount: i.discount_bp / 100 })) } : blank);
  }
  if (!open && k) setK('');
  const items = f.items.map((i: any) => ({ designation: i.designation, quantity: Number(i.quantity) || 1, unit_price: toMillimes(i.unit_price || 0), discount_bp: Math.round(Number(i.discount || 0) * 100) }));
  const ht = items.reduce((a: number, i: any) => a + i.quantity * i.unit_price - Math.round(i.quantity * i.unit_price * i.discount_bp / 10000), 0);
  const vat = Math.round(ht * Number(f.vat_rate || 0) / 100);
  const save = async () => {
    const base = { client_id: f.client_id ? Number(f.client_id) : null, issue_date: f.issue_date, vat_rate_bp: Math.round(Number(f.vat_rate || 0) * 100), items };
    const body = kind === 'quotation' ? { ...base, prospect_name: f.prospect_name || null, prospect_phone: f.prospect_phone || null, valid_until: f.valid_until || null, conditions: f.conditions || null }
      : { ...base, customer_name: f.customer_name || null, customer_phone: f.customer_phone || null, customer_tax_id: f.customer_tax_id || null, due_date: f.due_date || null, notes: f.notes || null };
    try {
      if (doc) await api(`/quotations/${doc.id}`, { method: 'PUT', body });
      else await api(kind === 'quotation' ? '/quotations' : '/invoices', { body });
      toast('success', 'Document enregistré'); qc.invalidateQueries({ queryKey: [kind] }); onClose();
    } catch (e: any) { toast('error', e.message); }
  };
  const setItem = (i: number, patch: any) => setF({ ...f, items: f.items.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <Modal open={open} onClose={onClose} title={doc ? `Modifier ${doc.number}` : kind === 'quotation' ? 'Nouveau devis' : 'Nouvelle facture'} size="xl" footer={<Button onClick={save}>Enregistrer</Button>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Client existant"><Select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}><option value="">— Prospect / autre —</option>{clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
        {!f.client_id && <><Field label={kind === 'quotation' ? 'Prospect' : 'Client'}><Input value={kind === 'quotation' ? f.prospect_name : f.customer_name} onChange={(e) => setF({ ...f, [kind === 'quotation' ? 'prospect_name' : 'customer_name']: e.target.value })} /></Field>
          <Field label="Téléphone"><Input value={kind === 'quotation' ? f.prospect_phone : f.customer_phone} onChange={(e) => setF({ ...f, [kind === 'quotation' ? 'prospect_phone' : 'customer_phone']: e.target.value })} /></Field></>}
        {kind === 'invoice' && <Field label="Matricule fiscal client"><Input value={f.customer_tax_id} onChange={(e) => setF({ ...f, customer_tax_id: e.target.value })} /></Field>}
        <Field label="Date"><Input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field>
        <Field label={kind === 'quotation' ? 'Valable jusqu’au' : 'Échéance'}><Input type="date" value={kind === 'quotation' ? f.valid_until ?? '' : f.due_date ?? ''} onChange={(e) => setF({ ...f, [kind === 'quotation' ? 'valid_until' : 'due_date']: e.target.value })} /></Field>
        <Field label="TVA (%)" hint="À valider par le comptable"><Input type="number" step="0.01" value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: e.target.value })} /></Field>
      </div>
      <div className="mt-5 space-y-2">
        <div className="grid grid-cols-12 gap-2 text-xs font-bold uppercase text-zinc-500"><div className="col-span-5">Désignation</div><div className="col-span-2">Qté</div><div className="col-span-2">P.U. HT (DT)</div><div className="col-span-2">Remise %</div></div>
        {f.items.map((it: any, i: number) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <Input className="col-span-5" value={it.designation} onChange={(e) => setItem(i, { designation: e.target.value })} />
            <Input className="col-span-2" type="number" min="1" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
            <Input className="col-span-2" type="number" step="0.001" value={it.unit_price} onChange={(e) => setItem(i, { unit_price: e.target.value })} />
            <Input className="col-span-2" type="number" step="0.01" value={it.discount} onChange={(e) => setItem(i, { discount: e.target.value })} />
            <Button size="icon" variant="ghost" onClick={() => setF({ ...f, items: f.items.filter((_: any, j: number) => j !== i) })} disabled={f.items.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setF({ ...f, items: [...f.items, { designation: '', quantity: 1, unit_price: '', discount: 0 }] })}><Plus className="h-4 w-4" />Ligne</Button>
      </div>
      <Field label={kind === 'quotation' ? 'Conditions commerciales' : 'Notes'} className="mt-4"><Textarea value={kind === 'quotation' ? f.conditions ?? '' : f.notes ?? ''} onChange={(e) => setF({ ...f, [kind === 'quotation' ? 'conditions' : 'notes']: e.target.value })} /></Field>
      <Card className="mt-4 flex flex-wrap justify-end gap-6 bg-zinc-50 text-sm dark:bg-white/5"><span>Total HT : <b>{money(ht)}</b></span><span>TVA : <b>{money(vat)}</b></span><span className="text-lg">Total TTC : <b className="text-brand">{money(ht + vat)}</b>{kind === 'invoice' && <span className="text-xs text-zinc-500"> (+ timbre selon paramètres)</span>}</span></Card>
    </Modal>
  );
}

export function QuotationsPage() {
  const { can } = useAuth();
  const { toast } = useUI();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<{ open: boolean; doc?: any }>({ open: false });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['quotation', search, status], queryFn: () => api('/quotations', { query: { search, status } }) });
  const setSt = async (id: number, s: string) => { try { await api(`/quotations/${id}/status`, { body: { status: s } }); toast('success', 'Statut mis à jour'); qc.invalidateQueries({ queryKey: ['quotation'] }); } catch (e: any) { toast('error', e.message); } };
  const convert = async (id: number) => { try { const r = await api(`/quotations/${id}/convert`, { body: {} }); toast('success', `Facture ${r.number} créée`); qc.invalidateQueries(); } catch (e: any) { toast('error', e.message); } };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-4xl uppercase tracking-wide">Devis</h1>{can('quotations:write') && <Button onClick={() => setEdit({ open: true })}><Plus className="h-4 w-4" />Nouveau devis</Button>}</div>
      <DataTable title="Devis" rows={data?.data ?? []} loading={isLoading} error={error} onRetry={refetch} search={search} onSearch={setSearch}
        toolbar={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto"><option value="">Statut</option>{Object.entries(qStatus).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>}
        columns={[
          { key: 'number', label: 'Numéro', className: 'font-mono text-xs' }, { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) },
          { key: 'client', label: 'Client / prospect', render: (r) => r.client_name || r.prospect_name, exportValue: (r) => r.client_name || r.prospect_name }, { key: 'valid_until', label: 'Validité', render: (r) => fmtDate(r.valid_until) },
          { key: 'total_ttc', label: 'Total TTC', money: true }, { key: 'effective_status', label: 'Statut', render: (r) => <Badge tone={qStatus[r.effective_status]?.[1]}>{qStatus[r.effective_status]?.[0]}</Badge> },
        ]}
        actions={(r) => <>
          <Button size="icon" variant="ghost" onClick={() => commercialPDF('quotation', r.id, 'print')} title="PDF"><Printer className="h-4 w-4" /></Button>
          {can('quotations:write') && ['draft', 'sent'].includes(r.status) && <Button size="icon" variant="ghost" title="Modifier" onClick={async () => setEdit({ open: true, doc: await api(`/quotations/${r.id}`) })}><Eye className="h-4 w-4" /></Button>}
          {can('quotations:write') && r.status !== 'invoiced' && <Select className="h-8 w-28 text-xs" value="" onChange={(e) => e.target.value && setSt(r.id, e.target.value)}><option value="">Statut…</option><option value="sent">Envoyé</option><option value="accepted">Accepté</option><option value="refused">Refusé</option><option value="draft">Brouillon</option></Select>}
          {can('invoices:write') && r.status === 'accepted' && <Button size="sm" variant="secondary" onClick={() => convert(r.id)}><FileOutput className="h-4 w-4" />Facturer</Button>}
        </>}
      />
      <DocEditor kind="quotation" open={edit.open} doc={edit.doc} onClose={() => setEdit({ open: false })} />
    </div>
  );
}

export function InvoicesPage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<any>(null);
  const [p, setP] = useState({ amount: '', method: 'transfer' });
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['invoice', search, status], queryFn: () => api('/invoices', { query: { search, status } }) });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-4xl uppercase tracking-wide">Factures</h1>{can('invoices:write') && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Nouvelle facture</Button>}</div>
      <DataTable title="Factures" rows={data?.data ?? []} loading={isLoading} error={error} onRetry={refetch} search={search} onSearch={setSearch}
        toolbar={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto"><option value="">Statut</option>{Object.entries(iStatus).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select>}
        columns={[
          { key: 'number', label: 'Numéro', className: 'font-mono text-xs' }, { key: 'issue_date', label: 'Date', render: (r) => fmtDate(r.issue_date) }, { key: 'client_name', label: 'Client' },
          { key: 'total_ttc', label: 'TTC', money: true }, { key: 'amount_paid', label: 'Payé', money: true }, { key: 'rest', label: 'Reste', render: (r) => money(r.total_ttc - r.amount_paid), exportValue: (r) => (r.total_ttc - r.amount_paid) / 1000 },
          { key: 'status', label: 'Statut', render: (r) => <Badge tone={iStatus[r.status]?.[1]}>{iStatus[r.status]?.[0]}</Badge> },
        ]}
        actions={(r) => <>
          <Button size="icon" variant="ghost" onClick={() => commercialPDF('invoice', r.id, 'print')} title="PDF"><Printer className="h-4 w-4" /></Button>
          {can('payments:write') && ['unpaid', 'partial'].includes(r.status) && <Button size="sm" variant="secondary" onClick={() => { setPay(r); setP({ amount: ((r.total_ttc - r.amount_paid) / 1000).toFixed(3), method: 'transfer' }); }}><CheckCircle2 className="h-4 w-4" />Encaisser</Button>}
          {can('invoices:delete') && r.status === 'unpaid' && <Button size="icon" variant="ghost" onClick={async () => { if (await confirm({ title: 'Annuler la facture ?', danger: true })) { try { await api(`/invoices/${r.id}/cancel`, { body: {} }); qc.invalidateQueries({ queryKey: ['invoice'] }); } catch (e: any) { toast('error', e.message); } } }}><Ban className="h-4 w-4 text-red-500" /></Button>}
        </>}
      />
      <DocEditor kind="invoice" open={open} onClose={() => setOpen(false)} />
      <Modal open={!!pay} onClose={() => setPay(null)} title={`Encaisser ${pay?.number}`} size="sm" footer={<Button onClick={async () => { try { const r = await api(`/invoices/${pay.id}/pay`, { body: { amount: toMillimes(p.amount), method: p.method } }); toast('success', 'Paiement enregistré'); setPay(null); qc.invalidateQueries(); receiptPDF(r.receipt.receipt_id, 'print'); } catch (e: any) { toast('error', e.message); } }}>Encaisser</Button>}>
        <div className="space-y-3"><Field label="Montant (DT)"><Input type="number" step="0.001" value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} /></Field><Field label="Mode"><MethodSelect value={p.method} onChange={(v) => setP({ ...p, method: v })} /></Field></div>
      </Modal>
    </div>
  );
}

export const _unused = { Empty };
