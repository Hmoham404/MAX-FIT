import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { assertPerm } from '../lib/auth';
import { zDate, zMoney } from '../lib/crud';
import { recordPayment } from '../lib/payments';
import { addDays, audit, computeEndDate, diffDays, HttpError, nextNumber, todayISO } from '../lib/util';

const subs = new Hono<AppEnv>();

const SELECT = `s.*, c.matricule, c.first_name, c.last_name, c.phone, p.name AS plan_name, p.duration_unit, p.duration_value,
  cc.name AS category_name, cc.code AS category_code`;
const FROM = `subscriptions s JOIN clients c ON c.id = s.client_id JOIN subscription_plans p ON p.id = s.plan_id
  LEFT JOIN client_categories cc ON cc.id = s.category_id`;

export function enrich<T extends Record<string, unknown>>(s: T) {
  const today = todayISO();
  const end = s.end_date as string;
  const start = s.start_date as string;
  let validity: string;
  if (s.status === 'cancelled' || s.status === 'replaced') validity = s.status as string;
  else if (s.status === 'suspended') validity = 'suspended';
  else if (end < today) validity = 'expired';
  else if (start > today) validity = 'upcoming';
  else validity = 'valid';
  const final = Number(s.final_price);
  const paid = Number(s.amount_paid);
  const payment_status = paid >= final ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
  return {
    ...s,
    activities: typeof s.activities === 'string' ? JSON.parse((s.activities as string) || '[]') : s.activities,
    validity,
    payment_status,
    remaining: Math.max(0, final - paid),
    days_remaining: validity === 'valid' || validity === 'upcoming' ? diffDays(today, end) + 1 : 0,
  };
}

