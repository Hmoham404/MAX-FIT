import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm, can } from '../lib/auth';
import { zDate, zMoney } from '../lib/crud';
import { openRegisterFor, recordPayment } from '../lib/payments';
import { audit, HttpError, nextNumber, nowISO, todayISO, addDays } from '../lib/util';

// ===================== PAYMENTS =====================
export const payments = new Hono<AppEnv>();

payments.get('/', async (c) => {
  assertPerm(c.get('user'), 'payments:read');
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(500, Number(q.pageSize) || 25);
  const where = ['p.cancelled_at IS NULL'];
  const params: unknown[] = [];
  if (q.from) (where.push('substr(p.paid_at,1,10) >= ?'), params.push(q.from));
  if (q.to) (where.push('substr(p.paid_at,1,10) <= ?'), params.push(q.to));
  if (q.method) (where.push('p.method = ?'), params.push(q.method));
  if (q.source) (where.push('p.source = ?'), params.push(q.source));
  if (q.client_id) (where.push('p.client_id = ?'), params.push(q.client_id));
  if (q.search) {
    where.push("(p.reference LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR r.number LIKE ?)");
    for (let i = 0; i < 4; i++) params.push(`%${q.search}%`);
  }
  // receptionists only see their own payments
  if (!can(c.get('user'), 'finance_stats:read')) (where.push('p.created_by = ?'), params.push(c.get('user').id));
  const w = 'WHERE ' + where.join(' AND ');
  const from = `payments p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.created_by`;
  const tot = await c.env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(p.amount),0) AS sum FROM ${from} ${w}`).bind(...params).first<{ n: number; sum: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT p.*, c.first_name, c.last_name, c.matricule, r.id AS receipt_id, r.number AS receipt_number, u.display_name AS user_name
     FROM ${from} ${w} ORDER BY p.paid_at DESC, p.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...params, pageSize, (page - 1) * pageSize)
    .all();
  return c.json({ data: rows.results, total: tot?.n ?? 0, sum: tot?.sum ?? 0, page, pageSize });
});

/** Other revenues: single session, private coaching, accessories, other. */
payments.post('/', async (c) => {
  assertPerm(c.get('user'), 'payments:write');
  const b = z
    .object({
      amount: zMoney,
      method: z.enum(['cash', 'transfer', 'card', 'cheque', 'other']),
      source: z.enum(['session', 'coaching', 'accessory', 'registration', 'other']),
      client_id: z.coerce.number().int().positive().optional().nullable(),
      notes: z.string().min(2).max(500),
    })
    .parse(await c.req.json());
  return c.json(await recordPayment(c, b), 201);
});

payments.post('/:id{[0-9]+}/cancel', async (c) => {
  assertPerm(c.get('user'), 'payments:delete');
  const id = Number(c.req.param('id'));
  const { reason } = z.object({ reason: z.string().min(3).max(500) }).parse(await c.req.json());
  const p = await c.env.DB.prepare('SELECT * FROM payments WHERE id = ? AND cancelled_at IS NULL').bind(id).first<{
    id: number; amount: number; subscription_id: number | null; invoice_id: number | null; cash_register_id: number | null; reference: string; method: string;
  }>();
  if (!p) throw new HttpError(404, 'Paiement introuvable');
  const stmts = [c.env.DB.prepare('UPDATE payments SET cancelled_at = ?, notes = COALESCE(notes,\'\') || ? WHERE id = ?').bind(nowISO(), ` [ANNULÉ: ${reason}]`, id)];
  if (p.subscription_id) stmts.push(c.env.DB.prepare('UPDATE subscriptions SET amount_paid = amount_paid - ? WHERE id = ?').bind(p.amount, p.subscription_id));
  if (p.invoice_id) {
    stmts.push(c.env.DB.prepare(
      "UPDATE invoices SET amount_paid = amount_paid - ?, status = CASE WHEN amount_paid - ? <= 0 THEN 'unpaid' ELSE 'partial' END WHERE id = ?",
    ).bind(p.amount, p.amount, p.invoice_id));
  }
  const reg = await openRegisterFor(c);
  if (reg && p.method === 'cash') {
    stmts.push(c.env.DB.prepare(
      "INSERT INTO cash_transactions (register_id, direction, amount, method, reference, justification, payment_id, created_by) VALUES (?, 'out', ?, 'cash', ?, ?, ?, ?)",
    ).bind(reg, p.amount, p.reference, `Annulation paiement: ${reason}`, id, c.get('user').id));
  }
  await c.env.DB.batch(stmts);
  await audit(c, 'payment_cancel', 'payments', id, { reason, amount: p.amount });
  return c.json({ ok: true });
});

// ===================== RECEIPTS =====================
export const receipts = new Hono<AppEnv>();
receipts.get('/', async (c) => {
  assertPerm(c.get('user'), 'receipts:read');
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Number(q.pageSize) || 25);
  const params: unknown[] = [];
  let w = 'WHERE p.cancelled_at IS NULL';
  if (q.search) {
    w += ' AND (r.number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)';
    params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
  }
  if (q.from) (w += ' AND substr(r.issued_at,1,10) >= ?', params.push(q.from));
  if (q.to) (w += ' AND substr(r.issued_at,1,10) <= ?', params.push(q.to));
  const from = 'receipts r JOIN payments p ON p.id = r.payment_id LEFT JOIN clients c ON c.id = r.client_id';
  const tot = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${from} ${w}`).bind(...params).first<{ n: number }>();
  const rows = await c.env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.matricule, p.source FROM ${from} ${w} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
  ).bind(...params, pageSize, (page - 1) * pageSize).all();
  return c.json({ data: rows.results, total: tot?.n ?? 0, page, pageSize });
});
receipts.get('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'receipts:read');
  const r = await c.env.DB.prepare(
    `SELECT r.*, c.first_name, c.last_name, c.matricule, c.phone, p.source, p.notes, p.reference AS payment_reference,
      s.reference AS subscription_reference, s.start_date, s.end_date, s.final_price, s.amount_paid AS subscription_paid,
      pl.name AS plan_name, u.display_name AS user_name
     FROM receipts r JOIN payments p ON p.id = r.payment_id LEFT JOIN clients c ON c.id = r.client_id
     LEFT JOIN subscriptions s ON s.id = r.subscription_id LEFT JOIN subscription_plans pl ON pl.id = s.plan_id
     LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`,
  ).bind(Number(c.req.param('id'))).first();
  if (!r) throw new HttpError(404, 'Reçu introuvable');
  return c.json(r);
});

