import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Eye, KeyRound, LogOut, Plus, Save, Send, Trash2, Undo2, Upload, UserX } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Tabs, Textarea, useUI } from '@/components/ui';
import { DataTable } from '@/components/DataTable';
import { resetCompanyCache } from '@/lib/docs';
import { useAuth } from '../auth';
import { Resource, useOptions } from '../Resource';
import { Logo } from '@/components/Logo';
import { mediaUrl } from '@/lib/api';

// ======================= WEBSITE CMS =======================
const L = ['fr', 'en', 'ar'] as const;
export function WebsitePage() {
  const { can } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'identity' | 'texts' | 'contact' | 'seo' | 'gallery'>('identity');
  const { data, isLoading, refetch } = useQuery({ queryKey: ['cms'], queryFn: () => api('/settings/website') });
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (data && !d) setD(Object.fromEntries(Object.entries(data).map(([k, v]: any) => [k, v.draft]))); }, [data]);
  const dirty = data && Object.values(data).some((v: any) => v.dirty);
  const saveDraft = async () => {
    try { for (const k of ['site', 'contact', 'about', 'seo', 'footer']) await api(`/settings/website/${k}`, { method: 'PUT', body: d[k] }); toast('success', 'Brouillon enregistré'); refetch(); } catch (e: any) { toast('error', e.message); }
  };
  const publish = async () => {
    await saveDraft();
    if (!(await confirm({ title: 'Publier les modifications ?', text: 'Les changements seront visibles immédiatement sur le site public.' }))) return;
    try { await api('/settings/website/publish', { body: {} }); toast('success', 'Site publié !'); refetch(); qc.invalidateQueries({ queryKey: ['public-site'] }); } catch (e: any) { toast('error', e.message); }
  };
  const discard = async () => { if (await confirm({ title: 'Annuler le brouillon ?', danger: true })) { await api('/settings/website/discard', { body: {} }); setD(null); await refetch(); } };
  const upload = async (file: File, kind: string, cb: (url: string) => void) => {
    const fd = new FormData(); fd.append('file', file); fd.append('kind', kind); fd.append('title', file.name);
    try { const r = await api('/settings/media/upload', { form: fd }); cb(r.path); toast('success', 'Fichier importé'); } catch (e: any) { toast('error', e.message); }
  };
  if (isLoading || !d) return <Spinner />;
  const set = (k: string, path: string[], v: any) => { const next = structuredClone(d); let o = next[k]; for (const p of path.slice(0, -1)) o = o[p] ??= {}; o[path[path.length - 1]] = v; setD(next); };
  const ro = !can('website:write');
  const UploadBtn = ({ kind, onDone }: { kind: string; onDone: (u: string) => void }) => <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-white/15"><Upload className="h-3.5 w-3.5" />Importer<input type="file" accept="image/*,video/mp4" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f, kind, onDone); }} /></label>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-4xl uppercase tracking-wide">Site web (CMS)</h1><p className="text-sm text-zinc-500">Modifiez le site sans toucher au code : brouillon → prévisualisation → publication.</p></div>
        <div className="flex flex-wrap gap-2">
          {dirty && <Badge tone="amber">Brouillon non publié</Badge>}
          <a href={`${import.meta.env.BASE_URL}?preview=1`} target="_blank" rel="noopener noreferrer"><Button variant="outline" onClick={saveDraft}><Eye className="h-4 w-4" />Prévisualiser</Button></a>
          {!ro && <><Button variant="ghost" onClick={discard}><Undo2 className="h-4 w-4" />Annuler</Button><Button variant="outline" onClick={saveDraft}><Save className="h-4 w-4" />Enregistrer le brouillon</Button><Button onClick={publish}><Send className="h-4 w-4" />Publier</Button></>}
        </div>
      </div>
      <p className="text-xs text-zinc-500">Les activités, tarifs, promotions, planning et coachs visibles se gèrent dans leurs modules respectifs et sont synchronisés automatiquement.</p>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'identity', label: 'Identité & couleurs' }, { value: 'texts', label: 'Textes & présentation' }, { value: 'contact', label: 'Contact & horaires' }, { value: 'seo', label: 'SEO & footer' }, { value: 'gallery', label: 'Galerie' }]} />
      <fieldset disabled={ro} className="space-y-4">
        {tab === 'identity' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-4">
              <Field label="Nom de la salle"><Input value={d.site.name} onChange={(e) => set('site', ['name'], e.target.value)} /></Field>
              {L.map((l) => <Field key={l} label={`Slogans (${l.toUpperCase()}) — un par ligne, défilent dans le hero`}><Textarea value={(d.site.slogans?.[l] ?? []).join('\n')} onChange={(e) => set('site', ['slogans', l], e.target.value.split('\n'))} dir={l === 'ar' ? 'rtl' : 'ltr'} /></Field>)}
            </Card>
            <Card className="space-y-4">
              <div className="grid grid-cols-3 gap-3">{(['primary', 'dark', 'anthracite'] as const).map((c) => <Field key={c} label={c}><div className="flex gap-2"><input type="color" value={d.site.colors?.[c] ?? '#BEF264'} onChange={(e) => set('site', ['colors', c], e.target.value)} className="h-10 w-12 rounded" /><Input value={d.site.colors?.[c] ?? ''} onChange={(e) => set('site', ['colors', c], e.target.value)} /></div></Field>)}</div>
              {(['logoDark', 'logoLight'] as const).map((k) => (
                <Field key={k} label={k === 'logoDark' ? 'Logo mode nuit (fond sombre)' : 'Logo mode jour (fond clair)'} hint="Vide = logo MAX FIT par défaut (change automatiquement avec le mode)">
                  <div className="flex gap-2"><Input value={d.site[k] ?? ''} onChange={(e) => set('site', [k], e.target.value)} placeholder="https://… ou importer" /><UploadBtn kind="logo" onDone={(u) => set('site', [k], u)} /></div>
                </Field>
              ))}
              <div className="grid grid-cols-2 gap-3"><div className="grid h-20 place-items-center rounded-xl bg-ink"><Logo site={d.site} forceTheme="dark" /></div><div className="grid h-20 place-items-center rounded-xl border bg-white"><Logo site={d.site} forceTheme="light" /></div></div>
              <Field label="Favicon (URL)"><div className="flex gap-2"><Input value={d.site.favicon ?? ''} onChange={(e) => set('site', ['favicon'], e.target.value)} /><UploadBtn kind="logo" onDone={(u) => set('site', ['favicon'], u)} /></div></Field>
              <Field label="Image du hero"><div className="flex gap-2"><Input value={d.site.heroImage ?? ''} onChange={(e) => set('site', ['heroImage'], e.target.value)} /><UploadBtn kind="hero" onDone={(u) => set('site', ['heroImage'], u)} /></div></Field>
              <Field label="Vidéo du hero (MP4, facultatif)" hint="Prioritaire sur l’image si renseignée"><div className="flex gap-2"><Input value={d.site.heroVideo ?? ''} onChange={(e) => set('site', ['heroVideo'], e.target.value)} /><UploadBtn kind="hero" onDone={(u) => set('site', ['heroVideo'], u)} /></div></Field>
            </Card>
          </div>
        )}
        {tab === 'texts' && (
          <div className="grid gap-4 lg:grid-cols-3">
            {L.map((l) => (
              <Card key={l} className="space-y-3" dir={l === 'ar' ? 'rtl' : 'ltr'}>
                <Badge tone="brand">{l.toUpperCase()}</Badge>
                {(['story', 'mission', 'vision'] as const).map((k) => <Field key={k} label={k}><Textarea value={d.about?.[l]?.[k] ?? ''} onChange={(e) => set('about', [l, k], e.target.value)} /></Field>)}
                <Field label="Valeurs (une par ligne)"><Textarea value={(d.about?.[l]?.values ?? []).join('\n')} onChange={(e) => set('about', [l, 'values'], e.target.value.split('\n').filter(Boolean))} /></Field>
              </Card>
            ))}
          </div>
        )}
        {tab === 'contact' && (
          <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(['address', 'phone', 'whatsapp', 'email', 'facebook', 'instagram'] as const).map((k) => <Field key={k} label={k}><Input value={d.contact[k] ?? ''} onChange={(e) => set('contact', [k], e.target.value)} /></Field>)}
            <Field label="Google Maps (lien « intégrer une carte » https://www.google.com/maps/embed?...)" className="sm:col-span-2 lg:col-span-3"><Input value={d.contact.mapsEmbed ?? ''} onChange={(e) => set('contact', ['mapsEmbed'], e.target.value)} /></Field>
            <div className="space-y-2 sm:col-span-2 lg:col-span-3">
              <div className="text-xs font-semibold uppercase text-zinc-500">Horaires d’ouverture</div>
              {(d.contact.hours ?? []).map((h: any, i: number) => (
                <div key={i} className="grid grid-cols-5 gap-2">
                  {L.map((l) => <Input key={l} placeholder={`Jours (${l})`} value={h.days?.[l] ?? ''} onChange={(e) => set('contact', ['hours', String(i), 'days', l], e.target.value)} />)}
                  <div className="flex gap-1"><Input placeholder="06:00 – 22:00" value={h.time} onChange={(e) => set('contact', ['hours', String(i), 'time'], e.target.value)} /><Button size="icon" variant="ghost" onClick={() => set('contact', ['hours'], d.contact.hours.filter((_: any, j: number) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set('contact', ['hours'], [...(d.contact.hours ?? []), { days: { fr: '', en: '', ar: '' }, time: '' }])}><Plus className="h-4 w-4" />Ligne</Button>
            </div>
          </Card>
        )}
        {tab === 'seo' && (
          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Titre SEO"><Input value={d.seo.title} onChange={(e) => set('seo', ['title'], e.target.value)} /></Field>
            <Field label="Mots-clés"><Input value={d.seo.keywords} onChange={(e) => set('seo', ['keywords'], e.target.value)} /></Field>
            <Field label="Description SEO" className="sm:col-span-2"><Textarea value={d.seo.description} onChange={(e) => set('seo', ['description'], e.target.value)} /></Field>
            {L.map((l) => <Field key={l} label={`Texte du footer (${l})`}><Input value={d.footer?.text?.[l] ?? ''} onChange={(e) => set('footer', ['text', l], e.target.value)} dir={l === 'ar' ? 'rtl' : 'ltr'} /></Field>)}
          </Card>
        )}
      </fieldset>
      {tab === 'gallery' && <GalleryAdmin upload={upload} />}
    </div>
  );
}

function GalleryAdmin({ upload }: { upload: (f: File, kind: string, cb: (u: string) => void) => Promise<void> }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  return (
    <div className="space-y-3">
      {can('website:write') && <Card className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-ink"><Upload className="h-4 w-4" />Importer des photos<input type="file" multiple accept="image/*" className="hidden" onChange={async (e) => { for (const f of Array.from(e.target.files ?? [])) await upload(f, 'gallery', () => {}); qc.invalidateQueries({ queryKey: ['/media'] }); }} /></label><span className="text-xs text-zinc-500">Ou ajoutez une image par URL avec « Ajouter » (ex. photos publiées sur votre page Facebook / Instagram).</span></Card>}
      <Resource title="Galerie" endpoint="/media" module="website" deletable query={{ kind: 'gallery' }} defaults={{ kind: 'gallery', is_public: true }}
        columns={[{ key: 'img', label: '', render: (r) => <img src={mediaUrl(r)} className="h-14 w-20 rounded-lg object-cover" alt="" />, exportValue: () => '' }, { key: 'title', label: 'Titre' }, { key: 'category', label: 'Catégorie' }, { key: 'sort_order', label: 'Ordre' }, { key: 'is_public', label: 'Public', render: (r) => r.is_public ? <Badge tone="green">Oui</Badge> : <Badge>Non</Badge> }]}
        fields={[{ name: 'title', label: 'Titre' }, { name: 'category', label: 'Catégorie', placeholder: 'Équipements / Espaces / Infrastructures' }, { name: 'url', label: 'URL de l’image', type: 'image', span: 3, hint: 'Laisser vide pour une image importée' }, { name: 'sort_order', label: 'Ordre', type: 'number' }, { name: 'is_public', label: 'Publique', type: 'bool' }]} />
    </div>
  );
}

// ======================= USERS =======================
export function UsersPage() {
  const { me } = useAuth();
  const { toast, confirm } = useUI();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [form, setForm] = useState<any>(null);
  const [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const users = useQuery({ queryKey: ['users'], queryFn: () => api('/users') });
  const meta = useQuery({ queryKey: ['users-meta'], queryFn: () => api('/users/meta') });
  const emps = useOptions('/employees', (e) => `${e.last_name} ${e.first_name} (${e.position})`);
  const save = async () => {
    try {
      if (form.id) { await api(`/users/${form.id}`, { method: 'PUT', body: { display_name: form.display_name, role: form.role, employee_id: form.employee_id ? Number(form.employee_id) : null, extra_permissions: form.extra, denied_permissions: form.denied, is_active: form.is_active } }); toast('success', 'Utilisateur mis à jour'); }
      else { const r = await api('/users', { body: { display_name: form.display_name, role: form.role, employee_id: form.employee_id ? Number(form.employee_id) : null, extra_permissions: form.extra, denied_permissions: form.denied } }); setCode({ name: form.display_name, code: r.code }); }
      setForm(null); qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: any) { toast('error', e.message); }
  };
  const roleTone: Record<string, any> = { super_admin: 'red', admin: 'violet', receptionist: 'blue', coach: 'brand' };
  const perms: any[] = meta.data?.permissions ?? [];
  const modules = [...new Set(perms.map((p) => p.module))];
  const [roleEdit, setRoleEdit] = useState<{ role: string; perms: Set<string> } | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-4xl uppercase tracking-wide">Utilisateurs</h1>{tab === 'users' && <Button onClick={() => setForm({ display_name: '', role: 'receptionist', employee_id: '', extra: [], denied: [], is_active: true })}><Plus className="h-4 w-4" />Créer un compte</Button>}</div>
      <p className="text-sm text-zinc-500">Connexion par <b>code d’accès personnel</b> (pas d’email / mot de passe). Le code est généré aléatoirement, affiché une seule fois, et stocké uniquement sous forme hachée.</p>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'users', label: 'Comptes' }, { value: 'roles', label: 'Rôles & permissions' }]} />
      {tab === 'users' && <DataTable rows={users.data?.data ?? []} loading={users.isLoading} columns={[
        { key: 'display_name', label: 'Nom', render: (r) => <b>{r.display_name}</b> }, { key: 'role', label: 'Rôle', render: (r) => <Badge tone={roleTone[r.role]}>{r.role_name}</Badge> },
        { key: 'employee_name', label: 'Employé lié' }, { key: 'code_hint', label: 'Code', render: (r) => <span className="font-mono">••••-••••-••{r.code_hint}</span> },
        { key: 'last_login_at', label: 'Dernière connexion', render: (r) => fmtDateTime(r.last_login_at) }, { key: 'active_sessions', label: 'Sessions' },
        { key: 'is_active', label: 'Statut', render: (r) => r.is_active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge> },
      ]} actions={(r) => <>
        <Button size="sm" variant="outline" onClick={() => setForm({ ...r, extra: JSON.parse(r.extra_permissions || '[]'), denied: JSON.parse(r.denied_permissions || '[]'), employee_id: r.employee_id ?? '', is_active: !!r.is_active })}>Modifier</Button>
        <Button size="icon" variant="ghost" title="Réinitialiser le code" onClick={async () => { if (await confirm({ title: `Réinitialiser le code de ${r.display_name} ?`, text: 'L’ancien code ne fonctionnera plus et ses sessions seront fermées.' })) { const x = await api(`/users/${r.id}/reset-code`, { body: {} }); setCode({ name: r.display_name, code: x.code }); qc.invalidateQueries({ queryKey: ['users'] }); } }}><KeyRound className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" title="Révoquer les sessions" onClick={async () => { await api(`/users/${r.id}/revoke`, { body: {} }); toast('success', 'Sessions révoquées'); qc.invalidateQueries({ queryKey: ['users'] }); }}><LogOut className="h-4 w-4" /></Button>
        {r.id !== me.id && <Button size="icon" variant="ghost" title="Archiver" onClick={async () => { if (await confirm({ title: 'Archiver ce compte ?', danger: true })) { await api(`/users/${r.id}/archive`, { body: {} }); qc.invalidateQueries({ queryKey: ['users'] }); } }}><UserX className="h-4 w-4 text-red-500" /></Button>}
      </>} />}
      {tab === 'roles' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(meta.data?.roles ?? []).map((r: any) => {
            const set = new Set<string>((meta.data?.role_permissions ?? []).filter((x: any) => x.role_id === r.id).map((x: any) => x.code));
            return <Card key={r.id}><div className="mb-2 flex items-center justify-between"><Badge tone={roleTone[r.code]}>{r.name}</Badge><span className="text-xs text-zinc-500">{r.code === 'super_admin' ? 'tous' : set.size} droits</span></div>
              {r.code !== 'super_admin' && <Button size="sm" variant="outline" onClick={() => setRoleEdit({ role: r.code, perms: set })}>Modifier les droits</Button>}</Card>;
          })}
        </div>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? 'Modifier le compte' : 'Nouveau compte'} size="lg" footer={<Button onClick={save}>Enregistrer</Button>}>
        {form && <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nom affiché" required><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></Field>
            <Field label="Rôle"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="super_admin">Super Admin</option><option value="admin">Administrateur</option><option value="receptionist">Réceptionniste</option><option value="coach">Coach</option></Select></Field>
            <Field label="Employé lié" hint="Nécessaire pour le pointage / planning personnel"><Select value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })}><option value="">—</option>{emps.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}</Select></Field>
            {form.id && <Field label="Actif"><label className="flex h-10 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-lime-400" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />Oui</label></Field>}
          </div>
          <details className="rounded-xl border border-zinc-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-sm font-semibold">Permissions personnalisées (en plus / en moins du rôle)</summary>
            <div className="mt-3 grid max-h-72 gap-1 overflow-auto text-xs sm:grid-cols-3">{perms.map((p) => {
              const st = form.extra.includes(p.code) ? 'extra' : form.denied.includes(p.code) ? 'denied' : '';
              return <Select key={p.code} className="h-8 text-xs" value={st} onChange={(e) => setForm({ ...form, extra: e.target.value === 'extra' ? [...form.extra.filter((x: string) => x !== p.code), p.code] : form.extra.filter((x: string) => x !== p.code), denied: e.target.value === 'denied' ? [...form.denied.filter((x: string) => x !== p.code), p.code] : form.denied.filter((x: string) => x !== p.code) })}><option value="">{p.code} — selon rôle</option><option value="extra">{p.code} — ACCORDÉ</option><option value="denied">{p.code} — REFUSÉ</option></Select>;
            })}</div>
          </details>
        </div>}
      </Modal>
      <Modal open={!!roleEdit} onClose={() => setRoleEdit(null)} title={`Droits du rôle ${roleEdit?.role}`} size="xl" footer={<Button onClick={async () => { await api(`/users/roles/${roleEdit!.role}/permissions`, { body: { permissions: [...roleEdit!.perms] } }); toast('success', 'Droits mis à jour'); setRoleEdit(null); meta.refetch(); }}>Enregistrer</Button>}>
        {roleEdit && <table className="w-full text-sm"><thead><tr className="text-xs uppercase text-zinc-500"><th className="text-start">Module</th><th>Lire</th><th>Écrire</th><th>Supprimer</th></tr></thead><tbody>{modules.map((m) => <tr key={m} className="border-b border-zinc-100 dark:border-white/5"><td className="py-1.5 font-mono text-xs">{m}</td>{['read', 'write', 'delete'].map((a) => { const c = `${m}:${a}`; return <td key={a} className="text-center"><input type="checkbox" className="h-4 w-4 accent-lime-400" checked={roleEdit.perms.has(c)} onChange={(e) => { const s = new Set(roleEdit.perms); e.target.checked ? s.add(c) : s.delete(c); setRoleEdit({ ...roleEdit, perms: s }); }} /></td>; })}</tr>)}</tbody></table>}
      </Modal>
      <Modal open={!!code} onClose={() => setCode(null)} title="Code d’accès généré" size="sm" footer={<Button onClick={() => setCode(null)}>J’ai noté le code</Button>}>
        <p className="text-sm">Code de <b>{code?.name}</b> :</p>
        <div className="my-4 flex items-center justify-between rounded-2xl bg-ink p-4 font-mono text-2xl tracking-widest text-brand">{code?.code}<Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(code!.code); toast('success', 'Copié'); }}><Copy className="h-4 w-4 text-white" /></Button></div>
        <p className="text-xs text-red-500">Ce code ne sera plus jamais affiché. Transmettez-le de façon sécurisée.</p>
      </Modal>
    </div>
  );
}

// ======================= SETTINGS =======================
export function SettingsPage() {
  const { can } = useAuth();
  const { toast } = useUI();
  const [tab, setTab] = useState<'company' | 'expcat' | 'audit'>('company');
  const { data, refetch } = useQuery({ queryKey: ['company'], queryFn: () => api('/settings/company') });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const [auditPage, setAuditPage] = useState(1);
  const audit = useQuery({ queryKey: ['audit', auditPage], queryFn: () => api('/audit', { query: { page: auditPage } }), enabled: tab === 'audit' });
  const fields: [string, string, string?][] = [['company_name', 'Nom commercial'], ['legal_name', 'Raison sociale'], ['tax_id', 'Matricule fiscal'], ['address', 'Adresse'], ['phone', 'Téléphone'], ['email', 'Email'], ['currency', 'Devise'], ['timezone', 'Fuseau horaire'], ['default_vat_bp', 'TVA par défaut (points de base, ex. 1900 = 19 %)', 'à valider par le comptable'], ['stamp_duty', 'Timbre fiscal facture (millimes)', 'à valider par le comptable'], ['signatory', 'Signataire des documents'], ['invoice_footer', 'Mention bas de page des documents']];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl uppercase tracking-wide">Paramètres</h1>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'company', label: 'Entreprise & documents' }, { value: 'expcat', label: 'Catégories de dépenses' }, ...(can('audit:read') ? [{ value: 'audit' as const, label: 'Journal d’audit' }] : [])]} />
      {tab === 'company' && f && (
        <Card>
          <fieldset disabled={!can('settings:write')} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map(([k, l, h]) => <Field key={k} label={l} hint={h}><Input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
            <Field label="Paramètres validés par le comptable"><Select value={f.accountant_validated ?? '0'} onChange={(e) => setF({ ...f, accountant_validated: e.target.value })}><option value="0">Non</option><option value="1">Oui</option></Select></Field>
          </fieldset>
          {can('settings:write') && <Button className="mt-4" onClick={async () => { try { await api('/settings/company', { method: 'PUT', body: f }); resetCompanyCache(); toast('success', 'Paramètres enregistrés'); refetch(); } catch (e: any) { toast('error', e.message); } }}><Save className="h-4 w-4" />Enregistrer</Button>}
        </Card>
      )}
      {tab === 'expcat' && <Resource title="Catégories de dépenses" endpoint="/expense-categories" module="expenses" deletable columns={[{ key: 'code', label: 'Code', className: 'font-mono text-xs' }, { key: 'name', label: 'Nom' }]} fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Nom', required: true }]} />}
      {tab === 'audit' && <DataTable title="Journal d'audit" rows={audit.data?.data ?? []} total={audit.data?.total} page={auditPage} pageSize={50} onPage={setAuditPage} loading={audit.isLoading} columns={[
        { key: 'created_at', label: 'Date', render: (r) => fmtDateTime(r.created_at) }, { key: 'user_name', label: 'Utilisateur' }, { key: 'action', label: 'Action', render: (r) => <Badge tone={r.action.includes('fail') ? 'red' : 'zinc'}>{r.action}</Badge>, exportValue: (r) => r.action },
        { key: 'entity', label: 'Entité' }, { key: 'entity_id', label: 'ID' }, { key: 'details', label: 'Détails', render: (r) => <span className="line-clamp-1 max-w-md font-mono text-xs">{r.details}</span> }, { key: 'ip', label: 'IP', hideOnMobile: true },
      ]} />}
    </div>
  );
}
