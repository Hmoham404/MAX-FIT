import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, FileSpreadsheet, FileText, MessageCircle, Play, Upload, Wrench } from 'lucide-react';
import { api, API_URL, session } from '@/lib/api';
import { fmtDate, fmtDateTime, money, todayISO, waLink } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, Select, Spinner, Stat, Tabs, useUI, type Tone } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { exportExcel, tablePDF } from '@/lib/docs';
import { useAuth } from '../auth';
import { Resource } from '../Resource';

const durUnits = [{ value: 'session', label: 'Séance' }, { value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }];

export function PlansPage() {
  const [tab, setTab] = useState<'plans' | 'promos' | 'cats'>('plans');
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'plans', label: 'Formules & tarifs' }, { value: 'promos', label: 'Promotions' }, { value: 'cats', label: 'Catégories d’âge' }]} />
      {tab === 'plans' && <Resource title="Formules & tarifs" endpoint="/plans" module="plans" archive
        header={<p className="text-sm text-zinc-500">Les tarifs publiés apparaissent immédiatement sur la page Tarifs du site public.</p>}
        filters={[{ name: 'category_id', label: 'Catégorie', relation: { endpoint: '/categories', label: (r) => r.name } }]}
        columns={[
          { key: 'category_name', label: 'Catégorie', render: (r) => <Badge>{r.category_name}</Badge>, exportValue: (r) => r.category_name }, { key: 'name', label: 'Formule', render: (r) => <b>{r.name}</b>, exportValue: (r) => r.name },
          { key: 'duration', label: 'Durée', render: (r) => `${r.duration_value} ${durUnits.find((d) => d.value === r.duration_unit)?.label}`, exportValue: (r) => `${r.duration_value} ${r.duration_unit}` },
          { key: 'price', label: 'Prix', money: true }, { key: 'registration_fee', label: 'Frais inscription', money: true },
          { key: 'is_published', label: 'Site', render: (r) => r.is_published ? <Badge tone="green">Publié</Badge> : <Badge>Masqué</Badge> }, { key: 'is_featured', label: 'Mis en avant', render: (r) => r.is_featured ? '★' : '' },
        ]}
        fields={[
          { name: 'name', label: 'Nom (FR)', required: true }, { name: 'name_en', label: 'Nom (EN)' }, { name: 'name_ar', label: 'Nom (AR)' },
          { name: 'category_id', label: 'Catégorie', type: 'relation', relation: { endpoint: '/categories', label: (r) => r.name }, required: true },
          { name: 'duration_unit', label: 'Unité', type: 'select', options: durUnits, required: true }, { name: 'duration_value', label: 'Durée', type: 'number', required: true },
          { name: 'price', label: 'Prix', type: 'money', required: true }, { name: 'registration_fee', label: 'Frais d’inscription', type: 'money' },
          { name: 'activities', label: 'Activités autorisées (vide = toutes)', type: 'multirelation', relation: { endpoint: '/activities', label: (r) => r.name }, span: 3 },
          { name: 'benefits', label: 'Avantages (séparés par •)', type: 'textarea', span: 2 }, { name: 'conditions', label: 'Conditions', type: 'textarea' },
          { name: 'is_published', label: 'Publié sur le site', type: 'bool' }, { name: 'is_featured', label: 'Mis en avant', type: 'bool' }, { name: 'sort_order', label: 'Ordre', type: 'number' },
        ]} defaults={{ duration_unit: 'month', duration_value: 1, is_published: true }} />}
      {tab === 'promos' && <Resource title="Promotions" endpoint="/promotions" module="plans" archive
        columns={[{ key: 'title', label: 'Titre' }, { key: 'plan_name', label: 'Formule', render: (r) => r.plan_name ?? 'Toutes' }, { key: 'discount', label: 'Réduction', render: (r) => r.discount_type === 'percent' ? `${r.discount_value} %` : money(r.discount_value) }, { key: 'start_date', label: 'Du', render: (r) => fmtDate(r.start_date) }, { key: 'end_date', label: 'Au', render: (r) => fmtDate(r.end_date) }, { key: 'is_published', label: 'Site', render: (r) => r.is_published ? <Badge tone="green">Publiée</Badge> : <Badge>Masquée</Badge> }]}
        fields={[{ name: 'title', label: 'Titre', required: true, span: 2 }, { name: 'plan_id', label: 'Formule concernée', type: 'relation', relation: { endpoint: '/plans', label: (r) => `${r.category_name} — ${r.name}` } }, { name: 'discount_type', label: 'Type', type: 'select', options: [{ value: 'percent', label: 'Pourcentage' }, { value: 'amount', label: 'Montant (millimes)' }], required: true }, { name: 'discount_value', label: 'Valeur (% ou millimes)', type: 'number', required: true }, { name: 'start_date', label: 'Début', type: 'date' }, { name: 'end_date', label: 'Fin', type: 'date' }, { name: 'is_published', label: 'Publiée', type: 'bool' }, { name: 'description', label: 'Description', type: 'textarea', span: 3 }]}
        defaults={{ discount_type: 'percent', is_published: true }} />}
      {tab === 'cats' && <Resource title="Catégories d’âge" endpoint="/categories" module="plans" deletable
        columns={[{ key: 'code', label: 'Code', className: 'font-mono text-xs' }, { key: 'name', label: 'Nom' }, { key: 'min_age', label: 'Âge min' }, { key: 'max_age', label: 'Âge max' }, { key: 'is_minor', label: 'Mineur', render: (r) => r.is_minor ? 'Oui' : 'Non' }]}
        fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Nom', required: true }, { name: 'min_age', label: 'Âge min', type: 'number' }, { name: 'max_age', label: 'Âge max', type: 'number' }, { name: 'is_minor', label: 'Mineur (tuteur obligatoire)', type: 'bool' }, { name: 'sort_order', label: 'Ordre', type: 'number' }]} />}
    </div>
  );
}

