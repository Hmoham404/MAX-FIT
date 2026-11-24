import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, ChevronLeft, ChevronRight, Copy, CopyPlus, Plus, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { addDays, cx, fmtDate, startOfWeek, todayISO } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Tabs, Textarea, useUI } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { useAuth } from '../auth';
import { Resource, useOptions } from '../Resource';

type View = 'day' | 'week' | 'month' | 'list';
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6);
const statusTone: Record<string, any> = { scheduled: 'green', cancelled: 'red', full: 'amber', done: 'zinc' };

function SessionForm({ open, onClose, session, date }: { open: boolean; onClose: () => void; session?: any; date?: string }) {
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const acts = useOptions('/activities', (a) => a.name);
  const coaches = useOptions('/coaches', (c) => c.public_name || `${c.first_name} ${c.last_name}`);
  const rooms = useOptions('/rooms', (r) => r.name);
  const init = () => session ? { ...session, coach_id: session.coach_id ?? '', room_id: session.room_id ?? '', replacement_coach_id: session.replacement_coach_id ?? '', repeat_weeks: 0, scope: 'one' }
    : { activity_id: '', coach_id: '', room_id: '', session_date: date ?? todayISO(), start_time: '18:00', end_time: '19:00', age_category: 'Adultes', capacity: 20, status: 'scheduled', is_published: true, notes: '', repeat_weeks: 0, replacement_coach_id: '' };
  const [f, setF] = useState<any>(init);
  const [conf, setConf] = useState<any[]>([]);
  const [key, setKey] = useState('');
  if (open && key !== `${session?.id ?? 'new'}-${date}`) { setKey(`${session?.id ?? 'new'}-${date}`); setF(init()); setConf([]); }
  if (!open && key) setKey('');
  const body = (force = false) => ({ ...f, activity_id: Number(f.activity_id), coach_id: f.coach_id ? Number(f.coach_id) : null, room_id: f.room_id ? Number(f.room_id) : null, replacement_coach_id: f.replacement_coach_id ? Number(f.replacement_coach_id) : null, capacity: Number(f.capacity), repeat_weeks: Number(f.repeat_weeks), is_published: !!f.is_published, force });
  const check = async () => { try { const r = await api('/schedules/check', { body: { ...body(), id: session?.id } }); setConf(r.conflicts); } catch { /* ignore */ } };
  const save = async (force = false) => {
    try {
      if (session) await api(`/schedules/${session.id}${f.scope === 'series' ? '?scope=series' : ''}`, { method: 'PUT', body: body(force) });
      else {
        const r = await api('/schedules', { body: body(force) });
        if (r.skipped?.length) toast('info', `${r.created.length} séance(s) créée(s), ${r.skipped.length} ignorée(s) pour conflit`);
      }
      toast('success', 'Planning mis à jour (synchronisé avec le site public)');
      qc.invalidateQueries({ queryKey: ['schedules'] });
      onClose();
    } catch (e: any) {
      if (e.status === 409) {
        const list = e.data?.details?.conflicts ?? [];
        setConf(list.flatMap((x: any) => x.conflicts ?? [x]));
        if (await confirm({ title: 'Conflit d’horaire', text: `${e.message}. Forcer l’enregistrement malgré le conflit ?` })) save(true);
      } else toast('error', e.message);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={session ? 'Modifier la séance' : 'Nouvelle séance'} size="lg"
      footer={<><Button variant="outline" onClick={check}>Vérifier les conflits</Button><Button onClick={() => save()}>Enregistrer</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Activité" required><Select value={f.activity_id} onChange={(e) => setF({ ...f, activity_id: e.target.value })}><option value="">—</option>{acts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></Field>
        <Field label="Coach"><Select value={f.coach_id} onChange={(e) => setF({ ...f, coach_id: e.target.value })}><option value="">—</option>{coaches.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></Field>
        <Field label="Salle / espace"><Select value={f.room_id} onChange={(e) => setF({ ...f, room_id: e.target.value })}><option value="">—</option>{rooms.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></Field>
        <Field label="Date" required><Input type="date" value={f.session_date} onChange={(e) => setF({ ...f, session_date: e.target.value })} /></Field>
        <Field label="Début" required><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="Fin" required><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
        <Field label="Catégorie d’âge"><Select value={f.age_category ?? ''} onChange={(e) => setF({ ...f, age_category: e.target.value })}><option>Adultes</option><option>Juniors</option><option>Enfants</option><option>Seniors</option><option>Tous</option></Select></Field>
        <Field label="Capacité max."><Input type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></Field>
        <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="scheduled">Programmée</option><option value="full">Complète</option><option value="cancelled">Annulée</option><option value="done">Réalisée</option></Select></Field>
        <Field label="Coach remplaçant"><Select value={f.replacement_coach_id} onChange={(e) => setF({ ...f, replacement_coach_id: e.target.value })}><option value="">Aucun</option>{coaches.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select></Field>
        {!session ? <Field label="Récurrence" hint="Répéter chaque semaine"><Select value={f.repeat_weeks} onChange={(e) => setF({ ...f, repeat_weeks: e.target.value })}><option value={0}>Aucune</option>{[3, 7, 11, 25, 51].map((w) => <option key={w} value={w}>{w + 1} semaines</option>)}</Select></Field>
          : session.recurrence_group && <Field label="Appliquer à"><Select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="one">Cette séance</option><option value="series">Toute la série à venir</option></Select></Field>}
        <Field label="Publiée sur le site"><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-lime-400" checked={!!f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} />Oui</label></Field>
        <Field label="Notes" className="sm:col-span-3"><Textarea value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      {conf.length > 0 ? (
        <Card className="mt-4 border-red-300 bg-red-50 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <b>Conflits détectés :</b><ul className="mt-1 list-disc ps-5">{conf.map((c, i) => <li key={i}>[{c.type === 'coach' ? 'Coach' : c.type === 'room' ? 'Salle' : 'Fermeture'}] {c.label}</li>)}</ul>
        </Card>
      ) : null}
    </Modal>
  );
}

export default function PlanningPage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('week');
  const [tab, setTab] = useState<'calendar' | 'exceptions' | 'rooms'>('calendar');
  const [cursor, setCursor] = useState(todayISO());
  const [filters, setFilters] = useState({ activity_id: '', coach_id: '', room_id: '' });
  const [edit, setEdit] = useState<{ open: boolean; session?: any; date?: string }>({ open: false });
  const acts = useOptions('/activities', (a) => a.name);
  const coaches = useOptions('/coaches', (c) => c.public_name || `${c.first_name} ${c.last_name}`);
  const rooms = useOptions('/rooms', (r) => r.name);
  const range: [string, string] = view === 'day' ? [cursor, cursor] : view === 'week' || view === 'list' ? [startOfWeek(cursor), addDays(startOfWeek(cursor), 6)]
    : [startOfWeek(cursor.slice(0, 7) + '-01'), addDays(startOfWeek(cursor.slice(0, 7) + '-01'), 41)];
  const { data } = useQuery({ queryKey: ['schedules', range, filters], queryFn: () => api('/schedules', { query: { from: range[0], to: range[1], ...filters } }) });
  const rows: any[] = data?.data ?? [];
  const exc = new Map<string, any>((data?.exceptions ?? []).map((e: any) => [e.exception_date, e]));
  const step = (n: number) => setCursor(view === 'day' ? addDays(cursor, n) : view === 'month' ? (() => { const d = new Date(cursor + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); })() : addDays(cursor, 7 * n));
  const move = async (s: any, date: string) => {
    if (date === s.session_date) return;
    try { await api(`/schedules/${s.id}`, { method: 'PUT', body: { session_date: date } }); toast('success', `Séance déplacée au ${fmtDate(date)}`); qc.invalidateQueries({ queryKey: ['schedules'] }); }
    catch (e: any) { toast('error', e.message); }
  };
  const duplicate = async (s: any) => {
    const d = await confirm({ title: 'Dupliquer la séance', input: 'Nouvelle date (AAAA-MM-JJ)' });
    if (!d) return;
    try { await api(`/schedules/${s.id}/duplicate`, { body: { session_date: d } }); toast('success', 'Séance dupliquée'); qc.invalidateQueries({ queryKey: ['schedules'] }); } catch (e: any) { toast('error', e.message); }
  };
  const cancel = async (s: any) => {
    if (!(await confirm({ title: 'Annuler cette séance ?', danger: true }))) return;
    try { await api(`/schedules/${s.id}`, { method: 'PUT', body: { status: 'cancelled' } }); toast('success', 'Séance annulée'); qc.invalidateQueries({ queryKey: ['schedules'] }); } catch (e: any) { toast('error', e.message); }
  };
  const remove = async (s: any) => {
    const series = s.recurrence_group && (await confirm({ title: 'Supprimer toute la série à venir ?', text: 'Confirmer = toute la série, Annuler = cette séance uniquement.' }));
    if (!series && !(await confirm({ title: 'Supprimer cette séance ?', danger: true }))) return;
    try { await api(`/schedules/${s.id}${series ? '?scope=series' : ''}`, { method: 'DELETE' }); toast('success', 'Supprimé'); qc.invalidateQueries({ queryKey: ['schedules'] }); } catch (e: any) { toast('error', e.message); }
  };
  const copyWeek = async () => {
    const n = await confirm({ title: 'Copier cette semaine', text: `Copier toutes les séances de la semaine du ${fmtDate(range[0])} sur les semaines suivantes (les conflits sont ignorés).`, input: 'Nombre de semaines (1-12)' });
    if (!n) return;
    try { const r = await api('/schedules/copy-week', { body: { from: startOfWeek(cursor), weeks: Number(n) } }); toast('success', `${r.created} séance(s) créée(s), ${r.skipped} conflit(s) ignoré(s)`); qc.invalidateQueries({ queryKey: ['schedules'] }); } catch (e: any) { toast('error', e.message); }
  };
  const Chip = ({ s }: { s: any }) => (
    <div draggable={can('schedules:write')} onDragStart={(e) => e.dataTransfer.setData('id', String(s.id))} onClick={() => can('schedules:write') && setEdit({ open: true, session: s })}
      className={cx('group cursor-pointer rounded-lg border-s-4 bg-white p-1.5 text-xs shadow-sm transition hover:shadow-md dark:bg-[#20242c]', s.status === 'cancelled' && 'opacity-50 line-through')} style={{ borderColor: s.activity_color || '#BEF264' }}>
      <div className="font-bold tabular-nums">{s.start_time}–{s.end_time}</div>
      <div className="truncate font-semibold">{s.activity_name}</div>
      <div className="truncate text-zinc-500">{s.coach_name}{s.replacement_coach_id ? ' (rempl.)' : ''}</div>
      <div className="truncate text-zinc-500">{s.room_name} · {s.attendees}/{s.capacity}</div>
      {can('schedules:write') && <div className="mt-1 hidden gap-1 group-hover:flex" onClick={(e) => e.stopPropagation()}>
        <button title="Dupliquer" onClick={() => duplicate(s)}><Copy className="h-3.5 w-3.5" /></button>
        <button title="Annuler" onClick={() => cancel(s)}><XCircle className="h-3.5 w-3.5 text-amber-500" /></button>
        {can('schedules:delete') && <button title="Supprimer" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></button>}
      </div>}
    </div>
  );
  const DayCol = ({ d, compact }: { d: string; compact?: boolean }) => {
    const list = rows.filter((r) => r.session_date === d);
    const e = exc.get(d);
    return (
      <div onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { const id = Number(ev.dataTransfer.getData('id')); const s = rows.find((r) => r.id === id); if (s) move(s, d); }}
        onDoubleClick={() => can('schedules:write') && setEdit({ open: true, date: d })}
        className={cx('min-h-[120px] space-y-1.5 rounded-xl border p-1.5', d === todayISO() ? 'border-brand bg-brand/5' : 'border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.02]', compact && d.slice(0, 7) !== cursor.slice(0, 7) && 'opacity-40')}>
        <div className="flex items-center justify-between px-1 text-xs font-bold"><span>{new Date(d + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>{list.length > 0 && <span className="text-zinc-400">{list.length}</span>}</div>
        {e && <div className="rounded bg-red-500/15 p-1 text-[10px] font-bold text-red-500">{e.kind === 'holiday' ? 'Férié' : 'Fermé'} — {e.label}</div>}
        {(compact ? list.slice(0, 3) : list).map((s) => <Chip key={s.id} s={s} />)}
        {compact && list.length > 3 && <button className="w-full text-[10px] text-zinc-500" onClick={() => { setCursor(d); setView('day'); }}>+{list.length - 3} autres</button>}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">Planning</h1>
        <div className="flex gap-2">
          {can('schedules:write') && <Button variant="outline" onClick={copyWeek}><CopyPlus className="h-4 w-4" />Copier la semaine</Button>}
          {can('schedules:write') && <Button onClick={() => setEdit({ open: true, date: cursor })}><Plus className="h-4 w-4" />Séance</Button>}
        </div>
      </div>
      {can('schedules:write') && <Tabs value={tab} onChange={setTab} items={[{ value: 'calendar', label: 'Calendrier' }, { value: 'exceptions', label: 'Jours fériés & fermetures' }, { value: 'rooms', label: 'Salles' }]} />}
      {tab === 'exceptions' && <Resource title="Jours fériés & fermetures" endpoint="/schedule-exceptions" module="schedules" deletable columns={[{ key: 'exception_date', label: 'Date', render: (r) => fmtDate(r.exception_date) }, { key: 'kind', label: 'Type', render: (r) => <Badge tone={r.kind === 'holiday' ? 'blue' : 'red'}>{r.kind === 'holiday' ? 'Jour férié' : 'Fermeture'}</Badge> }, { key: 'label', label: 'Libellé' }]} fields={[{ name: 'exception_date', label: 'Date', type: 'date', required: true }, { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'holiday', label: 'Jour férié' }, { value: 'closure', label: 'Fermeture exceptionnelle' }], required: true }, { name: 'label', label: 'Libellé', required: true }]} />}
      {tab === 'rooms' && <Resource title="Salles & espaces" endpoint="/rooms" module="schedules" deletable columns={[{ key: 'name', label: 'Nom' }, { key: 'capacity', label: 'Capacité' }]} fields={[{ name: 'name', label: 'Nom', required: true }, { name: 'capacity', label: 'Capacité', type: 'number' }]} />}
      {tab === 'calendar' && <>
        <Card className="flex flex-wrap items-center gap-2 p-3">
          <Button size="icon" variant="outline" onClick={() => step(-1)}><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(todayISO())}>Aujourd’hui</Button>
          <Button size="icon" variant="outline" onClick={() => step(1)}><ChevronRight className="h-4 w-4 rtl:rotate-180" /></Button>
          <span className="font-bold">{view === 'month' ? new Date(cursor + 'T00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : `${fmtDate(range[0])} → ${fmtDate(range[1])}`}</span>
          <div className="ms-auto flex flex-wrap gap-2">
            <Select className="h-9 w-auto" value={filters.activity_id} onChange={(e) => setFilters({ ...filters, activity_id: e.target.value })}><option value="">Activité</option>{acts.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
            <Select className="h-9 w-auto" value={filters.coach_id} onChange={(e) => setFilters({ ...filters, coach_id: e.target.value })}><option value="">Coach</option>{coaches.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
            <Select className="h-9 w-auto" value={filters.room_id} onChange={(e) => setFilters({ ...filters, room_id: e.target.value })}><option value="">Salle</option>{rooms.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}</Select>
            <Tabs value={view} onChange={setView} items={[{ value: 'day', label: 'Jour' }, { value: 'week', label: 'Semaine' }, { value: 'month', label: 'Mois' }, { value: 'list', label: 'Liste' }]} />
          </div>
        </Card>
        {can('schedules:write') && view !== 'list' && <p className="text-xs text-zinc-500">Astuce : glissez-déposez une séance pour la déplacer, double-cliquez sur un jour pour ajouter une séance.</p>}
        {view === 'week' && <div className="grid gap-2 md:grid-cols-7">{Array.from({ length: 7 }, (_, i) => <DayCol key={i} d={addDays(range[0], i)} />)}</div>}
        {view === 'month' && <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 md:grid-cols-7">{Array.from({ length: 42 }, (_, i) => <DayCol key={i} d={addDays(range[0], i)} compact />)}</div>}
        {view === 'day' && (
          <Card className="p-0">
            {exc.get(cursor) && <div className="bg-red-500/15 p-3 text-sm font-bold text-red-500"><CalendarOff className="me-2 inline h-4 w-4" />{exc.get(cursor).label}</div>}
            {HOURS.map((h) => {
              const list = rows.filter((r) => r.session_date === cursor && Number(r.start_time.slice(0, 2)) === h);
              return <div key={h} className="flex gap-3 border-b border-zinc-100 p-2 dark:border-white/5"><div className="w-14 shrink-0 pt-1 text-xs font-bold text-zinc-500">{String(h).padStart(2, '0')}:00</div><div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{list.map((s) => <Chip key={s.id} s={s} />)}</div></div>;
            })}
          </Card>
        )}
        {view === 'list' && (
          <DataTable title="Planning" rows={rows} columns={[
            { key: 'session_date', label: 'Date', render: (r) => fmtDate(r.session_date) }, { key: 'time', label: 'Horaire', render: (r) => `${r.start_time}–${r.end_time}`, exportValue: (r) => `${r.start_time}-${r.end_time}` },
            { key: 'activity_name', label: 'Activité' }, { key: 'coach_name', label: 'Coach' }, { key: 'room_name', label: 'Salle' }, { key: 'age_category', label: 'Catégorie' },
            { key: 'attendees', label: 'Présents', render: (r) => `${r.attendees}/${r.capacity}` }, { key: 'status', label: 'Statut', render: (r) => <Badge tone={statusTone[r.status]}>{r.status}</Badge> },
          ]} onRowClick={(r) => can('schedules:write') && setEdit({ open: true, session: r })} />
        )}
      </>}
      <SessionForm open={edit.open} session={edit.session} date={edit.date} onClose={() => setEdit({ open: false })} />
    </div>
  );
}
