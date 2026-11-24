import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { HttpError, nextNumber, nowISO, todayISO } from './util';

export type Method = 'cash' | 'transfer' | 'card' | 'cheque' | 'other';

export async function openRegisterFor(c: Context<AppEnv>): Promise<number | null> {
  const r = await c.env.DB.prepare("SELECT id FROM cash_registers WHERE status = 'open' AND opened_by = ? ORDER BY id DESC LIMIT 1")
    .bind(c.get('user').id)
    .first<{ id: number }>();
  return r?.id ?? null;
}

/**
 * Records money actually received. Creates: payment, receipt, and (for cash) a cash-register movement.
 * This is the ONLY place where "encaissé" amounts are created → no double counting in stats.
 */
export async function recordPayment(
  c: Context<AppEnv>,
  p: {
    amount: number;
    method: Method;
    source: string;
    client_id?: number | null;
    subscription_id?: number | null;
    invoice_id?: number | null;
    notes?: string | null;
    paid_at?: string;
    remaining?: number;
  },
) {
  if (!Number.isInteger(p.amount) || p.amount <= 0) throw new HttpError(400, 'Montant invalide');
  const user = c.get('user');
  const db = c.env.DB;
  const register = await openRegisterFor(c);
  if (p.method === 'cash' && !register) {
    throw new HttpError(409, 'Aucune caisse ouverte : ouvrez votre caisse avant un encaissement en espèces.');
  }
  const year = todayISO().slice(0, 4);
  const ref = await nextNumber(db, 'PAY', year, 5);
  const recNo = await nextNumber(db, 'REC', year);
  const paidAt = p.paid_at || nowISO();
  const pay = await db
    .prepare(
      `INSERT INTO payments (reference, client_id, subscription_id, invoice_id, source, amount, method, paid_at, notes, cash_register_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    )
    .bind(ref, p.client_id ?? null, p.subscription_id ?? null, p.invoice_id ?? null, p.source, p.amount, p.method, paidAt, p.notes ?? null, register, user.id)
    .first<{ id: number }>();
  const paymentId = pay!.id;
  const stmts = [
    db
      .prepare(
        'INSERT INTO receipts (number, payment_id, client_id, subscription_id, amount, remaining, method, issued_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      )
      .bind(recNo, paymentId, p.client_id ?? null, p.subscription_id ?? null, p.amount, p.remaining ?? 0, p.method, paidAt, user.id),
  ];
  if (p.subscription_id) {
    stmts.push(db.prepare('INSERT INTO subscription_payments (subscription_id, payment_id) VALUES (?, ?)').bind(p.subscription_id, paymentId));
  }
  if (register) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO cash_transactions (register_id, direction, amount, method, reference, justification, payment_id, created_by) VALUES (?, 'in', ?, ?, ?, ?, ?, ?)",
        )
        .bind(register, p.amount, p.method, ref, `Encaissement ${p.source} — ${recNo}`, paymentId, user.id),
    );
  }
  stmts.push(
    db
      .prepare('INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)')
      .bind(user.id, 'payment', 'payments', String(paymentId), JSON.stringify({ amount: p.amount, method: p.method, source: p.source })),
  );
  await db.batch(stmts);
  const receipt = await db.prepare('SELECT id, number FROM receipts WHERE payment_id = ?').bind(paymentId).first<{ id: number; number: string }>();
  return { payment_id: paymentId, reference: ref, receipt_id: receipt!.id, receipt_number: receipt!.number };
}