async function load(c: Context<AppEnv>, id: number) {
  const s = await c.env.DB.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE s.id = ?`).bind(id).first<Record<string, unknown>>();
  if (!s) throw new HttpError(404, 'Abonnement introuvable');
  return enrich(s);
}

async function history(c: Context<AppEnv>, id: number, action: string, details?: unknown) {
  await c.env.DB.prepare('INSERT INTO subscription_history (subscription_id, action, details, user_id) VALUES (?,?,?,?)')
    .bind(id, action, details ? JSON.stringify(details) : null, c.get('user').id)
    .run();
  await audit(c, `subscription_${action}`, 'subscriptions', id, details);
}

async function computePrice(c: Context<AppEnv>, planId: number, promotionId?: number | null, extraDiscount = 0, includeFee = true) {
  const plan = await c.env.DB.prepare('SELECT * FROM subscription_plans WHERE id = ? AND archived_at IS NULL')
    .bind(planId)
    .first<{ id: number; price: number; registration_fee: number; duration_unit: string; duration_value: number; category_id: number | null; activities: string; name: string }>();
  if (!plan) throw new HttpError(400, 'Formule introuvable');
  let discount = 0;
  if (promotionId) {
    const promo = await c.env.DB.prepare(
      "SELECT * FROM promotions WHERE id = ? AND archived_at IS NULL AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)",
    )
      .bind(promotionId, todayISO(), todayISO())
      .first<{ discount_type: string; discount_value: number; plan_id: number | null }>();
    if (!promo) throw new HttpError(400, 'Promotion invalide ou expirée');
    if (promo.plan_id && promo.plan_id !== planId) throw new HttpError(400, 'Promotion non applicable à cette formule');
    discount = promo.discount_type === 'percent' ? Math.round((plan.price * promo.discount_value) / 100) : promo.discount_value;
  }
  discount += extraDiscount;
  const fee = includeFee ? plan.registration_fee : 0;
  discount = Math.min(discount, plan.price + fee);
  return { plan, discount, fee, final: plan.price + fee - discount };
}

subs.get('/', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:read');
  const q = c.req.query();
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(500, Number(q.pageSize) || 25);
  const where: string[] = [];
  const params: unknown[] = [];
  const today = todayISO();
  if (q.client_id) (where.push('s.client_id = ?'), params.push(q.client_id));
  if (q.plan_id) (where.push('s.plan_id = ?'), params.push(q.plan_id));
  if (q.category) (where.push('cc.code = ?'), params.push(q.category));
  if (q.search) {
    where.push("(c.first_name LIKE ? OR c.last_name LIKE ? OR c.matricule LIKE ? OR c.phone LIKE ? OR s.reference LIKE ?)");
    for (let i = 0; i < 5; i++) params.push(`%${q.search}%`);
  }
  switch (q.validity) {
    case 'valid':
      where.push("s.status = 'active' AND s.start_date <= ? AND s.end_date >= ?"), params.push(today, today);
      break;
    case 'expired':
      where.push("s.status = 'active' AND s.end_date < ?"), params.push(today);
      break;
    case 'suspended':
      where.push("s.status = 'suspended'");
      break;
    case 'expiring':
      where.push("s.status = 'active' AND s.end_date BETWEEN ? AND ?"), params.push(today, addDays(today, Number(q.days) || 7));
      break;
    case 'current':
      where.push("s.status IN ('active','suspended')");
      break;
  }
  if (q.payment === 'unpaid') where.push("s.amount_paid = 0 AND s.final_price > 0 AND s.status NOT IN ('cancelled','replaced')");
  if (q.payment === 'partial') where.push("s.amount_paid > 0 AND s.amount_paid < s.final_price AND s.status NOT IN ('cancelled','replaced')");
  if (q.payment === 'due') where.push("s.amount_paid < s.final_price AND s.status NOT IN ('cancelled','replaced')");
  if (q.payment === 'paid') where.push('s.amount_paid >= s.final_price');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sortMap: Record<string, string> = { end_date: 's.end_date', start_date: 's.start_date', final_price: 's.final_price', name: 'c.last_name' };
  const [sf, sd] = (q.sort || '').split(':');
  const order = sortMap[sf] ? `${sortMap[sf]} ${sd === 'asc' ? 'ASC' : 'DESC'}` : 's.id DESC';
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${FROM} ${w}`).bind(...params).first<{ n: number }>();
  const rows = await c.env.DB.prepare(`SELECT ${SELECT} FROM ${FROM} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, (page - 1) * pageSize)
    .all<Record<string, unknown>>();
  return c.json({ data: rows.results.map(enrich), total: total?.n ?? 0, page, pageSize });
});

subs.get('/:id{[0-9]+}', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:read');
  const id = Number(c.req.param('id'));
  const s = await load(c, id);
  const payments = await c.env.DB.prepare(
    `SELECT p.*, r.number AS receipt_number, r.id AS receipt_id, u.display_name AS user_name FROM payments p
     LEFT JOIN receipts r ON r.payment_id = p.id LEFT JOIN users u ON u.id = p.created_by
     WHERE p.subscription_id = ? AND p.cancelled_at IS NULL ORDER BY p.paid_at`,
  )
    .bind(id)
    .all();
  const hist = await c.env.DB.prepare(
    'SELECT h.*, u.display_name AS user_name FROM subscription_history h LEFT JOIN users u ON u.id = h.user_id WHERE subscription_id = ? ORDER BY h.id DESC',
  )
    .bind(id)
    .all();
  return c.json({ ...s, payments: payments.results, history: hist.results });
});

const createSchema = z.object({
  client_id: z.coerce.number().int().positive(),
  plan_id: z.coerce.number().int().positive(),
  start_date: zDate.optional(),
  promotion_id: z.coerce.number().int().positive().optional().nullable(),
  extra_discount: zMoney.optional(),
  include_registration_fee: z.boolean().optional(),
  activities: z.array(z.coerce.number().int()).optional(),
  notes: z.string().max(1000).optional().nullable(),
  initial_payment: zMoney.optional(),
  method: z.enum(['cash', 'transfer', 'card', 'cheque', 'other']).optional(),
});

async function createSubscription(c: Context<AppEnv>, input: z.infer<typeof createSchema>, action = 'created') {
  const client = await c.env.DB.prepare('SELECT id, category_id, archived_at FROM clients WHERE id = ?')
    .bind(input.client_id)
    .first<{ id: number; category_id: number | null; archived_at: string | null }>();
  if (!client || client.archived_at) throw new HttpError(400, 'Client introuvable ou archivé');
  const { plan, discount, fee, final } = await computePrice(c, input.plan_id, input.promotion_id, input.extra_discount ?? 0, input.include_registration_fee ?? action === 'created');
  if (input.extra_discount && input.extra_discount > 0) {
    // exceptional discount: admin only
    assertPerm(c.get('user'), 'plans:write');
  }
  const start = input.start_date || todayISO();
  const end = computeEndDate(start, plan.duration_unit, plan.duration_value);
  const label = `${plan.duration_value} ${plan.duration_unit}`;
  const ref = await nextNumber(c.env.DB, 'ABN', todayISO().slice(0, 4), 5);
  const r = await c.env.DB.prepare(
    `INSERT INTO subscriptions (reference, client_id, plan_id, category_id, activities, start_date, end_date, duration_label, sessions_total,
      base_price, registration_fee, discount, final_price, promotion_id, notes, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
  )
    .bind(
      ref,
      input.client_id,
      plan.id,
      plan.category_id ?? client.category_id,
      JSON.stringify(input.activities ?? JSON.parse(plan.activities || '[]')),
      start,
      end,
      label,
      plan.duration_unit === 'session' ? plan.duration_value : null,
      plan.price,
      fee,
      discount,
      final,
      input.promotion_id ?? null,
      input.notes ?? null,
      c.get('user').id,
    )
    .first<{ id: number }>();
  const id = r!.id;
  await c.env.DB.prepare("UPDATE clients SET status = 'active', updated_at = datetime('now') WHERE id = ?").bind(input.client_id).run();
  await history(c, id, action, { plan: plan.name, start, end, final });
  let receipt = null;
  if (input.initial_payment && input.initial_payment > 0) {
    if (input.initial_payment > final) throw new HttpError(400, 'Le paiement dépasse le montant dû');
    receipt = await recordPayment(c, {
      amount: input.initial_payment,
      method: input.method ?? 'cash',
      source: 'subscription',
      client_id: input.client_id,
      subscription_id: id,
      remaining: final - input.initial_payment,
    });
    await c.env.DB.prepare('UPDATE subscriptions SET amount_paid = amount_paid + ? WHERE id = ?').bind(input.initial_payment, id).run();
  }
  return { subscription: await load(c, id), receipt };
}

