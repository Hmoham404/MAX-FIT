import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm } from '../lib/auth';
import { zDate, zMoney } from '../lib/crud';
import { audit, HttpError, nextNumber, nowISO, parseJSON, todayISO } from '../lib/util';

const payroll = new Hono<AppEnv>();
const zPeriod = z.string().regex(/^\d{4}-\d{2}$/);

function monthEnd(period: string) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

async function rulesAt(db: D1Database, date: string) {
  const rows = await db
    .prepare(
      `SELECT r.* FROM payroll_rules r WHERE r.effective_from = (SELECT MAX(effective_from) FROM payroll_rules r2 WHERE r2.code = r.code AND r2.effective_from <= ?)`,
    )
    .bind(date)
    .all<{ code: string; value_json: string; validated_by_accountant: number; label: string; effective_from: string }>();
  const map: Record<string, { value: any; validated: boolean; label: string; effective_from: string }> = {};
  for (const r of rows.results) map[r.code] = { value: parseJSON(r.value_json, {}), validated: !!r.validated_by_accountant, label: r.label, effective_from: r.effective_from };
  return map;
}

function irppMonthly(taxableMonthly: number, rule: any) {
  const brackets: { upTo: number | null; rate_bp: number }[] = rule?.brackets ?? [];
  if (!brackets.length) return 0;
  let annual = taxableMonthly * 12;
  const pe = Math.min(Math.round((annual * (rule.professional_expenses_bp ?? 0)) / 10000), rule.professional_expenses_cap || Infinity);
  annual = Math.max(0, annual - pe);
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (annual > lower) tax += ((Math.min(annual, upper) - lower) * b.rate_bp) / 10000;
    lower = upper;
  }
  return Math.round(tax / 12);
}

type Item = { kind: 'earning' | 'deduction'; code: string; label: string; base?: string; amount: number; is_manual?: number };

