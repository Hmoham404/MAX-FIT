// Functional & security tests against a running API.
// Usage:  API_URL=https://maxfit-api.xxx.workers.dev ADMIN_CODE=XXXX-XXXX-XXXX node --test tests/
// WARNING: creates test records (names prefixed "TEST") — run against the demo/dev database only.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const API = process.env.API_URL;
const CODE = process.env.ADMIN_CODE;
if (!API || !CODE) throw new Error('API_URL and ADMIN_CODE env vars are required');
let token;
const today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function call(path, { method, body, tok = token } = {}) {
  const res = await fetch(API + '/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const ctx = {};
before(async () => {
  const r = await call('/auth/login', { body: { code: CODE }, tok: null });
  assert.equal(r.status, 200, 'admin login');
  token = r.data.token;
});

test('private API is protected without token', async () => {
  for (const p of ['/clients', '/dashboard', '/payroll/periods', '/users']) {
    const r = await call(p, { tok: null });
    assert.equal(r.status, 401, p);
  }
});

test('public API exposes no personal data', async () => {
  const r = await call('/public/site', { tok: null });
  assert.equal(r.status, 200);
  const s = JSON.stringify(r.data);
  for (const forbidden of ['cin', 'base_salary', 'cnss_number', 'bank_rib', '"phone":"2', 'matricule']) assert.ok(!s.includes(forbidden), `public leak: ${forbidden}`);
});

test('wrong access code is rejected', async () => {
  const r = await call('/auth/login', { body: { code: 'WRONG-CODE-0000' }, tok: null });
  assert.equal(r.status, 401);
});

test('create client (adult) + duplicate detection', async () => {
  const body = { first_name: 'TEST', last_name: 'Client' + Date.now(), phone: '20' + String(Date.now()).slice(-6), birth_date: '1995-05-10' };
  const r = await call('/clients', { body });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.matricule, /^MF-\d{4}-\d{5}$/);
  assert.equal(r.data.category_code, 'adult');
  ctx.client = r.data;
  const dup = await call('/clients', { body });
  assert.equal(dup.status, 409, 'duplicate detected');
});

test('minor requires guardian', async () => {
  const r = await call('/clients', { body: { first_name: 'TEST', last_name: 'Kid' + Date.now(), phone: '55' + String(Date.now()).slice(-6), birth_date: addDays(today, -365 * 8) } });
  assert.equal(r.status, 400);
});

test('open cash register', async () => {
  const cur = await call('/cash/current');
  if (!cur.data) {
    const r = await call('/cash/open', { body: { opening_balance: 100000 } });
    assert.equal(r.status, 201);
  }
});

test('subscription: expiry date, partial & full payment, receipt', async () => {
  const plans = await call('/plans', { body: undefined });
  const plan = plans.data.data.find((p) => p.category_name === 'Adulte' && p.duration_unit === 'month' && p.duration_value === 1);
  assert.ok(plan, 'monthly adult plan');
  const r = await call('/subscriptions', { body: { client_id: ctx.client.id, plan_id: plan.id, start_date: '2026-01-31', include_registration_fee: false, initial_payment: 20000, method: 'cash' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const s = r.data.subscription;
  assert.equal(s.end_date, '2026-02-27', 'month from Jan 31 ends Feb 27 (inclusive)');
  assert.equal(s.payment_status, 'partial');
  assert.ok(r.data.receipt.receipt_number.startsWith('REC-'));
  ctx.sub = s;
  const over = await call(`/subscriptions/${s.id}/pay`, { body: { amount: s.remaining + 1000, method: 'cash' } });
  assert.equal(over.status, 400, 'overpayment refused');
  const full = await call(`/subscriptions/${s.id}/pay`, { body: { amount: s.remaining, method: 'card' } });
  assert.equal(full.status, 200);
  assert.equal(full.data.subscription.payment_status, 'paid');
  const rec = await call(`/receipts/${full.data.receipt.receipt_id}`);
  assert.equal(rec.status, 200);
  assert.equal(rec.data.remaining, 0);
});

test('renewal starts the day after previous end', async () => {
  const r = await call(`/subscriptions/${ctx.sub.id}/renew`, { body: { start_date: addDays(ctx.sub.end_date, 1) } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.subscription.start_date, addDays(ctx.sub.end_date, 1));
});

test('quotation → accepted → invoice', async () => {
  const q = await call('/quotations', { body: { prospect_name: 'TEST Société', vat_rate_bp: 1900, items: [{ designation: 'Pack', quantity: 2, unit_price: 100000 }] } });
  assert.equal(q.status, 201);
  assert.match(q.data.number, /^DEV-\d{4}-\d{4}$/);
  const bad = await call(`/quotations/${q.data.id}/convert`, { body: {} });
  assert.equal(bad.status, 409, 'not accepted yet');
  await call(`/quotations/${q.data.id}/status`, { body: { status: 'accepted' } });
  const inv = await call(`/quotations/${q.data.id}/convert`, { body: {} });
  assert.equal(inv.status, 201);
  assert.match(inv.data.number, /^FAC-\d{4}-\d{4}$/);
  const d = await call(`/invoices/${inv.data.id}`);
  assert.equal(d.data.total_ht, 200000);
  assert.equal(d.data.total_vat, 38000);
});

test('create coach + schedule + conflict detection', async () => {
  const e = await call('/employees', { body: { first_name: 'TEST', last_name: 'Coach' + Date.now(), position: 'coach', pay_mode: 'per_session', session_rate: 20000 } });
  assert.equal(e.status, 201, JSON.stringify(e.data));
  const coaches = await call('/coaches', { body: undefined });
  const coach = coaches.data.data.find((c) => c.employee_id === e.data.id);
  assert.ok(coach, 'coach profile auto-created');
  ctx.employee = e.data;
  const date = addDays(today, 60);
  const s1 = await call('/schedules', { body: { activity_id: 1, coach_id: coach.id, session_date: date, start_time: '10:00', end_time: '11:00' } });
  assert.equal(s1.status, 201, JSON.stringify(s1.data));
  const s2 = await call('/schedules', { body: { activity_id: 2, coach_id: coach.id, session_date: date, start_time: '10:30', end_time: '11:30' } });
  assert.equal(s2.status, 409, 'coach conflict');
  ctx.schedule = s1.data.created[0];
  const pub = await call(`/public/schedule?from=${date}&to=${date}`, { tok: null });
  assert.ok(pub.data.data.some((x) => x.id === ctx.schedule), 'synced to public planning');
});

test('staff attendance + payroll preparation + payslip data', async () => {
  const period = addDays(today, -40).slice(0, 7);
  const day = period + '-10';
  const a = await call('/attendance', { body: { employee_id: ctx.employee.id, work_date: day, check_in: '08:00', check_out: '17:00', break_minutes: 60, expected_start: '08:00', expected_end: '16:00' } });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const list = await call(`/attendance?from=${day}&to=${day}&employee_id=${ctx.employee.id}`);
  assert.equal(list.data.data[0].worked_minutes, 480);
  assert.equal(list.data.data[0].overtime_minutes, 60);
  await call('/attendance/validate', { body: { ids: [list.data.data[0].id] } });
  const p = await call('/payroll/periods', { body: { period } });
  if (p.status === 409) return; // period already validated in a previous run
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const d = await call(`/payroll/periods/${period}`);
  const rec = d.data.records.find((r) => r.employee_id === ctx.employee.id);
  assert.ok(rec, 'payroll record');
  assert.match(rec.number, /^PAIE-\d{4}-\d{2}-\d{4}$/);
});

test('cash closure computes the gap', async () => {
  const cur = await call('/cash/current');
  const r = await call('/cash/close', { body: { actual_balance: cur.data.theoretical_balance } });
  assert.equal(r.status, 200);
  assert.equal(r.data.closure.difference, 0);
});

test('CMS: draft → publish updates public site', async () => {
  const w = await call('/settings/website');
  const site = w.data.site.draft;
  const original = site.name;
  await call('/settings/website/site', { method: 'PUT', body: { ...site, name: 'MAX FIT TEST' } });
  let pub = await call('/public/site', { tok: null });
  assert.equal(pub.data.site.name, original, 'draft not public yet');
  await call('/settings/website/publish', { body: {} });
  pub = await call('/public/site', { tok: null });
  assert.equal(pub.data.site.name, 'MAX FIT TEST');
  await call('/settings/website/site', { method: 'PUT', body: { ...site, name: original } });
  await call('/settings/website/publish', { body: {} });
});

test('receptionist restrictions are enforced server-side', async () => {
  const u = await call('/users', { body: { display_name: 'TEST Réception', role: 'receptionist' } });
  assert.equal(u.status, 201);
  const login = await call('/auth/login', { body: { code: u.data.code }, tok: null });
  const rt = login.data.token;
  for (const p of ['/payroll/periods', '/employees', '/expenses', '/users', '/reports/profitability']) {
    const r = await call(p, { tok: rt });
    assert.equal(r.status, 403, `receptionist must not access ${p}`);
  }
  const ok = await call('/clients', { tok: rt });
  assert.equal(ok.status, 200);
  const dash = await call('/dashboard', { tok: rt });
  assert.equal(dash.data.finance, false, 'no profit data for receptionist');
  assert.equal(dash.data.kpis.revenue, undefined);
  await call(`/users/${u.data.id}/archive`, { body: {} });
});

test('client with financial history cannot be deleted (archive instead)', async () => {
  const r = await call(`/clients/${ctx.client.id}`, { method: 'DELETE' });
  assert.equal(r.status, 409);
  const a = await call(`/clients/${ctx.client.id}/archive`, { body: {} });
  assert.equal(a.status, 200);
});

test('data persists (re-read after write)', async () => {
  const r = await call(`/clients/${ctx.client.id}`);
  assert.equal(r.data.id, ctx.client.id);
  assert.ok(r.data.archived_at);
});