subs.post('/', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const input = createSchema.parse(await c.req.json());
  return c.json(await createSubscription(c, input), 201);
});

subs.post('/quote', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:read');
  const input = createSchema.partial({ client_id: true }).parse(await c.req.json());
  const { plan, discount, fee, final } = await computePrice(c, input.plan_id, input.promotion_id, input.extra_discount ?? 0, input.include_registration_fee ?? true);
  const start = input.start_date || todayISO();
  return c.json({ base_price: plan.price, registration_fee: fee, discount, final_price: final, start_date: start, end_date: computeEndDate(start, plan.duration_unit, plan.duration_value) });
});

subs.post('/:id{[0-9]+}/pay', async (c) => {
  assertPerm(c.get('user'), 'payments:write');
  const id = Number(c.req.param('id'));
  const body = z
    .object({ amount: zMoney, method: z.enum(['cash', 'transfer', 'card', 'cheque', 'other']), notes: z.string().max(500).optional() })
    .parse(await c.req.json());
  const s = await load(c, id);
  if (s.status === 'cancelled') throw new HttpError(400, 'Abonnement annulé');
  if (body.amount <= 0) throw new HttpError(400, 'Montant invalide');
  if (body.amount > s.remaining) throw new HttpError(400, `Le montant dépasse le reste à payer (${s.remaining / 1000} TND)`);
  // Optimistic guard against double submission
  const upd = await c.env.DB.prepare('UPDATE subscriptions SET amount_paid = amount_paid + ?, updated_at = datetime(\'now\') WHERE id = ? AND amount_paid = ?')
    .bind(body.amount, id, s.amount_paid)
    .run();
  if (!upd.meta.changes) throw new HttpError(409, 'Paiement concurrent détecté, rechargez la page');
  let receipt;
  try {
    receipt = await recordPayment(c, {
      amount: body.amount,
      method: body.method,
      source: 'subscription',
      client_id: s.client_id as number,
      subscription_id: id,
      notes: body.notes,
      remaining: s.remaining - body.amount,
    });
  } catch (e) {
    await c.env.DB.prepare('UPDATE subscriptions SET amount_paid = amount_paid - ? WHERE id = ?').bind(body.amount, id).run();
    throw e;
  }
  await history(c, id, 'payment', { amount: body.amount, method: body.method, receipt: receipt.receipt_number });
  return c.json({ subscription: await load(c, id), receipt });
});

subs.post('/:id{[0-9]+}/renew', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const id = Number(c.req.param('id'));
  const old = await load(c, id);
  const body = createSchema.omit({ client_id: true }).partial({ plan_id: true }).parse(await c.req.json());
  const today = todayISO();
  const start = body.start_date || ((old.end_date as string) >= today ? addDays(old.end_date as string, 1) : today);
  const res = await createSubscription(
    c,
    { ...body, client_id: old.client_id as number, plan_id: body.plan_id ?? (old.plan_id as number), start_date: start, include_registration_fee: body.include_registration_fee ?? false },
    'renewed',
  );
  await history(c, id, 'renewed_to', { new_id: res.subscription.id });
  return c.json(res, 201);
});

