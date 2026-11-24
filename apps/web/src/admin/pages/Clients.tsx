import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, DoorOpen, Eye, FileUp, History, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ageOf, fmtDate, fmtDateTime, money } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Tabs, Textarea, useUI } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { clientSheetPDF, readExcel } from '@/lib/docs';
import { useAuth } from '../auth';
import { useOptions } from '../Resource';
import { NewSubscriptionModal, PB, SubscriptionDetail, VB } from './Subscriptions';

const catTitle: Record<string, string> = { adult: 'Adultes', junior: 'Juniors', child: 'Enfants' };
const empty = { first_name: '', last_name: '', birth_date: '', gender: '', phone: '', email: '', address: '', registration_date: '', category_id: '', activities: [] as number[], status: 'active', notes: '', guardian: { full_name: '', phone: '', relationship: '', emergency_contact: '' } };

function ClientForm({ open, onClose, client }: { open: boolean; onClose: () => void; client?: any }) {
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const cats = useOptions('/categories', (c) => c.name);
  const acts = useOptions('/activities', (a) => a.name);
  const [f, setF] = useState<any>(empty);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF(client ? {
      ...empty, ...Object.fromEntries(Object.keys(empty).map((k) => [k, client[k] ?? (empty as any)[k]])),
      guardian: { full_name: client.guardian_name ?? '', phone: client.guardian_phone ?? '', relationship: client.guardian_relationship ?? '', emergency_contact: client.guardian_emergency ?? '' },
    } : empty);
  }, [open, client]);
  const age = ageOf(f.birth_date);
  const selectedCat = cats.find((c) => String(c.value) === String(f.category_id))?.raw;
  const minor = (age != null && age < 18) || !!selectedCat?.is_minor;
  const submit = async (force = false) => {
    setSaving(true);
    const body: any = { ...f, category_id: f.category_id ? Number(f.category_id) : null, gender: f.gender || null, birth_date: f.birth_date || null, registration_date: f.registration_date || undefined, email: f.email || null, guardian: minor ? f.guardian : null, force };
    try {
      if (client) await api(`/clients/${client.id}`, { method: 'PUT', body });
      else await api('/clients', { body });
      toast('success', client ? 'Client mis à jour' : 'Client inscrit');
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['client'] });
      onClose();
    } catch (e: any) {
      if (e.status === 409 && e.data?.details?.duplicate && !force) {
        if (await confirm({ title: 'Doublon probable', text: e.message + ' Voulez-vous quand même créer ce client ?' })) return submit(true);
      } else toast('error', e.message);
    } finally { setSaving(false); }
  };
  const g = f.guardian;
  return (
    <Modal open={open} onClose={onClose} title={client ? `Modifier ${client.matricule}` : 'Inscrire un client'} size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Annuler</Button><Button loading={saving} onClick={() => (document.getElementById('client-form') as HTMLFormElement).requestSubmit()}>Enregistrer</Button></>}>
      <form id="client-form" onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nom" required><Input required value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
          <Field label="Prénom" required><Input required value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
          <Field label="Date de naissance" hint={age != null ? `${age} ans` : undefined}><Input type="date" value={f.birth_date ?? ''} onChange={(e) => setF({ ...f, birth_date: e.target.value })} /></Field>
          <Field label="Sexe"><Select value={f.gender ?? ''} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option></Select></Field>
          <Field label="Téléphone" required><Input required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Adresse" className="sm:col-span-2"><Input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Date d’inscription"><Input type="date" value={f.registration_date ?? ''} onChange={(e) => setF({ ...f, registration_date: e.target.value })} /></Field>
          <Field label="Catégorie" hint="Automatique selon l’âge si vide"><Select value={f.category_id ?? ''} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Auto</option>{cats.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select></Field>
          <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Actif</option><option value="inactive">Inactif</option><option value="suspended">Suspendu</option></Select></Field>
          <Field label="Activités pratiquées" className="sm:col-span-2 lg:col-span-3">
            <div className="flex flex-wrap gap-1.5">{acts.map((a) => { const on = f.activities.includes(a.value); return <button type="button" key={a.value} onClick={() => setF({ ...f, activities: on ? f.activities.filter((x: number) => x !== a.value) : [...f.activities, a.value] })} className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-brand text-brand-fg' : 'bg-zinc-100 dark:bg-white/10'}`}>{a.label}</button>; })}</div>
          </Field>
          <Field label="Remarques administratives" className="sm:col-span-2 lg:col-span-3"><Textarea value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        </div>
        {minor && (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/5">
            <h4 className="mb-3 font-bold text-amber-700 dark:text-amber-300">Mineur — parent / tuteur obligatoire</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom du parent / tuteur" required><Input required value={g.full_name} onChange={(e) => setF({ ...f, guardian: { ...g, full_name: e.target.value } })} /></Field>
              <Field label="Téléphone du parent" required><Input required value={g.phone} onChange={(e) => setF({ ...f, guardian: { ...g, phone: e.target.value } })} /></Field>
              <Field label="Lien de parenté"><Select value={g.relationship} onChange={(e) => setF({ ...f, guardian: { ...g, relationship: e.target.value } })}><option value="">—</option><option>Père</option><option>Mère</option><option>Tuteur</option><option>Autre</option></Select></Field>
              <Field label="Contact d’urgence"><Input value={g.emergency_contact} onChange={(e) => setF({ ...f, guardian: { ...g, emergency_contact: e.target.value } })} /></Field>
            </div>
          </Card>
        )}
      </form>
    </Modal>
  );
}

function ClientDetail({ id, onClose, onEdit }: { id: number | null; onClose: () => void; onEdit: (c: any) => void }) {
  const { can } = useAuth();
  const { toast } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'info' | 'subs' | 'history' | 'visits'>('info');
  const [newSub, setNewSub] = useState(false);
  const [subId, setSubId] = useState<number | null>(null);
  const { data: c, isLoading } = useQuery({ queryKey: ['client', id], queryFn: () => api(`/clients/${id}`), enabled: !!id });
  const subs = useQuery({ queryKey: ['subscriptions', { client_id: id }], queryFn: () => api('/subscriptions', { query: { client_id: id, pageSize: 100 } }), enabled: !!id });
  const hist = useQuery({ queryKey: ['audit', 'clients', id], queryFn: () => api('/audit', { query: { entity: 'clients', entity_id: id } }), enabled: !!id && tab === 'history' && can('audit:read') });
  const checkin = async () => {
    try {
      const r = await api('/checkins', { body: { client_id: id } });
      toast(r.subscription_valid ? 'success' : 'error', r.subscription_valid ? 'Entrée enregistrée — abonnement valide' : 'Entrée enregistrée — ATTENTION : aucun abonnement valide');
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e: any) { toast('error', e.message); }
  };
  return (
    <>
      <Modal open={!!id} onClose={onClose} title={c ? `${c.last_name} ${c.first_name}` : 'Client'} size="lg">
        {isLoading || !c ? <div className="grid place-items-center py-10"><Spinner /></div> : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand" className="font-mono">{c.matricule}</Badge><Badge>{c.category_name}</Badge><Badge tone={c.status === 'active' ? 'green' : 'zinc'}>{c.status}</Badge>
              {c.archived_at && <Badge tone="red">Archivé</Badge>}
              {c.balance_due > 0 && <Badge tone="red">Reste dû : {money(c.balance_due)}</Badge>}
              <div className="ms-auto flex flex-wrap gap-1.5">
                {can('clients:write') && <Button size="sm" onClick={checkin}><DoorOpen className="h-4 w-4" />Entrée</Button>}
                {can('subscriptions:write') && <Button size="sm" variant="outline" onClick={() => setNewSub(true)}><Plus className="h-4 w-4" />Abonnement</Button>}
                {can('clients:write') && <Button size="sm" variant="outline" onClick={() => onEdit(c)}><Pencil className="h-4 w-4" />Modifier</Button>}
                <Button size="sm" variant="outline" onClick={() => clientSheetPDF(c)}><Printer className="h-4 w-4" />Fiche</Button>
              </div>
            </div>
            <Tabs value={tab} onChange={setTab} items={[{ value: 'info', label: 'Informations' }, { value: 'subs', label: `Abonnements (${subs.data?.total ?? 0})` }, ...(can('audit:read') ? [{ value: 'history' as const, label: 'Historique' }] : [])]} />
            {tab === 'info' && (
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                {[['Né(e) le', `${fmtDate(c.birth_date)} (${c.age ?? '—'} ans)`], ['Sexe', c.gender], ['Téléphone', c.phone], ['Email', c.email], ['Adresse', c.address], ['Inscrit le', fmtDate(c.registration_date)], ['Abonnement actuel', c.current_plan ? `${c.current_plan} → ${fmtDate(c.current_end_date)}` : 'Aucun'], ['Parent / tuteur', c.guardian_name ? `${c.guardian_name} (${c.guardian_relationship ?? ''})` : null], ['Tél. parent', c.guardian_phone], ['Contact urgence', c.guardian_emergency], ['Remarques', c.notes]].filter(([, v]) => v).map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5"><div className="text-xs text-zinc-500">{l}</div><div className="font-semibold">{v}</div></div>
                ))}
              </div>
            )}
            {tab === 'subs' && (
              <div className="space-y-2">
                {(subs.data?.data ?? []).map((s: any) => (
                  <button key={s.id} onClick={() => setSubId(s.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-3 text-start text-sm hover:border-brand dark:border-white/10">
                    <span className="font-mono text-xs">{s.reference}</span><b>{s.plan_name}</b><span className="text-zinc-500">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</span>
                    <span className="ms-auto flex gap-1"><VB v={s.validity} /><PB v={s.payment_status} /></span><b>{money(s.final_price)}</b>
                  </button>
                ))}
                {subs.data?.data?.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Aucun abonnement.</p>}
              </div>
            )}
            {tab === 'history' && (
              <ul className="space-y-1 text-xs">
                {(hist.data?.data ?? []).map((h: any) => <li key={h.id} className="flex gap-3 border-b border-zinc-100 py-1.5 dark:border-white/5"><History className="h-3.5 w-3.5 text-zinc-400" /><span className="text-zinc-500">{fmtDateTime(h.created_at)}</span><b>{h.action}</b><span className="flex-1 truncate text-zinc-500">{h.details}</span><span>{h.user_name}</span></li>)}
              </ul>
            )}
          </div>
        )}
      </Modal>
      {c && <NewSubscriptionModal open={newSub} onClose={() => setNewSub(false)} clientId={c.id} />}
      <SubscriptionDetail id={subId} onClose={() => setSubId(null)} />
    </>
  );
}

function ImportClients({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useUI();
  const qc = useQueryClient();
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
  const norm = (r: any) => ({
    last_name: r.nom ?? r.last_name ?? '', first_name: r['prénom'] ?? r.prenom ?? r.first_name ?? '', phone: String(r['téléphone'] ?? r.telephone ?? r.phone ?? ''),
    birth_date: r['date de naissance'] ?? r.naissance ?? r.birth_date ?? '', gender: (r.sexe ?? r.gender ?? '').toString().toUpperCase().slice(0, 1) || null, email: r.email ?? '',
    address: r.adresse ?? r.address ?? '', guardian_name: r.tuteur ?? r.parent ?? '', guardian_phone: String(r['tél tuteur'] ?? r.tel_tuteur ?? r.parent_phone ?? ''),
  });
  const validate = (r: any) => [!r.last_name && 'nom manquant', !r.first_name && 'prénom manquant', String(r.phone).replace(/\D/g, '').length < 8 && 'téléphone invalide', r.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.birth_date) && 'date (AAAA-MM-JJ)'].filter(Boolean) as string[];
  const run = async () => {
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (const [i, r] of rows.entries()) {
      if (validate(r).length) { errors.push(`Ligne ${i + 2} ignorée : ${validate(r).join(', ')}`); continue; }
      try {
        await api('/clients', { body: { first_name: r.first_name, last_name: r.last_name, phone: r.phone, birth_date: r.birth_date || null, gender: r.gender === 'M' || r.gender === 'F' ? r.gender : null, email: r.email || null, address: r.address || null, guardian: r.guardian_name ? { full_name: r.guardian_name, phone: r.guardian_phone || r.phone } : null } });
        ok++;
      } catch (e: any) { errors.push(`Ligne ${i + 2} : ${e.message}`); }
    }
    setResult({ ok, errors });
    setBusy(false);
    qc.invalidateQueries({ queryKey: ['clients'] });
    toast('success', `${ok} client(s) importé(s)`);
  };
  return (
    <Modal open={open} onClose={() => { setRows([]); setResult(null); onClose(); }} title="Importer des clients (Excel)" size="xl"
      footer={rows.length > 0 && !result && <Button loading={busy} onClick={run}>Importer {rows.filter((r) => !validate(r).length).length} client(s) valides</Button>}>
      <p className="mb-3 text-sm text-zinc-500">Colonnes attendues (1re ligne) : <code>nom, prénom, téléphone, date de naissance, sexe, email, adresse, tuteur, tél tuteur</code>. Les doublons sont refusés automatiquement.</p>
      <Input type="file" accept=".xlsx" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { try { setRows((await readExcel(file)).map(norm)); setResult(null); } catch (err: any) { toast('error', 'Fichier illisible : ' + err.message); } } }} />
      {result && <Card className="mt-4"><b>{result.ok} importé(s)</b>{result.errors.length > 0 && <ul className="mt-2 max-h-40 overflow-auto text-xs text-red-500">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>}</Card>}
      {rows.length > 0 && !result && (
        <div className="mt-4 max-h-[50vh] overflow-auto rounded-xl border border-zinc-200 dark:border-white/10">
          <table className="w-full text-xs"><thead className="sticky top-0 bg-zinc-100 dark:bg-anthracite"><tr>{['#', 'Nom', 'Prénom', 'Téléphone', 'Naissance', 'Tuteur', 'Validation'].map((h) => <th key={h} className="px-2 py-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => { const errs = validate(r); return <tr key={i} className={errs.length ? 'bg-red-50 dark:bg-red-500/10' : ''}><td className="px-2 py-1">{i + 2}</td><td className="px-2">{r.last_name}</td><td className="px-2">{r.first_name}</td><td className="px-2">{r.phone}</td><td className="px-2">{r.birth_date}</td><td className="px-2">{r.guardian_name}</td><td className="px-2">{errs.length ? <span className="text-red-500">{errs.join(', ')}</span> : <Badge tone="green">OK</Badge>}</td></tr>; })}</tbody></table>
        </div>
      )}
    </Modal>
  );
}

export default function ClientsPage() {
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat') ?? '';
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('');
  const [status, setStatus] = useState('');
  const [validity, setValidity] = useState('');
  const [activity, setActivity] = useState('');
  const [archived, setArchived] = useState(false);
  const [form, setForm] = useState<{ open: boolean; client?: any }>({ open: false });
  const [detail, setDetail] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const acts = useOptions('/activities', (a) => a.name);
  useEffect(() => setPage(1), [cat, search, status, validity, activity, archived]);
  const query = { page, pageSize: 25, search, sort, category: cat, status, validity, activity, archived: archived ? '1' : undefined };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['clients', query], queryFn: () => api('/clients', { query }) });
  const act = async (c: any, kind: 'archive' | 'restore' | 'delete') => {
    if (!(await confirm({ title: kind === 'delete' ? 'Supprimer ce client ?' : kind === 'archive' ? 'Archiver ce client ?' : 'Restaurer ce client ?', danger: kind === 'delete', text: kind === 'delete' ? 'Impossible si le client a un historique financier (utilisez l’archivage).' : undefined }))) return;
    try {
      if (kind === 'delete') await api(`/clients/${c.id}`, { method: 'DELETE' });
      else await api(`/clients/${c.id}/archive${kind === 'restore' ? '?restore=1' : ''}`, { body: {} });
      toast('success', 'Opération effectuée');
      qc.invalidateQueries({ queryKey: ['clients'] });
    } catch (e: any) { toast('error', e.message); }
  };
  const title = cat ? `Clients — ${catTitle[cat]}` : 'Clients';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">{title}</h1>
        <div className="flex gap-2">
          {can('clients:write') && <Button variant="outline" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importer</Button>}
          {can('clients:write') && <Button onClick={() => setForm({ open: true })}><Plus className="h-4 w-4" />Inscrire un client</Button>}
        </div>
      </div>
      <Tabs value={cat} onChange={(v) => setParams(v ? { cat: v } : {})} items={[{ value: '', label: 'Tous' }, { value: 'adult', label: 'Adultes' }, { value: 'junior', label: 'Juniors' }, { value: 'child', label: 'Enfants' }, { value: 'senior', label: 'Seniors' }]} />
      <DataTable
        title={title} rows={data?.data ?? []} total={data?.total} page={page} onPage={setPage} search={search} onSearch={setSearch} sort={sort} onSort={setSort}
        loading={isLoading} error={error} onRetry={refetch} searchPlaceholder="Matricule, nom ou téléphone…"
        fetchAll={async () => (await api('/clients', { query: { ...query, page: 1, pageSize: 500 } })).data}
        onRowClick={(r) => setDetail(r.id)}
        toolbar={<>
          <Select value={validity} onChange={(e) => setValidity(e.target.value)} className="h-9 w-auto"><option value="">Abonnement</option><option value="valid">Valide</option><option value="expired">Expiré / aucun</option><option value="unpaid">Avec impayé</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-auto"><option value="">Statut</option><option value="active">Actif</option><option value="inactive">Inactif</option><option value="suspended">Suspendu</option></Select>
          <Select value={activity} onChange={(e) => setActivity(e.target.value)} className="h-9 w-auto"><option value="">Activité</option>{acts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm text-zinc-500"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-brand" />Archivés</label>
        </>}
        columns={[
          { key: 'matricule', label: 'Matricule', sortKey: 't.matricule', className: 'font-mono text-xs' },
          { key: 'name', label: 'Nom', sortKey: 't.last_name', render: (r) => <div><div className="font-semibold">{r.last_name} {r.first_name}</div>{r.guardian_name && <div className="text-xs text-zinc-500">Tuteur : {r.guardian_name}</div>}</div>, exportValue: (r) => `${r.last_name} ${r.first_name}` },
          { key: 'age', label: 'Âge', sortKey: 't.birth_date', render: (r) => r.age ?? '—', hideOnMobile: true },
          { key: 'category_name', label: 'Catégorie', render: (r) => <Badge>{r.category_name ?? '—'}</Badge>, exportValue: (r) => r.category_name },
          { key: 'phone', label: 'Téléphone', hideOnMobile: true },
          { key: 'current_plan', label: 'Abonnement', sortKey: 'current_end_date', render: (r) => r.current_plan ? <div>{r.current_plan}<div className={`text-xs ${r.current_end_date < new Date().toISOString().slice(0, 10) ? 'text-red-500' : 'text-zinc-500'}`}>→ {fmtDate(r.current_end_date)}</div></div> : <span className="text-zinc-400">Aucun</span>, exportValue: (r) => r.current_plan ? `${r.current_plan} (→ ${r.current_end_date})` : '' },
          { key: 'balance_due', label: 'Reste dû', money: true, sortKey: 'balance_due' },
          { key: 'registration_date', label: 'Inscrit le', sortKey: 't.registration_date', render: (r) => fmtDate(r.registration_date), hideOnMobile: true },
        ]}
        actions={(r) => <>
          <Button size="icon" variant="ghost" onClick={() => setDetail(r.id)} title="Voir"><Eye className="h-4 w-4" /></Button>
          {can('clients:write') && <Button size="icon" variant="ghost" onClick={() => setForm({ open: true, client: r })} title="Modifier"><Pencil className="h-4 w-4" /></Button>}
          {can('clients:delete') && (r.archived_at ? <Button size="icon" variant="ghost" onClick={() => act(r, 'restore')}><ArchiveRestore className="h-4 w-4" /></Button> : <Button size="icon" variant="ghost" onClick={() => act(r, 'archive')} title="Archiver"><Archive className="h-4 w-4" /></Button>)}
          {can('clients:delete') && <Button size="icon" variant="ghost" onClick={() => act(r, 'delete')} title="Supprimer"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
        </>}
      />
      <ClientForm open={form.open} client={form.client} onClose={() => setForm({ open: false })} />
      <ClientDetail id={detail} onClose={() => setDetail(null)} onEdit={(c) => setForm({ open: true, client: c })} />
      <ImportClients open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