export function ActivitiesAdminPage() {
  return <Resource title="Activités" endpoint="/activities" module="activities" archive
    header={<p className="text-sm text-zinc-500">Les activités publiées apparaissent sur le site (accueil, activités, planning).</p>}
    columns={[
      { key: 'image', label: '', render: (r) => r.image_url ? <img src={r.image_url} className="h-10 w-14 rounded-lg object-cover" alt="" /> : null, exportValue: () => '' },
      { key: 'name', label: 'Nom', render: (r) => <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: r.color }} /><b>{r.name}</b></span>, exportValue: (r) => r.name },
      { key: 'category', label: 'Catégorie' }, { key: 'description', label: 'Description', render: (r) => <span className="line-clamp-1 max-w-sm">{r.description}</span> },
      { key: 'is_published', label: 'Site', render: (r) => r.is_published ? <Badge tone="green">Publiée</Badge> : <Badge>Brouillon</Badge> },
    ]}
    fields={[
      { name: 'name', label: 'Nom (FR)', required: true }, { name: 'name_en', label: 'Nom (EN)' }, { name: 'name_ar', label: 'Nom (AR)' }, { name: 'category', label: 'Catégorie' }, { name: 'color', label: 'Couleur', type: 'color' }, { name: 'sort_order', label: 'Ordre', type: 'number' },
      { name: 'image_url', label: 'Image illustrative (URL)', type: 'image', span: 3 }, { name: 'description', label: 'Description (FR)', type: 'textarea', span: 3 }, { name: 'description_en', label: 'Description (EN)', type: 'textarea' }, { name: 'description_ar', label: 'Description (AR)', type: 'textarea' },
      { name: 'is_published', label: 'Publiée', type: 'bool' },
    ]} defaults={{ is_published: true, color: '#D3010C' }} />;
}