// ===================== CASH REGISTER =====================
export const cash = new Hono<AppEnv>();

async function registerSummary(c: Context<AppEnv>, id: number) {
  const reg = await c.env.DB.prepare(
    'SELECT r.*, u.display_name AS opened_by_name FROM cash_registers r JOIN users u ON u.id = r.opened_by WHERE r.id = ?',
  ).bind(id).first<Record<string, unknown> & { opening_balance: number; opened_by: number }>();
  if (!reg) throw new HttpError(404, 'Caisse introuvable');
  const sums = await c.env.DB.prepare(
    `SELECT
      COALESCE(SUM(CASE WHEN direction='in' AND method='cash' THEN amount END),0) AS cash_in,
      COALESCE(SUM(CASE WHEN direction='out' AND method='cash' THEN amount END),0) AS cash_out,
      COALESCE(SUM(CASE WHEN direction='in' AND method!='cash' THEN amount END),0) AS other_in,
      COUNT(*) AS n
     FROM cash_transactions WHERE register_id = ?`,
  ).bind(id).first<{ cash_in: number; cash_out: number; other_in: number; n: number }>();
  const tx = await c.env.DB.prepare(
    'SELECT t.*, u.display_name AS user_name FROM cash_transactions t JOIN users u ON u.id = t.created_by WHERE register_id = ? ORDER BY t.id DESC',
  ).bind(id).all();
  const closure = await c.env.DB.prepare('SELECT * FROM cash_closures WHERE register_id = ?').bind(id).first();
  return {
    ...reg,
    ...sums,
    theoretical_balance: reg.opening_balance + (sums?.cash_in ?? 0) - (sums?.cash_out ?? 0),
    transactions: tx.results,
    closure,
  };
}