subs.post('/:id{[0-9]+}/suspend', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const id = Number(c.req.param('id'));
  const { reason } = z.object({ reason: z.string().max(500).optional() }).parse(await c.req.json().catch(() => ({})));
  const s = await load(c, id);
  if (s.status !== 'active') throw new HttpError(400, 'Seul un abonnement actif peut être suspendu');
  await c.env.DB.prepare("UPDATE subscriptions SET status = 'suspended', suspended_at = ?, updated_at = datetime('now') WHERE id = ?").bind(todayISO(), id).run();
  await history(c, id, 'suspended', { reason });
  return c.json(await load(c, id));
});

subs.post('/:id{[0-9]+}/reactivate', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const id = Number(c.req.param('id'));
  const s = await load(c, id);
  if (s.status !== 'suspended') throw new HttpError(400, 'Abonnement non suspendu');
  const days = Math.max(0, diffDays(s.suspended_at as string, todayISO()));
  const newEnd = addDays(s.end_date as string, days);
  await c.env.DB.prepare(
    "UPDATE subscriptions SET status = 'active', suspended_at = NULL, suspended_days = suspended_days + ?, end_date = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(days, newEnd, id)
    .run();
  await history(c, id, 'reactivated', { days_added: days, new_end: newEnd });
  return c.json(await load(c, id));
});

subs.post('/:id{[0-9]+}/extend', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const id = Number(c.req.param('id'));
  const { days, reason } = z.object({ days: z.coerce.number().int().min(1).max(365), reason: z.string().min(2).max(500) }).parse(await c.req.json());
  const s = await load(c, id);
  const newEnd = addDays(s.end_date as string, days);
  await c.env.DB.prepare("UPDATE subscriptions SET end_date = ?, updated_at = datetime('now') WHERE id = ?").bind(newEnd, id).run();
  await history(c, id, 'extended', { days, reason, new_end: newEnd });
  return c.json(await load(c, id));
});

subs.post('/:id{[0-9]+}/change-plan', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:write');
  const id = Number(c.req.param('id'));
  const { plan_id, promotion_id, extra_discount } = z
    .object({ plan_id: z.coerce.number().int().positive(), promotion_id: z.coerce.number().int().positive().optional().nullable(), extra_discount: zMoney.optional() })
    .parse(await c.req.json());
  const s = await load(c, id);
  if (!['active', 'suspended'].includes(s.status as string)) throw new HttpError(400, 'Abonnement non modifiable');
  const { plan, discount, final } = await computePrice(c, plan_id, promotion_id, extra_discount ?? 0, false);
  const fee = Number(s.registration_fee);
  const newFinal = final + fee;
  if (newFinal < Number(s.amount_paid)) throw new HttpError(400, 'Le nouveau prix est inférieur au montant déjà payé : procédez à un avoir manuel.');
  const end = computeEndDate(s.start_date as string, plan.duration_unit, plan.duration_value);
  await c.env.DB.prepare(
    "UPDATE subscriptions SET plan_id = ?, base_price = ?, discount = ?, final_price = ?, end_date = ?, promotion_id = ?, updated_at = datetime('now') WHERE id = ?",
  )
    .bind(plan.id, plan.price, discount, newFinal, addDays(end, Number(s.suspended_days)), promotion_id ?? null, id)
    .run();
  await history(c, id, 'plan_changed', { from: s.plan_name, to: plan.name, final: newFinal });
  return c.json(await load(c, id));
});

subs.post('/:id{[0-9]+}/discount', async (c) => {
  assertPerm(c.get('user'), 'plans:write');
  const id = Number(c.req.param('id'));
  const { amount, reason } = z.object({ amount: zMoney, reason: z.string().min(2).max(500) }).parse(await c.req.json());
  const s = await load(c, id);
  const newFinal = Number(s.final_price) - amount;
  if (newFinal < Number(s.amount_paid)) throw new HttpError(400, 'Réduction supérieure au reste à payer');
  await c.env.DB.prepare("UPDATE subscriptions SET discount = discount + ?, final_price = ?, updated_at = datetime('now') WHERE id = ?").bind(amount, newFinal, id).run();
  await history(c, id, 'discount', { amount, reason });
  return c.json(await load(c, id));
});

subs.post('/:id{[0-9]+}/cancel', async (c) => {
  assertPerm(c.get('user'), 'subscriptions:delete');
  const id = Number(c.req.param('id'));
  const { reason } = z.object({ reason: z.string().min(2).max(500) }).parse(await c.req.json());
  await c.env.DB.prepare("UPDATE subscriptions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await history(c, id, 'cancelled', { reason });
  return c.json(await load(c, id));
});

export default subs;