export function SuppliersPage() {
  const [tab, setTab] = useState<'list' | 'purchases'>('list');
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'list', label: 'Fournisseurs' }, { value: 'purchases', label: 'Achats & factures fournisseurs' }]} />
      {tab === 'list' ? <Resource title="Fournisseurs" endpoint="/suppliers" module="suppliers" archive
        columns={[{ key: 'company_name', label: 'Raison sociale', render: (r) => <b>{r.company_name}</b>, exportValue: (r) => r.company_name }, { key: 'contact_name', label: 'Contact' }, { key: 'phone', label: 'Téléphone' }, { key: 'email', label: 'Email', hideOnMobile: true }, { key: 'tax_id', label: 'Matricule fiscal', hideOnMobile: true }, { key: 'supply_type', label: 'Produits / services' }, { key: 'total_purchases', label: 'Achats', money: true }, { key: 'debt', label: 'Dette', money: true }]}
        fields={[{ name: 'company_name', label: 'Raison sociale', required: true, span: 2 }, { name: 'contact_name', label: 'Contact' }, { name: 'phone', label: 'Téléphone' }, { name: 'email', label: 'Email' }, { name: 'tax_id', label: 'Matricule fiscal' }, { name: 'address', label: 'Adresse', span: 2 }, { name: 'supply_type', label: 'Type de produits / services' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 3 }]} />
        : <Resource title="Achats fournisseurs" endpoint="/purchases" module="suppliers" deletable
          filters={[{ name: 'supplier_id', label: 'Fournisseur', relation: { endpoint: '/suppliers', label: (r) => r.company_name } }]}
          columns={[{ key: 'purchase_date', label: 'Date', render: (r) => fmtDate(r.purchase_date) }, { key: 'supplier_name', label: 'Fournisseur' }, { key: 'invoice_number', label: 'N° facture' }, { key: 'label', label: 'Libellé' }, { key: 'amount', label: 'Montant', money: true }, { key: 'amount_paid', label: 'Payé', money: true }, { key: 'rest', label: 'Reste', render: (r) => <b className={r.amount - r.amount_paid > 0 ? 'text-red-500' : ''}>{money(r.amount - r.amount_paid)}</b>, exportValue: (r) => (r.amount - r.amount_paid) / 1000 }]}
          fields={[{ name: 'supplier_id', label: 'Fournisseur', type: 'relation', relation: { endpoint: '/suppliers', label: (r) => r.company_name }, required: true }, { name: 'invoice_number', label: 'N° facture fournisseur' }, { name: 'purchase_date', label: 'Date', type: 'date', required: true }, { name: 'label', label: 'Libellé', required: true, span: 2 }, { name: 'amount', label: 'Montant', type: 'money', required: true }, { name: 'amount_paid', label: 'Montant payé', type: 'money' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }]}
          defaults={{ purchase_date: todayISO() }} />}
    </div>
  );
}

const condTone: Record<string, [string, Tone]> = { available: ['Disponible', 'green'], broken: ['En panne', 'red'], maintenance: ['En maintenance', 'amber'], retired: ['Réformé', 'zinc'] };
export function EquipmentPage() {
  const { data } = useQuery({ queryKey: ['/equipment', 'stats'], queryFn: () => api('/equipment', { query: { pageSize: 500 } }) });
  const rows: any[] = data?.data ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Équipements" value={rows.length} icon={<Wrench className="h-5 w-5" />} />
        <Stat label="Disponibles" value={rows.filter((r) => r.condition === 'available').length} tone="green" />
        <Stat label="En panne" value={rows.filter((r) => r.condition === 'broken').length} tone="red" />
        <Stat label="En maintenance" value={rows.filter((r) => r.condition === 'maintenance').length} tone="amber" />
      </div>
      <Resource title="Équipements" endpoint="/equipment" module="equipment" archive
        filters={[{ name: 'condition', label: 'État', options: Object.entries(condTone).map(([value, [label]]) => ({ value, label })) }]}
        columns={[{ key: 'code', label: 'Code', sortKey: 't.code', className: 'font-mono text-xs' }, { key: 'name', label: 'Désignation', render: (r) => <b>{r.name}</b>, exportValue: (r) => r.name }, { key: 'brand', label: 'Marque' }, { key: 'model', label: 'Modèle', hideOnMobile: true }, { key: 'location', label: 'Emplacement' }, { key: 'condition', label: 'État', render: (r) => <Badge tone={condTone[r.condition][1]}>{condTone[r.condition][0]}</Badge>, exportValue: (r) => condTone[r.condition][0] }, { key: 'last_maintenance', label: 'Dernière maint.', render: (r) => fmtDate(r.last_maintenance), hideOnMobile: true }, { key: 'next_maintenance', label: 'Prochaine maint.', sortKey: 't.next_maintenance', render: (r) => <span className={r.next_maintenance && r.next_maintenance <= todayISO() ? 'font-bold text-red-500' : ''}>{fmtDate(r.next_maintenance)}</span> }, { key: 'purchase_price', label: 'Prix achat', money: true, hideOnMobile: true }]}
        fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Désignation', required: true, span: 2 }, { name: 'brand', label: 'Marque' }, { name: 'model', label: 'Modèle' }, { name: 'serial_number', label: 'N° de série' }, { name: 'purchase_date', label: 'Date d’achat', type: 'date' }, { name: 'supplier_id', label: 'Fournisseur', type: 'relation', relation: { endpoint: '/suppliers', label: (r) => r.company_name } }, { name: 'purchase_price', label: 'Prix d’achat', type: 'money' }, { name: 'location', label: 'Emplacement' }, { name: 'condition', label: 'État', type: 'select', options: Object.entries(condTone).map(([value, [label]]) => ({ value, label })) }, { name: 'last_maintenance', label: 'Dernière maintenance', type: 'date' }, { name: 'next_maintenance', label: 'Prochaine maintenance', type: 'date' }]}
        defaults={{ condition: 'available' }} />
    </div>
  );
}

