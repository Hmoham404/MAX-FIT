import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Calculator, Check, CheckCheck, FileDown, Lock, LogIn, LogOut, Plus, Printer, Trash2, Unlock, Wallet, X } from 'lucide-react';
import { api } from '@/lib/api';
import { addDays, fmtDate, minutesToH, money, toMillimes, todayISO } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Stat, Tabs, Textarea, useUI, type Tone } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { payslipPDF } from '@/lib/docs';
import { useAuth } from '../auth';
import { Resource, useOptions } from '../Resource';

const positions = [{ value: 'coach', label: 'Coach' }, { value: 'receptionist', label: 'Réceptionniste' }, { value: 'manager', label: 'Responsable' }, { value: 'cleaning', label: 'Agent d’entretien' }, { value: 'security', label: 'Agent de sécurité' }, { value: 'other', label: 'Autre' }];
const posLabel = Object.fromEntries(positions.map((p) => [p.value, p.label]));
const payModes = [{ value: 'monthly', label: 'Salaire mensuel fixe' }, { value: 'hourly', label: 'Paiement horaire' }, { value: 'per_session', label: 'Paiement par séance' }, { value: 'commission', label: 'Commission' }, { value: 'mixed', label: 'Mixte (fixe + séances)' }];

// ======================= STAFF =======================
export function StaffPage() {
  const sens = 'hr_sensitive:read';
  return (
    <Resource title="Personnel" endpoint="/employees" module="employees" archive
      header={<p className="text-sm text-zinc-500">Les données sensibles (CIN, salaire, CNSS, RIB, adresse) ne sont visibles que par les utilisateurs autorisés. Créer un employé « Coach » crée automatiquement sa fiche coach.</p>}
      filters={[{ name: 'position', label: 'Poste', options: positions }, { name: 'status', label: 'Statut', options: [{ value: 'active', label: 'Actif' }, { value: 'inactive', label: 'Inactif' }, { value: 'left', label: 'Sorti' }] }]}
      columns={[
        { key: 'matricule', label: 'Matricule', sortKey: 't.matricule', className: 'font-mono text-xs' },
        { key: 'name', label: 'Nom', sortKey: 't.last_name', render: (r) => <b>{r.last_name} {r.first_name}</b>, exportValue: (r) => `${r.last_name} ${r.first_name}` },
        { key: 'position', label: 'Poste', render: (r) => <Badge tone={r.position === 'coach' ? 'brand' : 'zinc'}>{posLabel[r.position]}</Badge>, exportValue: (r) => posLabel[r.position] },
        { key: 'phone', label: 'Téléphone' }, { key: 'hire_date', label: 'Embauche', sortKey: 't.hire_date', render: (r) => fmtDate(r.hire_date), hideOnMobile: true },
        { key: 'contract_type', label: 'Contrat', hideOnMobile: true }, { key: 'pay_mode', label: 'Rémunération', render: (r) => payModes.find((p) => p.value === r.pay_mode)?.label, hideOnMobile: true },
        { key: 'base_salary', label: 'Salaire base', money: true }, { key: 'status', label: 'Statut', render: (r) => <Badge tone={r.status === 'active' ? 'green' : 'zinc'}>{r.status}</Badge> },
      ]}
      fields={[
        { name: 'last_name', label: 'Nom', required: true }, { name: 'first_name', label: 'Prénom', required: true }, { name: 'position', label: 'Poste', type: 'select', options: positions, required: true },
        { name: 'phone', label: 'Téléphone', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'hire_date', label: 'Date d’embauche', type: 'date' },
        { name: 'cin', label: 'CIN', perm: sens }, { name: 'birth_date', label: 'Date de naissance', type: 'date', perm: sens }, { name: 'address', label: 'Adresse', perm: sens },
        { name: 'contract_type', label: 'Type de contrat', type: 'select', options: ['CDI', 'CDD', 'SIVP', 'Karama', 'freelance', 'other'].map((v) => ({ value: v, label: v })) },
        { name: 'cnss_number', label: 'N° CNSS', perm: sens }, { name: 'status', label: 'Statut', type: 'select', options: [{ value: 'active', label: 'Actif' }, { value: 'inactive', label: 'Inactif' }, { value: 'left', label: 'Sorti' }] },
        { name: 'pay_mode', label: 'Mode de rémunération', type: 'select', options: payModes, perm: sens }, { name: 'base_salary', label: 'Salaire de base', type: 'money', perm: sens },
        { name: 'hourly_rate', label: 'Taux horaire', type: 'money', perm: sens }, { name: 'session_rate', label: 'Tarif par séance', type: 'money', perm: sens },
        { name: 'commission_rate', label: 'Commission (%)', type: 'percent', perm: sens }, { name: 'leave_balance', label: 'Solde congés (jours)', type: 'number' },
        { name: 'work_schedule', label: 'Horaires de travail', placeholder: 'ex: 08:00-16:00' }, { name: 'bank_rib', label: 'RIB (facultatif)', perm: sens, span: 2 },
      ]}
      defaults={{ status: 'active', pay_mode: 'monthly', contract_type: 'CDI', hire_date: todayISO() }}
    />
  );
}