cash.get('/current', async (c) => {
  assertPerm(c.get('user'), 'cash:read');
  const id = await openRegisterFor(c);
  return c.json(id ? await registerSummary(c, id) : null);
});

cash.get('/registers', async (c) => {
  assertPerm(c.get('user'), 'cash:read');
  const q = c.req.query();
  const params: unknown[] = [];
  let w = 'WHERE 1=1';
  if (!can(c.get('user'), 'finance_stats:read')) (w += ' AND r.opened_by = ?', params.push(c.get('user').id));
  if (q.from) (w += ' AND substr(r.opened_at,1,10) >= ?', params.push(q.from));
  if (q.to) (w += ' AND substr(r.opened_at,1,10) <= ?', params.push(q.to));
  const rows = await c.env.DB.prepare(
    `SELECT r.*, u.display_name AS opened_by_name, cl.theoretical_balance, cl.actual_balance, cl.difference,
      (SELECT COALESCE(SUM(amount),0) FROM cash_transactions t WHERE t.register_id = r.id AND direction='in') AS total_in,
      (SELECT COALESCE(SUM(amount),0) FROM cash_transactions t WHERE t.register_id = r.id AND direction='out') AS total_out
     FROM cash_registers r JOIN users u ON u.id = r.opened_by LEFT JOIN cash_closures cl ON cl.register_id = r.id
     ${w} ORDER BY r.id DESC LIMIT 200`,
  ).bind(...params).all();
  return c.json({ data: rows.results });
});

cash.get('/registers/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'cash:read');
  const s = await registerSummary(c, Number(c.req.param('id')));
  if (!can(c.get('user'), 'finance_stats:read') && s.opened_by !== c.get('user').id) throw new HttpError(403, 'Accès refusé');
  return c.json(s);
});

cash.post('/open', async (c) => {
  assertPerm(c.get('user'), 'cash:write');
  const { opening_balance } = z.object({ opening_balance: zMoney }).parse(await c.req.json());
  if (await openRegisterFor(c)) throw new HttpError(409, 'Vous avez déjà une caisse ouverte');
  const r = await c.env.DB.prepare('INSERT INTO cash_registers (opened_by, opened_at, opening_balance) VALUES (?,?,?) RETURNING id')
    .bind(c.get('user').id, nowISO(), opening_balance).first<{ id: number }>();
  await audit(c, 'cash_open', 'cash_registers', r!.id, { opening_balance });
  return c.json(await registerSummary(c, r!.id), 201);
});

cash.post('/movement', async (c) => {
  assertPerm(c.get('user'), 'cash:write');
  const b = z.object({ direction: z.enum(['in', 'out']), amount: zMoney, justification: z.string().trim().min(3).max(500) }).parse(await c.req.json());
  if (b.amount <= 0) throw new HttpError(400, 'Montant invalide');
  const reg = await openRegisterFor(c);
  if (!reg) throw new HttpError(409, 'Aucune caisse ouverte');
  const ref = await nextNumber(c.env.DB, b.direction === 'in' ? 'CIN' : 'COUT', todayISO().slice(0, 4), 5);
  await c.env.DB.prepare(
    "INSERT INTO cash_transactions (register_id, direction, amount, method, reference, justification, created_by) VALUES (?,?,?,'cash',?,?,?)",
  ).bind(reg, b.direction, b.amount, ref, b.justification, c.get('user').id).run();
  await audit(c, 'cash_movement', 'cash_registers', reg, b);
  return c.json(await registerSummary(c, reg));
});