const mKinds = [{ value: 'preventive', label: 'Préventive' }, { value: 'corrective', label: 'Corrective' }, { value: 'cleaning', label: 'Nettoyage' }, { value: 'inspection', label: 'Inspection' }, { value: 'repair', label: 'Réparation' }];
export function MaintenancePage() {
  return <Resource title="Maintenance" endpoint="/maintenance" module="maintenance" deletable
    header={<p className="text-sm text-zinc-500">Passer une intervention à « Réalisée » met à jour la date de dernière maintenance et remet l’équipement en service.</p>}
    filters={[{ name: 'status', label: 'Statut', options: [{ value: 'planned', label: 'Planifiée' }, { value: 'done', label: 'Réalisée' }, { value: 'cancelled', label: 'Annulée' }] }, { name: 'kind', label: 'Type', options: mKinds }]}
    columns={[{ key: 'planned_date', label: 'Prévue', render: (r) => <span className={r.status === 'planned' && r.planned_date <= todayISO() ? 'font-bold text-red-500' : ''}>{fmtDate(r.planned_date)}</span> }, { key: 'equipment', label: 'Équipement', render: (r) => `${r.equipment_code} — ${r.equipment_name}`, exportValue: (r) => `${r.equipment_code} ${r.equipment_name}` }, { key: 'kind', label: 'Type', render: (r) => mKinds.find((k) => k.value === r.kind)?.label }, { key: 'technician', label: 'Technicien' }, { key: 'done_date', label: 'Réalisée le', render: (r) => fmtDate(r.done_date) }, { key: 'cost', label: 'Coût', money: true }, { key: 'status', label: 'Statut', render: (r) => <Badge tone={r.status === 'done' ? 'green' : r.status === 'planned' ? 'amber' : 'zinc'}>{r.status}</Badge> }]}
    fields={[{ name: 'equipment_id', label: 'Équipement', type: 'relation', relation: { endpoint: '/equipment', label: (r) => `${r.code} — ${r.name}` }, required: true }, { name: 'kind', label: 'Type', type: 'select', options: mKinds, required: true }, { name: 'planned_date', label: 'Date prévue', type: 'date', required: true }, { name: 'status', label: 'Statut', type: 'select', options: [{ value: 'planned', label: 'Planifiée' }, { value: 'done', label: 'Réalisée' }, { value: 'cancelled', label: 'Annulée' }] }, { name: 'done_date', label: 'Date de réalisation', type: 'date' }, { name: 'technician', label: 'Technicien' }, { name: 'cost', label: 'Coût', type: 'money' }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }]}
    defaults={{ status: 'planned', kind: 'preventive', planned_date: todayISO() }} />;
}

