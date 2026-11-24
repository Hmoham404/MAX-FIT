import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { toMillimes } from '@/lib/format';
import { Button, Field, Input, Modal, Select, Textarea, useUI } from '@/components/ui';
import { DataTable, type Column } from '@/components/DataTable';
import { useAuth } from './auth';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'date' | 'time' | 'select' | 'bool' | 'textarea' | 'email' | 'tel' | 'relation' | 'multirelation' | 'color' | 'image' | 'percent';
  options?: { value: string | number; label: string }[];
  relation?: { endpoint: string; label: (r: any) => string; query?: Record<string, unknown> };
  required?: boolean;
  span?: 1 | 2 | 3;
  hidden?: (f: any) => boolean;
  hint?: string;
  perm?: string;
  placeholder?: string;
}
export interface FilterDef { name: string; label: string; options?: { value: string; label: string }[]; relation?: FieldDef['relation']; type?: 'select' | 'date' }

export function useRelation(rel?: FieldDef['relation']) {
  return useQuery({
    queryKey: ['rel', rel?.endpoint, rel?.query],
    queryFn: () => api(rel!.endpoint, { query: { pageSize: 500, ...(rel!.query ?? {}) } }),
    enabled: !!rel,
    staleTime: 60_000,
    select: (d: any) => (d.data ?? d) as any[],
  });
}