async function computeRecord(db: D1Database, periodId: number, period: string, emp: Record<string, any>, rules: Awaited<ReturnType<typeof rulesAt>>) {
  const from = period + '-01';
  const to = monthEnd(period);
  const att = await db
    .prepare(
      `SELECT COALESCE(SUM(worked_minutes),0) AS worked, COALESCE(SUM(overtime_minutes),0) AS overtime,
        SUM(CASE WHEN day_type='absent' THEN 1 ELSE 0 END) AS absent_days,
        COALESCE(SUM(CASE WHEN day_type='absent' AND expected_start IS NOT NULL AND expected_end IS NOT NULL
          THEN (CAST(substr(expected_end,1,2) AS INT)*60+CAST(substr(expected_end,4,2) AS INT)) - (CAST(substr(expected_start,1,2) AS INT)*60+CAST(substr(expected_start,4,2) AS INT)) END),0) AS absent_minutes
       FROM employee_attendance WHERE employee_id = ? AND work_date BETWEEN ? AND ? AND is_validated = 1`,
    )
    .bind(emp.id, from, to)
    .first<{ worked: number; overtime: number; absent_days: number; absent_minutes: number }>();
  const unpaid = await db
    .prepare("SELECT COALESCE(SUM(days),0) AS d FROM leaves WHERE employee_id = ? AND status='approved' AND leave_type IN ('unpaid','unjustified_absence') AND start_date <= ? AND end_date >= ?")
    .bind(emp.id, to, from)
    .first<{ d: number }>();
  const sessions = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM schedules s JOIN coaches co ON co.id = COALESCE(s.replacement_coach_id, s.coach_id)
       WHERE co.employee_id = ? AND s.session_date BETWEEN ? AND ? AND s.status IN ('scheduled','done','full') AND s.session_date <= ?`,
    )
    .bind(emp.id, from, to, todayISO())
    .first<{ n: number }>();
  const advances = await db.prepare('SELECT COALESCE(SUM(amount),0) AS a FROM salary_advances WHERE employee_id = ? AND period = ?').bind(emp.id, period).first<{ a: number }>();

  const items: Item[] = [];
  const monthlyHours = Number(rules.monthly_hours?.value?.hours || 0);
  const hourly = emp.pay_mode === 'hourly' ? emp.hourly_rate : monthlyHours > 0 ? Math.round(emp.base_salary / monthlyHours) : emp.hourly_rate;
  const worked = att?.worked ?? 0;
  const nSessions = sessions?.n ?? 0;

  if (['monthly', 'mixed'].includes(emp.pay_mode) && emp.base_salary > 0) items.push({ kind: 'earning', code: 'base', label: 'Salaire de base', base: 'mensuel', amount: emp.base_salary });
  if (emp.pay_mode === 'hourly' && worked > 0) items.push({ kind: 'earning', code: 'hours', label: 'Heures normales', base: `${(worked / 60).toFixed(2)} h × ${(emp.hourly_rate / 1000).toFixed(3)}`, amount: Math.round((worked / 60) * emp.hourly_rate) });
  if (['per_session', 'mixed'].includes(emp.pay_mode) && nSessions > 0 && emp.session_rate > 0)
    items.push({ kind: 'earning', code: 'sessions', label: 'Séances réalisées', base: `${nSessions} × ${(emp.session_rate / 1000).toFixed(3)}`, amount: nSessions * emp.session_rate });
  const otRate = Number(rules.overtime_rate?.value?.rate_bp || 0);
  if ((att?.overtime ?? 0) > 0 && hourly > 0 && emp.pay_mode !== 'per_session') {
    const amt = Math.round(((att!.overtime / 60) * hourly * (10000 + otRate)) / 10000);
    items.push({ kind: 'earning', code: 'overtime', label: 'Heures supplémentaires', base: `${(att!.overtime / 60).toFixed(2)} h (+${otRate / 100}%)`, amount: amt });
  }
  if (emp.pay_mode === 'monthly' || emp.pay_mode === 'mixed') {
    const absMin = att?.absent_minutes ?? 0;
    if (absMin > 0 && hourly > 0) items.push({ kind: 'deduction', code: 'absence', label: 'Retenue absences', base: `${(absMin / 60).toFixed(2)} h`, amount: Math.round((absMin / 60) * hourly) });
  }
  return { items, worked, overtime: att?.overtime ?? 0, sessions: nSessions, absence_days: (att?.absent_days ?? 0) + (unpaid?.d ?? 0), advances: advances?.a ?? 0 };
}

async function finalize(db: D1Database, recordId: number, rules: Awaited<ReturnType<typeof rulesAt>>) {
  const items = await db.prepare('SELECT * FROM payroll_items WHERE record_id = ?').bind(recordId).all<{ kind: string; code: string; amount: number }>();
  const rec = await db.prepare('SELECT advances FROM payroll_records WHERE id = ?').bind(recordId).first<{ advances: number }>();
  const earnings = items.results.filter((i) => i.kind === 'earning').reduce((a, i) => a + i.amount, 0);
  const preDeductions = items.results.filter((i) => i.kind === 'deduction' && ['absence'].includes(i.code)).reduce((a, i) => a + i.amount, 0);
  const otherDeductions = items.results.filter((i) => i.kind === 'deduction' && !['absence', 'cnss', 'irpp', 'css'].includes(i.code)).reduce((a, i) => a + i.amount, 0);
  const gross = Math.max(0, earnings - preDeductions);
  const cnss = Math.round((gross * Number(rules.cnss_employee?.value?.rate_bp || 0)) / 10000);
  const taxable = gross - cnss;
  const irpp = irppMonthly(taxable, rules.irpp_brackets?.value);
  const css = Math.round((taxable * Number(rules.css?.value?.rate_bp || 0)) / 10000);
  await db.batch([
    db.prepare("DELETE FROM payroll_items WHERE record_id = ? AND code IN ('cnss','irpp','css') AND is_manual = 0").bind(recordId),
    ...(cnss ? [db.prepare("INSERT INTO payroll_items (record_id, kind, code, label, base, amount) VALUES (?, 'deduction', 'cnss', 'Cotisation CNSS salarié', ?, ?)").bind(recordId, `${Number(rules.cnss_employee?.value?.rate_bp || 0) / 100}%`, cnss)] : []),
    ...(irpp ? [db.prepare("INSERT INTO payroll_items (record_id, kind, code, label, base, amount) VALUES (?, 'deduction', 'irpp', 'IRPP', 'barème', ?)").bind(recordId, irpp)] : []),
    ...(css ? [db.prepare("INSERT INTO payroll_items (record_id, kind, code, label, base, amount) VALUES (?, 'deduction', 'css', 'CSS', ?, ?)").bind(recordId, `${Number(rules.css?.value?.rate_bp || 0) / 100}%`, css)] : []),
  ]);
  const net = gross - cnss - irpp - css - otherDeductions;
  await db
    .prepare("UPDATE payroll_records SET gross = ?, social_contrib = ?, irpp = ?, other_deductions = ?, net = ?, net_to_pay = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(gross, cnss, irpp + css, otherDeductions, net, net - (rec?.advances ?? 0), recordId)
    .run();
}

async function periodRow(db: D1Database, period: string) {
  return db.prepare('SELECT * FROM payroll_periods WHERE period = ?').bind(period).first<{ id: number; period: string; status: string }>();
}

// ---- rules ----
payroll.get('/rules', async (c) => {
  assertPerm(c.get('user'), 'payroll:read');
  const rows = await c.env.DB.prepare('SELECT * FROM payroll_rules ORDER BY code, effective_from DESC').all();
  return c.json({ data: rows.results });
});
payroll.post('/rules', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const b = z.object({ code: z.enum(['cnss_employee', 'cnss_employer', 'css', 'irpp_brackets', 'overtime_rate', 'monthly_hours']), label: z.string().min(2), value_json: z.string(), effective_from: zDate, notes: z.string().optional().nullable() }).parse(await c.req.json());
  JSON.parse(b.value_json);
  await c.env.DB.prepare('INSERT INTO payroll_rules (code, label, value_json, effective_from, notes, created_by) VALUES (?,?,?,?,?,?) ON CONFLICT(code, effective_from) DO UPDATE SET value_json = excluded.value_json, label = excluded.label, notes = excluded.notes, validated_by_accountant = 0')
    .bind(b.code, b.label, b.value_json, b.effective_from, b.notes ?? null, c.get('user').id).run();
  await audit(c, 'payroll_rule', 'payroll_rules', b.code, b);
  return c.json({ ok: true });
});
payroll.post('/rules/:id{[0-9]+}/validate', async (c) => {
  assertPerm(c.get('user'), 'settings:write');
  await c.env.DB.prepare('UPDATE payroll_rules SET validated_by_accountant = 1 WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await audit(c, 'payroll_rule_validate', 'payroll_rules', c.req.param('id'));
  return c.json({ ok: true });
});

// ---- periods ----
payroll.get('/periods', async (c) => {
  assertPerm(c.get('user'), 'payroll:read');
  const rows = await c.env.DB.prepare(
    `SELECT p.*, COUNT(r.id) AS employees, COALESCE(SUM(r.gross),0) AS gross, COALESCE(SUM(r.net_to_pay),0) AS net_to_pay
     FROM payroll_periods p LEFT JOIN payroll_records r ON r.period_id = p.id GROUP BY p.id ORDER BY p.period DESC`,
  ).all();
  return c.json({ data: rows.results });
});

payroll.post('/periods', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const { period } = z.object({ period: zPeriod }).parse(await c.req.json());
  let p = await periodRow(c.env.DB, period);
  if (p && p.status !== 'draft') throw new HttpError(409, 'Paie validée : verrouillée');
  if (!p) {
    await c.env.DB.prepare('INSERT INTO payroll_periods (period) VALUES (?)').bind(period).run();
    p = await periodRow(c.env.DB, period);
  }
  const rules = await rulesAt(c.env.DB, monthEnd(period));
  const emps = await c.env.DB.prepare(
    "SELECT * FROM employees WHERE archived_at IS NULL AND status = 'active' AND (hire_date IS NULL OR hire_date <= ?)",
  ).bind(monthEnd(period)).all<Record<string, any>>();
  for (const e of emps.results) {
    const calc = await computeRecord(c.env.DB, p!.id, period, e, rules);
    let rec = await c.env.DB.prepare('SELECT id FROM payroll_records WHERE period_id = ? AND employee_id = ?').bind(p!.id, e.id).first<{ id: number }>();
    if (!rec) {
      const number = await nextNumber(c.env.DB, 'PAIE', period);
      rec = await c.env.DB.prepare('INSERT INTO payroll_records (period_id, employee_id, number) VALUES (?,?,?) RETURNING id').bind(p!.id, e.id, number).first<{ id: number }>();
    }
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM payroll_items WHERE record_id = ? AND is_manual = 0').bind(rec!.id),
      ...calc.items.map((i) => c.env.DB.prepare('INSERT INTO payroll_items (record_id, kind, code, label, base, amount) VALUES (?,?,?,?,?,?)').bind(rec!.id, i.kind, i.code, i.label, i.base ?? null, i.amount)),
      c.env.DB.prepare('UPDATE payroll_records SET worked_minutes = ?, overtime_minutes = ?, sessions_count = ?, absence_days = ?, advances = ? WHERE id = ?').bind(calc.worked, calc.overtime, calc.sessions, calc.absence_days, calc.advances, rec!.id),
    ]);
    await finalize(c.env.DB, rec!.id, rules);
  }
  await audit(c, 'payroll_compute', 'payroll_periods', period);
  return c.json({ ok: true, rules_validated: Object.values(rules).every((r) => r.validated) });
});

payroll.get('/periods/:period', async (c) => {
  assertPerm(c.get('user'), 'payroll:read');
  const period = zPeriod.parse(c.req.param('period'));
  const p = await periodRow(c.env.DB, period);
  if (!p) return c.json(null);
  const recs = await c.env.DB.prepare(
    `SELECT r.*, e.matricule, e.first_name, e.last_name, e.position, e.pay_mode, e.cnss_number FROM payroll_records r JOIN employees e ON e.id = r.employee_id WHERE r.period_id = ? ORDER BY e.last_name`,
  ).bind(p.id).all<Record<string, any>>();
  const items = await c.env.DB.prepare('SELECT i.* FROM payroll_items i JOIN payroll_records r ON r.id = i.record_id WHERE r.period_id = ? ORDER BY i.kind DESC, i.id').bind(p.id).all<Record<string, any>>();
  const rules = await rulesAt(c.env.DB, monthEnd(period));
  return c.json({
    ...p,
    rules,
    rules_validated: Object.values(rules).every((r) => r.validated),
    records: recs.results.map((r) => ({ ...r, items: items.results.filter((i) => i.record_id === r.id) })),
  });
});

async function assertDraftRecord(c: Context<AppEnv>, recordId: number) {
  const r = await c.env.DB.prepare('SELECT p.status, p.period FROM payroll_records r JOIN payroll_periods p ON p.id = r.period_id WHERE r.id = ?').bind(recordId).first<{ status: string; period: string }>();
  if (!r) throw new HttpError(404, 'Fiche introuvable');
  if (r.status !== 'draft') throw new HttpError(409, 'Paie validée : verrouillée');
  return r;
}

payroll.post('/records/:id{[0-9]+}/items', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const id = Number(c.req.param('id'));
  const r = await assertDraftRecord(c, id);
  const b = z.object({ kind: z.enum(['earning', 'deduction']), code: z.enum(['bonus', 'commission', 'allowance', 'deduction_other', 'advance_other']), label: z.string().min(2).max(120), amount: zMoney }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO payroll_items (record_id, kind, code, label, amount, is_manual) VALUES (?,?,?,?,?,1)').bind(id, b.kind, b.code, b.label, b.amount).run();
  await finalize(c.env.DB, id, await rulesAt(c.env.DB, monthEnd(r.period)));
  await audit(c, 'payroll_item_add', 'payroll_records', id, b);
  return c.json({ ok: true });
});

payroll.delete('/items/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const item = await c.env.DB.prepare('SELECT record_id, is_manual FROM payroll_items WHERE id = ?').bind(Number(c.req.param('id'))).first<{ record_id: number; is_manual: number }>();
  if (!item) throw new HttpError(404, 'Introuvable');
  if (!item.is_manual) throw new HttpError(400, 'Seuls les éléments manuels peuvent être supprimés');
  const r = await assertDraftRecord(c, item.record_id);
  await c.env.DB.prepare('DELETE FROM payroll_items WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await finalize(c.env.DB, item.record_id, await rulesAt(c.env.DB, monthEnd(r.period)));
  await audit(c, 'payroll_item_delete', 'payroll_records', item.record_id);
  return c.json({ ok: true });
});

payroll.post('/periods/:period/validate', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const period = zPeriod.parse(c.req.param('period'));
  const { acknowledge } = z.object({ acknowledge: z.boolean().optional() }).parse(await c.req.json().catch(() => ({})));
  const p = await periodRow(c.env.DB, period);
  if (!p || p.status !== 'draft') throw new HttpError(409, 'Période introuvable ou déjà validée');
  const rules = await rulesAt(c.env.DB, monthEnd(period));
  if (!Object.values(rules).every((r) => r.validated) && !acknowledge) {
    throw new HttpError(412, 'Les règles fiscales/sociales ne sont pas validées par le comptable. Confirmez pour continuer.');
  }
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'validated', validated_at = ?, validated_by = ? WHERE id = ?").bind(nowISO(), c.get('user').id, p.id).run();
  await audit(c, 'payroll_validate', 'payroll_periods', period, { acknowledged_unvalidated_rules: !!acknowledge });
  return c.json({ ok: true });
});

payroll.post('/periods/:period/pay', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const period = zPeriod.parse(c.req.param('period'));
  const { method, paid_at } = z.object({ method: z.enum(['cash', 'transfer', 'cheque', 'other']), paid_at: zDate.optional() }).parse(await c.req.json());
  const p = await periodRow(c.env.DB, period);
  if (!p || p.status !== 'validated') throw new HttpError(409, 'La paie doit être validée avant paiement');
  const cat = await c.env.DB.prepare("SELECT id FROM expense_categories WHERE code = 'salaries'").first<{ id: number }>();
  const recs = await c.env.DB.prepare("SELECT r.*, e.first_name || ' ' || e.last_name AS name FROM payroll_records r JOIN employees e ON e.id = r.employee_id WHERE r.period_id = ? AND r.paid_at IS NULL AND r.net_to_pay > 0").bind(p.id).all<Record<string, any>>();
  const date = paid_at || todayISO();
  for (const r of recs.results) {
    const ref = await nextNumber(c.env.DB, 'DEP', date.slice(0, 4));
    // The salary expense is the ONLY salary entry in financial statistics (no double counting).
    const e = await c.env.DB.prepare(
      'INSERT INTO expenses (reference, category_id, label, amount, method, spent_at, payroll_record_id, created_by) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
    ).bind(ref, cat!.id, `Salaire ${period} — ${r.name} (${r.number})`, r.net_to_pay, method, date, r.id, c.get('user').id).first<{ id: number }>();
    await c.env.DB.prepare('UPDATE payroll_records SET paid_at = ?, expense_id = ? WHERE id = ?').bind(date, e!.id, r.id).run();
  }
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'paid' WHERE id = ?").bind(p.id).run();
  await audit(c, 'payroll_pay', 'payroll_periods', period, { count: recs.results.length, method });
  return c.json({ ok: true, paid: recs.results.length });
});

payroll.post('/periods/:period/close', async (c) => {
  assertPerm(c.get('user'), 'payroll:write');
  const period = zPeriod.parse(c.req.param('period'));
  const p = await periodRow(c.env.DB, period);
  if (!p || p.status !== 'paid') throw new HttpError(409, 'La paie doit être payée avant clôture');
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'closed', closed_at = ? WHERE id = ?").bind(nowISO(), p.id).run();
  await audit(c, 'payroll_close', 'payroll_periods', period);
  return c.json({ ok: true });
});

/** Correction of a validated (not paid) payroll: super admin only, always logged. */
payroll.post('/periods/:period/reopen', async (c) => {
  assertPerm(c.get('user'), 'settings:write');
  const period = zPeriod.parse(c.req.param('period'));
  const { reason } = z.object({ reason: z.string().min(5) }).parse(await c.req.json());
  const p = await periodRow(c.env.DB, period);
  if (!p || p.status !== 'validated') throw new HttpError(409, 'Seule une paie validée et non payée peut être rouverte');
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'draft' WHERE id = ?").bind(p.id).run();
  await audit(c, 'payroll_reopen', 'payroll_periods', period, { reason });
  return c.json({ ok: true });
});

export default payroll;