export function DocumentsPage() {
  const { toast } = useUI();
  const qc = useQueryClient();
  const { can } = useAuth();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File, title: string) => {
    setBusy(true);
    const fd = new FormData(); fd.append('file', file); fd.append('kind', 'document'); fd.append('title', title || file.name);
    try { await api('/settings/media/upload', { form: fd }); toast('success', 'Document ajouté'); qc.invalidateQueries({ queryKey: ['/media'] }); } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };
  const openDoc = async (id: number) => {
    const r = await fetch(`${API_URL}/api/media/${id}/file`, { headers: { Authorization: `Bearer ${session.get()}` } });
    if (!r.ok) return toast('error', 'Accès refusé');
    window.open(URL.createObjectURL(await r.blob()), '_blank');
  };
  return (
    <div className="space-y-4">
      {can('website:write') && <Card className="flex flex-wrap items-end gap-3"><Field label="Ajouter un document (PDF / image ≤ 1,5 Mo) — stockage privé"><Input type="file" accept=".pdf,image/*" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, f.name); e.target.value = ''; }} /></Field>{busy && <Spinner />}</Card>}
      <Resource title="Documents" endpoint="/media" module="website" deletable creatable={false} query={{ kind: 'document' }}
        columns={[{ key: 'title', label: 'Titre' }, { key: 'mime', label: 'Type' }, { key: 'created_at', label: 'Ajouté le', render: (r) => fmtDateTime(r.created_at) }]}
        fields={[{ name: 'title', label: 'Titre' }, { name: 'category', label: 'Catégorie' }]}
        rowActions={(r) => <Button size="sm" variant="outline" onClick={() => openDoc(r.id)}>Ouvrir</Button>} />
    </div>
  );
}

export function ReportsPage() {
  const [key, setKey] = useState('');
  const [range, setRange] = useState({ from: todayISO().slice(0, 8) + '01', to: todayISO() });
  const list = useQuery({ queryKey: ['reports'], queryFn: () => api('/reports') });
  const rep = useQuery({ queryKey: ['report', key, range], queryFn: () => api(`/reports/${key}`, { query: range }), enabled: !!key });
  const rows: any[] = rep.data?.rows ?? [];
  const cols = rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k.replace(/_m$/, '').replace(/_/g, ' '), money: k.endsWith('_m') })) : [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">Rapports</h1>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(list.data ?? []).map((r: any) => <button key={r.key} onClick={() => setKey(r.key)} className={`rounded-xl border p-3 text-start text-sm font-semibold transition ${key === r.key ? 'border-brand bg-brand text-brand-fg' : 'border-zinc-200 hover:border-brand dark:border-white/10'}`}>{r.title}</button>)}
      </div>
      {key && <>
        <Card className="flex flex-wrap items-center gap-2 p-3"><span className="font-bold">{rep.data?.title}</span><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="ms-auto h-9 w-auto" /><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="h-9 w-auto" />
          <Button size="sm" variant="outline" onClick={() => exportExcel(rep.data.title, cols, rows)} disabled={!rows.length}><FileSpreadsheet className="h-4 w-4 text-emerald-600" />Excel</Button>
          <Button size="sm" variant="outline" onClick={() => tablePDF(rep.data.title, cols, rows, `${range.from} → ${range.to}`)} disabled={!rows.length}><FileText className="h-4 w-4 text-red-500" />PDF</Button></Card>
        {rep.isLoading ? <Spinner /> : <DataTable rows={rows.map((r, i) => ({ id: i, ...r }))} columns={cols} />}
        {cols.some((c) => c.money) && rows.length > 0 && <Card className="flex flex-wrap gap-4 text-sm">{cols.filter((c) => c.money).map((c) => <span key={c.key}>Total {c.label} : <b>{money(rows.reduce((a, r) => a + Number(r[c.key] || 0), 0))}</b></span>)}</Card>}
      </>}
      {!key && <Empty title="Choisissez un rapport" text="Tous les rapports sont calculés en temps réel à partir de la base de données." />}
    </div>
  );
}