cash.post('/close', async (c) => {
  assertPerm(c.get('user'), 'cash:write');
  const { actual_balance, notes } = z.object({ actual_balance: zMoney, notes: z.string().max(1000).optional() }).parse(await c.req.json());
  const reg = await openRegisterFor(c);
  if (!reg) throw new HttpError(409, 'Aucune caisse ouverte');
  const s = await registerSummary(c, reg);
  const diff = actual_balance - s.theoretical_balance;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO cash_closures (register_id, theoretical_balance, actual_balance, difference, notes, closed_by) VALUES (?,?,?,?,?,?)')
      .bind(reg, s.theoretical_balance, actual_balance, diff, notes ?? null, c.get('user').id),
    c.env.DB.prepare("UPDATE cash_registers SET status = 'closed', closed_at = ? WHERE id = ?").bind(nowISO(), reg),
  ]);
  if (diff !== 0) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO notifications (kind, title, body, link, dedupe_key) VALUES (?,?,?,?,?)')
      .bind('cash_gap', 'Écart de caisse', `Écart de ${(diff / 1000).toFixed(3)} TND à la clôture de la caisse #${reg}`, '/admin/cash', `cash_gap_${reg}`).run();
  }
  await audit(c, 'cash_close', 'cash_registers', reg, { theoretical: s.theoretical_balance, actual_balance, diff });
  return c.json(await registerSummary(c, reg));
});

// ===================== QUOTATIONS & INVOICES =====================
const itemSchema = z.object({
  designation: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().int().min(1).max(10000),
  unit_price: zMoney,
  discount_bp: z.coerce.number().int().min(0).max(10000).optional(),
});

function computeTotals(items: z.infer<typeof itemSchema>[], vat_bp: number, stamp = 0) {
  const lines = items.map((i) => {
    const gross = i.quantity * i.unit_price;
    const total = gross - Math.round((gross * (i.discount_bp ?? 0)) / 10000);
    return { ...i, discount_bp: i.discount_bp ?? 0, total };
  });
  const ht = lines.reduce((a, l) => a + l.total, 0);
  const vat = Math.round((ht * vat_bp) / 10000);
  return { lines, ht, vat, ttc: ht + vat + stamp };
}

const quoteSchema = z.object({
  client_id: z.coerce.number().int().positive().optional().nullable(),
  prospect_name: z.string().max(160).optional().nullable(),
  prospect_phone: z.string().max(30).optional().nullable(),
  issue_date: zDate.optional(),
  valid_until: zDate.optional().nullable(),
  vat_rate_bp: z.coerce.number().int().min(0).max(10000),
  conditions: z.string().max(3000).optional().nullable(),
  items: z.array(itemSchema).min(1),
});

export const quotations = new Hono<AppEnv>();

const QSEL = `q.*, c.first_name || ' ' || c.last_name AS client_name, c.matricule, c.phone AS client_phone,
  CASE WHEN q.status IN ('draft','sent') AND q.valid_until < date('now','+1 hour') THEN 'expired' ELSE q.status END AS effective_status`;