function RelationSelect({ f, value, onChange }: { f: FieldDef; value: any; onChange: (v: any) => void }) {
  const { data = [] } = useRelation(f.relation);
  if (f.type === 'multirelation') {
    const arr: number[] = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-zinc-300 p-2 dark:border-white/10">
        {data.map((r) => {
          const on = arr.includes(r.id);
          return (
            <button type="button" key={r.id} onClick={() => onChange(on ? arr.filter((x) => x !== r.id) : [...arr, r.id])}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${on ? 'bg-brand text-brand-fg' : 'bg-zinc-100 dark:bg-white/10'}`}>{f.relation!.label(r)}</button>
          );
        })}
      </div>
    );
  }
  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} required={f.required}>
      <option value="">—</option>
      {data.map((r) => <option key={r.id} value={r.id}>{f.relation!.label(r)}</option>)}
    </Select>
  );
}

export function FormFields({ fields, value, onChange }: { fields: FieldDef[]; value: any; onChange: (v: any) => void }) {
  const { can } = useAuth();
  const set = (k: string, v: any) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {fields.filter((f) => !f.hidden?.(value) && (!f.perm || can(f.perm))).map((f) => {
        const v = value[f.name];
        let input: ReactNode;
        switch (f.type) {
          case 'textarea': input = <Textarea value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} required={f.required} placeholder={f.placeholder} />; break;
          case 'select': input = <Select value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} required={f.required}><option value="">—</option>{f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>; break;
          case 'bool': input = <label className="flex h-10 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-brand" checked={!!v} onChange={(e) => set(f.name, e.target.checked)} /> <span className="text-sm">Oui</span></label>; break;
          case 'relation': case 'multirelation': input = <RelationSelect f={f} value={v} onChange={(x) => set(f.name, x)} />; break;
          case 'money': input = <div className="relative"><Input type="number" step="0.001" min="0" value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} required={f.required} className="pe-12" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 rtl:left-3 rtl:right-auto">DT</span></div>; break;
          case 'color': input = <div className="flex gap-2"><input type="color" value={v || '#D3010C'} onChange={(e) => set(f.name, e.target.value)} className="h-10 w-14 rounded-lg" /><Input value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} /></div>; break;
          case 'image': input = <div className="flex gap-2"><Input value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} placeholder="https://…" />{v && <img src={v} alt="" className="h-10 w-10 rounded-lg object-cover" />}</div>; break;
          default: input = <Input type={f.type === 'percent' ? 'number' : f.type || 'text'} value={v ?? ''} onChange={(e) => set(f.name, e.target.value)} required={f.required} placeholder={f.placeholder} step={f.type === 'percent' ? '0.01' : undefined} />;
        }
        return <Field key={f.name} label={f.label} required={f.required} hint={f.hint} className={f.span === 3 ? 'sm:col-span-2 lg:col-span-3' : f.span === 2 ? 'sm:col-span-2' : ''}>{input}</Field>;
      })}
    </div>
  );
}

/** Converts form values (TND strings) to API payload (millimes, numbers, nulls). */
export function toPayload(fields: FieldDef[], form: any) {
  const out: any = {};
  for (const f of fields) {
    if (!(f.name in form)) continue;
    let v = form[f.name];
    if (f.type === 'money') v = v === '' || v == null ? 0 : toMillimes(v);
    else if (f.type === 'percent') v = v === '' || v == null ? 0 : Math.round(Number(v) * 100);
    else if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
    else if (f.type === 'bool') v = !!v;
    else if (v === '') v = null;
    out[f.name] = v;
  }
  return out;
}
export function toForm(fields: FieldDef[], row: any) {
  const out: any = {};
  for (const f of fields) {
    let v = row?.[f.name];
    if (f.type === 'money' && v != null) v = (Number(v) / 1000).toFixed(3);
    if (f.type === 'percent' && v != null) v = Number(v) / 100;
    if (f.type === 'bool') v = !!v;
    out[f.name] = v ?? (f.type === 'multirelation' ? [] : '');
  }
  return out;
}

export interface ResourceProps {
  title: string;
  endpoint: string;
  module: string;
  columns: Column[];
  fields: FieldDef[];
  filters?: FilterDef[];
  defaults?: Record<string, unknown>;
  query?: Record<string, unknown>;
  archive?: boolean;
  deletable?: boolean;
  creatable?: boolean;
  editable?: (row: any) => boolean;
  rowActions?: (row: any, refetch: () => void) => ReactNode;
  toolbar?: ReactNode;
  header?: ReactNode;
  modalSize?: 'sm' | 'md' | 'lg' | 'xl';
  transformOut?: (payload: any, form: any) => any;
  defaultSort?: string;
  importer?: ReactNode;
  onRowClick?: (row: any) => void;
}

export function Resource(p: ResourceProps) {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(p.defaultSort ?? '');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  useEffect(() => setPage(1), [search, JSON.stringify(filters), archived, JSON.stringify(p.query)]);
  const query = { page, pageSize: 25, search, sort, archived: archived ? '1' : undefined, ...filters, ...(p.query ?? {}) };
  const { data, isLoading, error, refetch } = useQuery({ queryKey: [p.endpoint, query], queryFn: () => api(p.endpoint, { query }) });
  const invalidate = () => { qc.invalidateQueries({ queryKey: [p.endpoint] }); qc.invalidateQueries({ queryKey: ['rel', p.endpoint] }); };
  const save = useMutation({
    mutationFn: async () => {
      let payload = toPayload(p.fields, form);
      if (p.transformOut) payload = p.transformOut(payload, form);
      return editing?.id ? api(`${p.endpoint}/${editing.id}`, { method: 'PUT', body: payload }) : api(p.endpoint, { method: 'POST', body: { ...(p.defaults ?? {}), ...payload } });
    },
    onSuccess: () => { toast('success', editing?.id ? 'Modifications enregistrées' : 'Élément créé'); setEditing(null); invalidate(); },
    onError: (e: any) => toast('error', e.message),
  });
  const open = (row?: any) => { setEditing(row ?? {}); setForm(row ? toForm(p.fields, row) : { ...toForm(p.fields, {}), ...Object.fromEntries(Object.entries(p.defaults ?? {}).map(([k, v]) => [k, p.fields.find((f) => f.name === k)?.type === 'money' ? Number(v) / 1000 : v])) }); };
  const canWrite = can(`${p.module}:write`);
  const canDelete = can(`${p.module}:delete`);
  const act = async (row: any, kind: 'archive' | 'restore' | 'delete') => {
    const ok = await confirm({ title: kind === 'delete' ? 'Supprimer définitivement ?' : kind === 'archive' ? 'Archiver cet élément ?' : 'Restaurer cet élément ?', danger: kind === 'delete', text: kind === 'delete' ? 'Cette action est irréversible.' : undefined });
    if (!ok) return;
    try {
      if (kind === 'delete') await api(`${p.endpoint}/${row.id}`, { method: 'DELETE' });
      else await api(`${p.endpoint}/${row.id}/archive${kind === 'restore' ? '?restore=1' : ''}`, { method: 'POST', body: {} });
      toast('success', 'Opération effectuée');
      invalidate();
    } catch (e: any) { toast('error', e.message); }
  };
  const fetchAll = async () => (await api(p.endpoint, { query: { ...query, page: 1, pageSize: 500 } })).data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-4xl uppercase tracking-wide">{p.title}</h1>
        <div className="flex gap-2">
          {p.importer}
          {canWrite && p.creatable !== false && <Button onClick={() => open()}><Plus className="h-4 w-4" />Ajouter</Button>}
        </div>
      </div>
      {p.header}
      <DataTable
        title={p.title}
        columns={p.columns}
        rows={data?.data ?? []}
        total={data?.total}
        page={page}
        onPage={setPage}
        search={search}
        onSearch={setSearch}
        sort={sort}
        onSort={setSort}
        loading={isLoading}
        error={error}
        onRetry={refetch}
        fetchAll={fetchAll}
        onRowClick={p.onRowClick}
        toolbar={<>
          {p.filters?.map((f) => <FilterSelect key={f.name} f={f} value={filters[f.name] ?? ''} onChange={(v) => setFilters({ ...filters, [f.name]: v })} />)}
          {p.archive && <label className="flex items-center gap-2 text-sm text-zinc-500"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-brand" />Archivés</label>}
          {p.toolbar}
        </>}
        actions={(row) => (
          <>
            {p.rowActions?.(row, refetch)}
            {canWrite && (p.editable?.(row) ?? true) && <Button size="icon" variant="ghost" onClick={() => open(row)} title="Modifier"><Pencil className="h-4 w-4" /></Button>}
            {p.archive && canDelete && (row.archived_at ? <Button size="icon" variant="ghost" onClick={() => act(row, 'restore')} title="Restaurer"><ArchiveRestore className="h-4 w-4" /></Button> : <Button size="icon" variant="ghost" onClick={() => act(row, 'archive')} title="Archiver"><Archive className="h-4 w-4" /></Button>)}
            {p.deletable && canDelete && <Button size="icon" variant="ghost" onClick={() => act(row, 'delete')} title="Supprimer"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </>
        )}
      />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Modifier — ${p.title}` : `Nouveau — ${p.title}`} size={p.modalSize ?? 'lg'}
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button><Button loading={save.isPending} onClick={() => (document.getElementById('res-form') as HTMLFormElement)?.requestSubmit()}>Enregistrer</Button></>}>
        <form id="res-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <FormFields fields={p.fields} value={form} onChange={setForm} />
        </form>
      </Modal>
    </div>
  );
}

export function FilterSelect({ f, value, onChange }: { f: FilterDef; value: string; onChange: (v: string) => void }) {
  const { data = [] } = useRelation(f.relation);
  if (f.type === 'date') return <label className="flex items-center gap-1 text-xs text-zinc-500">{f.label}<Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto" /></label>;
  const opts = f.options ?? data.map((r) => ({ value: String(r.id), label: f.relation!.label(r) }));
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-auto min-w-[140px]">
      <option value="">{f.label}</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
}

export function useOptions(endpoint: string, label: (r: any) => string, query?: Record<string, unknown>) {
  const { data = [] } = useRelation({ endpoint, label, query });
  return useMemo(() => data.map((r) => ({ value: r.id, label: label(r), raw: r })), [data]);
}