const nTone: Record<string, Tone> = { expiring: 'amber', expired: 'red', unpaid: 'red', leave: 'blue', absence: 'amber', maintenance: 'violet', payroll: 'blue', cash_gap: 'red' };
export function NotificationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'center' | 'whatsapp'>('center');
  const { data, isLoading } = useQuery({ queryKey: ['notif-count'], queryFn: () => api('/notifications') });
  const exp = useQuery({ queryKey: ['subscriptions', 'wa'], queryFn: () => api('/subscriptions', { query: { validity: 'expiring', days: 7, pageSize: 200 } }), enabled: tab === 'whatsapp' });
  const exd = useQuery({ queryKey: ['subscriptions', 'wa-exp'], queryFn: () => api('/subscriptions', { query: { validity: 'expired', pageSize: 200, sort: 'end_date:desc' } }), enabled: tab === 'whatsapp' });
  const due = useQuery({ queryKey: ['subscriptions', 'wa-due'], queryFn: () => api('/subscriptions', { query: { payment: 'due', pageSize: 200 } }), enabled: tab === 'whatsapp' });
  const markAll = async () => { await api('/notifications/read', { body: {} }); qc.invalidateQueries({ queryKey: ['notif-count'] }); };
  const tpl = {
    expiring: (s: any) => `Bonjour ${s.first_name}, votre abonnement MAX FIT (${s.plan_name}) expire le ${fmtDate(s.end_date)}. Pensez à le renouveler à l’accueil. Sportivement, l’équipe MAX FIT 💪`,
    expired: (s: any) => `Bonjour ${s.first_name}, votre abonnement MAX FIT a expiré le ${fmtDate(s.end_date)}. Revenez vite nous voir ! Profitez de nos offres à l’accueil.`,
    due: (s: any) => `Bonjour ${s.first_name}, un solde de ${money(s.remaining)} reste à régler sur votre abonnement MAX FIT (${s.plan_name}). Merci de passer à l’accueil.`,
  };
  const WaList = ({ title, rows, kind }: { title: string; rows: any[]; kind: keyof typeof tpl }) => (
    <Card><h3 className="mb-3 font-bold">{title} ({rows.length})</h3>
      <div className="max-h-96 space-y-1 overflow-auto">{rows.map((s) => <div key={s.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-white/5"><span className="flex-1"><b>{s.last_name} {s.first_name}</b> <span className="text-zinc-500">· {s.plan_name} · {fmtDate(s.end_date)}{kind === 'due' ? ` · ${money(s.remaining)}` : ''}</span></span><a href={waLink(s.phone, tpl[kind](s))} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline"><MessageCircle className="h-4 w-4 text-emerald-500" />Envoyer</Button></a></div>)}{rows.length === 0 && <p className="text-sm text-zinc-500">Aucun.</p>}</div>
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-4xl uppercase tracking-wide">Notifications</h1>{tab === 'center' && <Button variant="outline" onClick={markAll}><CheckCheck className="h-4 w-4" />Tout marquer comme lu</Button>}</div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'center', label: `Centre d’alertes (${data?.unread ?? 0})` }, { value: 'whatsapp', label: 'Relances WhatsApp' }]} />
      {tab === 'center' && (isLoading ? <Spinner /> : (
        <Card className="divide-y divide-zinc-100 p-0 dark:divide-white/5">
          {(data?.data ?? []).map((n: any) => (
            <Link key={n.id} to={n.link || '#'} onClick={() => api('/notifications/read', { body: { ids: [n.id] } }).then(() => qc.invalidateQueries({ queryKey: ['notif-count'] }))} className={`flex items-start gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-white/5 ${n.read_at ? 'opacity-60' : ''}`}>
              <Bell className={`mt-0.5 h-4 w-4 ${n.read_at ? 'text-zinc-400' : 'text-brand'}`} />
              <div className="flex-1"><div className="flex items-center gap-2 font-semibold">{n.title}<Badge tone={nTone[n.kind]}>{n.kind}</Badge></div><div className="text-sm text-zinc-500">{n.body}</div></div>
              <span className="text-xs text-zinc-400">{fmtDateTime(n.created_at)}</span>
            </Link>
          ))}
          {data?.data?.length === 0 && <Empty title="Aucune notification" />}
        </Card>
      ))}
      {tab === 'whatsapp' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">Envoi manuel : chaque bouton ouvre WhatsApp avec un message pré-rempli. Aucun message n’est envoyé automatiquement.</p>
          <div className="grid gap-4 xl:grid-cols-3">
            <WaList title="Expirent sous 7 jours" rows={exp.data?.data ?? []} kind="expiring" />
            <WaList title="Abonnements expirés" rows={exd.data?.data ?? []} kind="expired" />
            <WaList title="Impayés" rows={due.data?.data ?? []} kind="due" />
          </div>
        </div>
      )}
    </div>
  );
}

export const _ops = { Play, Upload, Select };