quotations.get('/', async (c) => {
  assertPerm(c.get('user'), 'quotations:read');
  const q = c.req.query();
  const params: unknown[] = [];
  let w = 'WHERE 1=1';
  if (q.status) (w += " AND (CASE WHEN q.status IN ('draft','sent') AND q.valid_until < date('now','+1 hour') THEN 'expired' ELSE q.status END) = ?", params.push(q.status));
  if (q.search) (w += ' AND (q.number LIKE ? OR q.prospect_name LIKE ? OR c.last_name LIKE ?)', params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`));
  const rows = await c.env.DB.prepare(`SELECT ${QSEL} FROM quotations q LEFT JOIN clients c ON c.id = q.client_id ${w} ORDER BY q.id DESC LIMIT 500`).bind(...params).all();
  return c.json({ data: rows.results, total: rows.results.length });
});

quotations.get('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'quotations:read');
  const id = Number(c.req.param('id'));
  const q = await c.env.DB.prepare(`SELECT ${QSEL} FROM quotations q LEFT JOIN clients c ON c.id = q.client_id WHERE q.id = ?`).bind(id).first();
  if (!q) throw new HttpError(404, 'Devis introuvable');
  const items = await c.env.DB.prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY id').bind(id).all();
  return c.json({ ...q, items: items.results });
});

async function saveQuoteItems(db: D1Database, id: number, lines: ReturnType<typeof computeTotals>['lines']) {
  await db.batch([
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').bind(id),
    ...lines.map((l) =>
      db.prepare('INSERT INTO quotation_items (quotation_id, designation, quantity, unit_price, discount_bp, total) VALUES (?,?,?,?,?,?)')
        .bind(id, l.designation, l.quantity, l.unit_price, l.discount_bp, l.total)),
  ]);
}

quotations.post('/', async (c) => {
  assertPerm(c.get('user'), 'quotations:write');
  const b = quoteSchema.parse(await c.req.json());
  if (!b.client_id && !b.prospect_name) throw new HttpError(400, 'Client ou prospect requis');
  const t = computeTotals(b.items, b.vat_rate_bp);
  const number = await nextNumber(c.env.DB, 'DEV', todayISO().slice(0, 4));
  const issue = b.issue_date || todayISO();
  const r = await c.env.DB.prepare(
    `INSERT INTO quotations (number, client_id, prospect_name, prospect_phone, issue_date, valid_until, vat_rate_bp, total_ht, total_vat, total_ttc, conditions, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  ).bind(number, b.client_id ?? null, b.prospect_name ?? null, b.prospect_phone ?? null, issue, b.valid_until || addDays(issue, 30), b.vat_rate_bp, t.ht, t.vat, t.ttc, b.conditions ?? null, c.get('user').id).first<{ id: number }>();
  await saveQuoteItems(c.env.DB, r!.id, t.lines);
  await audit(c, 'create', 'quotations', r!.id);
  return c.json({ id: r!.id, number }, 201);
});

quotations.put('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'quotations:write');
  const id = Number(c.req.param('id'));
  const cur = await c.env.DB.prepare('SELECT status FROM quotations WHERE id = ?').bind(id).first<{ status: string }>();
  if (!cur) throw new HttpError(404, 'Devis introuvable');
  if (!['draft', 'sent'].includes(cur.status)) throw new HttpError(409, 'Ce devis ne peut plus être modifié');
  const b = quoteSchema.parse(await c.req.json());
  const t = computeTotals(b.items, b.vat_rate_bp);
  await c.env.DB.prepare(
    `UPDATE quotations SET client_id=?, prospect_name=?, prospect_phone=?, issue_date=COALESCE(?, issue_date), valid_until=?, vat_rate_bp=?, total_ht=?, total_vat=?, total_ttc=?, conditions=?, updated_at=datetime('now') WHERE id=?`,
  ).bind(b.client_id ?? null, b.prospect_name ?? null, b.prospect_phone ?? null, b.issue_date ?? null, b.valid_until ?? null, b.vat_rate_bp, t.ht, t.vat, t.ttc, b.conditions ?? null, id).run();
  await saveQuoteItems(c.env.DB, id, t.lines);
  await audit(c, 'update', 'quotations', id);
  return c.json({ ok: true });
});