// ======================= COACHES =======================
export function CoachesPage() {
  return (
    <Resource title="Coachs" endpoint="/coaches" module="coaches" creatable={false} query={{ active: '1' }}
      header={<p className="text-sm text-zinc-500">Pour ajouter un coach, créez un employé avec le poste « Coach » dans Personnel. Cochez « Visible sur le site » pour l’afficher publiquement (aucune donnée RH n’est publiée).</p>}
      filters={[{ name: 'public', label: 'Visibilité', options: [{ value: '1', label: 'Visibles sur le site' }, { value: '0', label: 'Masqués' }] }]}
      columns={[
        { key: 'photo', label: '', render: (r) => r.photo_url ? <img src={r.photo_url} className="h-10 w-10 rounded-full object-cover" alt="" /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-brand font-bold text-brand-fg">{r.first_name?.[0]}</div>, exportValue: () => '' },
        { key: 'name', label: 'Coach', render: (r) => <div><b>{r.public_name || `${r.first_name} ${r.last_name}`}</b><div className="text-xs text-zinc-500">{r.matricule}</div></div>, exportValue: (r) => `${r.first_name} ${r.last_name}` },
        { key: 'specialties', label: 'Spécialités' }, { key: 'experience_years', label: 'Exp. (ans)' }, { key: 'sessions_done', label: 'Séances réalisées' },
        { key: 'worked_minutes', label: 'Heures validées', render: (r) => minutesToH(r.worked_minutes), exportValue: (r) => (r.worked_minutes / 60).toFixed(1) },
        { key: 'session_rate', label: 'Tarif / séance', money: true }, { key: 'is_public', label: 'Site', render: (r) => r.is_public ? <Badge tone="green">Visible</Badge> : <Badge>Masqué</Badge> },
      ]}
      fields={[
        { name: 'public_name', label: 'Nom public' }, { name: 'specialties', label: 'Spécialités', span: 2 }, { name: 'specialties_en', label: 'Spécialités (EN)' }, { name: 'specialties_ar', label: 'Spécialités (AR)' },
        { name: 'experience_years', label: 'Expérience (ans)', type: 'number' }, { name: 'qualifications', label: 'Qualifications', type: 'textarea' }, { name: 'certifications', label: 'Certifications', type: 'textarea' },
        { name: 'photo_url', label: 'Photo professionnelle (URL, facultatif)', type: 'image', span: 2 }, { name: 'activities', label: 'Activités encadrées', type: 'multirelation', relation: { endpoint: '/activities', label: (r) => r.name }, span: 3 },
        { name: 'bio', label: 'Description', type: 'textarea', span: 3 }, { name: 'bio_en', label: 'Description (EN)', type: 'textarea' }, { name: 'bio_ar', label: 'Description (AR)', type: 'textarea' },
        { name: 'is_public', label: 'Visible sur le site', type: 'bool' }, { name: 'sort_order', label: 'Ordre', type: 'number' },
      ]}
      transformOut={(p) => { delete p.employee_id; return p; }}
    />
  );
}

// ======================= ATTENDANCE =======================
const dayTypes: Record<string, [string, Tone]> = { work: ['Travail', 'green'], absent: ['Absence', 'red'], leave: ['Congé', 'blue'], rest: ['Repos', 'zinc'], holiday: ['Férié', 'violet'] };
export function AttendancePage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [range, setRange] = useState({ from: todayISO().slice(0, 8) + '01', to: todayISO() });
  const [emp, setEmp] = useState('');
  const [tab, setTab] = useState<'daily' | 'summary'>('daily');
  const [form, setForm] = useState<any>(null);
  const emps = useOptions('/employees', (e) => `${e.last_name} ${e.first_name}`);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['attendance', range, emp], queryFn: () => api('/attendance', { query: { ...range, employee_id: emp } }) });
  const save = async () => {
    try {
      await api('/attendance', { body: { ...form, employee_id: Number(form.employee_id), break_minutes: Number(form.break_minutes || 0), sessions_count: Number(form.sessions_count || 0), check_in: form.check_in || null, check_out: form.check_out || null, expected_start: form.expected_start || null, expected_end: form.expected_end || null, correction_reason: form.correction_reason || null } });
      toast('success', 'Pointage enregistré'); setForm(null); qc.invalidateQueries({ queryKey: ['attendance'] });
    } catch (e: any) { toast('error', e.message); }
  };
  const validateAll = async () => {
    if (!(await confirm({ title: 'Valider les pointages ?', text: `Tous les pointages du ${fmtDate(range.from)} au ${fmtDate(range.to)} seront verrouillés et utilisés pour la paie.` }))) return;
    try { await api('/attendance/validate', { body: range }); toast('success', 'Pointages validés'); refetch(); } catch (e: any) { toast('error', e.message); }
  };
  const presets = (k: string) => { const t = todayISO(); setRange(k === 'day' ? { from: t, to: t } : k === 'week' ? { from: addDays(t, -6), to: t } : { from: t.slice(0, 8) + '01', to: t }); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">Pointage</h1>
        <div className="flex gap-2">
          {can('attendance:write') && <Button variant="outline" onClick={validateAll}><CheckCheck className="h-4 w-4" />Valider la période</Button>}
          {can('attendance:write') && <Button onClick={() => setForm({ employee_id: '', work_date: todayISO(), check_in: '', check_out: '', break_minutes: 30, expected_start: '', expected_end: '', day_type: 'work', sessions_count: 0, correction_reason: '' })}><Plus className="h-4 w-4" />Saisir un pointage</Button>}
        </div>
      </div>
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" variant="outline" onClick={() => presets('day')}>Jour</Button><Button size="sm" variant="outline" onClick={() => presets('week')}>Semaine</Button><Button size="sm" variant="outline" onClick={() => presets('month')}>Mois</Button>
        <Input type="date" className="h-9 w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /><Input type="date" className="h-9 w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <Select className="h-9 w-auto" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Tous les employés</option>{emps.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</Select>
        <div className="ms-auto"><Tabs value={tab} onChange={setTab} items={[{ value: 'daily', label: 'Feuille détaillée' }, { value: 'summary', label: 'Synthèse (paie)' }]} /></div>
      </Card>
      {tab === 'daily' ? (
        <DataTable title={`Pointage ${range.from} ${range.to}`} rows={data?.data ?? []} loading={isLoading} error={error} onRetry={refetch}
          onRowClick={(r) => can('attendance:write') && !r.is_validated && setForm({ ...r })}
          columns={[
            { key: 'work_date', label: 'Date', render: (r) => fmtDate(r.work_date) }, { key: 'employee_name', label: 'Employé' },
            { key: 'day_type', label: 'Type', render: (r) => <Badge tone={dayTypes[r.day_type]?.[1]}>{dayTypes[r.day_type]?.[0]}</Badge>, exportValue: (r) => dayTypes[r.day_type]?.[0] },
            { key: 'check_in', label: 'Entrée' }, { key: 'check_out', label: 'Sortie' }, { key: 'break_minutes', label: 'Pause (min)', hideOnMobile: true },
            { key: 'worked_minutes', label: 'Effectif', render: (r) => minutesToH(r.worked_minutes), exportValue: (r) => (r.worked_minutes / 60).toFixed(2) },
            { key: 'late_minutes', label: 'Retard', render: (r) => r.late_minutes ? <span className="text-amber-600">{r.late_minutes} min</span> : '—' },
            { key: 'early_leave_minutes', label: 'Départ anticipé', render: (r) => r.early_leave_minutes ? `${r.early_leave_minutes} min` : '—', hideOnMobile: true },
            { key: 'overtime_minutes', label: 'H. sup.', render: (r) => r.overtime_minutes ? minutesToH(r.overtime_minutes) : '—' },
            { key: 'is_validated', label: 'Validé', render: (r) => r.is_validated ? <Badge tone="green"><Lock className="h-3 w-3" />Validé</Badge> : <Badge tone="amber">À valider</Badge> },
            { key: 'correction_reason', label: 'Justification', hideOnMobile: true },
          ]}
          actions={(r) => can('attendance:write') && !r.is_validated ? <Button size="icon" variant="ghost" title="Valider" onClick={async () => { await api('/attendance/validate', { body: { ids: [r.id] } }); refetch(); }}><Check className="h-4 w-4 text-emerald-500" /></Button> : null}
        />
      ) : (
        <DataTable title={`Synthèse pointage ${range.from} ${range.to}`} rows={data?.summary ?? []} loading={isLoading}
          columns={[
            { key: 'employee_name', label: 'Employé' }, { key: 'days', label: 'Jours' }, { key: 'worked', label: 'Heures', render: (r) => minutesToH(r.worked), exportValue: (r) => (r.worked / 60).toFixed(2) },
            { key: 'overtime', label: 'H. sup.', render: (r) => minutesToH(r.overtime), exportValue: (r) => (r.overtime / 60).toFixed(2) }, { key: 'late', label: 'Retards (min)' },
            { key: 'absences', label: 'Absences' }, { key: 'leaves', label: 'Congés' }, { key: 'sessions', label: 'Séances' }, { key: 'validated', label: 'Validés', render: (r) => `${r.validated}/${r.days}` },
          ]} />
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="Pointage" size="lg" footer={<Button onClick={save}>Enregistrer</Button>}>
        {form && <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Employé" required><Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}><option value="">—</option>{emps.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</Select></Field>
          <Field label="Date" required><Input type="date" value={form.work_date} onChange={(e) => setForm({ ...form, work_date: e.target.value })} /></Field>
          <Field label="Type de journée"><Select value={form.day_type} onChange={(e) => setForm({ ...form, day_type: e.target.value })}>{Object.entries(dayTypes).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          <Field label="Heure d’entrée"><Input type="time" value={form.check_in ?? ''} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></Field>
          <Field label="Heure de sortie"><Input type="time" value={form.check_out ?? ''} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></Field>
          <Field label="Pause (minutes)"><Input type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} /></Field>
          <Field label="Début prévu"><Input type="time" value={form.expected_start ?? ''} onChange={(e) => setForm({ ...form, expected_start: e.target.value })} /></Field>
          <Field label="Fin prévue"><Input type="time" value={form.expected_end ?? ''} onChange={(e) => setForm({ ...form, expected_end: e.target.value })} /></Field>
          <Field label="Séances animées"><Input type="number" value={form.sessions_count} onChange={(e) => setForm({ ...form, sessions_count: e.target.value })} /></Field>
          <Field label="Justification (correction manuelle)" className="sm:col-span-3"><Input value={form.correction_reason ?? ''} onChange={(e) => setForm({ ...form, correction_reason: e.target.value })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}

// ======================= LEAVES =======================
const leaveTypes = [{ value: 'paid', label: 'Congé payé' }, { value: 'sick', label: 'Congé maladie' }, { value: 'unpaid', label: 'Congé sans solde' }, { value: 'justified_absence', label: 'Absence justifiée' }, { value: 'unjustified_absence', label: 'Absence non justifiée' }];
const lStatus: Record<string, [string, Tone]> = { pending: ['En attente', 'amber'], approved: ['Validé', 'green'], rejected: ['Refusé', 'red'] };
export function LeavesPage() {
  const { can } = useAuth();
  const { toast } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'list' | 'calendar'>('list');
  const month = todayISO().slice(0, 7);
  const cal = useQuery({ queryKey: ['/leaves', 'cal'], queryFn: () => api('/leaves', { query: { status: 'approved', pageSize: 500, year: month.slice(0, 4) } }), enabled: tab === 'calendar' });
  const decide = async (id: number, decision: string) => { try { await api(`/leaves/${id}/decide`, { body: { decision } }); toast('success', decision === 'approved' ? 'Congé validé' : 'Congé refusé'); qc.invalidateQueries({ queryKey: ['/leaves'] }); } catch (e: any) { toast('error', e.message); } };
  const days = Array.from({ length: 35 }, (_, i) => addDays(todayISO().slice(0, 8) + '01', i)).filter((d) => d.slice(0, 7) === month);
  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab} items={[{ value: 'list', label: 'Demandes & historique' }, { value: 'calendar', label: 'Calendrier des absences' }]} />
      {tab === 'list' ? (
        <Resource title="Congés & absences" endpoint="/leaves" module="leaves" deletable
          filters={[{ name: 'status', label: 'Statut', options: Object.entries(lStatus).map(([value, [label]]) => ({ value, label })) }, { name: 'leave_type', label: 'Type', options: leaveTypes }, { name: 'employee_id', label: 'Employé', relation: { endpoint: '/employees', label: (r) => `${r.last_name} ${r.first_name}` } }, { name: 'year', label: 'Année', options: ['2025', '2026', '2027'].map((y) => ({ value: y, label: y })) }]}
          editable={(r) => r.status === 'pending'}
          columns={[
            { key: 'employee_name', label: 'Employé' }, { key: 'leave_type', label: 'Type', render: (r) => leaveTypes.find((t) => t.value === r.leave_type)?.label },
            { key: 'start_date', label: 'Du', render: (r) => fmtDate(r.start_date) }, { key: 'end_date', label: 'Au', render: (r) => fmtDate(r.end_date) }, { key: 'days', label: 'Jours' },
            { key: 'leave_balance', label: 'Solde', hideOnMobile: true }, { key: 'reason', label: 'Motif', hideOnMobile: true },
            { key: 'status', label: 'Statut', render: (r) => <Badge tone={lStatus[r.status][1]}>{lStatus[r.status][0]}</Badge> },
          ]}
          fields={[
            { name: 'employee_id', label: 'Employé', type: 'relation', relation: { endpoint: '/employees', label: (r) => `${r.last_name} ${r.first_name}` }, required: true },
            { name: 'leave_type', label: 'Type', type: 'select', options: leaveTypes, required: true }, { name: 'start_date', label: 'Du', type: 'date', required: true }, { name: 'end_date', label: 'Au', type: 'date', required: true },
            { name: 'reason', label: 'Motif / justificatif', type: 'textarea', span: 2 },
          ]}
          rowActions={(r) => can('leaves:write') && r.status === 'pending' ? <><Button size="sm" variant="secondary" onClick={() => decide(r.id, 'approved')}><Check className="h-4 w-4" />Valider</Button><Button size="icon" variant="ghost" onClick={() => decide(r.id, 'rejected')} title="Refuser"><X className="h-4 w-4 text-red-500" /></Button></> : null}
        />
      ) : (
        <Card className="overflow-x-auto">
          <h2 className="mb-3 font-bold">Absences validées — {month}</h2>
          {cal.isLoading ? <Spinner /> : (
            <table className="text-xs">
              <thead><tr><th className="sticky left-0 bg-white px-2 text-start dark:bg-anthracite">Employé</th>{days.map((d) => <th key={d} className="w-7 text-center">{d.slice(8)}</th>)}</tr></thead>
              <tbody>{[...new Map((cal.data?.data ?? []).map((l: any) => [l.employee_id, l.employee_name])).entries()].map(([id, name]) => (
                <tr key={id as number}><td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 font-semibold dark:bg-anthracite">{name as string}</td>{days.map((d) => { const l = (cal.data?.data ?? []).find((x: any) => x.employee_id === id && x.start_date <= d && x.end_date >= d); return <td key={d} className="p-0.5"><div title={l?.leave_type} className={`h-6 rounded ${l ? (l.leave_type === 'sick' ? 'bg-red-400' : l.leave_type.includes('absence') ? 'bg-amber-400' : 'bg-sky-400') : 'bg-zinc-100 dark:bg-white/5'}`} /></td>; })}</tr>
              ))}</tbody>
            </table>
          )}
          <div className="mt-3 flex gap-4 text-xs"><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-sky-400" />Congé</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-red-400" />Maladie</span><span className="flex items-center gap-1"><i className="h-3 w-3 rounded bg-amber-400" />Absence</span></div>
        </Card>
      )}
    </div>
  );
}

// ======================= PAYROLL =======================
const pStatus: Record<string, [string, Tone]> = { draft: ['Brouillon', 'amber'], validated: ['Validée (verrouillée)', 'blue'], paid: ['Payée', 'green'], closed: ['Clôturée', 'zinc'] };
const steps = ['Sélection du mois', 'Import des pointages validés', 'Calcul', 'Primes & retenues', 'Vérification', 'Validation', 'Bulletins PDF', 'Paiement', 'Clôture'];

export function PayrollPage({ initialTab = 'run' }: { initialTab?: 'run' | 'slips' | 'rules' | 'advances' }) {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [period, setPeriod] = useState(todayISO().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [rec, setRec] = useState<any>(null);
  const [item, setItem] = useState({ kind: 'earning', code: 'bonus', label: '', amount: '' });
  const periods = useQuery({ queryKey: ['payroll-periods'], queryFn: () => api('/payroll/periods') });
  const p = useQuery({ queryKey: ['payroll', period], queryFn: () => api(`/payroll/periods/${period}`) });
  const rules = useQuery({ queryKey: ['payroll-rules'], queryFn: () => api('/payroll/rules'), enabled: tab === 'rules' });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['payroll'] }); qc.invalidateQueries({ queryKey: ['payroll-periods'] }); };
  const call = async (path: string, body: any = {}, msg = 'OK') => { setBusy(true); try { const r = await api(path, { body }); toast('success', msg); refresh(); return r; } catch (e: any) { if (e.status === 412 && (await confirm({ title: 'Règles non validées', text: e.message }))) { return call(path, { ...body, acknowledge: true }, msg); } toast('error', e.message); } finally { setBusy(false); } };
  const d = p.data;
  const stepIdx = !d ? 0 : d.status === 'draft' ? 4 : d.status === 'validated' ? 6 : d.status === 'paid' ? 7 : 8;
  const curRec = rec && d?.records?.find((r: any) => r.id === rec.id);
  const [ruleForm, setRuleForm] = useState<any>(null);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">{tab === 'slips' ? 'Fiches de paie' : 'Salaires & paie'}</h1>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'run', label: 'Préparer la paie' }, { value: 'slips', label: 'Bulletins' }, { value: 'advances', label: 'Avances sur salaire' }, { value: 'rules', label: 'Règles fiscales & sociales' }]} />
      {(tab === 'run' || tab === 'slips') && (
        <>
          <Card className="flex flex-wrap items-center gap-3 p-3">
            <Field label="Mois"><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto" /></Field>
            {d && <Badge tone={pStatus[d.status][1]}>{pStatus[d.status][0]}</Badge>}
            {d && !d.rules_validated && <Badge tone="red"><AlertTriangle className="h-3 w-3" />Règles non validées par le comptable</Badge>}
            <div className="ms-auto flex flex-wrap gap-2">
              {tab === 'run' && can('payroll:write') && (!d || d.status === 'draft') && <Button loading={busy} onClick={() => call('/payroll/periods', { period }, 'Paie calculée à partir des pointages validés')}><Calculator className="h-4 w-4" />{d ? 'Recalculer' : 'Préparer la paie'}</Button>}
              {tab === 'run' && can('payroll:write') && d?.status === 'draft' && <Button variant="secondary" loading={busy} onClick={async () => (await confirm({ title: 'Valider la paie ?', text: 'La paie sera verrouillée. Toute correction ultérieure sera historisée.' })) && call(`/payroll/periods/${period}/validate`, {}, 'Paie validée et verrouillée')}><Lock className="h-4 w-4" />Valider</Button>}
              {tab === 'run' && can('payroll:write') && d?.status === 'validated' && <Button variant="secondary" loading={busy} onClick={async () => { const m = await confirm({ title: 'Enregistrer le paiement des salaires ?', text: 'Une dépense « Salaires » est créée par salarié.', input: 'Mode (cash / transfer / cheque)' }); if (m) call(`/payroll/periods/${period}/pay`, { method: ['cash', 'transfer', 'cheque'].includes(m) ? m : 'transfer' }, 'Paiement des salaires enregistré'); }}><Wallet className="h-4 w-4" />Payer</Button>}
              {tab === 'run' && can('settings:write') && d?.status === 'validated' && <Button variant="outline" onClick={async () => { const r = await confirm({ title: 'Rouvrir la paie (correction) ?', input: 'Motif de la correction' }); if (r) call(`/payroll/periods/${period}/reopen`, { reason: r }, 'Paie rouverte (correction historisée)'); }}><Unlock className="h-4 w-4" />Corriger</Button>}
              {tab === 'run' && can('payroll:write') && d?.status === 'paid' && <Button variant="outline" onClick={() => call(`/payroll/periods/${period}/close`, {}, 'Période clôturée')}><Lock className="h-4 w-4" />Clôturer</Button>}
              {d?.records?.length > 0 && <Button variant="outline" onClick={() => payslipPDF(d, d.records)}><FileDown className="h-4 w-4" />Tous les bulletins</Button>}
            </div>
          </Card>
          {tab === 'run' && <div className="flex flex-wrap gap-1.5">{steps.map((s, i) => <span key={s} className={`rounded-full px-3 py-1 text-xs font-semibold ${i <= stepIdx ? 'bg-brand text-brand-fg' : 'bg-zinc-100 text-zinc-500 dark:bg-white/5'}`}>{i + 1}. {s}</span>)}</div>}
          {d?.records && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Salariés" value={d.records.length} /><Stat label="Masse brute" value={money(d.records.reduce((a: number, r: any) => a + r.gross, 0))} tone="blue" />
              <Stat label="Retenues" value={money(d.records.reduce((a: number, r: any) => a + r.social_contrib + r.irpp + r.other_deductions, 0))} tone="red" /><Stat label="Net à payer" value={money(d.records.reduce((a: number, r: any) => a + r.net_to_pay, 0))} tone="brand" />
            </div>
          )}
          <DataTable title={`Paie ${period}`} rows={d?.records ?? []} loading={p.isLoading} onRowClick={(r) => setRec(r)}
            columns={[
              { key: 'number', label: 'N°', className: 'font-mono text-xs' }, { key: 'name', label: 'Salarié', render: (r) => <b>{r.last_name} {r.first_name}</b>, exportValue: (r) => `${r.last_name} ${r.first_name}` },
              { key: 'pay_mode', label: 'Mode', render: (r) => payModes.find((m) => m.value === r.pay_mode)?.label, hideOnMobile: true },
              { key: 'worked_minutes', label: 'Heures', render: (r) => minutesToH(r.worked_minutes), hideOnMobile: true }, { key: 'sessions_count', label: 'Séances', hideOnMobile: true },
              { key: 'gross', label: 'Brut', money: true }, { key: 'social_contrib', label: 'CNSS', money: true, hideOnMobile: true }, { key: 'irpp', label: 'IRPP/CSS', money: true, hideOnMobile: true },
              { key: 'advances', label: 'Avances', money: true, hideOnMobile: true }, { key: 'net_to_pay', label: 'Net à payer', money: true }, { key: 'paid_at', label: 'Payé le', render: (r) => fmtDate(r.paid_at) },
            ]}
            actions={(r) => <Button size="icon" variant="ghost" onClick={() => payslipPDF(d, [r], 'print')} title="Bulletin PDF"><Printer className="h-4 w-4" /></Button>}
          />
        </>
      )}
      {tab === 'advances' && (
        <Resource title="Avances sur salaire" endpoint="/advances" module="payroll" deletable
          columns={[{ key: 'employee_name', label: 'Employé' }, { key: 'given_at', label: 'Date', render: (r) => fmtDate(r.given_at) }, { key: 'period', label: 'Retenue sur' }, { key: 'amount', label: 'Montant', money: true }, { key: 'notes', label: 'Notes' }]}
          fields={[{ name: 'employee_id', label: 'Employé', type: 'relation', relation: { endpoint: '/employees', label: (r) => `${r.last_name} ${r.first_name}` }, required: true }, { name: 'amount', label: 'Montant', type: 'money', required: true }, { name: 'given_at', label: 'Date', type: 'date', required: true }, { name: 'period', label: 'Mois de retenue (AAAA-MM)', required: true, placeholder: todayISO().slice(0, 7) }, { name: 'notes', label: 'Notes', type: 'textarea', span: 2 }]}
          defaults={{ given_at: todayISO(), period: todayISO().slice(0, 7) }} />
      )}
      {tab === 'rules' && (
        <div className="space-y-3">
          <Card className="border-amber-300 bg-amber-50 text-sm dark:border-amber-500/30 dark:bg-amber-500/5"><AlertTriangle className="me-2 inline h-4 w-4 text-amber-500" />Aucun taux légal n’est pré-rempli. Les taux CNSS, le barème IRPP, la CSS et les majorations doivent être saisis et <b>validés par votre comptable</b>, avec leur date d’application. Chaque modification crée une nouvelle version datée.</Card>
          {can('payroll:write') && <Button onClick={() => setRuleForm({ code: 'cnss_employee', label: '', value_json: '{"rate_bp":0}', effective_from: todayISO().slice(0, 8) + '01', notes: '' })}><Plus className="h-4 w-4" />Nouvelle version de règle</Button>}
          <DataTable title="Règles de paie" rows={rules.data?.data ?? []} loading={rules.isLoading} columns={[
            { key: 'code', label: 'Code', className: 'font-mono text-xs' }, { key: 'label', label: 'Libellé' }, { key: 'value_json', label: 'Valeur', className: 'font-mono text-xs' },
            { key: 'effective_from', label: 'Applicable dès', render: (r) => fmtDate(r.effective_from) }, { key: 'validated_by_accountant', label: 'Comptable', render: (r) => r.validated_by_accountant ? <Badge tone="green">Validé</Badge> : <Badge tone="red">Non validé</Badge> }, { key: 'notes', label: 'Notes' },
          ]} actions={(r) => <>{can('payroll:write') && <Button size="sm" variant="outline" onClick={() => setRuleForm({ ...r, effective_from: r.effective_from })}>Modifier</Button>}{can('settings:write') && !r.validated_by_accountant && <Button size="sm" variant="secondary" onClick={async () => { await api(`/payroll/rules/${r.id}/validate`, { body: {} }); rules.refetch(); }}><Check className="h-4 w-4" />Valider</Button>}</>} />
          <Card className="text-xs text-zinc-500"><b>Formats :</b> taux en points de base (<code>{'{"rate_bp":918}'}</code> = 9,18 %). Barème IRPP : <code>{'{"brackets":[{"upTo":5000000,"rate_bp":0},{"upTo":null,"rate_bp":...}],"professional_expenses_bp":1000,"professional_expenses_cap":2000000}'}</code> (montants annuels en millimes). Heures mensuelles : <code>{'{"hours":...}'}</code>.</Card>
        </div>
      )}
      <Modal open={!!ruleForm} onClose={() => setRuleForm(null)} title="Règle de paie" footer={<Button onClick={async () => { try { JSON.parse(ruleForm.value_json); await api('/payroll/rules', { body: { ...ruleForm, notes: ruleForm.notes || null } }); toast('success', 'Règle enregistrée (à faire valider par le comptable)'); setRuleForm(null); rules.refetch(); } catch (e: any) { toast('error', e.message); } }}>Enregistrer</Button>}>
        {ruleForm && <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code"><Select value={ruleForm.code} onChange={(e) => setRuleForm({ ...ruleForm, code: e.target.value })}>{['cnss_employee', 'cnss_employer', 'css', 'irpp_brackets', 'overtime_rate', 'monthly_hours'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Libellé"><Input value={ruleForm.label} onChange={(e) => setRuleForm({ ...ruleForm, label: e.target.value })} /></Field>
          <Field label="Valeur (JSON)" className="sm:col-span-2"><Textarea className="font-mono" value={ruleForm.value_json} onChange={(e) => setRuleForm({ ...ruleForm, value_json: e.target.value })} /></Field>
          <Field label="Date d’application"><Input type="date" value={ruleForm.effective_from} onChange={(e) => setRuleForm({ ...ruleForm, effective_from: e.target.value })} /></Field>
          <Field label="Notes / source"><Input value={ruleForm.notes ?? ''} onChange={(e) => setRuleForm({ ...ruleForm, notes: e.target.value })} /></Field>
        </div>}
      </Modal>
      <Modal open={!!curRec} onClose={() => setRec(null)} title={curRec ? `${curRec.number} — ${curRec.last_name} ${curRec.first_name}` : ''} size="lg" footer={curRec && <Button variant="outline" onClick={() => payslipPDF(d, [curRec], 'print')}><Printer className="h-4 w-4" />Bulletin</Button>}>
        {curRec && <div className="space-y-4">
          {['earning', 'deduction'].map((k) => (
            <div key={k}><h4 className="mb-2 text-sm font-bold uppercase text-zinc-500">{k === 'earning' ? 'Rémunérations' : 'Retenues'}</h4>
              {curRec.items.filter((i: any) => i.kind === k).map((i: any) => <div key={i.id} className="flex items-center gap-3 border-b border-zinc-100 py-1.5 text-sm dark:border-white/5"><span className="flex-1">{i.label} {i.is_manual ? <Badge tone="violet">manuel</Badge> : null}</span><span className="text-xs text-zinc-500">{i.base}</span><b>{money(i.amount)}</b>{d.status === 'draft' && i.is_manual ? <Button size="icon" variant="ghost" onClick={async () => { await api(`/payroll/items/${i.id}`, { method: 'DELETE' }); refresh(); }}><Trash2 className="h-4 w-4 text-red-500" /></Button> : null}</div>)}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><Stat label="Brut" value={money(curRec.gross)} /><Stat label="Net" value={money(curRec.net)} /><Stat label="Avances" value={money(curRec.advances)} /><Stat label="Net à payer" value={money(curRec.net_to_pay)} tone="brand" /></div>
          {d.status === 'draft' && can('payroll:write') && (
            <Card className="grid gap-3 bg-zinc-50 dark:bg-white/5 sm:grid-cols-4">
              <Select value={`${item.kind}:${item.code}`} onChange={(e) => { const [kind, code] = e.target.value.split(':'); setItem({ ...item, kind, code }); }}>
                <option value="earning:bonus">Prime</option><option value="earning:commission">Commission</option><option value="earning:allowance">Indemnité</option><option value="deduction:deduction_other">Autre retenue</option>
              </Select>
              <Input placeholder="Libellé" value={item.label} onChange={(e) => setItem({ ...item, label: e.target.value })} />
              <Input type="number" step="0.001" placeholder="Montant (DT)" value={item.amount} onChange={(e) => setItem({ ...item, amount: e.target.value })} />
              <Button onClick={async () => { try { await api(`/payroll/records/${curRec.id}/items`, { body: { ...item, amount: toMillimes(item.amount) } }); setItem({ kind: 'earning', code: 'bonus', label: '', amount: '' }); refresh(); } catch (e: any) { toast('error', e.message); } }}><Plus className="h-4 w-4" />Ajouter</Button>
            </Card>
          )}
        </div>}
      </Modal>
    </div>
  );
}

// ======================= ME (coach / staff self-service) =======================
export function MePage() {
  const { me } = useAuth();
  const { toast } = useUI();
  const { data, refetch, isLoading } = useQuery({ queryKey: ['me-overview'], queryFn: () => api('/me/overview') });
  const [codeForm, setCodeForm] = useState({ current: '', custom: '' });
  const [newCode, setNewCode] = useState('');
  const today = data?.attendance?.find((a: any) => a.work_date === todayISO());
  const punch = async (action: 'in' | 'out') => { try { const r = await api('/attendance/self', { body: { action } }); toast('success', `${action === 'in' ? 'Entrée' : 'Sortie'} pointée à ${r.time}`); refetch(); } catch (e: any) { toast('error', e.message); } };
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">Mon espace</h1>
      {isLoading ? <Spinner /> : (
        <>
          {data?.employee ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card><div className="text-sm text-zinc-500">Profil</div><div className="text-xl font-bold">{data.employee.first_name} {data.employee.last_name}</div><div className="text-sm">{posLabel[data.employee.position]} · {data.employee.matricule}</div><div className="text-sm text-zinc-500">Depuis le {fmtDate(data.employee.hire_date)}</div></Card>
              <Card className="lg:col-span-2"><div className="mb-3 text-sm text-zinc-500">Déclaration de présence — {fmtDate(todayISO())}</div>
                <div className="flex flex-wrap items-center gap-3"><Button size="lg" disabled={!!today?.check_in} onClick={() => punch('in')}><LogIn className="h-5 w-5" />Pointer l’entrée</Button><Button size="lg" variant="secondary" disabled={!today?.check_in || !!today?.check_out} onClick={() => punch('out')}><LogOut className="h-5 w-5" />Pointer la sortie</Button>
                  {today && <span className="text-sm">Entrée : <b>{today.check_in ?? '—'}</b> · Sortie : <b>{today.check_out ?? '—'}</b></span>}</div></Card>
            </div>
          ) : <Card className="text-sm text-zinc-500">Aucun profil employé n’est lié à votre compte ({me.display_name}).</Card>}
          {data?.sessions?.length > 0 && (
            <DataTable title="Mes séances" rows={data.sessions} columns={[{ key: 'session_date', label: 'Date', render: (r) => fmtDate(r.session_date) }, { key: 'time', label: 'Horaire', render: (r) => `${r.start_time}–${r.end_time}` }, { key: 'activity_name', label: 'Activité' }, { key: 'room_name', label: 'Salle' }, { key: 'age_category', label: 'Catégorie' }, { key: 'attendees', label: 'Participants', render: (r) => `${r.attendees}/${r.capacity}` }, { key: 'status', label: 'Statut', render: (r) => <Badge>{r.status}</Badge> }]} />
          )}
          {data?.attendance?.length > 0 && (
            <DataTable title="Mes pointages" rows={data.attendance} columns={[{ key: 'work_date', label: 'Date', render: (r) => fmtDate(r.work_date) }, { key: 'check_in', label: 'Entrée' }, { key: 'check_out', label: 'Sortie' }, { key: 'worked_minutes', label: 'Effectif', render: (r) => minutesToH(r.worked_minutes) }, { key: 'is_validated', label: 'Validé', render: (r) => r.is_validated ? 'Oui' : 'Non' }]} />
          )}
        </>
      )}
      <Card className="max-w-xl">
        <h3 className="mb-3 font-bold">Changer mon code d’accès</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code actuel"><Input type="password" value={codeForm.current} onChange={(e) => setCodeForm({ ...codeForm, current: e.target.value })} /></Field>
          <Field label="Nouveau code (facultatif)" hint="Vide = code fort généré automatiquement. Min. 8 caractères, lettres + chiffres."><Input value={codeForm.custom} onChange={(e) => setCodeForm({ ...codeForm, custom: e.target.value })} /></Field>
        </div>
        <Button className="mt-3" onClick={async () => { try { const r = await api('/auth/change-code', { body: { current: codeForm.current, custom: codeForm.custom || undefined } }); setNewCode(r.code); setCodeForm({ current: '', custom: '' }); toast('success', 'Code modifié — les autres sessions ont été déconnectées'); } catch (e: any) { toast('error', e.message); } }}>Changer le code</Button>
        {newCode && <div className="mt-3 rounded-xl bg-brand/20 p-3 text-sm">Votre nouveau code : <b className="font-mono text-lg">{newCode}</b> — notez-le, il ne sera plus affiché.</div>}
      </Card>
    </div>
  );
}