quotations.post('/:id{[0-9]+}/status', async (c) => {
  assertPerm(c.get('user'), 'quotations:write');
  const id = Number(c.req.param('id'));
  const { status } = z.object({ status: z.enum(['draft', 'sent', 'accepted', 'refused', 'expired']) }).parse(await c.req.json());
  const cur = await c.env.DB.prepare('SELECT status FROM quotations WHERE id = ?').bind(id).first<{ status: string }>();
  if (cur?.status === 'invoiced') throw new HttpError(409, 'Devis déjà facturé');
  await c.env.DB.prepare("UPDATE quotations SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
  await audit(c, 'status', 'quotations', id, { status });
  return c.json({ ok: true });
});

quotations.post('/:id{[0-9]+}/convert', async (c) => {
  assertPerm(c.get('user'), 'invoices:write');
  const id = Number(c.req.param('id'));
  const q = await c.env.DB.prepare('SELECT * FROM quotations WHERE id = ?').bind(id).first<Record<string, any>>();
  if (!q) throw new HttpError(404, 'Devis introuvable');
  if (q.status !== 'accepted') throw new HttpError(409, 'Seul un devis accepté peut être transformé en facture');
  const items = await c.env.DB.prepare('SELECT * FROM quotation_items WHERE quotation_id = ?').bind(id).all<Record<string, any>>();
  const stamp = Number((await c.env.DB.prepare("SELECT value FROM company_settings WHERE key = 'stamp_duty'").first<{ value: string }>())?.value || 0);
  const number = await nextNumber(c.env.DB, 'FAC', todayISO().slice(0, 4));
  const inv = await c.env.DB.prepare(
    `INSERT INTO invoices (number, client_id, customer_name, customer_phone, quotation_id, issue_date, due_date, vat_rate_bp, stamp_duty, total_ht, total_vat, total_ttc, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  ).bind(number, q.client_id, q.prospect_name, q.prospect_phone, id, todayISO(), addDays(todayISO(), 15), q.vat_rate_bp, stamp, q.total_ht, q.total_vat, q.total_ht + q.total_vat + stamp, c.get('user').id).first<{ id: number }>();
  await c.env.DB.batch([
    ...items.results.map((i) =>
      c.env.DB.prepare('INSERT INTO invoice_items (invoice_id, designation, quantity, unit_price, discount_bp, total) VALUES (?,?,?,?,?,?)')
        .bind(inv!.id, i.designation, i.quantity, i.unit_price, i.discount_bp, i.total)),
    c.env.DB.prepare("UPDATE quotations SET status = 'invoiced', invoice_id = ?, updated_at = datetime('now') WHERE id = ?").bind(inv!.id, id),
  ]);
  await audit(c, 'convert', 'quotations', id, { invoice: number });
  return c.json({ id: inv!.id, number }, 201);
});

export const invoices = new Hono<AppEnv>();
const ISEL = `i.*, COALESCE(c.first_name || ' ' || c.last_name, i.customer_name) AS client_name, c.matricule, COALESCE(c.phone, i.customer_phone) AS client_phone, c.address AS client_address`;

invoices.get('/', async (c) => {
  assertPerm(c.get('user'), 'invoices:read');
  const q = c.req.query();
  const params: unknown[] = [];
  let w = 'WHERE 1=1';
  if (q.status) (w += ' AND i.status = ?', params.push(q.status));
  if (q.search) (w += ' AND (i.number LIKE ? OR i.customer_name LIKE ? OR c.last_name LIKE ?)', params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`));
  const rows = await c.env.DB.prepare(`SELECT ${ISEL} FROM invoices i LEFT JOIN clients c ON c.id = i.client_id ${w} ORDER BY i.id DESC LIMIT 500`).bind(...params).all();
  return c.json({ data: rows.results, total: rows.results.length });
});

invoices.get('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'invoices:read');
  const id = Number(c.req.param('id'));
  const inv = await c.env.DB.prepare(`SELECT ${ISEL} FROM invoices i LEFT JOIN clients c ON c.id = i.client_id WHERE i.id = ?`).bind(id).first();
  if (!inv) throw new HttpError(404, 'Facture introuvable');
  const items = await c.env.DB.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').bind(id).all();
  const pays = await c.env.DB.prepare('SELECT p.*, r.number AS receipt_number, r.id AS receipt_id FROM payments p LEFT JOIN receipts r ON r.payment_id = p.id WHERE p.invoice_id = ? AND p.cancelled_at IS NULL').bind(id).all();
  return c.json({ ...inv, items: items.results, payments: pays.results });
});

invoices.post('/', async (c) => {
  assertPerm(c.get('user'), 'invoices:write');
  const b = z.object({
    client_id: z.coerce.number().int().positive().optional().nullable(),
    customer_name: z.string().max(160).optional().nullable(),
    customer_phone: z.string().max(30).optional().nullable(),
    customer_tax_id: z.string().max(40).optional().nullable(),
    issue_date: zDate.optional(),
    due_date: zDate.optional().nullable(),
    vat_rate_bp: z.coerce.number().int().min(0).max(10000),
    notes: z.string().max(2000).optional().nullable(),
    items: z.array(itemSchema).min(1),
  }).parse(await c.req.json());
  if (!b.client_id && !b.customer_name) throw new HttpError(400, 'Client requis');
  const stamp = Number((await c.env.DB.prepare("SELECT value FROM company_settings WHERE key = 'stamp_duty'").first<{ value: string }>())?.value || 0);
  const t = computeTotals(b.items, b.vat_rate_bp, stamp);
  const number = await nextNumber(c.env.DB, 'FAC', todayISO().slice(0, 4));
  const issue = b.issue_date || todayISO();
  const r = await c.env.DB.prepare(
    `INSERT INTO invoices (number, client_id, customer_name, customer_phone, customer_tax_id, issue_date, due_date, vat_rate_bp, stamp_duty, total_ht, total_vat, total_ttc, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  ).bind(number, b.client_id ?? null, b.customer_name ?? null, b.customer_phone ?? null, b.customer_tax_id ?? null, issue, b.due_date ?? addDays(issue, 15), b.vat_rate_bp, stamp, t.ht, t.vat, t.ttc, b.notes ?? null, c.get('user').id).first<{ id: number }>();
  await c.env.DB.batch(t.lines.map((l) =>
    c.env.DB.prepare('INSERT INTO invoice_items (invoice_id, designation, quantity, unit_price, discount_bp, total) VALUES (?,?,?,?,?,?)')
      .bind(r!.id, l.designation, l.quantity, l.unit_price, l.discount_bp, l.total)));
  await audit(c, 'create', 'invoices', r!.id);
  return c.json({ id: r!.id, number }, 201);
});

invoices.post('/:id{[0-9]+}/pay', async (c) => {
  assertPerm(c.get('user'), 'payments:write');
  const id = Number(c.req.param('id'));
  const b = z.object({ amount: zMoney, method: z.enum(['cash', 'transfer', 'card', 'cheque', 'other']) }).parse(await c.req.json());
  const inv = await c.env.DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first<{ total_ttc: number; amount_paid: number; status: string; client_id: number | null; number: string }>();
  if (!inv) throw new HttpError(404, 'Facture introuvable');
  if (inv.status === 'cancelled') throw new HttpError(400, 'Facture annulée');
  const remaining = inv.total_ttc - inv.amount_paid;
  if (b.amount <= 0 || b.amount > remaining) throw new HttpError(400, 'Montant invalide (dépasse le reste dû)');
  const receipt = await recordPayment(c, { amount: b.amount, method: b.method, source: 'invoice', client_id: inv.client_id, invoice_id: id, remaining: remaining - b.amount, notes: `Facture ${inv.number}` });
  const paid = inv.amount_paid + b.amount;
  await c.env.DB.prepare("UPDATE invoices SET amount_paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(paid, paid >= inv.total_ttc ? 'paid' : 'partial', id).run();
  return c.json({ receipt });
});

invoices.post('/:id{[0-9]+}/cancel', async (c) => {
  assertPerm(c.get('user'), 'invoices:delete');
  const id = Number(c.req.param('id'));
  const inv = await c.env.DB.prepare('SELECT amount_paid FROM invoices WHERE id = ?').bind(id).first<{ amount_paid: number }>();
  if (!inv) throw new HttpError(404, 'Introuvable');
  if (inv.amount_paid > 0) throw new HttpError(409, 'Facture avec paiements : annulez d’abord les paiements');
  await c.env.DB.prepare("UPDATE invoices SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c, 'cancel', 'invoices', id);
  return c.json({ ok: true });
});

// Expense cancellation (expenses are never deleted)
export const expenseActions = new Hono<AppEnv>();
expenseActions.post('/:id{[0-9]+}/cancel', async (c) => {
  assertPerm(c.get('user'), 'expenses:delete');
  const id = Number(c.req.param('id'));
  const { reason } = z.object({ reason: z.string().min(3) }).parse(await c.req.json());
  await c.env.DB.prepare("UPDATE expenses SET cancelled_at = ?, notes = COALESCE(notes,'') || ? WHERE id = ? AND cancelled_at IS NULL").bind(nowISO(), ` [ANNULÉE: ${reason}]`, id).run();
  await audit(c, 'cancel', 'expenses', id, { reason });
  return c.json({ ok: true });
});
